package controller

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/yeying-community/router/common/logger"
	"github.com/yeying-community/router/internal/admin/model"
	"github.com/yeying-community/router/internal/relay/adaptor/openai"
	relaymodel "github.com/yeying-community/router/internal/relay/model"
)

const groupDailyQuotaExceededCode = "group_daily_quota_exceeded"

func reserveGroupDailyQuota(groupID string, userID string, quota int64) (model.GroupDailyQuotaReservation, *relaymodel.ErrorWithStatusCode) {
	reservation, allowed, err := model.ReserveGroupDailyQuota(groupID, userID, quota)
	if err != nil {
		return model.GroupDailyQuotaReservation{}, openai.ErrorWrapper(err, "reserve_group_daily_quota_failed", http.StatusInternalServerError)
	}
	if !allowed {
		return model.GroupDailyQuotaReservation{}, openai.ErrorWrapper(errors.New("当前分组套餐每日额度已达上限，请明日再试"), groupDailyQuotaExceededCode, http.StatusForbidden)
	}
	return reservation, nil
}

func releaseGroupDailyQuotaReservation(ctx context.Context, reservation model.GroupDailyQuotaReservation) {
	if !reservation.Active() {
		return
	}
	if err := model.ReleaseGroupDailyQuotaReservation(reservation); err != nil {
		logger.Error(ctx, "release group daily quota reservation failed: "+err.Error())
	}
}

func settleGroupDailyQuotaReservation(ctx context.Context, reservation model.GroupDailyQuotaReservation, consumedQuota int64) {
	if !reservation.Active() {
		return
	}
	if err := model.SettleGroupDailyQuotaReservation(reservation, consumedQuota); err != nil {
		logger.Error(ctx, "settle group daily quota reservation failed: "+err.Error())
	}
}

func IsGroupDailyQuotaExceededError(err *relaymodel.ErrorWithStatusCode) bool {
	if err == nil {
		return false
	}
	code := strings.TrimSpace(fmt.Sprint(err.Code))
	return code == groupDailyQuotaExceededCode
}
