package model

import (
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/yeying-community/router/common/config"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestPersonalProviderCredentialEncryptionRoundTrip(t *testing.T) {
	previousSecret := config.JWTSecret
	previousFallbacks := config.JWTFallbackSecrets
	config.JWTSecret = "current-test-secret"
	config.JWTFallbackSecrets = nil
	t.Cleanup(func() {
		config.JWTSecret = previousSecret
		config.JWTFallbackSecrets = previousFallbacks
	})

	encrypted, err := encryptPersonalProviderCredential(" sk-personal-secret ")
	if err != nil {
		t.Fatalf("encryptPersonalProviderCredential() error = %v", err)
	}
	if encrypted == "sk-personal-secret" {
		t.Fatal("credential was stored as plaintext")
	}
	decrypted, err := decryptPersonalProviderCredential(encrypted)
	if err != nil {
		t.Fatalf("decryptPersonalProviderCredential() error = %v", err)
	}
	if decrypted != "sk-personal-secret" {
		t.Fatalf("decrypted credential = %q, want %q", decrypted, "sk-personal-secret")
	}
}

func TestListPersonalProviderModelsOnlyReturnsEnabledConnectionModels(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&PersonalProviderConnection{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	previousDB := DB
	DB = db
	t.Cleanup(func() { DB = previousDB })
	rows := []PersonalProviderConnection{
		{Id: "p1", UserId: "u1", Name: "enabled", Status: PersonalProviderStatusEnabled, ModelsJSON: `["gpt-5.1","gpt-5.1"]`},
		{Id: "p2", UserId: "u1", Name: "disabled", Status: PersonalProviderStatusDisabled, ModelsJSON: `["claude-opus"]`},
	}
	if err := db.Create(&rows).Error; err != nil {
		t.Fatalf("seed connections: %v", err)
	}
	models, err := ListPersonalProviderModels("u1")
	if err != nil {
		t.Fatalf("ListPersonalProviderModels() error = %v", err)
	}
	if len(models) != 1 || models[0] != "gpt-5.1" {
		t.Fatalf("models = %#v, want [gpt-5.1]", models)
	}
}

func TestMergePersonalProviderModelsIntoEntitlementsKeepsPrivateSourceSeparate(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&PersonalProviderConnection{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	previousDB := DB
	DB = db
	t.Cleanup(func() { DB = previousDB })
	if err := db.Create(&PersonalProviderConnection{
		Id: "p1", UserId: "u1", Name: "My OpenAI", Status: PersonalProviderStatusEnabled,
		ModelsJSON: `["gpt-5.1","private-model"]`,
	}).Error; err != nil {
		t.Fatalf("seed connection: %v", err)
	}
	payload := UserEntitlementModelsPayload{
		Models: []string{"gpt-5.1"},
		Items: []UserAvailableModel{{
			Model: "gpt-5.1", Provider: "openai", ProviderLabel: "OpenAI",
			Sources: []UserEntitlementModelSource{{SourceType: UserEntitlementSourcePackage, SourceID: "pkg", GroupID: "group"}},
		}},
	}
	merged, err := MergePersonalProviderModelsIntoEntitlements("u1", payload)
	if err != nil {
		t.Fatalf("MergePersonalProviderModelsIntoEntitlements() error = %v", err)
	}
	if len(merged.Models) != 2 || merged.Models[0] != "gpt-5.1" || merged.Models[1] != "private-model" {
		t.Fatalf("models = %#v, want [gpt-5.1 private-model]", merged.Models)
	}
	var privateItem *UserAvailableModel
	for index := range merged.Items {
		if merged.Items[index].Model == "private-model" {
			privateItem = &merged.Items[index]
		}
	}
	if privateItem == nil || privateItem.Provider != PersonalProviderSourceType || len(privateItem.Sources) != 1 {
		t.Fatalf("private model item = %#v", privateItem)
	}
	if privateItem.Sources[0].GroupID != "" || privateItem.Sources[0].SourceID != "p1" {
		t.Fatalf("private source = %#v, must not carry a community group", privateItem.Sources[0])
	}
}

func TestPersonalProviderCredentialUsesFallbackSecret(t *testing.T) {
	previousSecret := config.JWTSecret
	previousFallbacks := config.JWTFallbackSecrets
	config.JWTSecret = "old-secret"
	config.JWTFallbackSecrets = nil
	encrypted, err := encryptPersonalProviderCredential("sk-rotated")
	if err != nil {
		t.Fatalf("encryptPersonalProviderCredential() error = %v", err)
	}
	config.JWTSecret = "new-secret"
	config.JWTFallbackSecrets = []string{"old-secret"}
	t.Cleanup(func() {
		config.JWTSecret = previousSecret
		config.JWTFallbackSecrets = previousFallbacks
	})
	decrypted, err := decryptPersonalProviderCredential(encrypted)
	if err != nil || decrypted != "sk-rotated" {
		t.Fatalf("fallback decrypt = %q, %v", decrypted, err)
	}
}

func TestNormalizePersonalRoutePolicy(t *testing.T) {
	tests := map[string]string{
		"":                   PersonalRoutePolicyPersonalFirst,
		"community_fallback": PersonalRoutePolicyPersonalFirst,
		"personal_only":      PersonalRoutePolicyPersonalOnly,
		"community_only":     PersonalRoutePolicyCommunityOnly,
		"community_first":    PersonalRoutePolicyCommunityFirst,
	}
	for input, want := range tests {
		if got := NormalizePersonalRoutePolicy(input); got != want {
			t.Errorf("NormalizePersonalRoutePolicy(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestPersonalProviderProtocolAndRoutePolicyValidation(t *testing.T) {
	for _, protocol := range []string{"openai", "anthropic", "gemini", "ali", "deepseek"} {
		if !IsPersonalProviderProtocol(protocol) {
			t.Fatalf("protocol %q should be supported", protocol)
		}
	}
	if IsPersonalProviderProtocol("unknown-provider") {
		t.Fatal("unknown provider protocol must not be supported")
	}
	if !IsPersonalRoutePolicy(PersonalRoutePolicyPersonalFirst) {
		t.Fatal("personal_first should be a valid route policy")
	}
	if IsPersonalRoutePolicy("unexpected") {
		t.Fatal("unexpected route policy must not be valid")
	}
}

func TestDeletePersonalModelRouteRequiresOwnership(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&PersonalModelRoute{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	previousDB := DB
	DB = db
	t.Cleanup(func() { DB = previousDB })
	if err := db.Create(&PersonalModelRoute{UserId: "owner", Model: "gpt-5.1", RoutePolicy: PersonalRoutePolicyPersonalOnly}).Error; err != nil {
		t.Fatalf("seed route: %v", err)
	}
	if err := DeletePersonalModelRoute("other-user", "gpt-5.1"); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("cross-user delete error = %v, want record not found", err)
	}
	var count int64
	if err := db.Model(&PersonalModelRoute{}).Where("user_id = ? AND model = ?", "owner", "gpt-5.1").Count(&count).Error; err != nil {
		t.Fatalf("count route: %v", err)
	}
	if count != 1 {
		t.Fatalf("cross-user delete removed route, count = %d", count)
	}
}

func TestResolvePersonalRoutePolicyDoesNotRelaxTokenSourceBoundary(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&PersonalModelRoute{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	previousDB := DB
	DB = db
	t.Cleanup(func() { DB = previousDB })
	if err := db.Create(&PersonalModelRoute{UserId: "user-a", Model: "model-a", RoutePolicy: PersonalRoutePolicyCommunityFirst}).Error; err != nil {
		t.Fatalf("seed model route: %v", err)
	}
	if got := ResolvePersonalRoutePolicy("user-a", &Token{RoutePolicy: PersonalRoutePolicyPersonalOnly}, "model-a"); got != PersonalRoutePolicyPersonalOnly {
		t.Fatalf("personal_only token was relaxed to %q", got)
	}
	if got := ResolvePersonalRoutePolicy("user-a", &Token{RoutePolicy: PersonalRoutePolicyCommunityOnly}, "model-a"); got != PersonalRoutePolicyCommunityOnly {
		t.Fatalf("community_only token was relaxed to %q", got)
	}
	if got := ResolvePersonalRoutePolicy("user-a", &Token{RoutePolicy: PersonalRoutePolicyPersonalFirst}, "model-a"); got != PersonalRoutePolicyCommunityFirst {
		t.Fatalf("flexible token policy = %q, want community_first", got)
	}
}

func TestVerifyPersonalProviderConnectionPersistsSafeHealthStatus(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&PersonalProviderConnection{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	previousDB := DB
	previousSecret := config.JWTSecret
	previousRequest := doPersonalProviderVerificationRequest
	DB = db
	config.JWTSecret = "personal-provider-verification-test-secret"
	doPersonalProviderVerificationRequest = func(req *http.Request) (*http.Response, error) {
		if req.URL.String() != "https://api.openai.com/v1/models" {
			t.Fatalf("verification URL = %q", req.URL.String())
		}
		if req.Header.Get("Authorization") != "Bearer sk-test" {
			t.Fatalf("Authorization = %q", req.Header.Get("Authorization"))
		}
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(`{"data":[]}`))}, nil
	}
	t.Cleanup(func() {
		DB = previousDB
		config.JWTSecret = previousSecret
		doPersonalProviderVerificationRequest = previousRequest
	})
	connection := &PersonalProviderConnection{UserId: "user-a", Name: "OpenAI", Protocol: "openai", Models: []string{"gpt-5.1"}, Status: PersonalProviderStatusEnabled}
	if err := CreatePersonalProviderConnection(connection, "sk-test"); err != nil {
		t.Fatalf("create connection: %v", err)
	}
	verified, err := VerifyPersonalProviderConnection("user-a", connection.Id)
	if err != nil {
		t.Fatalf("VerifyPersonalProviderConnection: %v", err)
	}
	if !verified.LastCheckOK || verified.LastCheckedAt == 0 || verified.LastCheckError != "" {
		t.Fatalf("verification result = %+v", verified)
	}
	var stored PersonalProviderConnection
	if err := db.First(&stored, "id = ?", connection.Id).Error; err != nil {
		t.Fatalf("load stored connection: %v", err)
	}
	if !stored.LastCheckOK || stored.LastCheckedAt == 0 || stored.LastCheckError != "" {
		t.Fatalf("stored verification result = %+v", stored)
	}
}

func TestPersonalProviderVerificationEndpointUsesProtocolHeaders(t *testing.T) {
	endpoint, err := personalProviderVerificationEndpoint(&PersonalProviderConnection{Protocol: "gemini"})
	if err != nil || endpoint != "https://generativelanguage.googleapis.com/v1beta/models" {
		t.Fatalf("gemini endpoint = %q, %v", endpoint, err)
	}
	endpoint, err = personalProviderVerificationEndpoint(&PersonalProviderConnection{Protocol: "ali"})
	if err != nil || endpoint != "https://dashscope.aliyuncs.com/compatible-mode/v1/models" {
		t.Fatalf("ali endpoint = %q, %v", endpoint, err)
	}
}
