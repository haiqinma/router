package model

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	commonutils "github.com/yeying-community/router/common/utils"
	billingratio "github.com/yeying-community/router/internal/relay/billing/ratio"
	relaychannel "github.com/yeying-community/router/internal/relay/channel"
)

const (
	ModelProviderModelTypeText  = "text"
	ModelProviderModelTypeImage = "image"
	ModelProviderModelTypeAudio = "audio"

	ModelProviderPriceUnitPer1KTokens = "per_1k_tokens"
	ModelProviderPriceUnitPer1KChars  = "per_1k_chars"
	ModelProviderPriceUnitPerImage    = "per_image"

	ModelProviderPriceCurrencyUSD = "USD"
)

type ModelProviderModelDetail struct {
	Model       string  `json:"model"`
	Type        string  `json:"type,omitempty"`
	InputPrice  float64 `json:"input_price,omitempty"`
	OutputPrice float64 `json:"output_price,omitempty"`
	PriceUnit   string  `json:"price_unit,omitempty"`
	Currency    string  `json:"currency,omitempty"`
	Source      string  `json:"source,omitempty"`
	UpdatedAt   int64   `json:"updated_at,omitempty"`
}

type ModelProviderCatalogSeed struct {
	Provider     string
	Name         string
	BaseURL      string
	SortOrder    int
	ModelDetails []ModelProviderModelDetail
}

func ModelProviderModelNames(details []ModelProviderModelDetail) []string {
	normalized := NormalizeModelProviderModelDetails(details)
	names := make([]string, 0, len(normalized))
	for _, item := range normalized {
		names = append(names, item.Model)
	}
	return names
}

func NormalizeModelProviderModelDetails(details []ModelProviderModelDetail) []ModelProviderModelDetail {
	index := make(map[string]int, len(details))
	normalized := make([]ModelProviderModelDetail, 0, len(details))
	for _, detail := range details {
		modelName := strings.TrimSpace(detail.Model)
		if modelName == "" {
			continue
		}
		t := normalizeModelType(detail.Type, modelName)
		priceUnit := strings.TrimSpace(strings.ToLower(detail.PriceUnit))
		if priceUnit == "" {
			priceUnit = defaultPriceUnitByType(t, modelName)
		}
		currency := strings.TrimSpace(strings.ToUpper(detail.Currency))
		if currency == "" {
			currency = ModelProviderPriceCurrencyUSD
		}
		source := strings.TrimSpace(strings.ToLower(detail.Source))
		if source == "" {
			source = "manual"
		}
		inputPrice := detail.InputPrice
		if inputPrice < 0 {
			inputPrice = 0
		}
		outputPrice := detail.OutputPrice
		if outputPrice < 0 {
			outputPrice = 0
		}
		entry := ModelProviderModelDetail{
			Model:       modelName,
			Type:        t,
			InputPrice:  inputPrice,
			OutputPrice: outputPrice,
			PriceUnit:   priceUnit,
			Currency:    currency,
			Source:      source,
			UpdatedAt:   detail.UpdatedAt,
		}
		if idx, ok := index[modelName]; ok {
			existing := normalized[idx]
			if existing.Type == "" {
				existing.Type = entry.Type
			}
			if existing.PriceUnit == "" {
				existing.PriceUnit = entry.PriceUnit
			}
			if existing.Currency == "" {
				existing.Currency = entry.Currency
			}
			if existing.InputPrice <= 0 && entry.InputPrice > 0 {
				existing.InputPrice = entry.InputPrice
			}
			if existing.OutputPrice <= 0 && entry.OutputPrice > 0 {
				existing.OutputPrice = entry.OutputPrice
			}
			if entry.Source != "default" {
				existing.Source = entry.Source
			}
			if entry.UpdatedAt > existing.UpdatedAt {
				existing.UpdatedAt = entry.UpdatedAt
			}
			normalized[idx] = existing
			continue
		}
		index[modelName] = len(normalized)
		normalized = append(normalized, entry)
	}
	sort.Slice(normalized, func(i, j int) bool {
		return normalized[i].Model < normalized[j].Model
	})
	return normalized
}

