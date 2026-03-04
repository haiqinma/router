package model

import (
	"sort"
	"strings"

	billingratio "github.com/yeying-community/router/internal/relay/billing/ratio"
	"gorm.io/gorm"
)

func runGroupCatalogMigrations() error {
	return runGroupCatalogMigrationsWithDB(DB)
}

func runGroupCatalogMigrationsWithDB(db *gorm.DB) error {
	if err := db.AutoMigrate(&GroupCatalog{}); err != nil {
		return err
	}

	groupNames := make(map[string]struct{})
	addName := func(name string) {
		normalized := strings.TrimSpace(name)
		if normalized == "" {
			return
		}
		groupNames[normalized] = struct{}{}
	}

	for groupName := range billingratio.GroupRatio {
		addName(groupName)
	}
	for _, groupName := range parseGroupNamesFromGroupRatioOptionWithDB(db) {
		addName(groupName)
	}

	users := make([]User, 0)
	if err := db.Select("group").Find(&users).Error; err != nil {
		return err
	}
	for _, user := range users {
		for _, groupName := range parseGroupNamesFromCSV(user.Group) {
			addName(groupName)
		}
	}

	channels := make([]Channel, 0)
	if err := db.Select("group").Find(&channels).Error; err != nil {
		return err
	}
	for _, channel := range channels {
		for _, groupName := range parseGroupNamesFromCSV(channel.Group) {
			addName(groupName)
		}
	}

	abilities := make([]Ability, 0)
	if err := db.Select("group").Find(&abilities).Error; err != nil {
		return err
	}
	for _, ability := range abilities {
		addName(ability.Group)
	}

	normalizedNames := make([]string, 0, len(groupNames))
	for groupName := range groupNames {
		normalizedNames = append(normalizedNames, groupName)
	}
	sort.Strings(normalizedNames)
	return upsertMissingGroupCatalogNamesWithDB(db, normalizedNames, "migration")
}

func parseGroupNamesFromGroupRatioOptionWithDB(db *gorm.DB) []string {
	var option Option
	err := db.Where("key = ?", "GroupRatio").First(&option).Error
	if err != nil {
		return nil
	}
	return parseGroupNamesFromGroupRatioJSON(option.Value)
}
