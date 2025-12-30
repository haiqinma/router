package common

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/yeying-community/router/common/config"
)

// WalletClaims defines JWT claims for wallet login.
type WalletClaims struct {
	UserID        int    `json:"user_id"`
	WalletAddress string `json:"wallet_address"`
	jwt.RegisteredClaims
}

// GenerateWalletJWT issues a JWT for the given user id and wallet address.
func GenerateWalletJWT(userID int, walletAddress string) (token string, expiresAt time.Time, err error) {
	secret := []byte(config.WalletJWTSecret)
	if len(secret) == 0 {
		return "", time.Time{}, errors.New("wallet jwt secret not configured")
	}
	expiresAt = time.Now().Add(time.Duration(config.WalletJWTExpireHours) * time.Hour)
	claims := WalletClaims{
		UserID:        userID,
		WalletAddress: walletAddress,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			NotBefore: jwt.NewNumericDate(time.Now()),
			Subject:   walletAddress,
		},
	}
	tokenObj := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	token, err = tokenObj.SignedString(secret)
	return
}

// VerifyWalletJWT validates token and returns claims.
func VerifyWalletJWT(tokenString string) (*WalletClaims, error) {
	secret := []byte(config.WalletJWTSecret)
	if len(secret) == 0 {
		return nil, errors.New("wallet jwt secret not configured")
	}
	parsed, err := jwt.ParseWithClaims(tokenString, &WalletClaims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return secret, nil
	})
	if err != nil {
		return nil, err
	}
	if claims, ok := parsed.Claims.(*WalletClaims); ok && parsed.Valid {
		return claims, nil
	}
	return nil, errors.New("invalid token")
}
