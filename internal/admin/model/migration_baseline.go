package model

import (
	"fmt"
	"gorm.io/gorm"
)

func runMainBaselineMigrationWithDB(tx *gorm.DB) error {
	if tx == nil {
		return fmt.Errorf("database handle is nil")
	}

	if err := tx.AutoMigrate(
		&User{},
		&Channel{},
		&ChannelModel{},
		&ChannelTest{},
		&Token{},
		&Redemption{},
		&Ability{},
		&Option{},
		&Provider{},
		&ProviderModel{},
		&ChannelProtocolCatalog{},
		&GroupCatalog{},
		&Log{},
	); err != nil {
		return err
	}

	if err := syncChannelProtocolCatalogWithDB(tx); err != nil {
		return err
	}
	if err := syncProviderCatalogWithDB(tx); err != nil {
		return err
	}
	if err := ensureCurrentChannelTestingSchemaWithDB(tx); err != nil {
		return err
	}
	return nil
}

func runLogBaselineMigrationWithDB(tx *gorm.DB) error {
	if tx == nil {
		return fmt.Errorf("database handle is nil")
	}
	return tx.AutoMigrate(&Log{})
}
