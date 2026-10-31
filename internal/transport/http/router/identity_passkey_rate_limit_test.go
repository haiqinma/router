package router

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/yeying-community/router/common"
	"github.com/yeying-community/router/common/config"
	"github.com/yeying-community/router/internal/admin/model"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestIdentityPasskeyLoginStatusUsesGlobalButNotCriticalRateLimit(t *testing.T) {
	previousDB := model.DB
	previousDebugEnabled := config.DebugEnabled
	previousRedisEnabled := common.RedisEnabled
	previousGlobalLimit := config.GlobalApiRateLimitNum
	previousGlobalDuration := config.GlobalApiRateLimitDuration
	previousCriticalLimit := config.CriticalRateLimitNum
	previousCriticalDuration := config.CriticalRateLimitDuration
	previousIdentityNodeURL := config.IdentityNodeURL
	previousIdentityAppID := config.IdentityAppID
	t.Cleanup(func() {
		model.DB = previousDB
		config.DebugEnabled = previousDebugEnabled
		common.RedisEnabled = previousRedisEnabled
		config.GlobalApiRateLimitNum = previousGlobalLimit
		config.GlobalApiRateLimitDuration = previousGlobalDuration
		config.CriticalRateLimitNum = previousCriticalLimit
		config.CriticalRateLimitDuration = previousCriticalDuration
		config.IdentityNodeURL = previousIdentityNodeURL
		config.IdentityAppID = previousIdentityAppID
	})

	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&model.IdentityPasskeyLoginSession{}); err != nil {
		t.Fatalf("migrate passkey login sessions: %v", err)
	}
	model.DB = db
	config.DebugEnabled = false
	common.RedisEnabled = false
	config.GlobalApiRateLimitNum = 25
	config.GlobalApiRateLimitDuration = 180
	config.CriticalRateLimitNum = 20
	config.CriticalRateLimitDuration = 20 * 60
	config.IdentityNodeURL = ""
	config.IdentityAppID = ""

	gin.SetMode(gin.TestMode)
	engine := gin.New()
	if err := engine.SetTrustedProxies(nil); err != nil {
		t.Fatalf("disable trusted proxies: %v", err)
	}
	SetApiRouter(engine)

	statusIP := "192.0.2.25:1234"
	for i := 0; i < config.GlobalApiRateLimitNum; i++ {
		request := httptest.NewRequest(http.MethodGet, "/api/v1/public/auth/identity/passkey/login/status?session_id=missing", nil)
		request.RemoteAddr = statusIP
		recorder := httptest.NewRecorder()
		engine.ServeHTTP(recorder, request)
		if recorder.Code == http.StatusTooManyRequests {
			t.Fatalf("status poll %d was rejected before the global API limit", i+1)
		}
	}

	request := httptest.NewRequest(http.MethodGet, "/api/v1/public/auth/identity/passkey/login/status?session_id=missing", nil)
	request.RemoteAddr = statusIP
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusTooManyRequests {
		t.Fatalf("status poll beyond the global API limit returned %d, want 429", recorder.Code)
	}

	criticalIP := "192.0.2.26:1234"
	for i := 0; i < config.CriticalRateLimitNum; i++ {
		request := httptest.NewRequest(http.MethodPost, "/api/v1/public/auth/identity/passkey/login/session", nil)
		request.RemoteAddr = criticalIP
		recorder := httptest.NewRecorder()
		engine.ServeHTTP(recorder, request)
		if recorder.Code == http.StatusTooManyRequests {
			t.Fatalf("critical login request %d was rejected before the critical limit", i+1)
		}
	}

	request = httptest.NewRequest(http.MethodPost, "/api/v1/public/auth/identity/passkey/login/session", nil)
	request.RemoteAddr = criticalIP
	recorder = httptest.NewRecorder()
	engine.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusTooManyRequests {
		t.Fatalf("critical login request beyond the configured limit returned %d, want 429", recorder.Code)
	}
}
