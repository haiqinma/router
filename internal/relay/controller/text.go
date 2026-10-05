package controller

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/yeying-community/router/common"
	"github.com/yeying-community/router/common/config"
	"github.com/yeying-community/router/common/logger"
	adminmodel "github.com/yeying-community/router/internal/admin/model"
	"github.com/yeying-community/router/internal/relay"
	"github.com/yeying-community/router/internal/relay/adaptor"
	"github.com/yeying-community/router/internal/relay/adaptor/openai"
	"github.com/yeying-community/router/internal/relay/apitype"
	"github.com/yeying-community/router/internal/relay/billing"
	relaychannel "github.com/yeying-community/router/internal/relay/channel"
	"github.com/yeying-community/router/internal/relay/meta"
	"github.com/yeying-community/router/internal/relay/model"
	"github.com/yeying-community/router/internal/relay/relaymode"
	"github.com/yeying-community/router/internal/tokenestimate"
)

func logTextStreamAcceptConflict(c *gin.Context, meta *meta.Meta) {
	if c == nil || c.Request == nil || meta == nil {
		return
	}
	accept := strings.ToLower(strings.TrimSpace(c.Request.Header.Get("Accept")))
	if accept == "" {
		return
	}
	const sse = "text/event-stream"
	hasSSEAccept := strings.Contains(accept, sse)
	if meta.IsStream == hasSSEAccept {
		return
	}
	logger.Warnf(
		c.Request.Context(),
		"[text_accept_conflict] path=%s stream=%t accept=%q resolved_accept=%q user_id=%s group=%s channel_id=%s origin_model=%s actual_model=%s",
		strings.TrimSpace(c.Request.URL.Path),
		meta.IsStream,
		strings.TrimSpace(c.Request.Header.Get("Accept")),
		map[bool]string{true: sse, false: "application/json"}[meta.IsStream],
		strings.TrimSpace(meta.UserId),
		strings.TrimSpace(meta.Group),
		strings.TrimSpace(meta.ChannelId),
		strings.TrimSpace(meta.OriginModelName),
		strings.TrimSpace(meta.ActualModelName),
	)
}

