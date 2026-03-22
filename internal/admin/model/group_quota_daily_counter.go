package model

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/yeying-community/router/common/helper"
	"gorm.io/gorm"
)

const GroupQuotaDailyCountersTableName = "user_group_daily_quota_counters"

type GroupQuotaDailyCounter struct {
	GroupID       string `json:"group_id" gorm:"primaryKey;type:char(36)"`
	UserID        string `json:"user_id" gorm:"primaryKey;type:char(36)"`
	BizDate       string `json:"biz_date" gorm:"primaryKey;type:varchar(10)"`
	ReservedQuota int64  `json:"reserved_quota" gorm:"type:bigint;not null;default:0"`
	ConsumedQuota int64  `json:"consumed_quota" gorm:"type:bigint;not null;default:0"`
	UpdatedAt     int64  `json:"updated_at" gorm:"bigint;index"`
}

func (GroupQuotaDailyCounter) TableName() string {
	return GroupQuotaDailyCountersTableName
}

type GroupDailyQuotaReservation struct {
	GroupID       string
	UserID        string
	BizDate       string
	ReservedQuota int64
}

func (reservation GroupDailyQuotaReservation) Active() bool {
	return strings.TrimSpace(reservation.GroupID) != "" &&
		strings.TrimSpace(reservation.UserID) != "" &&
		strings.TrimSpace(reservation.BizDate) != "" &&
		reservation.ReservedQuota > 0
}

func businessDateByTimezone(now time.Time, timezone string) string {
	locationName := normalizeGroupQuotaResetTimezone(timezone)
	location, err := time.LoadLocation(locationName)
	if err != nil {
		location = time.FixedZone(DefaultGroupQuotaResetTimezone, 8*3600)
	}
	return now.In(location).Format("2006-01-02")
}

func ReserveGroupDailyQuotaWithDB(db *gorm.DB, groupID string, userID string, quota int64) (GroupDailyQuotaReservation, bool, error) {
	if db == nil {
		return GroupDailyQuotaReservation{}, false, fmt.Errorf("database handle is nil")
	}
	normalizedGroupID := strings.TrimSpace(groupID)
	normalizedUserID := strings.TrimSpace(userID)
	normalizedQuota := normalizeGroupDailyQuotaLimit(quota)
	if normalizedGroupID == "" || normalizedQuota <= 0 {
		return GroupDailyQuotaReservation{}, true, nil
	}
	if normalizedUserID == "" {
		return GroupDailyQuotaReservation{}, false, fmt.Errorf("用户 ID 不能为空")
	}
	policy := GetGroupDailyQuotaPolicy(normalizedGroupID)
	if policy.Limit <= 0 {
		return GroupDailyQuotaReservation{}, true, nil
	}
	now := time.Now()
	bizDate := businessDateByTimezone(now, policy.Timezone)
	updatedAt := helper.GetTimestamp()
	result := db.Exec(
		`INSERT INTO user_group_daily_quota_counters (group_id, user_id, biz_date, reserved_quota, consumed_quota, updated_at)
		 VALUES (?, ?, ?, ?, 0, ?)
		 ON CONFLICT (group_id, user_id, biz_date)
		 DO UPDATE
		 SET reserved_quota = user_group_daily_quota_counters.reserved_quota + EXCLUDED.reserved_quota,
		     updated_at = EXCLUDED.updated_at
		 WHERE (user_group_daily_quota_counters.consumed_quota + user_group_daily_quota_counters.reserved_quota + EXCLUDED.reserved_quota) <= ?`,
		normalizedGroupID,
		normalizedUserID,
		bizDate,
		normalizedQuota,
		updatedAt,
		policy.Limit,
	)
	if result.Error != nil {
		return GroupDailyQuotaReservation{}, false, result.Error
	}
	if result.RowsAffected == 0 {
		return GroupDailyQuotaReservation{}, false, nil
	}
	return GroupDailyQuotaReservation{
		GroupID:       normalizedGroupID,
		UserID:        normalizedUserID,
		BizDate:       bizDate,
		ReservedQuota: normalizedQuota,
	}, true, nil
}

func ReserveGroupDailyQuota(groupID string, userID string, quota int64) (GroupDailyQuotaReservation, bool, error) {
	return ReserveGroupDailyQuotaWithDB(DB, groupID, userID, quota)
}

func ReleaseGroupDailyQuotaReservationWithDB(db *gorm.DB, reservation GroupDailyQuotaReservation) error {
	if db == nil {
		return fmt.Errorf("database handle is nil")
	}
	if !reservation.Active() {
		return nil
	}
	result := db.Exec(
		`UPDATE user_group_daily_quota_counters
		 SET reserved_quota = GREATEST(reserved_quota - ?, 0),
		     updated_at = ?
		 WHERE group_id = ? AND user_id = ? AND biz_date = ?`,
		reservation.ReservedQuota,
		helper.GetTimestamp(),
		reservation.GroupID,
		reservation.UserID,
		reservation.BizDate,
	)
	return result.Error
}

func ReleaseGroupDailyQuotaReservation(reservation GroupDailyQuotaReservation) error {
	return ReleaseGroupDailyQuotaReservationWithDB(DB, reservation)
}

