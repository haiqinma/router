package utils

import "strings"

// NormalizeProvider canonicalizes provider aliases for filtering and persistence.
func NormalizeProvider(provider string) string {
	trimmed := strings.TrimSpace(provider)
	if trimmed == "" {
		return ""
	}
	lower := strings.ToLower(trimmed)
	switch lower {
	case "gpt", "openai":
		return "openai"
	case "gemini", "google":
		return "google"
	case "claude", "anthropic":
		return "anthropic"
	case "xai", "grok":
		return "xai"
	case "mistral":
		return "mistral"
	case "cohere", "command-r", "commandr":
		return "cohere"
	case "deepseek":
		return "deepseek"
	case "qwen", "qwq", "qvq", "千问":
		return "qwen"
	case "zhipu", "glm", "智谱", "bigmodel":
		return "zhipu"
	case "hunyuan", "tencent", "腾讯", "混元":
		return "hunyuan"
	case "volc", "volcengine", "doubao", "ark", "火山", "豆包", "字节":
		return "volcengine"
	case "minimax", "abab":
		return "minimax"
	case "black-forest-labs", "blackforestlabs", "bfl":
		return "black-forest-labs"
	default:
		return lower
	}
}

// ResolveProvider infers provider from model naming rules to keep backend and frontend consistent.
func ResolveProvider(modelName string) string {
	name := strings.TrimSpace(modelName)
	if name == "" {
		return "unknown"
	}
	if strings.Contains(name, "/") {
		parts := strings.SplitN(name, "/", 2)
		prefix := NormalizeProvider(parts[0])
		if prefix == "" {
			return "unknown"
		}
		return prefix
	}
	lower := strings.ToLower(name)
	switch {
	case strings.HasPrefix(lower, "gpt-"),
		strings.HasPrefix(lower, "o1"),
		strings.HasPrefix(lower, "o3"),
		strings.HasPrefix(lower, "o4"),
		strings.HasPrefix(lower, "chatgpt-"):
		return "openai"
	case strings.HasPrefix(lower, "claude-"):
		return "anthropic"
	case strings.HasPrefix(lower, "gemini-"):
		return "google"
	case strings.HasPrefix(lower, "grok-"):
		return "xai"
	case strings.HasPrefix(lower, "mistral-"):
		return "mistral"
	case strings.HasPrefix(lower, "command-r"),
		strings.HasPrefix(lower, "cohere-"):
		return "cohere"
	case strings.HasPrefix(lower, "deepseek-"):
		return "deepseek"
	case strings.HasPrefix(lower, "qwen"),
		strings.HasPrefix(lower, "qwq-"),
		strings.HasPrefix(lower, "qvq-"):
		return "qwen"
	case strings.HasPrefix(lower, "glm-"),
		strings.HasPrefix(lower, "cogview-"):
		return "zhipu"
	case strings.HasPrefix(lower, "hunyuan-"):
		return "hunyuan"
	case strings.HasPrefix(lower, "doubao-"),
		strings.HasPrefix(lower, "ark-"):
		return "volcengine"
	case strings.HasPrefix(lower, "abab"),
		strings.HasPrefix(lower, "minimax-"):
		return "minimax"
	case strings.HasPrefix(lower, "ernie-"):
		return "baidu"
	case strings.HasPrefix(lower, "llama"):
		return "meta-llama"
	case strings.HasPrefix(lower, "flux"):
		return "black-forest-labs"
	default:
		return "unknown"
	}
}

// ResolveOwnedByProvider infers provider from OpenAI-compatible `owned_by`.
func ResolveOwnedByProvider(ownedBy string) string {
	value := strings.TrimSpace(strings.ToLower(ownedBy))
	if value == "" {
		return "unknown"
	}
	canonical := NormalizeProvider(value)
	if canonical != value {
		return canonical
	}
	switch {
	case strings.Contains(value, "openai"),
		strings.Contains(value, "gpt"):
		return "openai"
	case strings.Contains(value, "anthropic"),
		strings.Contains(value, "claude"):
		return "anthropic"
	case strings.Contains(value, "google"),
		strings.Contains(value, "gemini"):
		return "google"
	case strings.Contains(value, "xai"),
		strings.Contains(value, "grok"):
		return "xai"
	case strings.Contains(value, "mistral"):
		return "mistral"
	case strings.Contains(value, "cohere"),
		strings.Contains(value, "command-r"):
		return "cohere"
	case strings.Contains(value, "deepseek"):
		return "deepseek"
	case strings.Contains(value, "qwen"),
		strings.Contains(value, "qwq"),
		strings.Contains(value, "qvq"):
		return "qwen"
	case strings.Contains(value, "zhipu"),
		strings.Contains(value, "bigmodel"),
		strings.Contains(value, "glm"):
		return "zhipu"
	case strings.Contains(value, "hunyuan"),
		strings.Contains(value, "tencent"):
		return "hunyuan"
	case strings.Contains(value, "volc"),
		strings.Contains(value, "doubao"),
		strings.Contains(value, "ark"):
		return "volcengine"
	case strings.Contains(value, "minimax"),
		strings.Contains(value, "abab"):
		return "minimax"
	case strings.Contains(value, "black-forest-labs"),
		strings.Contains(value, "black forest labs"),
		strings.Contains(value, "blackforestlabs"):
		return "black-forest-labs"
	default:
		return value
	}
}

// MatchProvider matches a model/provider metadata pair to the provider filter.
func MatchProvider(modelName string, ownedBy string, provider string) bool {
	filter := NormalizeProvider(provider)
	if filter == "" {
		return true
	}
	if ResolveProvider(modelName) == filter {
		return true
	}
	if ResolveOwnedByProvider(ownedBy) == filter {
		return true
	}
	lowerName := strings.ToLower(modelName)
	lowerOwnedBy := strings.ToLower(ownedBy)
	return strings.Contains(lowerName, filter) || strings.Contains(lowerOwnedBy, filter)
}
