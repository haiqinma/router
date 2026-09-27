package user

import (
	"context"

	"github.com/yeying-community/router/internal/admin/model"
	userrepo "github.com/yeying-community/router/internal/admin/repository/user"
)

func ValidateLogin(user *model.User) error {
	return user.ValidateAndFill()
}

func GetAll(start, num int, order string) ([]*model.User, error) {
	return userrepo.GetAll(start, num, order)
}

func GetAllFiltered(start, num int, order string, statusFilter, roleFilter int, group string) ([]*model.User, error) {
	return userrepo.GetAllFiltered(start, num, order, statusFilter, roleFilter, group)
}

func CountAllFiltered(statusFilter, roleFilter int, group string) (int64, error) {
	return userrepo.CountAllFiltered(statusFilter, roleFilter, group)
}

func Search(keyword string) ([]*model.User, error) {
	return userrepo.Search(keyword)
}

func GetByID(id string, selectAll bool) (*model.User, error) {
	return userrepo.GetByID(id, selectAll)
}

func GetByUsername(username string) (*model.User, error) {
	return userrepo.GetByUsername(username)
}

// GetUsernamesByIds 批量取用户名(id -> username),供列表页富化属主信息。
func GetUsernamesByIds(ids []string) map[string]string {
	return userrepo.GetUsernamesByIds(ids)
}

func GetIDByAffCode(code string) (string, error) {
	return userrepo.GetIDByAffCode(code)
}

func Create(ctx context.Context, user *model.User, inviterId string) error {
	return userrepo.Create(ctx, user, inviterId)
}

func Update(user *model.User, updatePassword bool) error {
	return userrepo.Update(user, updatePassword)
}

func DeleteByID(id string) error {
	return userrepo.DeleteByID(id)
}

func Delete(user *model.User) error {
	return userrepo.Delete(user)
}

func FillByID(user *model.User) error {
	return userrepo.FillByID(user)
}

func SearchLogsByPeriodAndModel(userId string, start, end int, granularity string, models []string) ([]*model.LogStatistic, error) {
	return model.SearchLogsByPeriodAndModel(userId, start, end, granularity, models)
}

func SearchLogModelsByPeriod(userId string, start, end int) ([]string, error) {
	return model.SearchLogModelsByPeriod(userId, start, end)
}

func AccessTokenExists(token string) (bool, error) {
	return userrepo.AccessTokenExists(token)
}

func Redeem(ctx context.Context, code string, userId string) (model.RedemptionResult, error) {
	return userrepo.Redeem(ctx, code, userId)
}

func RecordLog(ctx context.Context, userId string, logType int, content string) {
	userrepo.RecordLog(ctx, userId, logType, content)
}

func RecordTopupLog(ctx context.Context, userId string, remark string, quota int64) {
	userrepo.RecordTopupLog(ctx, userId, remark, quota)
}

func GetQuota(userId string) (int64, error) {
	return userrepo.GetQuota(userId)
}

func GetUsedQuota(userId string) (int64, error) {
	return userrepo.GetUsedQuota(userId)
}