func RelayTextHelper(c *gin.Context) *model.ErrorWithStatusCode {
	ctx := c.Request.Context()
	meta := meta.GetByContext(c)
	// get & validate textRequest
	textRequest, validatedRawBody, err := getAndValidateTextRequest(c, meta.Mode)
	if err != nil {
		logger.Errorf(ctx, "getAndValidateTextRequest failed: %s", err.Error())
		return openai.ErrorWrapper(err, "invalid_text_request", http.StatusBadRequest)
	}
	if err := validateProviderSpecificTextRequest(meta, textRequest, validatedRawBody); err != nil {
		logger.Errorf(ctx, "validateProviderSpecificTextRequest failed: %s", err.Error())
		return openai.ErrorWrapper(err, "invalid_text_request", http.StatusBadRequest)
	}
	meta.IsStream = textRequest.Stream
	logTextStreamAcceptConflict(c, meta)

	// map model name
	meta.OriginModelName = textRequest.Model
	textRequest.Model, _ = getMappedModelName(textRequest.Model, meta.ModelMapping)
	meta.ActualModelName = textRequest.Model
	upstreamMode, upstreamPath, err := resolveChannelTextUpstream(meta, meta.OriginModelName, textRequest.Model)
	if err != nil {
		return openai.ErrorWrapper(err, "unsupported_channel_endpoint", http.StatusBadRequest)
	}
	meta.UpstreamMode = upstreamMode
	meta.UpstreamRequestPath = upstreamPath
	meta.EndpointPolicies = adminmodel.CacheGetChannelModelEndpointPolicies(meta.ChannelId, upstreamPath, meta.OriginModelName, textRequest.Model)
	meta.EndpointPolicy = adminmodel.CacheGetChannelModelEndpointPolicy(meta.ChannelId, upstreamPath, meta.OriginModelName, textRequest.Model)
	if err := ApplyEndpointAccessPolicies(c, meta); err != nil {
		return openai.ErrorWrapper(err, "endpoint_policy_failed", http.StatusInternalServerError)
	}
	if config.DebugEnabled {
		logger.Debugf(
			ctx,
			"[text_route] downstream=%s upstream=%s api_type=%d channel_protocol=%d origin_model=%s actual_model=%s",
			relayModeLabel(meta.Mode),
			relayModeLabel(upstreamMode),
			meta.APIType,
			meta.ChannelProtocol,
			strings.TrimSpace(meta.OriginModelName),
			strings.TrimSpace(meta.ActualModelName),
		)
	}
	billingRatio := adminmodel.GetRouteBillingRatio(meta.Group, meta.OriginModelName, meta.ChannelId)
	groupRatio := billingRatio.EffectiveRatio
	pricing, err := adminmodel.ResolveChannelModelPricing(meta.ChannelProtocol, meta.ChannelModelConfigs, textRequest.Model)
	if err != nil {
		if groupRatio == 0 {
			pricing = adminmodel.ResolvedModelPricing{
				Model:     textRequest.Model,
				Type:      adminmodel.InferModelType(textRequest.Model),
				PriceUnit: adminmodel.ProviderPriceUnitPer1KTokens,
				Currency:  adminmodel.ProviderPriceCurrencyUSD,
				Source:    "group_free",
			}
		} else {
			logger.Errorf(ctx, "ResolveChannelModelPricing failed: %s", err.Error())
			return openai.ErrorWrapper(err, "model_pricing_not_configured", http.StatusServiceUnavailable)
		}
	}
	pricing = adminmodel.ResolveTextRequestPricing(pricing, upstreamPath)
	// Resolve the published model policy once per request. The resulting
	// version is copied into the billing snapshot so in-flight requests remain
	// explainable after an administrator changes the model policy.
	policyResolution, policyErr := resolveTextPrechargePolicy(meta, pricing)
	if policyErr != nil {
		logger.Warnf(ctx, "resolve model precharge policy failed; using global default model=%s provider=%s err=%s", strings.TrimSpace(meta.ActualModelName), strings.TrimSpace(pricing.Provider), policyErr.Error())
	}
	// pre-consume quota
	rawRequestBody, err := prepareTextBillingRequestBody(c, meta, validatedRawBody)
	if err != nil {
		var policyErr *endpointPolicyError
		if errors.As(err, &policyErr) {
			return openai.ErrorWrapper(policyErr, policyErr.ErrorCode(), policyErr.StatusCode())
		}
		logger.Errorf(ctx, "prepare request body for token estimate failed: %s", err.Error())
		return openai.ErrorWrapper(err, "read_request_body_failed", http.StatusBadRequest)
	}
	estimateRequest := textRequest
	if meta.Mode != relaymode.Messages {
		estimateRequest, err = parseTextRequestForBillingEstimate(rawRequestBody, textRequest)
		if err != nil {
			logger.Errorf(ctx, "parse endpoint-adjusted request for token estimate failed: %s", err.Error())
			return openai.ErrorWrapper(err, "estimate_prompt_tokens_failed", http.StatusBadRequest)
		}
	}
	estimateResult, estimateErr := tokenestimate.Estimate(tokenestimate.EstimateRequest{
		RelayMode: meta.Mode,
		Model:     meta.OriginModelName,
		RawBody:   rawRequestBody,
		Request:   estimateRequest,
	})
	if estimateErr != nil {
		logger.Errorf(ctx, "estimate prompt tokens failed: %s", estimateErr.Error())
		return openai.ErrorWrapper(estimateErr, "estimate_prompt_tokens_failed", http.StatusInternalServerError)
	}
	promptTokens := estimateResult.PromptTokens
	meta.PromptTokens = promptTokens
	logger.Debugf(
		ctx,
		"[prompt_token_estimate] estimator=%s source=%s precision=%s tokens=%d model=%s path=%s",
		strings.TrimSpace(estimateResult.Estimator),
		strings.TrimSpace(estimateResult.Source),
		string(estimateResult.Precision),
		promptTokens,
		strings.TrimSpace(meta.OriginModelName),
		strings.TrimSpace(c.Request.URL.Path),
	)
	responsesImageTools, responsesImageToolsErr := parseResponsesImageToolSpecs(rawRequestBody)
	if responsesImageToolsErr != nil {
		logger.Errorf(ctx, "parse responses image tools failed: %s", responsesImageToolsErr.Error())
		return openai.ErrorWrapper(responsesImageToolsErr, "parse_responses_image_tools_failed", http.StatusBadRequest)
	}
	maxOutputTokens := resolveTextMaxOutputTokens(textRequest)
	personalProviderRequest := strings.TrimSpace(meta.PersonalProviderID) != ""
	communityOfferRequest := strings.TrimSpace(meta.CommunityOfferID) != ""
	if communityOfferRequest {
		// Reject an uncovered request before it reaches a third-party publisher.
		preview, previewErr := adminmodel.QuotePublisherOfferSettlement(adminmodel.PublisherOfferSettlementInput{
			RequestLogID: "preview", OfferID: meta.CommunityOfferID, ConsumerUserID: meta.UserId,
			InputTokens: int64(promptTokens), OutputTokens: int64(maxOutputTokens),
		})
		if previewErr != nil {
			return openai.ErrorWrapper(previewErr, "community_offer_unavailable", http.StatusServiceUnavailable)
		}
		reservedQuota, _, quotaErr := adminmodel.CommunityOfferQuotaForMicros(preview.ConsumerAmountMicros)
		if quotaErr != nil {
			return openai.ErrorWrapper(quotaErr, "community_offer_pricing_unavailable", http.StatusServiceUnavailable)
		}
		balance, balanceErr := adminmodel.GetEffectiveUserBalanceAmount(meta.UserId)
		if balanceErr != nil {
			return openai.ErrorWrapper(balanceErr, "community_offer_balance_unavailable", http.StatusInternalServerError)
		}
		if balance < reservedQuota {
			return openai.ErrorWrapper(fmt.Errorf("账户余额不足以覆盖该社区报价的请求预算"), "community_offer_balance_insufficient", http.StatusForbidden)
		}
	}
	preConsumedSnapshot := billing.BillingSnapshot{}
	groupReservedQuota := int64(0)
	if !personalProviderRequest && !communityOfferRequest {
		preConsumedPricing := adminmodel.ResolveTextUsagePricing(pricing, upstreamPath, promptTokens, maxOutputTokens)
		reservedTokens := policyResolution.Policy.ReserveTokens(promptTokens, maxOutputTokens)
		preConsumedSnapshot, err = billing.ComputeTextPreConsumedBillingSnapshotWithReservedTokens(promptTokens, maxOutputTokens, reservedTokens, preConsumedPricing, groupRatio)
		if err != nil {
			logger.Errorf(ctx, "ComputeTextPreConsumedQuota failed: %s", err.Error())
			return openai.ErrorWrapper(err, "calculate_text_quota_failed", http.StatusInternalServerError)
		}
		preConsumedSnapshot.SetBillingRatioBreakdown(billingRatio)
		preConsumedSnapshot.PrechargePolicy = policyResolution.Policy.Type
		preConsumedSnapshot.PrechargePolicySource = policyResolution.Source
		preConsumedSnapshot.PrechargePolicyVersion = policyResolution.Version
		preConsumedSnapshot.PrechargeReservedTokens = reservedTokens
		if err := billing.ApplyEstimatedProcurementCostFloor(&preConsumedSnapshot, meta.ChannelId, meta.ActualModelName); err != nil {
			logger.Errorf(ctx, "estimate procurement cost for text pre-consume failed: %s", err.Error())
			return openai.ErrorWrapper(err, "calculate_text_quota_failed", http.StatusInternalServerError)
		}
		groupReservedQuota = preConsumedSnapshot.ChargeAmount
	}
	billingPlan, quotaErr := reserveRelayQuota(ctx, meta, groupReservedQuota)
	if quotaErr != nil {
		return quotaErr
	}
	groupQuotaSettled := false
	defer func() {
		if !groupQuotaSettled {
			releaseRelayBillingPlan(ctx, billingPlan)
		}
	}()
	preConsumedQuota, bizErr := preConsumeQuota(ctx, groupReservedQuota, meta, billingPlan)
	if bizErr != nil {
		logger.Warnf(ctx, "preConsumeQuota failed: %+v", *bizErr)
		return bizErr
	}
	preConsumedQuotaSettled := false
	defer func() {
		if !preConsumedQuotaSettled && preConsumedQuota > 0 {
			billing.ReturnPreConsumedQuota(ctx, preConsumedQuota, meta.TokenId, meta.UserId, meta.Group, billingPlan.ChargeUserBalance() && billingPlan.ChargeTokenQuota())
		}
	}()

	upstreamRequest, err := convertTextRequestForUpstream(textRequest, meta.Mode, upstreamMode)
	if err != nil {
		return openai.ErrorWrapper(err, "convert_request_failed", http.StatusBadRequest)
	}

	adaptor := relay.GetAdaptor(meta.APIType)
	if adaptor == nil {
		return openai.ErrorWrapper(fmt.Errorf("invalid api type: %d", meta.APIType), "invalid_api_type", http.StatusBadRequest)
	}
	adaptor.Init(meta)

	// get request body
	requestBody, err := getRequestBody(c, meta, upstreamRequest, adaptor, rawRequestBody)
	if err != nil {
		var policyErr *endpointPolicyError
		if errors.As(err, &policyErr) {
			return openai.ErrorWrapper(policyErr, policyErr.ErrorCode(), policyErr.StatusCode())
		}
		return openai.ErrorWrapper(err, "convert_request_failed", http.StatusInternalServerError)
	}

	// do request
	resp, err := adaptor.DoRequest(c, meta, requestBody)
	if err != nil {
		return openai.ErrorWrapper(err, "do_request_failed", http.StatusInternalServerError)
	}
	if isErrorHappened(meta, resp) {
		return RelayErrorHandler(meta, resp)
	}

	// do response
	usage, respErr := adaptor.DoResponse(c, resp, meta)
	if respErr != nil {
		return respErr
	}
	// post-consume quota
	go postConsumeQuota(ctx, usage, meta, upstreamRequest, pricing, preConsumedQuota, int(preConsumedSnapshot.OutputQuantity), groupReservedQuota, billingRatio, estimateResult, responsesImageTools, false, billingPlan)
	preConsumedQuotaSettled = true
	groupQuotaSettled = true
	return nil
}

