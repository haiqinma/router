package model

import (
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestMigrateUserPackageSubscriptionCreatedAtWithDB(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	if err := db.AutoMigrate(&UserPackageSubscription{}); err != nil {
		t.Fatalf("create subscription table: %v", err)
	}
	if err := db.Migrator().DropColumn(&UserPackageSubscription{}, "CreatedAt"); err != nil {
		t.Fatalf("remove creation time from legacy table: %v", err)
	}
	if err := db.Exec(`INSERT INTO user_package_subscriptions (id, user_id, package_id, group_id, started_at, updated_at) VALUES
		('future', 'user', 'package', 'group', 200, 100),
		('normal', 'user', 'package', 'group', 100, 200),
		('no-update', 'user', 'package', 'group', 300, 0)`).Error; err != nil {
		t.Fatalf("seed subscriptions: %v", err)
	}

	if err := migrateUserPackageSubscriptionCreatedAtWithDB(db); err != nil {
		t.Fatalf("migrate creation time: %v", err)
	}

	want := map[string]int64{"future": 100, "normal": 100, "no-update": 300}
	for id, wantCreatedAt := range want {
		var createdAt int64
		if err := db.Table(UserPackageSubscriptionsTableName).Where("id = ?", id).Pluck("created_at", &createdAt).Error; err != nil {
			t.Fatalf("read %s creation time: %v", id, err)
		}
		if createdAt != wantCreatedAt {
			t.Fatalf("%s created_at = %d, want %d", id, createdAt, wantCreatedAt)
		}
	}
}

func TestAdminPurchasesExcludeSubscriptionInstances(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	if err := db.AutoMigrate(&User{}, &ServicePackage{}, &UserPackageSubscription{}, &TopupOrder{}); err != nil {
		t.Fatalf("migrate test tables: %v", err)
	}
	row := UserPackageSubscription{
		Id: "subscription-1", UserID: "user-1", PackageID: "package-1", PackageName: "旗舰版本",
		StartedAt: 200, ExpiresAt: 300, Status: UserPackageSubscriptionStatusCanceled,
		CreatedAt: 100, UpdatedAt: 150,
	}
	if err := db.Create(&row).Error; err != nil {
		t.Fatalf("create subscription: %v", err)
	}

	if _, err := GetAdminPurchaseRecordByIDWithDB(db, row.Id); err != gorm.ErrRecordNotFound {
		t.Fatalf("get subscription instance as purchase error = %v, want record not found", err)
	}
}

func TestAdminPurchaseBalanceUsesOrderTitleAsProductName(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	if err := db.AutoMigrate(&User{}, &ServicePackage{}, &UserPackageSubscription{}, &TopupOrder{}); err != nil {
		t.Fatalf("migrate test tables: %v", err)
	}
	order := TopupOrder{
		Id: "topup-1", UserID: "user-1", Status: TopupOrderStatusFulfilled,
		BusinessType: TopupOrderBusinessBalance, Title: "100 元充值权益",
		CreditOrigin: TopupOrderCreditOriginPaid, TopupPlanID: "product-1",
		TransactionID: "transaction-1", CreatedAt: 100,
	}
	if err := db.Create(&order).Error; err != nil {
		t.Fatalf("create topup order: %v", err)
	}

	record, err := GetAdminPurchaseRecordByIDWithDB(db, order.Id)
	if err != nil {
		t.Fatalf("get purchase record: %v", err)
	}
	if record.ProductName != order.Title {
		t.Fatalf("product_name = %q, want %q", record.ProductName, order.Title)
	}
}

func TestAdminPurchasesExcludeGiftOrders(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	if err := db.AutoMigrate(&User{}, &TopupOrder{}); err != nil {
		t.Fatalf("migrate test tables: %v", err)
	}
	order := TopupOrder{
		Id: "gift-1", UserID: "user-1", Status: TopupOrderStatusFulfilled,
		BusinessType: TopupOrderBusinessBalance, CreditOrigin: TopupOrderCreditOriginAdmin,
		Title: "管理员赠送", TransactionID: "gift-transaction-1", CreatedAt: 100,
	}
	if err := db.Create(&order).Error; err != nil {
		t.Fatalf("create gift order: %v", err)
	}

	if _, err := GetAdminPurchaseRecordByIDWithDB(db, order.Id); err != gorm.ErrRecordNotFound {
		t.Fatalf("get gift as purchase error = %v, want record not found", err)
	}
}
