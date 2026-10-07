package ali

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/yeying-community/router/internal/relay/adaptor"
	openaiadaptor "github.com/yeying-community/router/internal/relay/adaptor/openai"
	relaychannel "github.com/yeying-community/router/internal/relay/channel"
	"github.com/yeying-community/router/internal/relay/meta"
	"github.com/yeying-community/router/internal/relay/model"
	"github.com/yeying-community/router/internal/relay/relaymode"
)

type Adaptor struct {
	meta *meta.Meta
}

func (a *Adaptor) Init(meta *meta.Meta) {
	a.meta = meta
}

func (a *Adaptor) GetRequestURL(meta *meta.Meta) (string, error) {
	fullRequestURL := ""
	switch meta.Mode {
	case relaymode.Embeddings:
		fullRequestURL = fmt.Sprintf("%s/compatible-mode/v1/embeddings", meta.BaseURL)
	case relaymode.Responses:
		fullRequestURL = fmt.Sprintf("%s/compatible-mode/v1/responses", meta.BaseURL)
	case relaymode.Realtime:
		fullRequestURL = fmt.Sprintf("%s/api-ws/v1/realtime", meta.BaseURL)
	case relaymode.AudioSpeech, relaymode.AudioTranslation, relaymode.AudioTranscription, relaymode.Videos:
		fullRequestURL = openaiadaptor.GetFullRequestURL(meta.BaseURL, meta.RequestURLPath, relaychannel.OpenAI)
	case relaymode.ImagesGenerations:
		if isQwenImageModel(meta.ActualModelName) {
			fullRequestURL = fmt.Sprintf("%s/api/v1/services/aigc/multimodal-generation/generation", meta.BaseURL)
		} else {
			fullRequestURL = fmt.Sprintf("%s/api/v1/services/aigc/text2image/image-synthesis", meta.BaseURL)
		}
	case relaymode.ImagesEdits:
		if isQwenImageModel(meta.ActualModelName) {
			fullRequestURL = fmt.Sprintf("%s/api/v1/services/aigc/multimodal-generation/generation", meta.BaseURL)
		} else if IsWanxImageEditModel(meta.ActualModelName) {
			fullRequestURL = fmt.Sprintf("%s/api/v1/services/aigc/image2image/image-synthesis", meta.BaseURL)
		} else {
			fullRequestURL = openaiadaptor.GetFullRequestURL(meta.BaseURL, meta.RequestURLPath, relaychannel.OpenAI)
		}
	case relaymode.Completions:
		fullRequestURL = fmt.Sprintf("%s/compatible-mode/v1/completions", meta.BaseURL)
	default:
		fullRequestURL = fmt.Sprintf("%s/compatible-mode/v1/chat/completions", meta.BaseURL)
	}

	return fullRequestURL, nil
}

func (a *Adaptor) SetupRequestHeader(c *gin.Context, req *http.Request, meta *meta.Meta) error {
	adaptor.SetupCommonRequestHeader(c, req, meta)
	if isQwenImageModel(meta.ActualModelName) && (meta.Mode == relaymode.ImagesGenerations || meta.Mode == relaymode.ImagesEdits) {
		req.Header.Set("Content-Type", "application/json")
	}
	// 万相局部重绘走 image2image 异步接口：JSON 请求体 + 必须的异步头
	if IsWanxImageEditModel(meta.ActualModelName) && meta.Mode == relaymode.ImagesEdits {
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-DashScope-Async", "enable")
	}
	if meta.IsStream {
		req.Header.Set("Accept", "text/event-stream")
		req.Header.Set("X-DashScope-SSE", "enable")
	}
	req.Header.Set("Authorization", "Bearer "+meta.APIKey)

	if meta.Mode == relaymode.ImagesGenerations && !isQwenImageModel(meta.ActualModelName) {
		req.Header.Set("X-DashScope-Async", "enable")
	}
	if a.meta.Config.Plugin != "" {
		req.Header.Set("X-DashScope-Plugin", a.meta.Config.Plugin)
	}
	return nil
}

func (a *Adaptor) ConvertRequest(c *gin.Context, relayMode int, request *model.GeneralOpenAIRequest) (any, error) {
	if request == nil {
		return nil, errors.New("request is nil")
	}
	switch relayMode {
	case relaymode.ImagesGenerations:
		aliRequest := ConvertRequest(*request)
		return aliRequest, nil
	default:
		compatibleAdaptor := openaiadaptor.Adaptor{}
		return compatibleAdaptor.ConvertRequest(c, relayMode, request)
	}
}

func (a *Adaptor) ConvertImageRequest(request *model.ImageRequest) (any, error) {
	if request == nil {
		return nil, errors.New("request is nil")
	}

	if isQwenImageModel(request.Model) || (a.meta != nil && isQwenImageModel(a.meta.ActualModelName)) {
		return ConvertQwenImageRequest(*request), nil
	}
	return ConvertImageRequest(*request), nil
}

func (a *Adaptor) DoRequest(c *gin.Context, meta *meta.Meta, requestBody io.Reader) (*http.Response, error) {
	return adaptor.DoRequestHelper(a, c, meta, requestBody)
}

func (a *Adaptor) DoResponse(c *gin.Context, resp *http.Response, meta *meta.Meta) (usage *model.Usage, err *model.ErrorWithStatusCode) {
	switch meta.Mode {
	case relaymode.ImagesGenerations, relaymode.ImagesEdits:
		if isQwenImageModel(meta.ActualModelName) {
			err, usage = QwenImageHandler(c, resp)
		} else {
			err, usage = ImageHandler(c, resp)
		}
	case relaymode.Embeddings:
		err, usage = relayCompatibleEmbeddingResponse(c, resp)
	case relaymode.Responses, relaymode.ChatCompletions, relaymode.Completions:
		compatibleAdaptor := openaiadaptor.Adaptor{}
		return compatibleAdaptor.DoResponse(c, resp, meta)
	default:
		if meta.IsStream {
			err, usage = StreamHandler(c, resp, meta.ActualModelName)
		} else {
			err, usage = Handler(c, resp, meta.ActualModelName)
		}
	}
	return
}

func (a *Adaptor) GetModelList() []string {
	return ModelList
}

func (a *Adaptor) GetChannelName() string {
	return "ali"
}

func isQwenImageModel(modelName string) bool {
	return IsQwenImageModel(modelName)
}

func IsQwenImageModel(modelName string) bool {
	return strings.HasPrefix(strings.ToLower(strings.TrimSpace(modelName)), "qwen-image")
}

// IsWanxImageEditModel 识别万相通用图像编辑模型（如 wanx2.1-imageedit），
// 它走 image2image/image-synthesis 异步接口，支持 mask 局部重绘。
func IsWanxImageEditModel(modelName string) bool {
	lower := strings.ToLower(strings.TrimSpace(modelName))
	return strings.HasPrefix(lower, "wanx") && strings.Contains(lower, "imageedit")
}

func QwenImageOutputCount(c *gin.Context) (int, bool) {
	if c == nil {
		return 0, false
	}
	value, exists := c.Get(qwenImageOutputCountContextKey)
	if !exists {
		return 0, false
	}
	count, ok := value.(int)
	return count, ok
}
