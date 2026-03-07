package model

import (
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/yeying-community/router/common"
	"github.com/yeying-community/router/common/config"
	"github.com/yeying-community/router/common/helper"
	"github.com/yeying-community/router/common/logger"
	"github.com/yeying-community/router/common/random"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var DB *gorm.DB
var LOG_DB *gorm.DB

func CreateRootAccountIfNeed() error {
	var user User
	//if user.Status != util.UserStatusEnabled {
	if err := DB.First(&user).Error; err != nil {
		logger.SysLog("no user exists, creating a root user for you: username is root, password is 123456")
		hashedPassword, err := common.Password2Hash("123456")
		if err != nil {
			return err
		}
		accessToken := random.GetUUID()
		if config.InitialRootAccessToken != "" {
			accessToken = config.InitialRootAccessToken
		}
		rootUser := User{
			Id:          random.GetUUID(),
			Username:    "root",
			Password:    hashedPassword,
			Role:        RoleRootUser,
			Status:      UserStatusEnabled,
			DisplayName: "Root User",
			AccessToken: accessToken,
			Quota:       500000000000000,
		}
		DB.Create(&rootUser)
		if config.InitialRootToken != "" {
			logger.SysLog("creating initial root token as requested")
			token := Token{
				Id:             random.GetUUID(),
				UserId:         rootUser.Id,
				Key:            config.InitialRootToken,
				Status:         TokenStatusEnabled,
				Name:           "Initial Root Token",
				CreatedTime:    helper.GetTimestamp(),
				AccessedTime:   helper.GetTimestamp(),
				ExpiredTime:    -1,
				RemainQuota:    500000000000000,
				UnlimitedQuota: true,
			}
			DB.Create(&token)
		}
	}
	return nil
}

func chooseDB(dsn string) (*gorm.DB, error) {
	trimmed := strings.TrimSpace(dsn)
	if trimmed == "" {
		return nil, errors.New("database.sql_dsn is required and only PostgreSQL is supported")
	}
	return openPostgreSQL(trimmed, true)
}

func chooseMigrationDB(dsn string) (*gorm.DB, error) {
	trimmed := strings.TrimSpace(dsn)
	if trimmed == "" {
		return nil, errors.New("database.sql_dsn is required and only PostgreSQL is supported")
	}
	return openPostgreSQL(trimmed, false)
}

func openPostgreSQL(dsn string, prepareStmt bool) (*gorm.DB, error) {
	if !isPostgreSQLDSN(dsn) {
		return nil, errors.New("unsupported database.sql_dsn: only PostgreSQL DSN is supported")
	}
	logger.SysLog("using PostgreSQL as database")
	common.UsingPostgreSQL = true
	return gorm.Open(postgres.New(postgres.Config{
		DSN:                  dsn,
		PreferSimpleProtocol: true, // disables implicit prepared statement usage
	}), &gorm.Config{
		PrepareStmt: prepareStmt,
	})
}

func isPostgreSQLDSN(dsn string) bool {
	normalized := strings.ToLower(strings.TrimSpace(dsn))
	if normalized == "" {
		return false
	}
	return strings.HasPrefix(normalized, "postgres://") ||
		strings.HasPrefix(normalized, "postgresql://") ||
		strings.Contains(normalized, "host=")
}

func InitDB() {
	var err error
	DB, err = chooseDB(common.SQLDSN)
	if err != nil {
		logger.FatalLog("failed to initialize database: " + err.Error())
		return
	}

	setDBConns(DB)

	if !config.IsMasterNode {
		if err = SyncModelPricingCatalogWithDB(DB); err != nil {
			logger.SysError("failed to sync model pricing catalog: " + err.Error())
		}
		return
	}

	logger.SysLog("database migration started")
	if err = migrateDB(); err != nil {
		logger.FatalLog("failed to migrate database: " + err.Error())
		return
	}
	logger.SysLog("database migrated")
	if err = SyncModelPricingCatalogWithDB(DB); err != nil {
		logger.SysError("failed to sync model pricing catalog: " + err.Error())
	}
}

func migrateDB() error {
	migrationDB, err := chooseMigrationDB(common.SQLDSN)
	if err != nil {
		return err
	}
	setDBConns(migrationDB)
	defer func() {
		_ = closeDB(migrationDB)
	}()
	return runMainVersionedMigrations(migrationDB)
}

func InitLogDB() {
	if common.LogSQLDSN == "" {
		LOG_DB = DB
		return
	}

	logger.SysLog("using secondary database for table logs")
	var err error
	LOG_DB, err = chooseDB(common.LogSQLDSN)
	if err != nil {
		logger.FatalLog("failed to initialize secondary database: " + err.Error())
		return
	}

	setDBConns(LOG_DB)

	if !config.IsMasterNode {
		return
	}

	logger.SysLog("secondary database migration started")
	err = migrateLOGDB()
	if err != nil {
		logger.FatalLog("failed to migrate secondary database: " + err.Error())
		return
	}
	logger.SysLog("secondary database migrated")
}

func migrateLOGDB() error {
	migrationDB, err := chooseMigrationDB(common.LogSQLDSN)
	if err != nil {
		return err
	}
	setDBConns(migrationDB)
	defer func() {
		_ = closeDB(migrationDB)
	}()
	return runLogVersionedMigrations(migrationDB)
}

func setDBConns(db *gorm.DB) *sql.DB {
	if config.DebugSQLEnabled {
		db = db.Debug()
	}

	sqlDB, err := db.DB()
	if err != nil {
		logger.FatalLog("failed to connect database: " + err.Error())
		return nil
	}

	sqlDB.SetMaxIdleConns(common.SQLMaxIdleConns)
	sqlDB.SetMaxOpenConns(common.SQLMaxOpenConns)
	sqlDB.SetConnMaxLifetime(time.Second * time.Duration(common.SQLMaxLifetimeSeconds))
	return sqlDB
}

func closeDB(db *gorm.DB) error {
	sqlDB, err := db.DB()
	if err != nil {
		return err
	}
	err = sqlDB.Close()
	return err
}

func CloseDB() error {
	if LOG_DB != DB {
		err := closeDB(LOG_DB)
		if err != nil {
			return err
		}
	}
	return closeDB(DB)
}