func MergeModelProviderDetails(provider string, current []ModelProviderModelDetail, fallbackModels []string, includeDefaults bool, now int64) []ModelProviderModelDetail {
	normalizedProvider := commonutils.NormalizeModelProvider(provider)
	if normalizedProvider == "" {
		normalizedProvider = strings.TrimSpace(strings.ToLower(provider))
	}

	merged := make(map[string]ModelProviderModelDetail)
	if includeDefaults {
		defaultIndex := buildDefaultProviderModelDetailIndex(now)
		if providerDefaults, ok := defaultIndex[normalizedProvider]; ok {
			for modelName, detail := range providerDefaults {
				merged[modelName] = detail
			}
		}
	}

	for _, detail := range NormalizeModelProviderModelDetails(current) {
		existing, ok := merged[detail.Model]
		if !ok {
			merged[detail.Model] = detail
			continue
		}
		if detail.Type != "" {
			existing.Type = detail.Type
		}
		if detail.PriceUnit != "" {
			existing.PriceUnit = detail.PriceUnit
		}
		if detail.Currency != "" {
			existing.Currency = detail.Currency
		}
		if detail.InputPrice >= 0 {
			existing.InputPrice = detail.InputPrice
		}
		if detail.OutputPrice >= 0 {
			existing.OutputPrice = detail.OutputPrice
		}
		if strings.TrimSpace(detail.Source) != "" {
			existing.Source = detail.Source
		}
		if detail.UpdatedAt > existing.UpdatedAt {
			existing.UpdatedAt = detail.UpdatedAt
		}
		merged[detail.Model] = existing
	}

	for _, modelName := range fallbackModels {
		name := strings.TrimSpace(modelName)
		if name == "" {
			continue
		}
		if _, ok := merged[name]; ok {
			continue
		}
		merged[name] = ModelProviderModelDetail{
			Model:       name,
			Type:        normalizeModelType("", name),
			PriceUnit:   defaultPriceUnitByType("", name),
			Currency:    ModelProviderPriceCurrencyUSD,
			Source:      "manual",
			UpdatedAt:   now,
			InputPrice:  0,
			OutputPrice: 0,
		}
	}

	result := make([]ModelProviderModelDetail, 0, len(merged))
	for _, detail := range merged {
		if detail.Model == "" {
			continue
		}
		if detail.UpdatedAt == 0 {
			detail.UpdatedAt = now
		}
		result = append(result, detail)
	}
	return NormalizeModelProviderModelDetails(result)
}

func BuildDefaultModelProviderCatalogSeeds(now int64) []ModelProviderCatalogSeed {
	detailIndex := buildDefaultProviderModelDetailIndex(now)
	baseURLs := GetModelProviderDefaultBaseURLs()
	providers := make([]string, 0, len(detailIndex))
	for provider := range detailIndex {
		providers = append(providers, provider)
	}
	sort.Strings(providers)

	seeds := make([]ModelProviderCatalogSeed, 0, len(providers))
	for idx, provider := range providers {
		details := make([]ModelProviderModelDetail, 0, len(detailIndex[provider]))
		for _, detail := range detailIndex[provider] {
			details = append(details, detail)
		}
		details = NormalizeModelProviderModelDetails(details)
		seeds = append(seeds, ModelProviderCatalogSeed{
			Provider:     provider,
			Name:         providerDisplayName(provider),
			BaseURL:      strings.TrimSpace(baseURLs[provider]),
			SortOrder:    (idx + 1) * 10,
			ModelDetails: details,
		})
	}
	return seeds
}