func resolveTextPrechargePolicy(relayMeta *meta.Meta, pricing adminmodel.ResolvedModelPricing) (billing.PrechargePolicyResolution, error) {
	defaultResolution := billing.ResolvePrechargePolicy(nil, config.PreConsumedQuota)
	if relayMeta == nil {
		return defaultResolution, nil
	}
	selected, selectedOK := adminmodel.FindSelectedChannelModelConfig(
		relayMeta.ChannelModelConfigs,
		relayMeta.OriginModelName,
		relayMeta.ActualModelName,
	)
	provider := ""
	modelName := strings.TrimSpace(relayMeta.ActualModelName)
	if selectedOK {
		provider = adminmodel.NormalizeGroupModelProviderValue(selected.Provider)
		if upstreamModel := strings.TrimSpace(selected.UpstreamModel); upstreamModel != "" {
			modelName = upstreamModel
		}
	}
	if provider == "" {
		provider = adminmodel.NormalizeGroupModelProviderValue(pricing.Provider)
	}
	if provider != "" {
		specification, err := adminmodel.LoadProviderModelSpecificationWithDB(adminmodel.DB, provider, modelName)
		if err != nil {
			return defaultResolution, err
		}
		return billing.ResolvePrechargePolicy(specification, config.PreConsumedQuota), nil
	}

	// Older channel rows may not yet carry provider. Preserve their previous
	// behavior only when the catalog proves that the model identity is unique.
	providerMap, err := adminmodel.LoadUniqueProviderMapByModelsWithDB(adminmodel.DB, []string{modelName})
	if err != nil {
		return defaultResolution, err
	}
	specifications, err := adminmodel.LoadProviderModelSpecificationMapByModelsWithDB(adminmodel.DB, providerMap, []string{modelName})
	if err != nil {
		return defaultResolution, err
	}
	for _, candidate := range adminmodel.NormalizeProviderLookupCandidates(modelName) {
		if specification, ok := specifications[candidate]; ok {
			return billing.ResolvePrechargePolicy(specification, config.PreConsumedQuota), nil
		}
	}
	return defaultResolution, nil
}