func SettleGroupDailyQuotaReservationWithDB(db *gorm.DB, reservation GroupDailyQuotaReservation, consumedQuota int64) error {
	if db == nil {
		return fmt.Errorf("database handle is nil")
	}
	if !reservation.Active() {
		return nil
	}
	consumed := consumedQuota
	if consumed < 0 {
		consumed = 0
	}
	now := helper.GetTimestamp()
	result := db.Exec(
		`INSERT INTO user_group_daily_quota_counters (group_id, user_id, biz_date, reserved_quota, consumed_quota, updated_at)
		 VALUES (?, ?, ?, 0, ?, ?)
		 ON CONFLICT (group_id, user_id, biz_date)
		 DO UPDATE
		 SET reserved_quota = GREATEST(user_group_daily_quota_counters.reserved_quota - ?, 0),
		     consumed_quota = user_group_daily_quota_counters.consumed_quota + EXCLUDED.consumed_quota,
		     updated_at = EXCLUDED.updated_at`,
		reservation.GroupID,
		reservation.UserID,
		reservation.BizDate,
		consumed,
		now,
		reservation.ReservedQuota,
	)
	return result.Error
}

func SettleGroupDailyQuotaReservation(reservation GroupDailyQuotaReservation, consumedQuota int64) error {
	return SettleGroupDailyQuotaReservationWithDB(DB, reservation, consumedQuota)
}

type GroupDailyQuotaSnapshot struct {
	GroupID        string `json:"group_id"`
	UserID         string `json:"user_id"`
	BizDate        string `json:"biz_date"`
	Limit          int64  `json:"limit"`
	ConsumedQuota  int64  `json:"consumed_quota"`
	ReservedQuota  int64  `json:"reserved_quota"`
	RemainingQuota int64  `json:"remaining_quota"`
	Unlimited      bool   `json:"unlimited"`
	Timezone       string `json:"timezone"`
	UpdatedAt      int64  `json:"updated_at"`
}

func normalizeGroupQuotaDate(rawDate string, timezone string) (string, error) {
	normalized := strings.TrimSpace(rawDate)
	if normalized == "" {
		return businessDateByTimezone(time.Now(), timezone), nil
	}
	parsed, err := time.Parse("2006-01-02", normalized)
	if err != nil {
		return "", fmt.Errorf("日期格式错误，应为 YYYY-MM-DD")
	}
	return parsed.Format("2006-01-02"), nil
}

func GetGroupDailyQuotaSnapshotWithDB(db *gorm.DB, groupID string, userID string, bizDate string) (GroupDailyQuotaSnapshot, error) {
	if db == nil {
		return GroupDailyQuotaSnapshot{}, fmt.Errorf("database handle is nil")
	}
	normalizedGroupID := strings.TrimSpace(groupID)
	normalizedUserID := strings.TrimSpace(userID)
	if normalizedGroupID == "" {
		return GroupDailyQuotaSnapshot{}, fmt.Errorf("分组 ID 不能为空")
	}
	if normalizedUserID == "" {
		return GroupDailyQuotaSnapshot{}, fmt.Errorf("用户 ID 不能为空")
	}
	groupCatalog, err := getGroupCatalogByIDWithDB(db, normalizedGroupID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return GroupDailyQuotaSnapshot{}, fmt.Errorf("分组不存在")
		}
		return GroupDailyQuotaSnapshot{}, err
	}

	limit := normalizeGroupDailyQuotaLimit(groupCatalog.DailyQuotaLimit)
	timezone := normalizeGroupQuotaResetTimezone(groupCatalog.QuotaResetTimezone)
	normalizedBizDate, err := normalizeGroupQuotaDate(bizDate, timezone)
	if err != nil {
		return GroupDailyQuotaSnapshot{}, err
	}

	counter := GroupQuotaDailyCounter{}
	err = db.Where("group_id = ? AND user_id = ? AND biz_date = ?", normalizedGroupID, normalizedUserID, normalizedBizDate).First(&counter).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return GroupDailyQuotaSnapshot{}, err
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		counter = GroupQuotaDailyCounter{
			GroupID: normalizedGroupID,
			UserID:  normalizedUserID,
			BizDate: normalizedBizDate,
		}
	}

	consumed := counter.ConsumedQuota
	if consumed < 0 {
		consumed = 0
	}
	reserved := counter.ReservedQuota
	if reserved < 0 {
		reserved = 0
	}

	unlimited := limit <= 0
	remaining := int64(0)
	if !unlimited {
		remaining = limit - consumed - reserved
		if remaining < 0 {
			remaining = 0
		}
	}

	return GroupDailyQuotaSnapshot{
		GroupID:        normalizedGroupID,
		UserID:         normalizedUserID,
		BizDate:        normalizedBizDate,
		Limit:          limit,
		ConsumedQuota:  consumed,
		ReservedQuota:  reserved,
		RemainingQuota: remaining,
		Unlimited:      unlimited,
		Timezone:       timezone,
		UpdatedAt:      counter.UpdatedAt,
	}, nil
}

func GetGroupDailyQuotaSnapshot(groupID string, userID string, bizDate string) (GroupDailyQuotaSnapshot, error) {
	return GetGroupDailyQuotaSnapshotWithDB(DB, groupID, userID, bizDate)
}