func GetModelProviderDefaultBaseURLs() map[string]string {
	result := map[string]string{
		"openai":      "https://api.openai.com",
		"google":      "https://generativelanguage.googleapis.com/v1beta/openai",
		"anthropic":   "https://api.anthropic.com",
		"xai":         "https://api.x.ai",
		"mistral":     "https://api.mistral.ai",
		"cohere":      "https://api.cohere.com/compatibility/v1",
		"deepseek":    "https://api.deepseek.com",
		"qwen":        "https://dashscope.aliyuncs.com/compatible-mode",
		"zhipu":       "https://open.bigmodel.cn/api/paas/v4",
		"hunyuan":     "https://api.hunyuan.cloud.tencent.com/v1",
		"volcengine":  "https://ark.cn-beijing.volces.com/api/v3",
		"minimax":     "https://api.minimax.chat/v1",
		"baidu":       "https://aip.baidubce.com",
		"baidu-v2":    "https://qianfan.baidubce.com",
		"groq":        "https://api.groq.com/openai",
		"moonshot":    "https://api.moonshot.cn",
		"baichuan":    "https://api.baichuan-ai.com",
		"ollama":      "http://localhost:11434",
		"lingyiwanwu": "https://api.lingyiwanwu.com",
		"stepfun":     "https://api.stepfun.com",
		"coze":        "https://api.coze.com",
		"cloudflare":  "https://api.cloudflare.com",
		"deepl":       "https://api-free.deepl.com",
		"togetherai":  "https://api.together.xyz",
		"novita":      "https://api.novita.ai/v3/openai",
		"siliconflow": "https://api.siliconflow.cn",
		"replicate":   "https://api.replicate.com/v1/models/",
		"xunfei":      "https://spark-api-open.xf-yun.com",
	}

	for idx, rawProvider := range relaychannel.ChannelProtocolNames {
		if idx <= 0 || idx >= len(relaychannel.ChannelBaseURLs) {
			continue
		}
		provider := commonutils.NormalizeModelProvider(rawProvider)
		if provider == "" || provider == "unknown" {
			provider = strings.TrimSpace(strings.ToLower(rawProvider))
		}
		if provider == "" || provider == "unknown" {
			continue
		}
		baseURL := strings.TrimSpace(relaychannel.ChannelBaseURLs[idx])
		if baseURL == "" {
			continue
		}
		if _, exists := result[provider]; !exists {
			result[provider] = baseURL
		}
	}
	return result
}

func buildDefaultProviderModelDetailIndex(now int64) map[string]map[string]ModelProviderModelDetail {
	providerModels := make(map[string]map[string]ModelProviderModelDetail)
	addModel := func(provider string, detail ModelProviderModelDetail) {
		normalizedProvider := commonutils.NormalizeModelProvider(provider)
		if normalizedProvider == "" || normalizedProvider == "unknown" {
			normalizedProvider = strings.TrimSpace(strings.ToLower(provider))
		}
		if normalizedProvider == "" || normalizedProvider == "unknown" {
			normalizedProvider = "other"
		}
		if providerModels[normalizedProvider] == nil {
			providerModels[normalizedProvider] = make(map[string]ModelProviderModelDetail)
		}
		detail.Model = strings.TrimSpace(detail.Model)
		if detail.Model == "" {
			return
		}
		detail.Type = normalizeModelType(detail.Type, detail.Model)
		if detail.PriceUnit == "" {
			detail.PriceUnit = defaultPriceUnitByType(detail.Type, detail.Model)
		}
		if detail.Currency == "" {
			detail.Currency = ModelProviderPriceCurrencyUSD
		}
		if detail.Source == "" {
			detail.Source = "default"
		}
		if detail.UpdatedAt == 0 {
			detail.UpdatedAt = now
		}

		existing, ok := providerModels[normalizedProvider][detail.Model]
		if !ok {
			providerModels[normalizedProvider][detail.Model] = detail
			return
		}
		if existing.InputPrice <= 0 && detail.InputPrice > 0 {
			existing.InputPrice = detail.InputPrice
		}
		if existing.OutputPrice <= 0 && detail.OutputPrice > 0 {
			existing.OutputPrice = detail.OutputPrice
		}
		if existing.Type == "" {
			existing.Type = detail.Type
		}
		if existing.PriceUnit == "" {
			existing.PriceUnit = detail.PriceUnit
		}
		if existing.Currency == "" {
			existing.Currency = detail.Currency
		}
		if detail.UpdatedAt > existing.UpdatedAt {
			existing.UpdatedAt = detail.UpdatedAt
		}
		providerModels[normalizedProvider][detail.Model] = existing
	}

	for modelKey, ratio := range billingratio.ModelRatio {
		modelName, channelProtocol, hasChannelProtocol := splitModelAndChannelProtocol(modelKey)
		provider := inferProviderByModel(modelName, channelProtocol, hasChannelProtocol)
		modelType := normalizeModelType("", modelName)
		priceUnit := defaultPriceUnitByType(modelType, modelName)
		inputPrice := ratioToOriginalPrice(modelType, priceUnit, ratio)
		outputPrice := 0.0
		if modelType == ModelProviderModelTypeText {
			multiplier := completionRatioByModel(modelName, channelProtocol, hasChannelProtocol)
			if multiplier > 0 {
				outputPrice = inputPrice * multiplier
			}
		}
		addModel(provider, ModelProviderModelDetail{
			Model:       modelName,
			Type:        modelType,
			InputPrice:  inputPrice,
			OutputPrice: outputPrice,
			PriceUnit:   priceUnit,
			Currency:    ModelProviderPriceCurrencyUSD,
			Source:      "default",
			UpdatedAt:   now,
		})
	}

	for modelKey := range billingratio.CompletionRatio {
		modelName, channelProtocol, hasChannelProtocol := splitModelAndChannelProtocol(modelKey)
		provider := inferProviderByModel(modelName, channelProtocol, hasChannelProtocol)
		addModel(provider, ModelProviderModelDetail{
			Model:       modelName,
			Type:        normalizeModelType("", modelName),
			InputPrice:  0,
			OutputPrice: 0,
			PriceUnit:   defaultPriceUnitByType("", modelName),
			Currency:    ModelProviderPriceCurrencyUSD,
			Source:      "default",
			UpdatedAt:   now,
		})
	}

	for modelName := range billingratio.ImageSizeRatios {
		provider := inferProviderByModel(modelName, 0, false)
		addModel(provider, ModelProviderModelDetail{
			Model:       modelName,
			Type:        ModelProviderModelTypeImage,
			InputPrice:  0,
			OutputPrice: 0,
			PriceUnit:   ModelProviderPriceUnitPerImage,
			Currency:    ModelProviderPriceCurrencyUSD,
			Source:      "default",
			UpdatedAt:   now,
		})
	}

	return providerModels
}