func prepareTextBillingRequestBody(c *gin.Context, meta *meta.Meta, rawRequestBody []byte) ([]byte, error) {
	rawBody := rawRequestBody
	if len(rawBody) == 0 {
		var err error
		rawBody, err = common.GetRequestBody(c)
		if err != nil {
			return nil, err
		}
	}
	upstreamMode := meta.Mode
	if meta.UpstreamMode != 0 {
		upstreamMode = meta.UpstreamMode
	}
	switch {
	case meta.Mode == relaymode.Messages && upstreamMode == relaymode.Messages:
		normalizedBody, err := normalizeMessagesRequestBody(rawBody, meta.ActualModelName)
		if err != nil {
			return nil, err
		}
		return applyEndpointRequestPolicy(c, meta, normalizedBody)
	case meta.Mode == relaymode.Responses && upstreamMode == relaymode.Responses:
		normalizedBody, err := normalizeTextModelRequestBody(rawBody, meta.ActualModelName)
		if err != nil {
			return nil, err
		}
		return applyEndpointRequestPolicy(c, meta, normalizedBody)
	case !config.EnforceIncludeUsage &&
		meta.APIType == apitype.OpenAI &&
		meta.OriginModelName == meta.ActualModelName &&
		meta.ChannelProtocol != relaychannel.Baichuan &&
		meta.Mode == upstreamMode &&
		meta.Mode != relaymode.Messages:
		return applyEndpointRequestPolicy(c, meta, rawBody)
	default:
		return rawBody, nil
	}
}

