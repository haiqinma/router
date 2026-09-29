package ali

import (
	"bufio"
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strings"

	"github.com/yeying-community/router/common/ctxkey"
	"github.com/yeying-community/router/common/render"

	"github.com/gin-gonic/gin"
	"github.com/yeying-community/router/common"
	"github.com/yeying-community/router/common/helper"
	"github.com/yeying-community/router/common/logger"
	"github.com/yeying-community/router/internal/relay/adaptor/openai"
	"github.com/yeying-community/router/internal/relay/model"
)

const EnableSearchModelSuffix = "-internet"

func ConvertRequest(request model.GeneralOpenAIRequest) *ChatRequest {
	messages := make([]Message, 0, len(request.Messages))
	for i := 0; i < len(request.Messages); i++ {
		message := request.Messages[i]
		messages = append(messages, Message{
			Content: message.StringContent(),
			Role:    strings.ToLower(message.Role),
		})
	}
	enableSearch := false
	aliModel := request.Model
	if strings.HasSuffix(aliModel, EnableSearchModelSuffix) {
		enableSearch = true
		aliModel = strings.TrimSuffix(aliModel, EnableSearchModelSuffix)
	}
	request.TopP = helper.Float64PtrMax(request.TopP, 0.9999)
	return &ChatRequest{
		Model: aliModel,
		Input: Input{
			Messages: messages,
		},
		Parameters: Parameters{
			EnableSearch:      enableSearch,
			EnableThinking:    request.EnableThinking,
			IncrementalOutput: request.Stream,
			Seed:              uint64(request.Seed),
			MaxTokens:         request.MaxTokens,
			Temperature:       request.Temperature,
			TopP:              request.TopP,
			TopK:              request.TopK,
			ResultFormat:      "message",
			Tools:             request.Tools,
		},
	}
}

func ConvertEmbeddingRequest(request model.GeneralOpenAIRequest) *EmbeddingRequest {
	return &EmbeddingRequest{
		Model: request.Model,
		Input: struct {
			Texts []string `json:"texts"`
		}{
			Texts: request.ParseInput(),
		},
	}
}

func ConvertImageRequest(request model.ImageRequest) *ImageRequest {
	var imageRequest ImageRequest
	imageRequest.Input.Prompt = request.Prompt
	imageRequest.Model = request.Model
	imageRequest.Parameters.Size = strings.Replace(request.Size, "x", "*", -1)
	imageRequest.Parameters.N = request.N
	imageRequest.ResponseFormat = request.ResponseFormat

	return &imageRequest
}

func ConvertQwenImageRequest(request model.ImageRequest) *QwenImageRequest {
	var imageRequest QwenImageRequest
	imageRequest.Model = request.Model
	imageRequest.Input.Messages = []QwenImageMessage{
		{
			Role: "user",
			Content: []QwenImageContent{
				{Text: request.Prompt},
			},
		},
	}
	imageRequest.Parameters.Size = strings.Replace(request.Size, "x", "*", -1)
	imageRequest.ResponseFormat = request.ResponseFormat
	return &imageRequest
}

func ConvertQwenImageEditRequest(request model.ImageRequest, form *multipart.Form) (*QwenImageRequest, error) {
	if form == nil {
		return nil, errors.New("multipart form is required")
	}
	files := form.File["image"]
	if len(files) == 0 {
		return nil, errors.New("image file is required")
	}
	imageDataURI, err := readMultipartImageDataURI(files[0])
	if err != nil {
		return nil, err
	}

	var imageRequest QwenImageRequest
	imageRequest.Model = request.Model
	imageRequest.Input.Messages = []QwenImageMessage{
		{
			Role: "user",
			Content: []QwenImageContent{
				{Image: imageDataURI},
				{Text: request.Prompt},
			},
		},
	}
	imageRequest.Parameters.Size = strings.Replace(request.Size, "x", "*", -1)
	imageRequest.ResponseFormat = request.ResponseFormat
	return &imageRequest, nil
}

func readMultipartImageDataURI(fileHeader *multipart.FileHeader) (string, error) {
	if fileHeader == nil {
		return "", errors.New("image file is required")
	}
	file, err := fileHeader.Open()
	if err != nil {
		return "", err
	}
	defer file.Close()
	data, err := io.ReadAll(file)
	if err != nil {
		return "", err
	}
	contentType := strings.TrimSpace(fileHeader.Header.Get("Content-Type"))
	if contentType == "" {
		contentType = http.DetectContentType(data)
	}
	return fmt.Sprintf("data:%s;base64,%s", contentType, base64.StdEncoding.EncodeToString(data)), nil
}

