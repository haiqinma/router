package group

import (
	"sort"

	"github.com/yeying-community/router/common/logger"
	"github.com/yeying-community/router/internal/admin/model"
	billingratio "github.com/yeying-community/router/internal/relay/billing/ratio"
)

func List() []string {
	groupNames, err := model.ListEnabledGroupNames()
	if err == nil && len(groupNames) > 0 {
		return groupNames
	}
	if err != nil {
		logger.SysError("list groups from catalog failed, fallback to GroupRatio: " + err.Error())
	}
	groupNames = make([]string, 0, len(billingratio.GroupRatio))
	for groupName := range billingratio.GroupRatio {
		groupNames = append(groupNames, groupName)
	}
	sort.Strings(groupNames)
	return groupNames
}

func ListCatalog() ([]model.GroupCatalog, error) {
	return model.ListGroupCatalog()
}

func Get(name string) (model.GroupCatalog, error) {
	return model.GetGroupCatalogByName(name)
}

func Create(item model.GroupCatalog) (model.GroupCatalog, error) {
	return model.CreateGroupCatalog(item)
}

func Update(item model.GroupCatalog) (model.GroupCatalog, error) {
	return model.UpdateGroupCatalog(item)
}

func Delete(name string) error {
	return model.DeleteGroupCatalog(name)
}