func parseTextRequestForBillingEstimate(rawRequestBody []byte, baseRequest *model.GeneralOpenAIRequest) (*model.GeneralOpenAIRequest, error) {
	if len(rawRequestBody) == 0 || baseRequest == nil {
		return baseRequest, nil
	}
	parsed := &model.GeneralOpenAIRequest{}
	if err := json.Unmarshal(rawRequestBody, parsed); err != nil {
		return nil, err
	}
	if strings.TrimSpace(baseRequest.Model) != "" {
		parsed.Model = baseRequest.Model
	}
	return parsed, nil
}

func getRequestBody(c *gin.Context, meta *meta.Meta, textRequest *model.GeneralOpenAIRequest, adaptor adaptor.Adaptor, rawRequestBody []byte) (io.Reader, error) {
	upstreamMode := meta.Mode
	if meta.UpstreamMode != 0 {
		upstreamMode = meta.UpstreamMode
	}
	if meta.Mode == relaymode.Messages && upstreamMode == relaymode.Messages {
		rawBody := rawRequestBody
		if len(rawBody) == 0 {
			var err error
			rawBody, err = common.GetRequestBody(c)
			if err != nil {
				return nil, err
			}
		}
		jsonData, err := normalizeMessagesRequestBody(rawBody, meta.ActualModelName)
		if err != nil {
			return nil, err
		}
		jsonData, err = applyEndpointRequestPolicy(c, meta, jsonData)
		if err != nil {
			return nil, err
		}
		logger.Debugf(
			c.Request.Context(),
			"[messages_body] len=%d model=%s stream=%t",
			len(jsonData),
			strings.TrimSpace(meta.ActualModelName),
			meta.IsStream,
		)
		if config.DebugEnabled {
			logger.Debugf(
				c.Request.Context(),
				"[upstream_request_body] downstream=%s upstream=%s body=%s",
				relayModeLabel(meta.Mode),
				relayModeLabel(upstreamMode),
				sanitizePayloadForRelayDebug(jsonData),
			)
		}
		return bytes.NewBuffer(jsonData), nil
	}
	if meta.Mode == relaymode.Responses && upstreamMode == relaymode.Responses {
		rawBody, err := common.GetRequestBody(c)
		if err != nil {
			return nil, err
		}
		rawBody, err = normalizeTextModelRequestBody(rawBody, meta.ActualModelName)
		if err != nil {
			return nil, err
		}
		rawBody, err = applyEndpointRequestPolicy(c, meta, rawBody)
		if err != nil {
			return nil, err
		}
		c.Request.Body = io.NopCloser(bytes.NewBuffer(rawBody))
		if config.DebugEnabled {
			logger.Debugf(
				c.Request.Context(),
				"[responses_body] len=%d model=%s stream=%t",
				len(rawBody),
				strings.TrimSpace(meta.ActualModelName),
				meta.IsStream,
			)
			logger.Debugf(
				c.Request.Context(),
				"[upstream_request_body] downstream=%s upstream=%s body=%s",
				relayModeLabel(meta.Mode),
				relayModeLabel(upstreamMode),
				sanitizePayloadForRelayDebug(rawBody),
			)
		}
		return c.Request.Body, nil
	}
	if !config.EnforceIncludeUsage &&
		meta.APIType == apitype.OpenAI &&
		meta.OriginModelName == meta.ActualModelName &&
		meta.ChannelProtocol != relaychannel.Baichuan &&
		meta.Mode == upstreamMode &&
		meta.Mode != relaymode.Messages {
		// no need to convert request for openai
		rawBody, err := common.GetRequestBody(c)
		if err != nil {
			return nil, err
		}
		rawBody, err = applyEndpointRequestPolicy(c, meta, rawBody)
		if err != nil {
			return nil, err
		}
		c.Request.Body = io.NopCloser(bytes.NewBuffer(rawBody))
		return c.Request.Body, nil
	}

	// get request body
	var requestBody io.Reader
	convertedRequest, err := adaptor.ConvertRequest(c, upstreamMode, textRequest)
	if err != nil {
		logger.Debugf(c.Request.Context(), "converted request failed: %s\n", err.Error())
		return nil, err
	}
	jsonData, err := json.Marshal(convertedRequest)
	if err != nil {
		logger.Debugf(c.Request.Context(), "converted request json_marshal_failed: %s\n", err.Error())
		return nil, err
	}
	jsonData, err = applyEndpointRequestPolicy(c, meta, jsonData)
	if err != nil {
		return nil, err
	}
	if config.DebugEnabled {
		logger.Debugf(
			c.Request.Context(),
			"[converted_request_body] downstream=%s upstream=%s len=%d body=%s",
			relayModeLabel(meta.Mode),
			relayModeLabel(upstreamMode),
			len(jsonData),
			sanitizePayloadForRelayDebug(jsonData),
		)
	}
	requestBody = bytes.NewBuffer(jsonData)
	return requestBody, nil
}

func relayModeLabel(mode int) string {
	switch mode {
	case relaymode.ChatCompletions:
		return "chat_completions"
	case relaymode.Messages:
		return "messages"
	case relaymode.Responses:
		return "responses"
	case relaymode.Completions:
		return "completions"
	case relaymode.Embeddings:
		return "embeddings"
	case relaymode.Moderations:
		return "moderations"
	case relaymode.ImagesGenerations:
		return "images_generations"
	case relaymode.Edits:
		return "edits"
	case relaymode.AudioSpeech:
		return "audio_speech"
	case relaymode.AudioTranslation:
		return "audio_translation"
	case relaymode.AudioTranscription:
		return "audio_transcription"
	case relaymode.Realtime:
		return "realtime"
	case relaymode.Videos:
		return "videos"
	default:
		return "unknown"
	}
}
