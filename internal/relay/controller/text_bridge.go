package controller

import (
	"encoding/json"
	"fmt"
	"strings"

	adminmodel "github.com/yeying-community/router/internal/admin/model"
	"github.com/yeying-community/router/internal/relay/meta"
	relaymodel "github.com/yeying-community/router/internal/relay/model"
	"github.com/yeying-community/router/internal/relay/relaymode"
)

func cloneGeneralOpenAIRequest(req *relaymodel.GeneralOpenAIRequest) (*relaymodel.GeneralOpenAIRequest, error) {
	if req == nil {
		return nil, fmt.Errorf("request is nil")
	}
	payload, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}
	cloned := &relaymodel.GeneralOpenAIRequest{}
	if err := json.Unmarshal(payload, cloned); err != nil {
		return nil, err
	}
	return cloned, nil
}

func parseInputAsMessages(input any) []relaymodel.Message {
	if input == nil {
		return nil
	}
	switch value := input.(type) {
	case string:
		if strings.TrimSpace(value) == "" {
			return nil
		}
		return []relaymodel.Message{{
			Role:    "user",
			Content: value,
		}}
	case []string:
		if len(value) == 0 {
			return nil
		}
		messages := make([]relaymodel.Message, 0, len(value))
		for _, item := range value {
			if strings.TrimSpace(item) == "" {
				continue
			}
			messages = append(messages, relaymodel.Message{Role: "user", Content: item})
		}
		return messages
	}

	payload, err := json.Marshal(input)
	if err != nil {
		return nil
	}

	messages := make([]relaymodel.Message, 0)
	if err := json.Unmarshal(payload, &messages); err == nil && len(messages) > 0 {
		return messages
	}

	stringList := make([]string, 0)
	if err := json.Unmarshal(payload, &stringList); err == nil && len(stringList) > 0 {
		messages := make([]relaymodel.Message, 0, len(stringList))
		for _, item := range stringList {
			if strings.TrimSpace(item) == "" {
				continue
			}
			messages = append(messages, relaymodel.Message{Role: "user", Content: item})
		}
		return messages
	}

	single := map[string]any{}
	if err := json.Unmarshal(payload, &single); err == nil {
		role := strings.TrimSpace(fmt.Sprintf("%v", single["role"]))
		if role == "" {
			role = "user"
		}
		return []relaymodel.Message{{
			Role:    role,
			Content: single["content"],
		}}
	}
	return nil
}

func resolveChannelTextUpstream(meta *meta.Meta, originModelName string, actualModelName string) (int, string) {
	if meta == nil {
		return relaymode.ChatCompletions, adminmodel.ChannelModelEndpointChat
	}
	if row, ok := adminmodel.FindSelectedChannelModelConfig(meta.ChannelModelConfigs, originModelName, actualModelName); ok {
		endpoint := adminmodel.NormalizeChannelModelEndpoint(row.Type, row.Endpoint)
		if endpoint == adminmodel.ChannelModelEndpointResponses {
			return relaymode.Responses, endpoint
		}
		return relaymode.ChatCompletions, adminmodel.ChannelModelEndpointChat
	}

	fallbackEndpoint := ""
	for _, ability := range meta.ChannelAbilities {
		if ability.Type != adminmodel.ProviderModelTypeText {
			continue
		}
		if ability.Endpoint == adminmodel.ChannelModelEndpointResponses {
			return relaymode.Responses, adminmodel.ChannelModelEndpointResponses
		}
		if fallbackEndpoint == "" {
			fallbackEndpoint = ability.Endpoint
		}
	}
	if fallbackEndpoint == adminmodel.ChannelModelEndpointChat {
		return relaymode.ChatCompletions, fallbackEndpoint
	}
	if fallbackEndpoint == adminmodel.ChannelModelEndpointResponses {
		return relaymode.Responses, fallbackEndpoint
	}
	if meta.Mode == relaymode.Responses {
		return relaymode.Responses, adminmodel.ChannelModelEndpointResponses
	}
	return relaymode.ChatCompletions, adminmodel.ChannelModelEndpointChat
}

func convertTextRequestForUpstream(req *relaymodel.GeneralOpenAIRequest, downstreamMode int, upstreamMode int) (*relaymodel.GeneralOpenAIRequest, error) {
	cloned, err := cloneGeneralOpenAIRequest(req)
	if err != nil {
		return nil, err
	}

	if upstreamMode == relaymode.Responses {
		if cloned.Input == nil && len(cloned.Messages) > 0 {
			cloned.Input = cloned.Messages
			cloned.Messages = nil
		}
		if cloned.MaxOutputTokens == nil && cloned.MaxTokens > 0 {
			value := cloned.MaxTokens
			cloned.MaxOutputTokens = &value
			cloned.MaxTokens = 0
		}
		return cloned, nil
	}

	if upstreamMode == relaymode.ChatCompletions {
		if len(cloned.Messages) == 0 {
			cloned.Messages = parseInputAsMessages(cloned.Input)
		}
		if len(cloned.Messages) == 0 {
			return nil, fmt.Errorf("field messages or input is required")
		}
		cloned.Input = nil
		if cloned.MaxTokens == 0 && cloned.MaxOutputTokens != nil && *cloned.MaxOutputTokens > 0 {
			cloned.MaxTokens = *cloned.MaxOutputTokens
		}
		return cloned, nil
	}

	return cloned, nil
}
