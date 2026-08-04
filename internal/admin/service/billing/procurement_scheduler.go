package billing

import (
	"context"
	"strings"
	"sync"
	"time"

	"github.com/yeying-community/router/common/helper"
	"github.com/yeying-community/router/common/logger"
	"github.com/yeying-community/router/internal/admin/model"
	relaybilling "github.com/yeying-community/router/internal/relay/billing"
)

const (
	procurementRetryLoopIntervalSeconds = 60
	procurementRetryCooldownSeconds     = 30
	procurementRetryBatchSize           = 20
)

var startProcurementRetryWorkerOnce sync.Once

func StartProcurementRetryWorker() {
	startProcurementRetryWorkerOnce.Do(func() { go runProcurementRetryWorker() })
}

func runProcurementRetryWorker() {
	logger.SysLog("[billing.procurement] retry worker started")
	ticker := time.NewTicker(procurementRetryLoopIntervalSeconds * time.Second)
	defer ticker.Stop()
	for {
		runProcurementRetryOnce()
		<-ticker.C
	}
}

func runProcurementRetryOnce() {
	maxCreatedAt := helper.GetTimestamp() - procurementRetryCooldownSeconds
	rows, err := model.ListProcurementCostRetryLogs(procurementRetryBatchSize, maxCreatedAt)
	if err != nil {
		logger.SysWarnf("[billing.procurement] list retry candidates failed: %s", err.Error())
		return
	}
	if len(rows) == 0 {
		return
	}
	successCount := 0
	failedCount := 0
	for index := range rows {
		row := &rows[index]
		if strings.TrimSpace(row.Id) == "" {
			continue
		}
		relaybilling.RetryProcurementCostAttribution(context.Background(), row)
		if strings.TrimSpace(row.BillingProcurementCostStatus) == model.ProcurementCostAttributionStatusRetry {
			failedCount++
		} else {
			successCount++
		}
	}
	logger.SysLogf("[billing.procurement] retry batch finished success=%d failed=%d", successCount, failedCount)
}
