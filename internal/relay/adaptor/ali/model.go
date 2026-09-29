package ali

import (
	"github.com/yeying-community/router/internal/relay/adaptor/openai"
	"github.com/yeying-community/router/internal/relay/model"
)

type Message struct {
	Content string `json:"content"`
	Role    string `json:"role"`
}

type Input struct {
	//Prompt   string       `json:"prompt"`
	Messages []Message `json:"messages"`
}

type Parameters struct {
	TopP              *float64     `json:"top_p,omitempty"`
	TopK              int          `json:"top_k,omitempty"`
	Seed              uint64       `json:"seed,omitempty"`
	EnableSearch      bool         `json:"enable_search,omitempty"`
	EnableThinking    *bool        `json:"enable_thinking,omitempty"`
	IncrementalOutput bool         `json:"incremental_output,omitempty"`
	MaxTokens         int          `json:"max_tokens,omitempty"`
	Temperature       *float64     `json:"temperature,omitempty"`
	ResultFormat      string       `json:"result_format,omitempty"`
	Tools             []model.Tool `json:"tools,omitempty"`
}

type ChatRequest struct {
	Model      string     `json:"model"`
	Input      Input      `json:"input"`
	Parameters Parameters `json:"parameters,omitempty"`
}

type ImageRequest struct {
	Model string `json:"model"`
	Input struct {
		Prompt         string `json:"prompt"`
		NegativePrompt string `json:"negative_prompt,omitempty"`
	} `json:"input"`
	Parameters struct {
		Size  string `json:"size,omitempty"`
		N     int    `json:"n,omitempty"`
		Steps string `json:"steps,omitempty"`
		Scale string `json:"scale,omitempty"`
	} `json:"parameters,omitempty"`
	ResponseFormat string `json:"response_format,omitempty"`
}

type QwenImageContent struct {
	Text  string `json:"text,omitempty"`
	Image string `json:"image,omitempty"`
}

type QwenImageMessage struct {
	Role    string             `json:"role"`
	Content []QwenImageContent `json:"content"`
}

type QwenImageRequest struct {
	Model string `json:"model"`
	Input struct {
		Messages []QwenImageMessage `json:"messages"`
	} `json:"input"`
	Parameters struct {
		Size string `json:"size,omitempty"`
	} `json:"parameters,omitempty"`
	ResponseFormat string `json:"response_format,omitempty"`
}

type QwenImageResponse struct {
	RequestId string `json:"request_id,omitempty"`
	Code      string `json:"code,omitempty"`
	Message   string `json:"message,omitempty"`
	Output    struct {
		Choices []struct {
			Message struct {
				Content []QwenImageContent `json:"content,omitempty"`
			} `json:"message,omitempty"`
		} `json:"choices,omitempty"`
	} `json:"output,omitempty"`
}

type TaskResponse struct {
	StatusCode int    `json:"status_code,omitempty"`
	RequestId  string `json:"request_id,omitempty"`
	Code       string `json:"code,omitempty"`
	Message    string `json:"message,omitempty"`
	Output     struct {
		TaskId     string `json:"task_id,omitempty"`
		TaskStatus string `json:"task_status,omitempty"`
		Code       string `json:"code,omitempty"`
		Message    string `json:"message,omitempty"`
		Results    []struct {
			B64Image string `json:"b64_image,omitempty"`
			Url      string `json:"url,omitempty"`
			Code     string `json:"code,omitempty"`
			Message  string `json:"message,omitempty"`
		} `json:"results,omitempty"`
		TaskMetrics struct {
			Total     int `json:"TOTAL,omitempty"`
			Succeeded int `json:"SUCCEEDED,omitempty"`
			Failed    int `json:"FAILED,omitempty"`
		} `json:"task_metrics,omitempty"`
	} `json:"output,omitempty"`
	Usage Usage `json:"usage"`
}

type Header struct {
	Action       string `json:"action,omitempty"`
	Streaming    string `json:"streaming,omitempty"`
	TaskID       string `json:"task_id,omitempty"`
	Event        string `json:"event,omitempty"`
	ErrorCode    string `json:"error_code,omitempty"`
	ErrorMessage string `json:"error_message,omitempty"`
	Attributes   any    `json:"attributes,omitempty"`
}

type Payload struct {
	Model      string `json:"model,omitempty"`
	Task       string `json:"task,omitempty"`
	TaskGroup  string `json:"task_group,omitempty"`
	Function   string `json:"function,omitempty"`
	Parameters struct {
		SampleRate int     `json:"sample_rate,omitempty"`
		Rate       float64 `json:"rate,omitempty"`
		Format     string  `json:"format,omitempty"`
	} `json:"parameters,omitempty"`
	Input struct {
		Text string `json:"text,omitempty"`
	} `json:"input,omitempty"`
	Usage struct {
		Characters int `json:"characters,omitempty"`
	} `json:"usage,omitempty"`
}

type WSSMessage struct {
	Header  Header  `json:"header,omitempty"`
	Payload Payload `json:"payload,omitempty"`
}

type EmbeddingRequest struct {
	Model string `json:"model"`
	Input struct {
		Texts []string `json:"texts"`
	} `json:"input"`
	Parameters *struct {
		TextType string `json:"text_type,omitempty"`
	} `json:"parameters,omitempty"`
}

type Embedding struct {
	Embedding []float64 `json:"embedding"`
	TextIndex int       `json:"text_index"`
}

type EmbeddingResponse struct {
	Output struct {
		Embeddings []Embedding `json:"embeddings"`
	} `json:"output"`
	Usage Usage `json:"usage"`
	Error
}

type Error struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	RequestId string `json:"request_id"`
}

type Usage struct {
	InputTokens  int `json:"input_tokens"`
	OutputTokens int `json:"output_tokens"`
	TotalTokens  int `json:"total_tokens"`
	// DashScope 上下文缓存命中是包含语义(input_tokens 的子集)。新版模型放在
	// prompt_tokens_details.cached_tokens,旧版模型直接给顶层 cached_tokens。
	CachedTokens        int                     `json:"cached_tokens"`
	PromptTokensDetails *UsagePromptTokenDetail `json:"prompt_tokens_details"`
}

type UsagePromptTokenDetail struct {
	CachedTokens             int `json:"cached_tokens"`
	CacheCreationInputTokens int `json:"cache_creation_input_tokens"`
}

// CacheReadTokens 归一化「命中缓存」的读取量,优先取新版嵌套字段,回退到旧版顶层字段。
func (u Usage) CacheReadTokens() int {
	if u.PromptTokensDetails != nil && u.PromptTokensDetails.CachedTokens > 0 {
		return u.PromptTokensDetails.CachedTokens
	}
	return u.CachedTokens
}

// CacheCreationTokens 归一化「写入缓存」的量(仅新版嵌套字段提供)。
func (u Usage) CacheCreationTokens() int {
	if u.PromptTokensDetails != nil {
		return u.PromptTokensDetails.CacheCreationInputTokens
	}
	return 0
}

type Output struct {
	//Text         string                      `json:"text"`
	//FinishReason string                      `json:"finish_reason"`
	Choices []openai.TextResponseChoice `json:"choices"`
}

type ChatResponse struct {
	Output Output `json:"output"`
	Usage  Usage  `json:"usage"`
	Error
}
