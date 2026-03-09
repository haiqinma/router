package billing

import (
	"fmt"
	"math"
	"strings"

	"github.com/yeying-community/router/common/config"
	"github.com/yeying-community/router/internal/admin/model"
)

const usd2rmb = 7

func ComputeTextPreConsumedQuota(promptTokens int, maxCompletionTokens int, pricing model.ResolvedModelPricing, groupRatio float64) int64 {
	completionBudget := float64(config.PreConsumedQuota)
	if maxCompletionTokens > 0 {
		completionBudget += float64(maxCompletionTokens)
	}
	promptCost := quotaFromPrice(pricing.InputPrice, pricing.PriceUnit, pricing.Currency, float64(promptTokens), groupRatio)
	completionCost := quotaFromPrice(pricing.OutputPrice, pricing.PriceUnit, pricing.Currency, completionBudget, groupRatio)
	return normalizeQuota(promptCost+completionCost, promptTokens > 0 || maxCompletionTokens > 0, pricing, groupRatio)
}

func ComputeTextQuota(promptTokens int, completionTokens int, pricing model.ResolvedModelPricing, groupRatio float64) int64 {
	promptCost := quotaFromPrice(pricing.InputPrice, pricing.PriceUnit, pricing.Currency, float64(promptTokens), groupRatio)
	completionCost := quotaFromPrice(pricing.OutputPrice, pricing.PriceUnit, pricing.Currency, float64(completionTokens), groupRatio)
	return normalizeQuota(promptCost+completionCost, promptTokens > 0 || completionTokens > 0, pricing, groupRatio)
}

func ComputeImageQuota(imageCount int, multiplier float64, pricing model.ResolvedModelPricing, groupRatio float64) (int64, error) {
	if imageCount <= 0 {
		return 0, nil
	}
	price := pricing.InputPrice
	if price <= 0 && pricing.OutputPrice > 0 {
		price = pricing.OutputPrice
	}
	quantity := float64(imageCount) * multiplier
	return normalizeQuota(quotaFromPrice(price, pricing.PriceUnit, pricing.Currency, quantity, groupRatio), quantity > 0, pricing, groupRatio), nil
}

func ComputeAudioSpeechQuota(charCount int, pricing model.ResolvedModelPricing, groupRatio float64) (int64, error) {
	if charCount <= 0 {
		return 0, nil
	}
	price := pricing.InputPrice
	if price <= 0 && pricing.OutputPrice > 0 {
		price = pricing.OutputPrice
	}
	return normalizeQuota(quotaFromPrice(price, pricing.PriceUnit, pricing.Currency, float64(charCount), groupRatio), charCount > 0, pricing, groupRatio), nil
}

func ComputeAudioTextQuota(tokenCount int, pricing model.ResolvedModelPricing, groupRatio float64) (int64, error) {
	if tokenCount <= 0 {
		return 0, nil
	}
	price := pricing.InputPrice
	if price <= 0 && pricing.OutputPrice > 0 {
		price = pricing.OutputPrice
	}
	return normalizeQuota(quotaFromPrice(price, pricing.PriceUnit, pricing.Currency, float64(tokenCount), groupRatio), tokenCount > 0, pricing, groupRatio), nil
}

func FormatPricingLog(pricing model.ResolvedModelPricing, groupRatio float64) string {
	source := strings.TrimSpace(pricing.Source)
	if source == "" {
		source = "unknown"
	}
	return fmt.Sprintf(
		"计费: source=%s provider=%s type=%s unit=%s currency=%s input=%.6f output=%.6f group=%.2f",
		source,
		strings.TrimSpace(pricing.Provider),
		strings.TrimSpace(pricing.Type),
		strings.TrimSpace(pricing.PriceUnit),
		strings.TrimSpace(pricing.Currency),
		pricing.InputPrice,
		pricing.OutputPrice,
		groupRatio,
	)
}

func quotaFromPrice(price float64, priceUnit string, currency string, quantity float64, groupRatio float64) float64 {
	if price <= 0 || quantity <= 0 || groupRatio == 0 {
		return 0
	}
	normalizedUnit := strings.TrimSpace(strings.ToLower(priceUnit))
	switch normalizedUnit {
	case "", model.ProviderPriceUnitPer1KTokens, model.ProviderPriceUnitPer1KChars:
		return quantity * price * quotaPerCurrencyUnit(currency) / 1000 * groupRatio
	case model.ProviderPriceUnitPerImage:
		return quantity * price * quotaPerCurrencyUnit(currency) * groupRatio
	default:
		return quantity * price * quotaPerCurrencyUnit(currency) / 1000 * groupRatio
	}
}

func quotaPerCurrencyUnit(currency string) float64 {
	switch strings.TrimSpace(strings.ToUpper(currency)) {
	case "", model.ProviderPriceCurrencyUSD:
		return config.QuotaPerUnit
	case "CNY", "RMB":
		return config.QuotaPerUnit / float64(usd2rmb)
	default:
		return config.QuotaPerUnit
	}
}

func normalizeQuota(raw float64, hasUsage bool, pricing model.ResolvedModelPricing, groupRatio float64) int64 {
	if raw <= 0 {
		if hasUsage && groupRatio != 0 && pricing.IsConfigured() {
			return 1
		}
		return 0
	}
	return int64(math.Ceil(raw))
}
