package controller

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/yeying-community/router/common/helper"
	"github.com/yeying-community/router/common/random"

	"github.com/gin-gonic/gin"

	"github.com/yeying-community/router/common"
	"github.com/yeying-community/router/common/config"
	"github.com/yeying-community/router/common/logger"
	"github.com/yeying-community/router/internal/admin/model"
	"github.com/yeying-community/router/internal/relay/adaptor/anthropic"
	"github.com/yeying-community/router/internal/relay/adaptor/openai"
	"github.com/yeying-community/router/internal/relay/billing"
	relaychannel "github.com/yeying-community/router/internal/relay/channel"
	"github.com/yeying-community/router/internal/relay/controller/validator"
	"github.com/yeying-community/router/internal/relay/meta"
	relaymodel "github.com/yeying-community/router/internal/relay/model"
	"github.com/yeying-community/router/internal/relay/relaymode"
	"github.com/yeying-community/router/internal/tokenestimate"
)

func getAndValidateTextRequest(c *gin.Context, relayMode int) (*relaymodel.GeneralOpenAIRequest, []byte, error) {
	var (
		textRequest *relaymodel.GeneralOpenAIRequest
		rawBody     []byte
		err         error
	)
	if relayMode == relaymode.Messages {
		requestBody, getErr := common.GetRequestBody(c)
		if getErr != nil {
			return nil, nil, getErr
		}
		rawBody = append([]byte(nil), requestBody...)
		textRequest, err = anthropic.ParseMessagesRequestToRelayRequest(requestBody)
		if err != nil {
			return nil, rawBody, err
		}
	} else {
		textRequest = &relaymodel.GeneralOpenAIRequest{}
		err = common.UnmarshalBodyReusable(c, textRequest)
		if err != nil {
			return nil, nil, err
		}
	}
	if relayMode == relaymode.Moderations && textRequest.Model == "" {
		textRequest.Model = "text-moderation-latest"
	}
	if relayMode == relaymode.Embeddings && textRequest.Model == "" {
		textRequest.Model = c.Param("model")
	}
	if relayMode != relaymode.Messages {
		err = validator.ValidateTextRequest(textRequest, relayMode)
		if err != nil {
			return nil, rawBody, err
		}
	}
	return textRequest, rawBody, nil
}

func getPreConsumedQuota(textRequest *relaymodel.GeneralOpenAIRequest, promptTokens int, ratio float64) int64 {
	preConsumedTokens := config.PreConsumedQuota + int64(promptTokens)
	if maxOutputTokens := resolveTextMaxOutputTokens(textRequest); maxOutputTokens != 0 {
		preConsumedTokens += int64(maxOutputTokens)
	}
	return int64(float64(preConsumedTokens) * ratio)
}

func resolveTextMaxOutputTokens(textRequest *relaymodel.GeneralOpenAIRequest) int {
	if textRequest == nil {
		return 0
	}
	maxTokens := textRequest.MaxTokens
	if textRequest.MaxCompletionTokens != nil && *textRequest.MaxCompletionTokens > maxTokens {
		maxTokens = *textRequest.MaxCompletionTokens
	}
	if textRequest.MaxOutputTokens != nil && *textRequest.MaxOutputTokens > maxTokens {
		maxTokens = *textRequest.MaxOutputTokens
	}
	if maxTokens < 0 {
		return 0
	}
	return maxTokens
}

func getAvailableUserBalanceForBilling(ctx context.Context, userID string, groupID string) (int64, error) {
	userBalanceAmount, err := model.CacheGetUserQuota(ctx, userID)
	if err != nil {
		return 0, err
	}
	if strings.TrimSpace(groupID) == "" {
		return userBalanceAmount, nil
	}
	groupBalanceAmount, err := model.CacheGetUserQuotaForGroup(ctx, userID, groupID)
	if err != nil {
		return 0, err
	}
	if groupBalanceAmount < userBalanceAmount {
		return groupBalanceAmount, nil
	}
	return userBalanceAmount, nil
}