func splitModelAndChannelProtocol(raw string) (string, int, bool) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", 0, false
	}
	left := strings.LastIndex(trimmed, "(")
	right := strings.LastIndex(trimmed, ")")
	if left <= 0 || right != len(trimmed)-1 || left >= right {
		return trimmed, 0, false
	}
	idRaw := strings.TrimSpace(trimmed[left+1 : right])
	channelProtocol, err := strconv.Atoi(idRaw)
	if err != nil {
		return trimmed, 0, false
	}
	modelName := strings.TrimSpace(trimmed[:left])
	if modelName == "" {
		return trimmed, 0, false
	}
	return modelName, channelProtocol, true
}

func inferProviderByModel(modelName string, channelProtocol int, hasChannelProtocol bool) string {
	provider := commonutils.NormalizeModelProvider(commonutils.ResolveModelProvider(modelName))
	if provider != "" && provider != "unknown" {
		return provider
	}

	if strings.Contains(modelName, "/") {
		parts := strings.SplitN(modelName, "/", 2)
		prefix := commonutils.NormalizeModelProvider(parts[0])
		if prefix != "" && prefix != "unknown" {
			return prefix
		}
		plainPrefix := strings.TrimSpace(strings.ToLower(parts[0]))
		if plainPrefix != "" {
			return plainPrefix
		}
	}

	if hasChannelProtocol && channelProtocol > 0 && channelProtocol < len(relaychannel.ChannelProtocolNames) {
		rawProvider := strings.TrimSpace(relaychannel.ChannelProtocolNames[channelProtocol])
		normalized := commonutils.NormalizeModelProvider(rawProvider)
		if normalized != "" && normalized != "unknown" {
			return normalized
		}
		if rawProvider != "" && rawProvider != "unknown" {
			return strings.ToLower(rawProvider)
		}
	}

	lower := strings.ToLower(strings.TrimSpace(modelName))
	switch {
	case strings.HasPrefix(lower, "ernie-"):
		return "baidu"
	case strings.HasPrefix(lower, "spark-"):
		return "xunfei"
	case strings.HasPrefix(lower, "moonshot-") || strings.HasPrefix(lower, "kimi-"):
		return "moonshot"
	case strings.HasPrefix(lower, "baichuan-"):
		return "baichuan"
	case strings.HasPrefix(lower, "yi-"):
		return "lingyiwanwu"
	case strings.HasPrefix(lower, "step-"):
		return "stepfun"
	case strings.HasPrefix(lower, "groq-"):
		return "groq"
	case strings.HasPrefix(lower, "ollama-"):
		return "ollama"
	}
	return "other"
}

