package common

import (
	"context"
	"strings"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/yeying-community/router/common/config"
	"github.com/yeying-community/router/common/logger"
)

var RDB redis.Cmdable
var RedisEnabled = true

// InitRedisClient This function is called after init()
func InitRedisClient() (err error) {
	if RedisConnString == "" {
		RedisEnabled = false
		logger.SysLog("redis.conn_string not set, Redis is not enabled")
		return nil
	}
	if config.SyncFrequency <= 0 {
		RedisEnabled = false
		logger.SysLog("cache.sync_frequency_seconds not set or invalid, Redis is disabled")
		return nil
	}
	redisConnString := RedisConnString
	if RedisMasterName == "" {
		logger.SysLog("Redis is enabled")
		opt, err := redis.ParseURL(redisConnString)
		if err != nil {
			logger.FatalLog("failed to parse Redis connection string: " + err.Error())
		}
		RDB = redis.NewClient(opt)
	} else {
		// cluster mode
		logger.SysLog("Redis cluster mode enabled")
		RDB = redis.NewUniversalClient(&redis.UniversalOptions{
			Addrs:      strings.Split(redisConnString, ","),
			Password:   RedisPassword,
			MasterName: RedisMasterName,
		})
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err = RDB.Ping(ctx).Result()
	if err != nil {
		logger.FatalLog("Redis ping test failed: " + err.Error())
	}
	return err
}

func ParseRedisOption() *redis.Options {
	opt, err := redis.ParseURL(RedisConnString)
	if err != nil {
		logger.FatalLog("failed to parse Redis connection string: " + err.Error())
	}
	return opt
}

func RedisSet(key string, value string, expiration time.Duration) error {
	ctx := context.Background()
	return RDB.Set(ctx, key, value, expiration).Err()
}

func RedisGet(key string) (string, error) {
	ctx := context.Background()
	return RDB.Get(ctx, key).Result()
}

func RedisDel(key string) error {
	ctx := context.Background()
	return RDB.Del(ctx, key).Err()
}

func RedisDecrease(key string, value int64) error {
	ctx := context.Background()
	return RDB.DecrBy(ctx, key, value).Err()
}