func preConsumeQuota(ctx context.Context, preConsumedQuota int64, meta *meta.Meta, billingPlan relayBillingPlan) (int64, *relaymodel.ErrorWithStatusCode) {
	var err error
	chargeUserBalance := billingPlan.ChargeUserBalance()
	chargeTokenQuota := billingPlan.ChargeTokenQuota()
	if !chargeUserBalance {
		if !chargeTokenQuota {
			return 0, nil
		}
		if strings.TrimSpace(meta.TokenId) == "" {
			return 0, nil
		}
		err = model.PreConsumeTokenRemainQuota(meta.TokenId, preConsumedQuota)
		if err != nil {
			logTokenPreConsumeFailure(ctx, meta, preConsumedQuota, chargeUserBalance, err)
			return preConsumedQuota, openai.ErrorWrapper(err, "pre_consume_token_quota_failed", http.StatusForbidden)
		}
		return preConsumedQuota, nil
	}
	userBalanceAmount, err := getAvailableUserBalanceForBilling(ctx, meta.UserId, meta.Group)
	if err != nil {
		return preConsumedQuota, openai.ErrorWrapper(err, "get_user_balance_failed", http.StatusInternalServerError)
	}
	if userBalanceAmount-preConsumedQuota < 0 {
		return preConsumedQuota, openai.ErrorWrapper(errors.New("user balance is not enough"), "insufficient_user_balance", http.StatusForbidden)
	}
	if userBalanceAmount > 100*preConsumedQuota {
		// in this case, we do not pre-consume quota
		// because the user has enough quota
		logger.Debugf(ctx, "user %s has enough balance %d, trusted and no need to pre-consume", meta.UserId, userBalanceAmount)
		return 0, nil
	}
	err = model.CacheDecreaseUserQuota(meta.UserId, preConsumedQuota)
	if err != nil {
		return preConsumedQuota, openai.ErrorWrapper(err, "decrease_user_quota_failed", http.StatusInternalServerError)
	}
	err = model.CacheDecreaseUserQuotaForGroup(meta.UserId, meta.Group, preConsumedQuota)
	if err != nil {
		return preConsumedQuota, openai.ErrorWrapper(err, "decrease_user_group_quota_failed", http.StatusInternalServerError)
	}
	if preConsumedQuota > 0 {
		if strings.TrimSpace(meta.TokenId) != "" {
			err := model.PreConsumeTokenQuota(meta.TokenId, preConsumedQuota)
			if err != nil {
				logTokenPreConsumeFailure(ctx, meta, preConsumedQuota, chargeUserBalance, err)
				return preConsumedQuota, openai.ErrorWrapper(err, "pre_consume_token_quota_failed", http.StatusForbidden)
			}
		}
	}
	return preConsumedQuota, nil
}

func logTokenPreConsumeFailure(ctx context.Context, meta *meta.Meta, quota int64, chargeUserBalance bool, cause error) {
	if meta == nil {
		logger.Warnf(ctx, "token pre-consume failed quota=%d charge_user_balance=%t error=%v", quota, chargeUserBalance, cause)
		return
	}
	tokenID := strings.TrimSpace(meta.TokenId)
	if tokenID == "" {
		logger.Warnf(
			ctx,
			"token pre-consume failed token_id= user_id=%s group=%s model=%s channel_id=%s quota=%d charge_user_balance=%t error=%v",
			strings.TrimSpace(meta.UserId),
			strings.TrimSpace(meta.Group),
			strings.TrimSpace(meta.OriginModelName),
			strings.TrimSpace(meta.ChannelId),
			quota,
			chargeUserBalance,
			cause,
		)
		return
	}
	token, err := model.GetTokenById(tokenID)
	if err != nil {
		logger.Warnf(
			ctx,
			"token pre-consume failed token_id=%s user_id=%s group=%s model=%s channel_id=%s quota=%d charge_user_balance=%t token_lookup_error=%v error=%v",
			tokenID,
			strings.TrimSpace(meta.UserId),
			strings.TrimSpace(meta.Group),
			strings.TrimSpace(meta.OriginModelName),
			strings.TrimSpace(meta.ChannelId),
			quota,
			chargeUserBalance,
			err,
			cause,
		)
		return
	}
	logger.Warnf(
		ctx,
		"token pre-consume failed token_id=%s token_name=%s user_id=%s group=%s model=%s channel_id=%s quota=%d token_remain_quota=%d token_unlimited=%t charge_user_balance=%t error=%v",
		tokenID,
		strings.TrimSpace(token.Name),
		strings.TrimSpace(meta.UserId),
		strings.TrimSpace(meta.Group),
		strings.TrimSpace(meta.OriginModelName),
		strings.TrimSpace(meta.ChannelId),
		quota,
		token.RemainQuota,
		token.UnlimitedQuota,
		chargeUserBalance,
		cause,
	)
}