func completionRatioByModel(modelName string, channelProtocol int, hasChannelProtocol bool) float64 {
	if hasChannelProtocol {
		key := fmt.Sprintf("%s(%d)", modelName, channelProtocol)
		if ratio, ok := billingratio.CompletionRatio[key]; ok {
			return ratio
		}
		if ratio, ok := billingratio.DefaultCompletionRatio[key]; ok {
			return ratio
		}
	}
	if ratio, ok := billingratio.CompletionRatio[modelName]; ok {
		return ratio
	}
	if ratio, ok := billingratio.DefaultCompletionRatio[modelName]; ok {
		return ratio
	}
	return billingratio.GetCompletionRatio(modelName, channelProtocol)
}

func ratioToOriginalPrice(modelType string, priceUnit string, ratio float64) float64 {
	if ratio <= 0 {
		return 0
	}
	switch modelType {
	case ModelProviderModelTypeImage:
		if priceUnit == ModelProviderPriceUnitPerImage {
			return ratio / float64(billingratio.USD)
		}
		return ratio / float64(billingratio.USD)
	default:
		return ratio / float64(billingratio.USD)
	}
}

func normalizeModelType(raw string, modelName string) string {
	trimmed := strings.TrimSpace(strings.ToLower(raw))
	switch trimmed {
	case ModelProviderModelTypeText, ModelProviderModelTypeImage, ModelProviderModelTypeAudio:
		return trimmed
	}
	lower := strings.ToLower(strings.TrimSpace(modelName))
	if lower == "" {
		return ModelProviderModelTypeText
	}
	if _, ok := billingratio.ImageSizeRatios[modelName]; ok {
		return ModelProviderModelTypeImage
	}
	switch {
	case strings.Contains(lower, "whisper"),
		strings.HasPrefix(lower, "tts-"),
		strings.Contains(lower, "audio"):
		return ModelProviderModelTypeAudio
	case strings.HasPrefix(lower, "dall-e"),
		strings.HasPrefix(lower, "cogview"),
		strings.Contains(lower, "stable-diffusion"),
		strings.HasPrefix(lower, "wanx"),
		strings.HasPrefix(lower, "step-1x"),
		strings.Contains(lower, "flux"):
		return ModelProviderModelTypeImage
	default:
		return ModelProviderModelTypeText
	}
}

func defaultPriceUnitByType(modelType string, modelName string) string {
	t := normalizeModelType(modelType, modelName)
	switch t {
	case ModelProviderModelTypeImage:
		return ModelProviderPriceUnitPerImage
	case ModelProviderModelTypeAudio:
		if strings.HasPrefix(strings.ToLower(strings.TrimSpace(modelName)), "tts-") {
			return ModelProviderPriceUnitPer1KChars
		}
		return ModelProviderPriceUnitPer1KTokens
	default:
		return ModelProviderPriceUnitPer1KTokens
	}
}

func providerDisplayName(provider string) string {
	switch provider {
	case "openai":
		return "OpenAI"
	case "google":
		return "Google Gemini"
	case "anthropic":
		return "Anthropic"
	case "xai":
		return "xAI"
	case "mistral":
		return "Mistral"
	case "cohere":
		return "Cohere"
	case "deepseek":
		return "DeepSeek"
	case "qwen":
		return "Qwen"
	case "zhipu":
		return "Zhipu"
	case "hunyuan":
		return "Tencent Hunyuan"
	case "volcengine":
		return "Volcengine"
	case "minimax":
		return "MiniMax"
	case "baidu":
		return "Baidu"
	case "baidu-v2":
		return "Baidu Qianfan V2"
	case "moonshot":
		return "Moonshot"
	case "baichuan":
		return "Baichuan"
	case "lingyiwanwu":
		return "Lingyiwanwu"
	case "stepfun":
		return "StepFun"
	case "groq":
		return "Groq"
	case "ollama":
		return "Ollama"
	case "xunfei":
		return "iFlytek Spark"
	case "other":
		return "Other"
	default:
		if provider == "" {
			return "Other"
		}
		return strings.ToUpper(provider[:1]) + provider[1:]
	}
}
