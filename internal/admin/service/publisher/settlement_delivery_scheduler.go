package publisher

import (
	"strings"
	"sync"
	"time"

	"github.com/yeying-community/router/common/logger"
	"github.com/yeying-community/router/internal/admin/model"
)

const (
	publisherSettlementDeliveryLoopInterval = 45 * time.Second
	publisherSettlementDeliveryBatchSize    = 50
)

var startPublisherSettlementDeliveryWorkerOnce sync.Once

// StartPublisherSettlementDeliveryWorker replays cross-store settlement
// handoffs after a restart or a transient main/log database failure.
func StartPublisherSettlementDeliveryWorker() {
	startPublisherSettlementDeliveryWorkerOnce.Do(func() { go runPublisherSettlementDeliveryWorker() })
}

func runPublisherSettlementDeliveryWorker() {
	logger.SysLog("[publisher.settlement] delivery worker started")
	ticker := time.NewTicker(publisherSettlementDeliveryLoopInterval)
	defer ticker.Stop()
	for {
		runPublisherSettlementDeliveryOnce()
		<-ticker.C
	}
}

func runPublisherSettlementDeliveryOnce() {
	rows, err := model.ListPublisherSettlementDeliveryCandidates(publisherSettlementDeliveryBatchSize)
	if err != nil {
		logger.SysWarnf("[publisher.settlement] list delivery candidates failed: %s", err.Error())
		return
	}
	delivered, pending, failed, exceptions := 0, 0, 0, 0
	for _, row := range rows {
		requestLogID := strings.TrimSpace(row.RequestLogID)
		if requestLogID == "" {
			continue
		}
		if row.Status == model.PublisherSettlementDeliveryStatusPrepared {
			if _, err := model.MarkPublisherSettlementDeliveryReady(requestLogID); err != nil {
				pending++
				continue
			}
		}
		if _, err := model.DeliverPublisherSettlement(requestLogID); err != nil {
			failed++
			logger.SysWarnf("[publisher.settlement] delivery failed request_log_id=%s err=%s", requestLogID, err.Error())
			continue
		}
		delivered++
	}
	cancelledRows, cancellationErr := model.ListPublisherSettlementCancellationObservationCandidates(publisherSettlementDeliveryBatchSize, 0)
	if cancellationErr != nil {
		logger.SysWarnf("[publisher.settlement] list cancellation observations failed: %s", cancellationErr.Error())
	} else {
		for _, row := range cancelledRows {
			requestLogID := strings.TrimSpace(row.RequestLogID)
			if requestLogID == "" {
				continue
			}
			updated, err := model.ReconcileCancelledPublisherSettlementDelivery(requestLogID)
			if err != nil {
				failed++
				logger.SysWarnf("[publisher.settlement] cancellation reconciliation failed request_log_id=%s err=%s", requestLogID, err.Error())
				continue
			}
			if updated.Status == model.PublisherSettlementDeliveryStatusException {
				exceptions++
				logger.SysWarnf("[publisher.settlement] cancellation contradiction requires manual resolution request_log_id=%s", requestLogID)
			}
		}
	}
	if delivered > 0 || pending > 0 || failed > 0 || exceptions > 0 {
		logger.SysLogf("[publisher.settlement] delivery batch delivered=%d pending_log=%d failed=%d exceptions=%d", delivered, pending, failed, exceptions)
	}
}
