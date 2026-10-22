package model

import (
	"fmt"
	"strings"

	"github.com/yeying-community/router/common/helper"
	"gorm.io/gorm"
)

const (
	DutyIncidentStatesTableName = "duty_incident_states"

	DutyIncidentStatusActive        = "active"
	DutyIncidentStatusAcknowledged  = "acknowledged"
	DutyIncidentStatusInvestigating = "investigating"
	DutyIncidentStatusMitigated     = "mitigated"
	DutyIncidentStatusResolved      = "resolved"
)

type DutyIncidentState struct {
	IncidentKey      string `json:"incident_key" gorm:"primaryKey;type:varchar(255)"`
	Status           string `json:"status" gorm:"type:varchar(32);not null;default:'active';index"`
	AssigneeUserId   string `json:"assignee_user_id" gorm:"type:char(36);not null;default:'';index"`
	AssigneeUsername string `json:"assignee_username" gorm:"type:varchar(255);not null;default:''"`
	LastNote         string `json:"last_note" gorm:"type:text"`
	AcknowledgedAt   int64  `json:"acknowledged_at" gorm:"bigint;not null;default:0;index"`
	MitigatedAt      int64  `json:"mitigated_at" gorm:"bigint;not null;default:0;index"`
	ResolvedAt       int64  `json:"resolved_at" gorm:"bigint;not null;default:0;index"`
	CreatedAt        int64  `json:"created_at" gorm:"bigint;not null;default:0;index"`
	UpdatedAt        int64  `json:"updated_at" gorm:"bigint;not null;default:0;index"`
}

func (DutyIncidentState) TableName() string {
	return DutyIncidentStatesTableName
}

func NormalizeDutyIncidentStatus(value string) string {
	switch strings.TrimSpace(strings.ToLower(value)) {
	case DutyIncidentStatusAcknowledged:
		return DutyIncidentStatusAcknowledged
	case DutyIncidentStatusInvestigating:
		return DutyIncidentStatusInvestigating
	case DutyIncidentStatusMitigated:
		return DutyIncidentStatusMitigated
	case DutyIncidentStatusResolved:
		return DutyIncidentStatusResolved
	case DutyIncidentStatusActive:
		return DutyIncidentStatusActive
	default:
		return ""
	}
}

func ListDutyIncidentStatesByKeysWithDB(db *gorm.DB, keys []string) (map[string]DutyIncidentState, error) {
	if db == nil {
		return nil, fmt.Errorf("database handle is nil")
	}
	normalized := make([]string, 0, len(keys))
	seen := make(map[string]struct{}, len(keys))
	for _, raw := range keys {
		key := strings.TrimSpace(raw)
		if key == "" {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		normalized = append(normalized, key)
	}
	if len(normalized) == 0 {
		return map[string]DutyIncidentState{}, nil
	}
	rows := make([]DutyIncidentState, 0, len(normalized))
	if err := db.Where("incident_key IN ?", normalized).Find(&rows).Error; err != nil {
		return nil, err
	}
	result := make(map[string]DutyIncidentState, len(rows))
	for _, row := range rows {
		row.IncidentKey = strings.TrimSpace(row.IncidentKey)
		row.Status = NormalizeDutyIncidentStatus(row.Status)
		if row.Status == "" {
			row.Status = DutyIncidentStatusActive
		}
		result[row.IncidentKey] = row
	}
	return result, nil
}

func UpsertDutyIncidentStateWithDB(
	db *gorm.DB,
	incidentKey string,
	status string,
	assigneeUserID string,
	assigneeUsername string,
	note string,
) (DutyIncidentState, error) {
	if db == nil {
		return DutyIncidentState{}, fmt.Errorf("database handle is nil")
	}
	key := strings.TrimSpace(incidentKey)
	normalizedStatus := NormalizeDutyIncidentStatus(status)
	if key == "" || normalizedStatus == "" {
		return DutyIncidentState{}, fmt.Errorf("invalid duty incident state")
	}
	now := helper.GetTimestamp()
	row := DutyIncidentState{}
	err := db.Where("incident_key = ?", key).Take(&row).Error
	if err != nil && err != gorm.ErrRecordNotFound {
		return DutyIncidentState{}, err
	}
	if err == gorm.ErrRecordNotFound {
		row = DutyIncidentState{
			IncidentKey: key,
			Status:      DutyIncidentStatusActive,
			CreatedAt:   now,
		}
	}
	row.Status = normalizedStatus
	row.UpdatedAt = now
	if strings.TrimSpace(note) != "" {
		row.LastNote = strings.TrimSpace(note)
	}
	if normalizedStatus != DutyIncidentStatusActive {
		if userID := strings.TrimSpace(assigneeUserID); userID != "" {
			row.AssigneeUserId = userID
		}
		if username := strings.TrimSpace(assigneeUsername); username != "" {
			row.AssigneeUsername = username
		}
	}
	switch normalizedStatus {
	case DutyIncidentStatusAcknowledged, DutyIncidentStatusInvestigating:
		if row.AcknowledgedAt <= 0 {
			row.AcknowledgedAt = now
		}
		row.ResolvedAt = 0
	case DutyIncidentStatusMitigated:
		if row.AcknowledgedAt <= 0 {
			row.AcknowledgedAt = now
		}
		row.MitigatedAt = now
		row.ResolvedAt = 0
	case DutyIncidentStatusResolved:
		if row.AcknowledgedAt <= 0 {
			row.AcknowledgedAt = now
		}
		row.ResolvedAt = now
	case DutyIncidentStatusActive:
		row.ResolvedAt = 0
	}
	if err == gorm.ErrRecordNotFound {
		if createErr := db.Create(&row).Error; createErr != nil {
			return DutyIncidentState{}, createErr
		}
	} else if saveErr := db.Save(&row).Error; saveErr != nil {
		return DutyIncidentState{}, saveErr
	}
	return row, nil
}
