package group

import "github.com/yeying-community/router/internal/admin/model"

func ListCatalog() ([]model.GroupCatalog, error) {
	return model.ListGroupCatalog()
}

func Get(id string) (model.GroupCatalog, error) {
	return model.GetGroupCatalogByID(id)
}

func Create(item model.GroupCatalog) (model.GroupCatalog, error) {
	return model.CreateGroupCatalog(item)
}

func CreateWithChannelBindings(item model.GroupCatalog, channelIDs []string) (model.GroupCatalog, error) {
	return model.CreateGroupCatalogWithChannelBindings(item, channelIDs)
}

func Update(item model.GroupCatalog) (model.GroupCatalog, error) {
	return model.UpdateGroupCatalog(item)
}

func UpdateWithChannelBindings(item model.GroupCatalog, channelIDs []string) (model.GroupCatalog, error) {
	return model.UpdateGroupCatalogWithChannelBindings(item, channelIDs)
}

func Delete(id string) error {
	return model.DeleteGroupCatalog(id)
}

func ListChannelBindings(id string) ([]model.GroupChannelBindingItem, error) {
	return model.ListGroupChannelBindings(id)
}

func ListChannelBindingCandidates() ([]model.GroupChannelBindingItem, error) {
	return model.ListGroupChannelBindingCandidates()
}

func ReplaceChannelBindings(id string, channelIDs []string) error {
	return model.ReplaceGroupChannelBindings(id, channelIDs)
}
