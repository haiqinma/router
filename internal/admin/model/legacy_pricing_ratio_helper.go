package model

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/yeying-community/router/common/logger"
)

const legacyPricingUSDQuotaScale = 500

type legacyPricingRatioPayload struct {
	ModelRatio      map[string]float64 `json:"model_ratio"`
	CompletionRatio map[string]float64 `json:"completion_ratio"`
}

//go:embed legacy_pricing_ratios.json
var legacyPricingRatiosJSON []byte

var legacyPricingRatios = mustLoadLegacyPricingRatios()

func mustLoadLegacyPricingRatios() legacyPricingRatioPayload {
	payload := legacyPricingRatioPayload{
		ModelRatio:      map[string]float64{},
		CompletionRatio: map[string]float64{},
	}
	if err := json.Unmarshal(legacyPricingRatiosJSON, &payload); err != nil {
		panic(fmt.Sprintf("invalid legacy pricing ratios: %v", err))
	}
	return payload
}

func legacyNormalizeRatioLookupModelName(name string) string {
	modelName := strings.TrimSpace(name)
	if strings.HasPrefix(modelName, "qwen-") && strings.HasSuffix(modelName, "-internet") {
		modelName = strings.TrimSuffix(modelName, "-internet")
	}
	if strings.HasPrefix(modelName, "command-") && strings.HasSuffix(modelName, "-internet") {
		modelName = strings.TrimSuffix(modelName, "-internet")
	}
	return strings.TrimSpace(modelName)
}

func legacyRatioLookupKeys(name string, channelProtocol int) []string {
	modelName := legacyNormalizeRatioLookupModelName(name)
	if modelName == "" {
		return nil
	}
	return []string{
		fmt.Sprintf("%s(%d)", modelName, channelProtocol),
		modelName,
	}
}

func legacyGetModelRatio(name string, channelProtocol int) float64 {
	for _, key := range legacyRatioLookupKeys(name, channelProtocol) {
		if ratio, ok := legacyPricingRatios.ModelRatio[key]; ok {
			return ratio
		}
	}
	logger.SysError("legacy model ratio not found: " + strings.TrimSpace(name))
	return 30
}

func legacyGetCompletionRatio(name string, channelProtocol int) float64 {
	modelName := legacyNormalizeRatioLookupModelName(name)
	for _, key := range legacyRatioLookupKeys(modelName, channelProtocol) {
		if ratio, ok := legacyPricingRatios.CompletionRatio[key]; ok {
			return ratio
		}
	}

	if strings.HasPrefix(modelName, "gpt-3.5") {
		if modelName == "gpt-3.5-turbo" || strings.HasSuffix(modelName, "0125") {
			return 3
		}
		if strings.HasSuffix(modelName, "1106") {
			return 2
		}
		return 4.0 / 3.0
	}
	if strings.HasPrefix(modelName, "gpt-4") {
		if strings.HasPrefix(modelName, "gpt-4o") {
			if modelName == "gpt-4o-2024-05-13" {
				return 3
			}
			return 4
		}
		if strings.HasPrefix(modelName, "gpt-4-turbo") || strings.HasSuffix(modelName, "preview") {
			return 3
		}
		return 2
	}
	if strings.HasPrefix(modelName, "o1") {
		return 4
	}
	if modelName == "chatgpt-4o-latest" {
		return 3
	}
	if strings.HasPrefix(modelName, "claude-3") {
		return 5
	}
	if strings.HasPrefix(modelName, "claude-") {
		return 3
	}
	if strings.HasPrefix(modelName, "mistral-") {
		return 3
	}
	if strings.HasPrefix(modelName, "gemini-") {
		return 3
	}
	if strings.HasPrefix(modelName, "deepseek-") {
		return 2
	}

	switch modelName {
	case "llama2-70b-4096":
		return 0.8 / 0.64
	case "llama3-8b-8192":
		return 2
	case "llama3-70b-8192":
		return 0.79 / 0.59
	case "command", "command-light", "command-nightly", "command-light-nightly":
		return 2
	case "command-r":
		return 3
	case "command-r-plus":
		return 5
	case "grok-beta":
		return 3
	case "ibm-granite/granite-20b-code-instruct-8k":
		return 5
	case "ibm-granite/granite-3.0-2b-instruct":
		return 8.333333333333334
	case "ibm-granite/granite-3.0-8b-instruct", "ibm-granite/granite-8b-code-instruct-128k":
		return 5
	case "meta/llama-2-13b",
		"meta/llama-2-13b-chat",
		"meta/llama-2-7b",
		"meta/llama-2-7b-chat",
		"meta/meta-llama-3-8b",
		"meta/meta-llama-3-8b-instruct":
		return 5
	case "meta/llama-2-70b",
		"meta/llama-2-70b-chat",
		"meta/meta-llama-3-70b",
		"meta/meta-llama-3-70b-instruct":
		return 2.750 / 0.650
	case "meta/meta-llama-3.1-405b-instruct":
		return 1
	case "mistralai/mistral-7b-instruct-v0.2", "mistralai/mistral-7b-v0.1":
		return 5
	case "mistralai/mixtral-8x7b-instruct-v0.1":
		return 1.0 / 0.3
	}

	return 1
}

func legacyRatioToOriginalPrice(modelType string, priceUnit string, ratio float64) float64 {
	if ratio <= 0 {
		return 0
	}
	switch modelType {
	case ModelProviderModelTypeImage:
		if priceUnit == ModelProviderPriceUnitPerImage {
			return ratio / float64(legacyPricingUSDQuotaScale)
		}
		return ratio / float64(legacyPricingUSDQuotaScale)
	default:
		return ratio / float64(legacyPricingUSDQuotaScale)
	}
}