func EmbeddingHandler(c *gin.Context, resp *http.Response) (*model.ErrorWithStatusCode, *model.Usage) {
	var aliResponse EmbeddingResponse
	err := json.NewDecoder(resp.Body).Decode(&aliResponse)
	if err != nil {
		return openai.ErrorWrapper(err, "unmarshal_response_body_failed", http.StatusInternalServerError), nil
	}

	err = resp.Body.Close()
	if err != nil {
		return openai.ErrorWrapper(err, "close_response_body_failed", http.StatusInternalServerError), nil
	}

	if aliResponse.Code != "" {
		return &model.ErrorWithStatusCode{
			Error: model.Error{
				Message: aliResponse.Message,
				Type:    aliResponse.Code,
				Param:   aliResponse.RequestId,
				Code:    aliResponse.Code,
			},
			StatusCode: resp.StatusCode,
		}, nil
	}
	requestModel := c.GetString(ctxkey.RequestModel)
	fullTextResponse := embeddingResponseAli2OpenAI(&aliResponse)
	fullTextResponse.Model = requestModel
	jsonResponse, err := json.Marshal(fullTextResponse)
	if err != nil {
		return openai.ErrorWrapper(err, "marshal_response_body_failed", http.StatusInternalServerError), nil
	}
	c.Writer.Header().Set("Content-Type", "application/json")
	c.Writer.WriteHeader(resp.StatusCode)
	_, err = c.Writer.Write(jsonResponse)
	return nil, &fullTextResponse.Usage
}

func embeddingResponseAli2OpenAI(response *EmbeddingResponse) *openai.EmbeddingResponse {
	openAIEmbeddingResponse := openai.EmbeddingResponse{
		Object: "list",
		Data:   make([]openai.EmbeddingResponseItem, 0, len(response.Output.Embeddings)),
		Model:  "text-embedding-v1",
		Usage:  model.Usage{TotalTokens: response.Usage.TotalTokens},
	}

	for _, item := range response.Output.Embeddings {
		openAIEmbeddingResponse.Data = append(openAIEmbeddingResponse.Data, openai.EmbeddingResponseItem{
			Object:    `embedding`,
			Index:     item.TextIndex,
			Embedding: item.Embedding,
		})
	}
	return &openAIEmbeddingResponse
}

func responseAli2OpenAI(response *ChatResponse, modelName string) *openai.TextResponse {
	fullTextResponse := openai.TextResponse{
		Id:      response.RequestId,
		Object:  "chat.completion",
		Created: helper.GetTimestamp(),
		Model:   strings.TrimSpace(modelName),
		Choices: response.Output.Choices,
		Usage: model.Usage{
			PromptTokens:        response.Usage.InputTokens,
			CompletionTokens:    response.Usage.OutputTokens,
			TotalTokens:         response.Usage.InputTokens + response.Usage.OutputTokens,
			PromptTokensDetails: aliCachePromptDetails(response.Usage),
		},
	}
	return &fullTextResponse
}

// aliCachePromptDetails 把 DashScope 的缓存命中/写入映射到内部 PromptTokensDetails。
// DashScope 是包含语义(缓存量已计入 input_tokens),因此只补明细、不改 PromptTokens,
// 让计费 carve-out 把命中量按缓存价扣减。无缓存时返回 nil。
func aliCachePromptDetails(usage Usage) *model.PromptTokensDetails {
	cacheRead := usage.CacheReadTokens()
	cacheWrite := usage.CacheCreationTokens()
	if cacheRead <= 0 && cacheWrite <= 0 {
		return nil
	}
	return &model.PromptTokensDetails{
		CachedTokens:        cacheRead,
		CacheCreationTokens: cacheWrite,
	}
}

func streamResponseAli2OpenAI(aliResponse *ChatResponse, modelName string) *openai.ChatCompletionsStreamResponse {
	if len(aliResponse.Output.Choices) == 0 {
		return nil
	}
	aliChoice := aliResponse.Output.Choices[0]
	var choice openai.ChatCompletionsStreamResponseChoice
	choice.Delta = aliChoice.Message
	if aliChoice.FinishReason != "null" {
		finishReason := aliChoice.FinishReason
		choice.FinishReason = &finishReason
	}
	response := openai.ChatCompletionsStreamResponse{
		Id:      aliResponse.RequestId,
		Object:  "chat.completion.chunk",
		Created: helper.GetTimestamp(),
		Model:   strings.TrimSpace(modelName),
		Choices: []openai.ChatCompletionsStreamResponseChoice{choice},
	}
	return &response
}