func consumeTokenRequestCount(ctx context.Context, tokenID string, requestCount int64) {
	if strings.TrimSpace(tokenID) == "" || requestCount <= 0 {
		return
	}
	if err := model.ConsumeTokenRequestCount(tokenID, requestCount); err != nil {
		logger.Errorf(ctx, "token request count consume failed code=consume_token_request_count_failed token_id=%s request_count=%d err=%q", strings.TrimSpace(tokenID), requestCount, err.Error())
	}
}

func postConsumeQuota(ctx context.Context, usage *relaymodel.Usage, meta *meta.Meta, textRequest *relaymodel.GeneralOpenAIRequest, pricing model.ResolvedModelPricing, preConsumedQuota int64, estimatedOutputTokens int, estimatedChargeAmount int64, billingRatio model.BillingRatioBreakdown, estimateResult tokenestimate.EstimateResult, responsesImageTools []responsesImageToolSpec, systemPromptReset bool, billingPlan relayBillingPlan) {
	if usage == nil {
		logger.Error(ctx, "usage is nil, which is unexpected")
		releaseRelayBillingPlan(ctx, billingPlan)
		return
	}
	if strings.TrimSpace(meta.CommunityOfferID) != "" {
		postConsumeCommunityOffer(ctx, usage, meta, textRequest)
		return
	}
	groupRatio := billingRatio.EffectiveRatio
	chargeUserBalance := billingPlan.ChargeUserBalance()
	chargeTokenQuota := billingPlan.ChargeTokenQuota()
	personalProviderRequest := billingPlan.IsPersonalProvider()
	promptTokens := usage.PromptTokens
	completionTokens := usage.CompletionTokens
	quota := preConsumedQuota
	settlementPricing := model.ResolveTextUsagePricing(pricing, meta.UpstreamRequestPath, promptTokens, completionTokens)
	billingSnapshot, snapshotErr := billing.ComputeTextBillingSnapshotWithUsage(*usage, settlementPricing, groupRatio)
	if snapshotErr != nil {
		logger.Error(ctx, "calculate text billing snapshot failed: "+snapshotErr.Error())
	}
	billingSnapshot.SetBillingRatioBreakdown(billingRatio)
	annotateTextBillingSnapshot(&billingSnapshot, settlementPricing.Source, resolveTextEstimateSourceLabel(estimateResult), meta.UpstreamRequestPath, textRequest)
	imageFeeNote := ""
	_, imageFeeNote, imageFeeErr := maybeApplyResponsesImageToolBilling(&billingSnapshot, usage, meta.ChannelProtocol, meta.ChannelModelConfigs, groupRatio, responsesImageTools)
	if imageFeeErr != nil {
		logger.Error(ctx, "calculate responses image tool billing failed: "+imageFeeErr.Error())
	}
	if snapshotErr == nil {
		if err := billing.ApplyEstimatedProcurementCostFloor(&billingSnapshot, meta.ChannelId, meta.ActualModelName); err != nil {
			logger.Error(ctx, "estimate procurement cost for text settlement failed: "+err.Error())
		}
		quota = billingSnapshot.ChargeAmount
	}
	totalTokens := promptTokens + completionTokens
	if totalTokens == 0 {
		// in this case, must be some error happened
		// we cannot just return, because we may have to return the pre-consumed quota
		quota = 0
	}
	if personalProviderRequest {
		// A personal key has no trustworthy Router-side purchase price. Do not
		// expose the community catalog estimate as a charge or a cost reference.
		quota = 0
		billingSnapshot = billing.BillingSnapshot{}
	}
	var err error
	quotaDelta := quota - preConsumedQuota
	if strings.TrimSpace(meta.TokenId) != "" && chargeTokenQuota {
		if chargeUserBalance {
			err = model.PostConsumeTokenQuota(meta.TokenId, quotaDelta)
		} else {
			err = model.PostConsumeTokenRemainQuota(meta.TokenId, quotaDelta)
		}
		if err != nil {
			logger.Error(ctx, "error consuming token remain quota: "+err.Error())
		}
	}
	balanceSource := model.LogBillingSourceSnapshot{}
	if chargeUserBalance {
		if quota > 0 {
			consumeResult, consumeErr := model.ConsumeUserBalanceLotsForGroupDetailed(meta.UserId, meta.Group, quota)
			if consumeErr != nil {
				logger.Error(ctx, "error consuming user balance lots: "+consumeErr.Error())
			} else {
				balanceSource = consumeResult.LogBillingSourceSnapshot()
				if consumeResult.ConsumedAmount < quota {
					logger.Warnf(ctx, "user balance lot coverage partial user=%s consumed=%d requested=%d", strings.TrimSpace(meta.UserId), consumeResult.ConsumedAmount, quota)
				}
			}
		}
		err = model.CacheUpdateUserQuota(ctx, meta.UserId)
		if err != nil {
			logger.Error(ctx, "error update user quota cache: "+err.Error())
		}
		err = model.CacheUpdateUserQuotaForGroup(ctx, meta.UserId, meta.Group)
		if err != nil {
			logger.Error(ctx, "error update user group quota cache: "+err.Error())
		}
	}
	userDailyQuota := 0
	userEmergencyQuota := 0
	if !chargeUserBalance {
		dailyConsumed, emergencyConsumed := settleRelayBillingPlan(ctx, billingPlan, quota)
		userDailyQuota = int(dailyConsumed)
		userEmergencyQuota = int(emergencyConsumed)
	}
	if !personalProviderRequest {
		billingSnapshot.ChargeAmount = quota
		billingSnapshot.SetBillingRatioBreakdown(billingRatio)
	}
	entry := &model.Log{
		UserId:             meta.UserId,
		GroupId:            meta.Group,
		ChannelId:          meta.ChannelId,
		PromptTokens:       promptTokens,
		CompletionTokens:   completionTokens,
		ModelName:          textRequest.Model,
		TokenName:          meta.TokenName,
		Quota:              quota,
		UserDailyQuota:     userDailyQuota,
		UserEmergencyQuota: userEmergencyQuota,
		Content:            buildTextBillingLogContent(settlementPricing, groupRatio, imageFeeNote),
		IsStream:           meta.IsStream,
		ElapsedTime:        helper.CalcElapsedTime(meta.StartTime),
	}
	if personalProviderRequest {
		model.ApplyPersonalProviderLogBillingSource(entry)
		entry.Content = "个人供应商调用，未扣社区套餐或账户余额"
	} else {
		model.ApplyConsumeLogBillingSource(entry, chargeUserBalance, billingPlan.LogBillingSourceSnapshot(), balanceSource)
	}
	applyRouteObservabilityToLog(entry, meta, textRequest.Model)
	billingSnapshot.ApplyToLog(entry)
	if !personalProviderRequest {
		annotateTextEstimateLogFields(entry, estimateResult)
		annotateTextPreConsumeLogFields(entry, estimateResult.PromptTokens, estimatedOutputTokens, estimatedChargeAmount)
	}
	if strings.TrimSpace(meta.PersonalProviderID) == "" {
		billing.ApplyProcurementCostObservation(entry)
	}
	model.RecordConsumeLog(ctx, entry)
	if strings.TrimSpace(meta.PersonalProviderID) == "" {
		billing.RecordProcurementConsumptionObservation(ctx, entry)
		model.UpdateUserUsedQuotaAndRequestCount(meta.UserId, quota)
		model.UpdateChannelUsedQuota(meta.ChannelId, quota)
	}
	consumeTokenRequestCount(ctx, meta.TokenId, 1)
}

