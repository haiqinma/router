package controller

import (
	"strings"

	adminmodel "github.com/yeying-community/router/internal/admin/model"
	relaychannel "github.com/yeying-community/router/internal/relay/channel"
	relaymeta "github.com/yeying-community/router/internal/relay/meta"
)

func applyRouteObservabilityToLog(entry *adminmodel.Log, meta *relaymeta.Meta, actualModel string) {
	if entry == nil || meta == nil {
		return
	}
	requestModel := strings.TrimSpace(meta.OriginModelName)
	if requestModel == "" {
		requestModel = strings.TrimSpace(entry.ModelName)
	}
	finalModel := strings.TrimSpace(actualModel)
	if finalModel == "" {
		finalModel = strings.TrimSpace(meta.ActualModelName)
	}
	if finalModel == "" {
		finalModel = strings.TrimSpace(entry.ModelName)
	}
	upstreamEndpoint := strings.TrimSpace(meta.UpstreamRequestPath)
	if upstreamEndpoint == "" {
		upstreamEndpoint = strings.TrimSpace(meta.RequestURLPath)
	}
	entry.RequestModelName = requestModel
	entry.ActualModelName = finalModel
	if selected, ok := adminmodel.FindSelectedChannelModelConfig(meta.ChannelModelConfigs, requestModel, finalModel); ok {
		entry.Provider = adminmodel.NormalizeGroupModelProviderValue(selected.Provider)
	}
	entry.UpstreamEndpoint = upstreamEndpoint
	entry.UpstreamProtocol = relaychannel.ProtocolByType(meta.ChannelProtocol)
	if strings.TrimSpace(meta.CommunityOfferID) != "" {
		entry.UpstreamSource = "community_offer"
	} else if strings.TrimSpace(meta.PersonalProviderID) != "" {
		entry.UpstreamSource = "personal_provider"
		entry.PersonalProviderId = strings.TrimSpace(meta.PersonalProviderID)
		entry.PersonalProviderName = strings.TrimSpace(meta.PersonalProviderName)
	} else {
		entry.UpstreamSource = "community_package"
	}
	entry.RouteDecision = strings.TrimSpace(meta.RouteDecision)
	entry.FallbackCount = meta.FallbackCount
	entry.FallbackAttempts = strings.TrimSpace(meta.FallbackAttempts)
	entry.RelayErrorType = strings.TrimSpace(meta.RelayErrorType)
	entry.RelayErrorCode = strings.TrimSpace(meta.RelayErrorCode)
	entry.RelayErrorMessage = strings.TrimSpace(meta.RelayErrorMessage)
}
