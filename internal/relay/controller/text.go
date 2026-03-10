package controller

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"

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
)

func RelayTextHelper(c *gin.Context) *model.ErrorWithStatusCode {
	ctx := c.Request.Context()
	meta := meta.GetByContext(c)
	// get & validate textRequest
	textRequest, err := getAndValidateTextRequest(c, meta.Mode)
	if err != nil {
		logger.Errorf(ctx, "getAndValidateTextRequest failed: %s", err.Error())
		return openai.ErrorWrapper(err, "invalid_text_request", http.StatusBadRequest)
	}
	meta.IsStream = textRequest.Stream

	// map model name
	meta.OriginModelName = textRequest.Model
	textRequest.Model, _ = getMappedModelName(textRequest.Model, meta.ModelMapping)
	meta.ActualModelName = textRequest.Model
	groupRatio := adminmodel.GetGroupBillingRatio(meta.Group)
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
	// pre-consume quota
	promptTokens := getPromptTokens(textRequest, meta.Mode)
	meta.PromptTokens = promptTokens
	preConsumedQuota, bizErr := preConsumeQuota(ctx, textRequest, promptTokens, pricing, groupRatio, meta)
	if bizErr != nil {
		logger.Warnf(ctx, "preConsumeQuota failed: %+v", *bizErr)
		return bizErr
	}

	upstreamMode, upstreamPath := resolveChannelTextUpstream(meta, meta.OriginModelName, textRequest.Model)
	meta.UpstreamMode = upstreamMode
	meta.UpstreamRequestPath = upstreamPath
	upstreamRequest, err := convertTextRequestForUpstream(textRequest, meta.Mode, upstreamMode)
	if err != nil {
		return openai.ErrorWrapper(err, "convert_request_failed", http.StatusBadRequest)
	}
	// set system prompt on the request shape that will actually be sent upstream
	systemPromptReset := setSystemPrompt(ctx, upstreamRequest, meta.ForcedSystemPrompt)

	adaptor := relay.GetAdaptor(meta.APIType)
	if adaptor == nil {
		return openai.ErrorWrapper(fmt.Errorf("invalid api type: %d", meta.APIType), "invalid_api_type", http.StatusBadRequest)
	}
	adaptor.Init(meta)

	// get request body
	requestBody, err := getRequestBody(c, meta, upstreamRequest, adaptor)
	if err != nil {
		return openai.ErrorWrapper(err, "convert_request_failed", http.StatusInternalServerError)
	}

	// do request
	resp, err := adaptor.DoRequest(c, meta, requestBody)
	if err != nil {
		logger.Errorf(ctx, "DoRequest failed: %s", err.Error())
		return openai.ErrorWrapper(err, "do_request_failed", http.StatusInternalServerError)
	}
	if isErrorHappened(meta, resp) {
		billing.ReturnPreConsumedQuota(ctx, preConsumedQuota, meta.TokenId, meta.UserId)
		return RelayErrorHandler(resp)
	}

	// do response
	usage, respErr := adaptor.DoResponse(c, resp, meta)
	if respErr != nil {
		logger.Errorf(ctx, "respErr is not nil: %+v", respErr)
		billing.ReturnPreConsumedQuota(ctx, preConsumedQuota, meta.TokenId, meta.UserId)
		return respErr
	}
	// post-consume quota
	go postConsumeQuota(ctx, usage, meta, upstreamRequest, pricing, preConsumedQuota, groupRatio, systemPromptReset)
	return nil
}

func getRequestBody(c *gin.Context, meta *meta.Meta, textRequest *model.GeneralOpenAIRequest, adaptor adaptor.Adaptor) (io.Reader, error) {
	upstreamMode := meta.Mode
	if meta.UpstreamMode != 0 {
		upstreamMode = meta.UpstreamMode
	}
	if upstreamMode == relaymode.Responses {
		if textRequest.Input == nil && len(textRequest.Messages) > 0 {
			textRequest.Input = textRequest.Messages
			textRequest.Messages = nil
		}
		normalizeResponsesInput(textRequest)
		jsonData, err := json.Marshal(textRequest)
		if err != nil {
			return nil, err
		}
		preview := string(jsonData)
		if len(preview) > 400 {
			preview = preview[:400]
		}
		logger.SysLogf("[responses_body] len=%d preview=%s", len(jsonData), preview)
		return bytes.NewBuffer(jsonData), nil
	}
	if !config.EnforceIncludeUsage &&
		meta.APIType == apitype.OpenAI &&
		meta.OriginModelName == meta.ActualModelName &&
		meta.ChannelProtocol != relaychannel.Baichuan &&
		meta.ForcedSystemPrompt == "" {
		// no need to convert request for openai
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
	logger.Debugf(c.Request.Context(), "converted request: \n%s", string(jsonData))
	requestBody = bytes.NewBuffer(jsonData)
	return requestBody, nil
}

func normalizeResponsesInput(req *model.GeneralOpenAIRequest) bool {
	if req == nil || req.Input == nil {
		return false
	}
	switch v := req.Input.(type) {
	case string:
		req.Input = []model.Message{{Role: "user", Content: v}}
		return true
	case []any:
		if len(v) == 0 {
			return false
		}
		msgs := make([]model.Message, 0, len(v))
		for _, item := range v {
			s, ok := item.(string)
			if !ok {
				return false
			}
			msgs = append(msgs, model.Message{Role: "user", Content: s})
		}
		req.Input = msgs
		return true
	}
	return false
}
