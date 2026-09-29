package model

type Usage struct {
	PromptTokens         int `json:"prompt_tokens"`
	CompletionTokens     int `json:"completion_tokens"`
	TotalTokens          int `json:"total_tokens"`
	ImageGenerationCalls int `json:"image_generation_calls,omitempty"`

	// DeepSeek 在 usage 顶层给出缓存命中/未命中(而非 prompt_tokens_details.cached_tokens),
	// 且 prompt_tokens = hit + miss(包含语义)。这里保留原始字段,由 NormalizeCacheDetails
	// 归一化到 PromptTokensDetails,供计费按缓存价扣减。
	PromptCacheHitTokens  int `json:"prompt_cache_hit_tokens,omitempty"`
	PromptCacheMissTokens int `json:"prompt_cache_miss_tokens,omitempty"`

	PromptTokensDetails     *PromptTokensDetails     `json:"prompt_tokens_details,omitempty"`
	CompletionTokensDetails *CompletionTokensDetails `json:"completion_tokens_details,omitempty"`
}

// NormalizeCacheDetails 把 DeepSeek 风格的顶层 prompt_cache_hit_tokens 归一化到
// PromptTokensDetails.CachedTokens。DeepSeek 是包含语义(prompt_tokens 已含命中),
// 因此只补缓存明细、不改 PromptTokens,让下游 carve-out 把命中部分按缓存价扣减。
// 已带 prompt_tokens_details 的响应(如 OpenAI)不受影响。
func (u *Usage) NormalizeCacheDetails() {
	if u == nil || u.PromptCacheHitTokens <= 0 {
		return
	}
	if u.PromptTokensDetails == nil {
		u.PromptTokensDetails = &PromptTokensDetails{}
	}
	if u.PromptTokensDetails.CachedTokens <= 0 && u.PromptTokensDetails.CacheReadTokens <= 0 {
		u.PromptTokensDetails.CachedTokens = u.PromptCacheHitTokens
	}
}

type PromptTokensDetails struct {
	CachedTokens        int `json:"cached_tokens,omitempty"`
	CacheReadTokens     int `json:"cache_read_tokens,omitempty"`
	CacheCreationTokens int `json:"cache_creation_tokens,omitempty"`
}

type CompletionTokensDetails struct {
	ReasoningTokens          int `json:"reasoning_tokens"`
	AcceptedPredictionTokens int `json:"accepted_prediction_tokens"`
	RejectedPredictionTokens int `json:"rejected_prediction_tokens"`
}

type Error struct {
	Message string `json:"message"`
	Type    string `json:"type"`
	Param   string `json:"param"`
	Code    any    `json:"code"`
}

type ErrorWithStatusCode struct {
	Error
	StatusCode int `json:"status_code"`
}