// postConsumeCommunityOffer is deliberately separate from package and
// procurement billing. Community offer revenue is an amount owed to a third
// party publisher, not a Router upstream purchase cost.
func postConsumeCommunityOffer(ctx context.Context, usage *relaymodel.Usage, relayMeta *meta.Meta, textRequest *relaymodel.GeneralOpenAIRequest) {
	if usage == nil || relayMeta == nil || textRequest == nil {
		return
	}
	inputTokens := int64(usage.PromptTokens)
	outputTokens := int64(usage.CompletionTokens)
	if inputTokens+outputTokens <= 0 {
		consumeTokenRequestCount(ctx, relayMeta.TokenId, 1)
		return
	}
	requestLogID := random.GetUUID()
	settlementInput := model.PublisherOfferSettlementInput{
		RequestLogID: requestLogID, OfferID: relayMeta.CommunityOfferID, ConsumerUserID: relayMeta.UserId,
		InputTokens: inputTokens, OutputTokens: outputTokens,
	}
	quote, err := model.QuotePublisherOfferSettlement(settlementInput)
	if err != nil {
		logger.Errorf(ctx, "community offer quote failed user_id=%s offer_id=%s err=%q", strings.TrimSpace(relayMeta.UserId), strings.TrimSpace(relayMeta.CommunityOfferID), err.Error())
		return
	}
	quota, chargeRate, err := model.CommunityOfferQuotaForMicros(quote.ConsumerAmountMicros)
	if err != nil {
		logger.Errorf(ctx, "community offer quota conversion failed user_id=%s offer_id=%s err=%q", strings.TrimSpace(relayMeta.UserId), strings.TrimSpace(relayMeta.CommunityOfferID), err.Error())
		return
	}
	delivery, err := model.PreparePublisherSettlementDeliveryForCharge(quote, quota, chargeRate)
	if err != nil {
		// Do this before touching a balance lot. Without a durable handoff we
		// cannot safely create a charge that may lose its publisher payable.
		logger.Errorf(ctx, "community offer settlement delivery prepare failed request_log_id=%s offer_id=%s err=%q", requestLogID, quote.OfferID, err.Error())
		return
	}
	balanceSource := model.LogBillingSourceSnapshot{}
	chargedQuota := int64(0)
	if quota > 0 {
		consumeResult, consumeErr := model.ConsumeUserBalanceLotsForGroupDetailed(relayMeta.UserId, "", quota)
		if consumeErr != nil {
			logger.Errorf(ctx, "community offer balance consume failed user_id=%s offer_id=%s quota=%d err=%q", strings.TrimSpace(relayMeta.UserId), strings.TrimSpace(relayMeta.CommunityOfferID), quota, consumeErr.Error())
			return
		}
		chargedQuota = consumeResult.ConsumedAmount
		if _, err := model.RecordPublisherSettlementDeliveryCharge(requestLogID, chargedQuota); err != nil {
			logger.Errorf(ctx, "community offer charged quota snapshot failed request_log_id=%s offer_id=%s quota=%d err=%q", requestLogID, quote.OfferID, chargedQuota, err.Error())
			return
		}
		if consumeResult.ConsumedAmount < quota {
			logger.Errorf(ctx, "community offer balance coverage partial user_id=%s offer_id=%s consumed=%d expected=%d", strings.TrimSpace(relayMeta.UserId), strings.TrimSpace(relayMeta.CommunityOfferID), consumeResult.ConsumedAmount, quota)
			return
		}
		balanceSource = consumeResult.LogBillingSourceSnapshot()
	}
	if quota == 0 {
		if _, err := model.RecordPublisherSettlementDeliveryCharge(requestLogID, chargedQuota); err != nil {
			logger.Errorf(ctx, "community offer zero quota snapshot failed request_log_id=%s offer_id=%s err=%q", requestLogID, quote.OfferID, err.Error())
			return
		}
	}
	entry := &model.Log{
		Id: requestLogID, UserId: relayMeta.UserId, GroupId: "", ChannelId: relayMeta.ChannelId,
		PromptTokens: usage.PromptTokens, CompletionTokens: usage.CompletionTokens, ModelName: textRequest.Model,
		TokenName: relayMeta.TokenName, Quota: quota, IsStream: relayMeta.IsStream,
		ElapsedTime:   helper.CalcElapsedTime(relayMeta.StartTime),
		Content:       fmt.Sprintf("社区报价调用: offer=%s currency=%s consumer_amount_micros=%d platform_fee_micros=%d publisher_payable_micros=%d", delivery.OfferID, delivery.Currency, delivery.ConsumerAmountMicros, delivery.PlatformFeeAmountMicros, delivery.PublisherPayableMicros),
		BillingSource: model.LogBillingSourceBalance, BillingSourceID: balanceSource.ID, BillingSourceName: balanceSource.Name, BillingSourceDetail: balanceSource.Detail,
		BillingPriceUnit: "per_1m_tokens", BillingCurrency: model.BillingCurrencyCodeUSD, BillingPricingSource: "community_offer", BillingUsageSource: "upstream_usage",
		BillingSettlementMode: "community_offer", BillingEffectiveRatio: 1, BillingChargeRate: chargeRate,
		BillingInputQuantity: float64(inputTokens), BillingOutputQuantity: float64(outputTokens), BillingAmount: float64(delivery.ConsumerAmountMicros) / 1_000_000,
		BillingChargeAmount: quota,
	}
	applyRouteObservabilityToLog(entry, relayMeta, textRequest.Model)
	model.RecordConsumeLog(ctx, entry)
	if _, err := model.MarkPublisherSettlementDeliveryReady(requestLogID); err != nil {
		// The worker will retry readiness after it observes the log. A missing
		// log intentionally remains prepared instead of fabricating an payable.
		logger.Errorf(ctx, "community offer settlement delivery not ready request_log_id=%s offer_id=%s err=%q", requestLogID, quote.OfferID, err.Error())
	} else if _, err := model.DeliverPublisherSettlement(requestLogID); err != nil {
		logger.Errorf(ctx, "community offer settlement delivery failed request_log_id=%s offer_id=%s err=%q", requestLogID, quote.OfferID, err.Error())
	}
	if strings.TrimSpace(relayMeta.TokenId) != "" && quota > 0 {
		if err := model.PostConsumeTokenQuota(relayMeta.TokenId, quota); err != nil {
			logger.Errorf(ctx, "community offer token quota consume failed token_id=%s quota=%d err=%q", strings.TrimSpace(relayMeta.TokenId), quota, err.Error())
		}
	}
	_ = model.CacheUpdateUserQuota(ctx, relayMeta.UserId)
	model.UpdateUserUsedQuotaAndRequestCount(relayMeta.UserId, quota)
	consumeTokenRequestCount(ctx, relayMeta.TokenId, 1)
}

func getMappedModelName(modelName string, mapping map[string]string) (string, bool) {
	if mapping == nil {
		return modelName, false
	}
	mappedModelName := mapping[modelName]
	if mappedModelName != "" {
		return mappedModelName, true
	}
	return modelName, false
}

func isErrorHappened(meta *meta.Meta, resp *http.Response) bool {
	if resp == nil {
		if meta.ChannelProtocol == relaychannel.AwsClaude {
			return false
		}
		return true
	}
	if resp.StatusCode != http.StatusOK &&
		// replicate return 201 to create a task
		resp.StatusCode != http.StatusCreated {
		return true
	}
	if meta.ChannelProtocol == relaychannel.DeepL {
		// skip stream check for deepl
		return false
	}

	if meta.IsStream && strings.HasPrefix(resp.Header.Get("Content-Type"), "application/json") &&
		// Even if stream mode is enabled, replicate will first return a task info in JSON format,
		// requiring the client to request the stream endpoint in the task info
		meta.ChannelProtocol != relaychannel.Replicate {
		return true
	}
	return false
}
