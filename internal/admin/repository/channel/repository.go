package channel

import (
	"strings"

	"github.com/yeying-community/router/common/config"
	"github.com/yeying-community/router/common/helper"
	"github.com/yeying-community/router/common/logger"
	"github.com/yeying-community/router/common/random"
	"github.com/yeying-community/router/internal/admin/model"
	"gorm.io/gorm"
)

func init() {
	model.BindChannelRepository(model.ChannelRepository{
		GetAllChannels:               GetAll,
		SearchChannels:               Search,
		GetChannelById:               GetByID,
		BatchInsertChannels:          BatchInsert,
		Insert:                       Insert,
		Update:                       Update,
		UpdateResponseTime:           UpdateResponseTime,
		UpdateBalance:                UpdateBalance,
		Delete:                       Delete,
		UpdateChannelStatusById:      UpdateStatusByID,
		UpdateChannelUsedQuota:       UpdateUsedQuota,
		UpdateChannelUsedQuotaDirect: UpdateUsedQuotaDirect,
		UpdateChannelTestModelByID:   UpdateTestModelByID,
		DeleteChannelByStatus:        DeleteByStatus,
		DeleteDisabledChannel:        DeleteDisabled,
	})
}

func GetAll(startIdx int, num int, status string) ([]*model.Channel, error) {
	var channels []*model.Channel
	var err error
	switch status {
	case "all":
		err = model.DB.Order("created_time desc").Find(&channels).Error
	case "disabled":
		err = model.DB.Order("created_time desc").Where("status = ? or status = ?", model.ChannelStatusAutoDisabled, model.ChannelStatusManuallyDisabled).Find(&channels).Error
	default:
		err = model.DB.Order("created_time desc").Limit(num).Offset(startIdx).Omit("key").Find(&channels).Error
	}
	return channels, err
}

func Search(keyword string) ([]*model.Channel, error) {
	var channels []*model.Channel
	trimmed := strings.TrimSpace(keyword)
	if trimmed == "" {
		return channels, nil
	}
	err := model.DB.Omit("key").Where("id = ? or name LIKE ?", trimmed, trimmed+"%").Find(&channels).Error
	return channels, err
}

func GetByID(id string, selectAll bool) (*model.Channel, error) {
	id = strings.TrimSpace(id)
	channel := model.Channel{Id: id}
	var err error
	if selectAll {
		err = model.DB.First(&channel, "id = ?", id).Error
	} else {
		err = model.DB.Omit("key").First(&channel, "id = ?", id).Error
	}
	return &channel, err
}

func BatchInsert(channels []model.Channel) error {
	now := helper.GetTimestamp()
	for i := range channels {
		if strings.TrimSpace(channels[i].Id) == "" {
			channels[i].Id = random.GetUUID()
		}
		if channels[i].CreatedTime == 0 {
			channels[i].CreatedTime = now
		}
	}
	err := model.DB.Create(&channels).Error
	if err != nil {
		return err
	}
	for _, channel := range channels {
		err = channel.AddAbilities()
		if err != nil {
			return err
		}
	}
	return nil
}

func Insert(channel *model.Channel) error {
	if strings.TrimSpace(channel.Id) == "" {
		channel.Id = random.GetUUID()
	}
	if channel.CreatedTime == 0 {
		channel.CreatedTime = helper.GetTimestamp()
	}
	err := model.DB.Create(channel).Error
	if err != nil {
		return err
	}
	return channel.AddAbilities()
}

func Update(channel *model.Channel) error {
	err := model.DB.Model(channel).Updates(channel).Error
	if err != nil {
		return err
	}
	model.DB.Model(channel).First(channel, "id = ?", channel.Id)
	return channel.UpdateAbilities()
}

func UpdateResponseTime(channel *model.Channel, responseTime int64) {
	err := model.DB.Model(channel).Select("response_time", "test_time").Updates(model.Channel{
		TestTime:     helper.GetTimestamp(),
		ResponseTime: int(responseTime),
	}).Error
	if err != nil {
		logger.SysError("failed to update response time: " + err.Error())
	}
}

func UpdateBalance(channel *model.Channel, balance float64) {
	err := model.DB.Model(channel).Select("balance_updated_time", "balance").Updates(model.Channel{
		BalanceUpdatedTime: helper.GetTimestamp(),
		Balance:            balance,
	}).Error
	if err != nil {
		logger.SysError("failed to update balance: " + err.Error())
	}
}

func Delete(channel *model.Channel) error {
	err := model.DB.Delete(channel).Error
	if err != nil {
		return err
	}
	return channel.DeleteAbilities()
}

func DeleteByID(id string) error {
	id = strings.TrimSpace(id)
	channel := model.Channel{Id: id}
	return Delete(&channel)
}

func DeleteDisabled() (int64, error) {
	result := model.DB.Where("status = ? or status = ?", model.ChannelStatusAutoDisabled, model.ChannelStatusManuallyDisabled).Delete(&model.Channel{})
	return result.RowsAffected, result.Error
}

func UpdateStatusByID(id string, status int) {
	id = strings.TrimSpace(id)
	err := model.UpdateAbilityStatus(id, status == model.ChannelStatusEnabled)
	if err != nil {
		logger.SysError("failed to update ability status: " + err.Error())
	}
	err = model.DB.Model(&model.Channel{}).Where("id = ?", id).Update("status", status).Error
	if err != nil {
		logger.SysError("failed to update channel status: " + err.Error())
	}
}

func UpdateUsedQuota(id string, quota int64) {
	if config.BatchUpdateEnabled {
		model.AddBatchUpdateRecord(model.BatchUpdateTypeChannelUsedQuota, id, quota)
		return
	}
	UpdateUsedQuotaDirect(id, quota)
}

func UpdateUsedQuotaDirect(id string, quota int64) {
	err := model.DB.Model(&model.Channel{}).Where("id = ?", id).Update("used_quota", gorm.Expr("used_quota + ?", quota)).Error
	if err != nil {
		logger.SysError("failed to update channel used quota: " + err.Error())
	}
}

func UpdateTestModelByID(id string, testModel string) error {
	id = strings.TrimSpace(id)
	testModel = strings.TrimSpace(testModel)
	return model.DB.Model(&model.Channel{}).Where("id = ?", id).Update("test_model", testModel).Error
}

func DeleteByStatus(status int64) (int64, error) {
	result := model.DB.Where("status = ?", status).Delete(&model.Channel{})
	return result.RowsAffected, result.Error
}
