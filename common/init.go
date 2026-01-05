package common

import (
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/yeying-community/router/common/config"
	"github.com/yeying-community/router/common/logger"
)

var (
	Port         = flag.Int("port", 3000, "the listening port")
	PrintVersion = flag.Bool("version", false, "print version and exit")
	PrintHelp    = flag.Bool("help", false, "print help and exit")
	LogDir       = flag.String("log-dir", "./logs", "specify the log directory")
)

func printHelp() {
	fmt.Println("Router " + Version + " - All in router service for OpenAI API.")
	fmt.Println("Copyright (C) 2023 JustSong. All rights reserved.")
	fmt.Println("GitHub: https://github.com/yeying-community/router")
	fmt.Println("Usage: one-api [--port <port>] [--log-dir <log directory>] [--version] [--help]")
}

func Init() {
	flag.Parse()

	if *PrintVersion {
		fmt.Println(Version)
		os.Exit(0)
	}

	if *PrintHelp {
		printHelp()
		os.Exit(0)
	}

	if os.Getenv("SESSION_SECRET") != "" {
		if os.Getenv("SESSION_SECRET") == "random_string" {
			logger.SysError("SESSION_SECRET is set to an example value, please change it to a random string.")
		} else {
			config.SessionSecret = os.Getenv("SESSION_SECRET")
		}
	}
	// Wallet login configuration
	if os.Getenv("WALLET_LOGIN_ENABLED") != "" {
		config.WalletLoginEnabled = os.Getenv("WALLET_LOGIN_ENABLED") == "true"
	}
	if chains := os.Getenv("WALLET_ALLOWED_CHAINS"); chains != "" {
		config.WalletAllowedChains = strings.Split(chains, ",")
	}
	if os.Getenv("WALLET_AUTO_REGISTER_ENABLED") != "" {
		config.WalletAutoRegisterEnabled = os.Getenv("WALLET_AUTO_REGISTER_ENABLED") == "true"
	}
	if envSecret := os.Getenv("WALLET_JWT_SECRET"); envSecret != "" {
		config.WalletJWTSecret = envSecret
	}
	if envFallback := os.Getenv("WALLET_JWT_FALLBACK_SECRETS"); envFallback != "" {
		parts := strings.Split(envFallback, ",")
		config.WalletJWTFallbackSecrets = make([]string, 0, len(parts))
		for _, p := range parts {
			p = strings.TrimSpace(p)
			if p != "" {
				config.WalletJWTFallbackSecrets = append(config.WalletJWTFallbackSecrets, p)
			}
		}
	}
	if envExpire := os.Getenv("WALLET_JWT_EXPIRE_HOURS"); envExpire != "" {
		if v, err := strconv.Atoi(envExpire); err == nil && v > 0 {
			config.WalletJWTExpireHours = v
		}
	}
	if envTTL := os.Getenv("WALLET_NONCE_TTL_MINUTES"); envTTL != "" {
		if v, err := strconv.Atoi(envTTL); err == nil && v > 0 {
			config.WalletNonceTTLMinutes = v
		}
	}
	if envRoot := os.Getenv("WALLET_ROOT_ALLOWED_ADDRESSES"); envRoot != "" {
		parts := strings.Split(envRoot, ",")
		config.WalletRootAllowedAddresses = make([]string, 0, len(parts))
		for _, p := range parts {
			if p == "" {
				continue
			}
			config.WalletRootAllowedAddresses = append(config.WalletRootAllowedAddresses, strings.ToLower(strings.TrimSpace(p)))
		}
	}
	if os.Getenv("SQLITE_PATH") != "" {
		SQLitePath = os.Getenv("SQLITE_PATH")
	}

	// Fallbacks
	if config.WalletJWTSecret == "" {
		config.WalletJWTSecret = config.SessionSecret
	}
	if *LogDir != "" {
		var err error
		*LogDir, err = filepath.Abs(*LogDir)
		if err != nil {
			log.Fatal(err)
		}
		if _, err := os.Stat(*LogDir); os.IsNotExist(err) {
			err = os.Mkdir(*LogDir, 0777)
			if err != nil {
				log.Fatal(err)
			}
		}
		logger.LogDir = *LogDir
	}
}
