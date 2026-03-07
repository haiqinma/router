package model

import (
	"sort"
	"strings"

	commonutils "github.com/yeying-community/router/common/utils"
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
	if isKnownImageModel(modelName) {
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

func isKnownImageModel(modelName string) bool {
	switch strings.TrimSpace(strings.ToLower(modelName)) {
	case "dall-e-2",
		"dall-e-3",
		"ali-stable-diffusion-xl",
		"ali-stable-diffusion-v1.5",
		"wanx-v1",
		"cogview-3",
		"step-1x-medium":
		return true
	default:
		return false
	}
}

func InferModelType(modelName string) string {
	return normalizeModelType("", modelName)
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
