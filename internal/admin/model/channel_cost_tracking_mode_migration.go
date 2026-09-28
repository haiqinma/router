package model

import (
	"fmt"

	"github.com/yeying-community/router/common/helper"
	"gorm.io/gorm"
)

// backfillChannelCostTrackingModeWithDB derives each channel's cost tracking mode
// from its existing procurement batches so upgrading preserves current behavior:
//   - any actual batch      -> actual (keep recording real cost)
//   - else any zero_cost    -> free   (upstream declared free)
//   - else                  -> untracked (column default; no row needed)
//
// For channels resolved to free it also re-tags legacy per-model zero-cost sentinel
// batches (created by the removed publish-page escape hatch) with the auto-free
// source ref, so future mode switches can cleanly disable them, then ensures the
// global zero-cost coverage the free mode relies on. Idempotent.
func backfillChannelCostTrackingModeWithDB(db *gorm.DB) error {
	if db == nil {
		return fmt.Errorf("database handle is nil")
	}
	if !db.Migrator().HasTable(&ChannelProcurementBatch{}) {
		return nil
	}

	type channelCostSourceRow struct {
		ChannelId  string
		CostSource string
	}
	rows := make([]channelCostSourceRow, 0)
	if err := db.Model(&ChannelProcurementBatch{}).
		Select("channel_id, cost_source").
		Group("channel_id, cost_source").
		Find(&rows).Error; err != nil {
		return err
	}

	sourcesByChannel := make(map[string]map[string]struct{})
	for _, row := range rows {
		channelID := row.ChannelId
		if channelID == "" {
			continue
		}
		if sourcesByChannel[channelID] == nil {
			sourcesByChannel[channelID] = make(map[string]struct{})
		}
		sourcesByChannel[channelID][normalizeProcurementCostSource(row.CostSource)] = struct{}{}
	}

	for channelID, sources := range sourcesByChannel {
		mode := ChannelCostTrackingModeUntracked
		if _, ok := sources[ProcurementCostSourceActual]; ok {
			mode = ChannelCostTrackingModeActual
		} else if _, ok := sources[ProcurementCostSourceZeroCost]; ok {
			mode = ChannelCostTrackingModeFree
		}
		if mode == ChannelCostTrackingModeUntracked {
			continue
		}
		if err := upsertChannelCostTrackingModeWithDB(db, channelID, mode); err != nil {
			return err
		}
		if mode == ChannelCostTrackingModeFree {
			if err := retagLegacyZeroCostSentinelsWithDB(db, channelID); err != nil {
				return err
			}
			if _, err := EnsureChannelFreeProcurementBatchesWithDB(db, channelID); err != nil {
				return err
			}
		}
	}
	return nil
}

// upsertChannelCostTrackingModeWithDB sets the mode on an existing billing profile
// or creates a minimal profile row when the channel has none.
func upsertChannelCostTrackingModeWithDB(db *gorm.DB, channelID string, mode string) error {
	res := db.Model(&ChannelBillingProfile{}).
		Where("channel_id = ?", channelID).
		Update("cost_tracking_mode", mode)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected > 0 {
		return nil
	}
	now := helper.GetTimestamp()
	return db.Create(&ChannelBillingProfile{
		ChannelId:        channelID,
		Enabled:          true,
		BillingSource:    ChannelBillingSourceManual,
		CostTrackingMode: mode,
		CreatedAt:        now,
		UpdatedAt:        now,
	}).Error
}

// retagLegacyZeroCostSentinelsWithDB puts the removed escape hatch's per-model
// zero-cost sentinel batches under auto-free management. It only matches sentinel
// capacity batches with no source ref, so manually cost-edited zero-cost batches
// (which do not carry the sentinel capacity) are preserved.
func retagLegacyZeroCostSentinelsWithDB(db *gorm.DB, channelID string) error {
	return db.Model(&ChannelProcurementBatch{}).
		Where("channel_id = ?", channelID).
		Where("cost_source = ?", ProcurementCostSourceZeroCost).
		Where("capacity_total = ?", ProcurementZeroCostCapacitySentinel).
		Where("(source_ref = ? OR source_ref IS NULL)", "").
		Update("source_ref", ProcurementAutoFreeSourceRef).Error
}
