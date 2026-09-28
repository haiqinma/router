package user

import (
	"testing"

	"github.com/yeying-community/router/internal/admin/model"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestWalletAddressQueriesAreCaseInsensitive(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&model.User{}); err != nil {
		t.Fatalf("AutoMigrate: %v", err)
	}
	previousDB := model.DB
	model.DB = db
	t.Cleanup(func() {
		model.DB = previousDB
	})

	storedAddress := "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"
	if err := db.Create(&model.User{
		Id:            "wallet-user",
		Username:      "wallet_user",
		Password:      "password",
		WalletAddress: &storedAddress,
		Status:        model.UserStatusEnabled,
	}).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}

	if !IsWalletAddressAlreadyTaken(" 0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD ") {
		t.Fatalf("mixed-case wallet address was not detected")
	}
	queryAddress := " 0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD "
	found := model.User{WalletAddress: &queryAddress}
	if err := FillByWalletAddress(&found); err != nil {
		t.Fatalf("fill by mixed-case wallet address: %v", err)
	}
	if found.Id != "wallet-user" {
		t.Fatalf("found user=%s, want wallet-user", found.Id)
	}
}

func TestSearchUsersMatchesWalletAddressFuzzyCaseInsensitive(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&model.User{}); err != nil {
		t.Fatalf("AutoMigrate: %v", err)
	}
	previousDB := model.DB
	model.DB = db
	t.Cleanup(func() {
		model.DB = previousDB
	})

	storedAddress := "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"
	if err := db.Create(&model.User{
		Id:            "wallet-user",
		Username:      "wallet_user",
		Password:      "password",
		WalletAddress: &storedAddress,
		Status:        model.UserStatusEnabled,
		AccessToken:   "wallet-search-token",
		AffCode:       "wallet-user",
	}).Error; err != nil {
		t.Fatalf("create wallet user: %v", err)
	}
	if err := db.Create(&model.User{
		Id:          "deleted-user",
		Username:    "deleted_user",
		Password:    "password",
		Status:      model.UserStatusDeleted,
		AccessToken: "deleted-search-token",
		AffCode:     "deleted-user",
	}).Error; err != nil {
		t.Fatalf("create deleted user: %v", err)
	}

	users, err := Search("CDEFabcdef")
	if err != nil {
		t.Fatalf("search users: %v", err)
	}
	if len(users) != 1 {
		t.Fatalf("len(users)=%d, want 1", len(users))
	}
	if users[0].Id != "wallet-user" {
		t.Fatalf("matched user=%s, want wallet-user", users[0].Id)
	}
}

func TestGetAllFilteredByGroup(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&model.User{}); err != nil {
		t.Fatalf("AutoMigrate: %v", err)
	}
	previousDB := model.DB
	model.DB = db
	t.Cleanup(func() {
		model.DB = previousDB
	})

	seed := []model.User{
		{Id: "u1", Username: "u1", Password: "p", AccessToken: "tok-u1", AffCode: "aff-u1", Group: "group-a", Status: model.UserStatusEnabled},
		{Id: "u2", Username: "u2", Password: "p", AccessToken: "tok-u2", AffCode: "aff-u2", Group: "group-a", Status: model.UserStatusEnabled},
		{Id: "u3", Username: "u3", Password: "p", AccessToken: "tok-u3", AffCode: "aff-u3", Group: "group-b", Status: model.UserStatusEnabled},
	}
	for i := range seed {
		if err := db.Create(&seed[i]).Error; err != nil {
			t.Fatalf("create user %s: %v", seed[i].Id, err)
		}
	}

	// 按分组过滤只返回该组成员。
	got, err := GetAllFiltered(0, 100, "", 0, 0, "group-a")
	if err != nil {
		t.Fatalf("GetAllFiltered group-a: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("group-a members=%d, want 2", len(got))
	}
	count, err := CountAllFiltered(0, 0, "group-a")
	if err != nil {
		t.Fatalf("CountAllFiltered group-a: %v", err)
	}
	if count != 2 {
		t.Fatalf("group-a count=%d, want 2", count)
	}

	// 空 group 表示不过滤,返回全部。
	all, err := GetAllFiltered(0, 100, "", 0, 0, "")
	if err != nil {
		t.Fatalf("GetAllFiltered all: %v", err)
	}
	if len(all) != 3 {
		t.Fatalf("all users=%d, want 3", len(all))
	}
}
