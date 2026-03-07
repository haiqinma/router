package option

import (
	"strings"

	"github.com/yeying-community/router/common/config"
	"github.com/yeying-community/router/common/helper"
	"github.com/yeying-community/router/internal/admin/model"
	optionrepo "github.com/yeying-community/router/internal/admin/repository/option"
)

func GetOptions() []*model.Option {
	options := make([]*model.Option, 0)
	config.OptionMapRWMutex.Lock()
	for k, v := range config.OptionMap {
		if model.IsLegacyPricingOptionKey(k) {
			continue
		}
		if strings.HasSuffix(k, "Token") || strings.HasSuffix(k, "Secret") {
			continue
		}
		options = append(options, &model.Option{
			Key:   k,
			Value: helper.Interface2String(v),
		})
	}
	config.OptionMapRWMutex.Unlock()
	return options
}

func UpdateOption(key string, value string) error {
	return optionrepo.Update(key, value)
}
