package model

import (
	"encoding/json"
	"errors"
	"strings"

	"github.com/yeying-community/router/common/logger"
	billingratio "github.com/yeying-community/router/internal/relay/billing/ratio"
	"gorm.io/gorm"
)

var legacyDefaultGroupNames = []string{"vip", "svip"}

func runRemoveLegacyDefaultGroupsMigrationWithDB(db *gorm.DB) error {
	if db == nil {
		return errors.New("database handle is nil")
	}

	configuredGroups := make(map[string]struct{})
	for name := range billingratio.GroupRatio {
		normalized := strings.TrimSpace(name)
		if normalized == "" {
			continue
		}
		configuredGroups[normalized] = struct{}{}
	}

	var option Option
	err := db.Where("key = ?", "GroupRatio").First(&option).Error
	if err == nil {
		normalizedValue, changed, normalizeErr := normalizeLegacyGroupRatioJSON(option.Value)
		if normalizeErr != nil {
			logger.SysError("migration: failed to normalize GroupRatio option: " + normalizeErr.Error())
		} else if changed {
			if err = db.Model(&Option{}).Where("key = ?", "GroupRatio").Update("value", normalizedValue).Error; err != nil {
				return err
			}
			option.Value = normalizedValue
		}
		for _, name := range parseGroupNamesFromGroupRatioJSON(option.Value) {
			configuredGroups[name] = struct{}{}
		}
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}

	configuredGroupNames := make([]string, 0, len(configuredGroups))
	for name := range configuredGroups {
		configuredGroupNames = append(configuredGroupNames, name)
	}
	if err = upsertMissingGroupCatalogNamesWithDB(db, configuredGroupNames, "migration"); err != nil {
		return err
	}

	for _, groupName := range legacyDefaultGroupNames {
		if _, keep := configuredGroups[groupName]; keep {
			continue
		}
		row, getErr := getGroupCatalogByNameWithDB(db, groupName)
		if errors.Is(getErr, gorm.ErrRecordNotFound) {
			continue
		}
		if getErr != nil {
			return getErr
		}
		if strings.EqualFold(strings.TrimSpace(row.Source), "manual") {
			continue
		}
		inUse, inUseErr := isGroupInUseWithDB(db, groupName)
		if inUseErr != nil {
			return inUseErr
		}
		if inUse {
			continue
		}
		if err = db.Where("name = ?", groupName).Delete(&GroupCatalog{}).Error; err != nil {
			return err
		}
	}
	return nil
}

func normalizeLegacyGroupRatioJSON(raw string) (string, bool, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return raw, false, nil
	}

	groupRatio := make(map[string]float64)
	if err := json.Unmarshal([]byte(trimmed), &groupRatio); err != nil {
		return "", false, err
	}
	if !isLegacyDefaultGroupRatio(groupRatio) {
		return trimmed, false, nil
	}

	normalized := map[string]float64{"default": 1}
	jsonBytes, err := json.Marshal(normalized)
	if err != nil {
		return "", false, err
	}
	return string(jsonBytes), true, nil
}

func isLegacyDefaultGroupRatio(groupRatio map[string]float64) bool {
	if len(groupRatio) != 3 {
		return false
	}
	defaultRatio, okDefault := groupRatio["default"]
	vipRatio, okVIP := groupRatio["vip"]
	svipRatio, okSVIP := groupRatio["svip"]
	return okDefault && okVIP && okSVIP &&
		defaultRatio == 1 &&
		vipRatio == 1 &&
		svipRatio == 1
}