func StreamHandler(c *gin.Context, resp *http.Response, modelName string) (*model.ErrorWithStatusCode, *model.Usage) {
	var usage model.Usage
	scanner := bufio.NewScanner(resp.Body)
	scanner.Split(func(data []byte, atEOF bool) (advance int, token []byte, err error) {
		if atEOF && len(data) == 0 {
			return 0, nil, nil
		}
		if i := strings.Index(string(data), "\n"); i >= 0 {
			return i + 1, data[0:i], nil
		}
		if atEOF {
			return len(data), data, nil
		}
		return 0, nil, nil
	})

	common.SetEventStreamHeaders(c)

	for scanner.Scan() {
		data := scanner.Text()
		if len(data) < 5 || data[:5] != "data:" {
			continue
		}
		data = data[5:]

		var aliResponse ChatResponse
		err := json.Unmarshal([]byte(data), &aliResponse)
		if err != nil {
			logger.SysError("error unmarshalling stream response: " + err.Error())
			continue
		}
		if aliResponse.Usage.OutputTokens != 0 {
			usage.PromptTokens = aliResponse.Usage.InputTokens
			usage.CompletionTokens = aliResponse.Usage.OutputTokens
			usage.TotalTokens = aliResponse.Usage.InputTokens + aliResponse.Usage.OutputTokens
			usage.PromptTokensDetails = aliCachePromptDetails(aliResponse.Usage)
		}
		response := streamResponseAli2OpenAI(&aliResponse, modelName)
		if response == nil {
			continue
		}
		err = render.ObjectData(c, response)
		if err != nil {
			logger.SysError(err.Error())
		}
	}

	if err := scanner.Err(); err != nil {
		logger.SysError("error reading stream: " + err.Error())
	}

	render.Done(c)

	err := resp.Body.Close()
	if err != nil {
		return openai.ErrorWrapper(err, "close_response_body_failed", http.StatusInternalServerError), nil
	}
	return nil, &usage
}

func Handler(c *gin.Context, resp *http.Response, modelName string) (*model.ErrorWithStatusCode, *model.Usage) {
	ctx := c.Request.Context()
	var aliResponse ChatResponse
	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return openai.ErrorWrapper(err, "read_response_body_failed", http.StatusInternalServerError), nil
	}
	err = resp.Body.Close()
	if err != nil {
		return openai.ErrorWrapper(err, "close_response_body_failed", http.StatusInternalServerError), nil
	}
	logger.Debugf(ctx, "response body: %s\n", responseBody)
	err = json.Unmarshal(responseBody, &aliResponse)
	if err != nil {
		return openai.ErrorWrapper(err, "unmarshal_response_body_failed", http.StatusInternalServerError), nil
	}
	if aliResponse.Code != "" {
		return &model.ErrorWithStatusCode{
			Error: model.Error{
				Message: aliResponse.Message,
				Type:    aliResponse.Code,
				Param:   aliResponse.RequestId,
				Code:    aliResponse.Code,
			},
			StatusCode: resp.StatusCode,
		}, nil
	}
	fullTextResponse := responseAli2OpenAI(&aliResponse, modelName)
	jsonResponse, err := json.Marshal(fullTextResponse)
	if err != nil {
		return openai.ErrorWrapper(err, "marshal_response_body_failed", http.StatusInternalServerError), nil
	}
	c.Writer.Header().Set("Content-Type", "application/json")
	c.Writer.WriteHeader(resp.StatusCode)
	_, err = c.Writer.Write(jsonResponse)
	return nil, &fullTextResponse.Usage
}

type compatibleEmbeddingUsage struct {
	PromptTokens int `json:"prompt_tokens"`
	TotalTokens  int `json:"total_tokens"`
}

type compatibleEmbeddingEnvelope struct {
	Usage compatibleEmbeddingUsage `json:"usage"`
	Error model.Error              `json:"error"`
}

func relayCompatibleEmbeddingResponse(c *gin.Context, resp *http.Response) (*model.ErrorWithStatusCode, *model.Usage) {
	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return openai.ErrorWrapper(err, "read_response_body_failed", http.StatusInternalServerError), nil
	}
	if err := resp.Body.Close(); err != nil {
		return openai.ErrorWrapper(err, "close_response_body_failed", http.StatusInternalServerError), nil
	}

	var envelope compatibleEmbeddingEnvelope
	if err := json.Unmarshal(responseBody, &envelope); err != nil {
		return openai.ErrorWrapper(err, "unmarshal_response_body_failed", http.StatusInternalServerError), nil
	}
	if envelope.Error.Type != "" {
		return &model.ErrorWithStatusCode{
			Error:      envelope.Error,
			StatusCode: resp.StatusCode,
		}, nil
	}

	resp.Body = io.NopCloser(bytes.NewBuffer(responseBody))
	for k, v := range resp.Header {
		c.Writer.Header().Set(k, v[0])
	}
	c.Writer.WriteHeader(resp.StatusCode)
	if _, err := io.Copy(c.Writer, resp.Body); err != nil {
		return openai.ErrorWrapper(err, "copy_response_body_failed", http.StatusInternalServerError), nil
	}
	if err := resp.Body.Close(); err != nil {
		return openai.ErrorWrapper(err, "close_response_body_failed", http.StatusInternalServerError), nil
	}

	usage := &model.Usage{
		PromptTokens: envelope.Usage.PromptTokens,
		TotalTokens:  envelope.Usage.TotalTokens,
	}
	if usage.TotalTokens >= usage.PromptTokens {
		usage.CompletionTokens = usage.TotalTokens - usage.PromptTokens
	}
	return nil, usage
}
