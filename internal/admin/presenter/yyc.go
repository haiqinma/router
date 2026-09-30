package presenter

import (
	"encoding/json"
	"strings"

	"github.com/yeying-community/router/internal/admin/model"
)

type User struct {
	*model.User
	BalanceAmount     int64  `json:"balance_amount"`
	UsedAmount        int64  `json:"used_amount"`
	ActivePackageName string `json:"active_package_name,omitempty"`
}

func NewUser(user *model.User) *User {
	if user == nil {
		return nil
	}
	return &User{
		User:          user,
		BalanceAmount: 0,
		UsedAmount:    user.UsedQuota,
	}
}

func NewUsers(users []*model.User) []*User {
	items := make([]*User, 0, len(users))
	for _, user := range users {
		items = append(items, NewUser(user))
	}
	return items
}

type Token struct {
	*model.Token
	RemainingAmount int64 `json:"remaining_amount"`
	UsedAmount      int64 `json:"used_amount"`
}

func NewToken(token *model.Token) *Token {
	if token == nil {
		return nil
	}
	return &Token{
		Token:           token,
		RemainingAmount: token.RemainQuota,
		UsedAmount:      token.UsedQuota,
	}
}

func NewCreatedToken(token *model.Token) *Token {
	if token == nil {
		return nil
	}
	return &Token{
		Token:           token,
		RemainingAmount: token.RemainQuota,
		UsedAmount:      token.UsedQuota,
	}
}

func NewTokens(tokens []*model.Token) []*Token {
	items := make([]*Token, 0, len(tokens))
	for _, token := range tokens {
		items = append(items, NewToken(token))
	}
	return items
}

// AdminToken 在 Token 基础上带出属主用户名,供全站令牌管理列表展示 owner 列。
type AdminToken struct {
	*Token
	Username string `json:"username"`
}

// NewAdminTokens 组装带属主用户名的令牌列表;nameByID 为 user_id -> username 映射,
// 缺失时 username 为空字符串。
func NewAdminTokens(tokens []*model.Token, nameByID map[string]string) []*AdminToken {
	items := make([]*AdminToken, 0, len(tokens))
	for _, token := range tokens {
		username := ""
		if token != nil {
			username = nameByID[token.UserId]
		}
		items = append(items, &AdminToken{
			Token:    NewToken(token),
			Username: username,
		})
	}
	return items
}

type Redemption struct {
	*model.Redemption
	CreditAmount int64 `json:"credit_amount"`
}

func NewRedemption(redemption *model.Redemption) *Redemption {
	if redemption == nil {
		return nil
	}
	creditAmount, _ := redemption.QuotaAmountSnapshotInt64()
	return &Redemption{
		Redemption:   redemption,
		CreditAmount: creditAmount,
	}
}

func NewRedemptions(redemptions []*model.Redemption) []*Redemption {
	items := make([]*Redemption, 0, len(redemptions))
	for _, redemption := range redemptions {
		items = append(items, NewRedemption(redemption))
	}
	return items
}

type Channel struct {
	*model.Channel
	UsedAmount int64 `json:"used_amount"`
}

func NewChannel(channel *model.Channel) *Channel {
	if channel == nil {
		return nil
	}
	return &Channel{
		Channel:    channel,
		UsedAmount: channel.UsedQuota,
	}
}

type Group struct {
	Id          string                   `json:"id"`
	Name        string                   `json:"name"`
	Description string                   `json:"description"`
	Source      string                   `json:"source"`
	Enabled     bool                     `json:"enabled"`
	SortOrder   int                      `json:"sort_order"`
	CreatedAt   int64                    `json:"created_at"`
	UpdatedAt   int64                    `json:"updated_at"`
	Channels    []model.GroupChannelItem `json:"channels,omitempty"`
}

func NewGroup(group *model.GroupCatalog) *Group {
	if group == nil {
		return nil
	}
	return &Group{
		Id:          strings.TrimSpace(group.Id),
		Name:        strings.TrimSpace(group.Name),
		Description: strings.TrimSpace(group.Description),
		Source:      strings.TrimSpace(group.Source),
		Enabled:     group.Enabled,
		SortOrder:   group.SortOrder,
		CreatedAt:   group.CreatedAt,
		UpdatedAt:   group.UpdatedAt,
		Channels:    group.Channels,
	}
}

func NewGroups(groups []model.GroupCatalog) []*Group {
	items := make([]*Group, 0, len(groups))
	for i := range groups {
		group := groups[i]
		items = append(items, NewGroup(&group))
	}
	return items
}

type UserDailyQuotaSnapshot struct {
	model.UserDailyQuotaSnapshot
	LimitAmount     int64 `json:"limit_amount"`
	ConsumedAmount  int64 `json:"consumed_amount"`
	ReservedAmount  int64 `json:"reserved_amount"`
	RemainingAmount int64 `json:"remaining_amount"`
}

func NewUserDailyQuotaSnapshot(snapshot model.UserDailyQuotaSnapshot) UserDailyQuotaSnapshot {
	return UserDailyQuotaSnapshot{
		UserDailyQuotaSnapshot: snapshot,
		LimitAmount:            snapshot.Limit,
		ConsumedAmount:         snapshot.ConsumedQuota,
		ReservedAmount:         snapshot.ReservedQuota,
		RemainingAmount:        snapshot.RemainingQuota,
	}
}

type UserPackageEmergencyQuotaSnapshot struct {
	model.UserPackageEmergencyQuotaSnapshot
	LimitAmount     int64 `json:"limit_amount"`
	ConsumedAmount  int64 `json:"consumed_amount"`
	ReservedAmount  int64 `json:"reserved_amount"`
	RemainingAmount int64 `json:"remaining_amount"`
}

func NewUserPackageEmergencyQuotaSnapshot(snapshot model.UserPackageEmergencyQuotaSnapshot) UserPackageEmergencyQuotaSnapshot {
	return UserPackageEmergencyQuotaSnapshot{
		UserPackageEmergencyQuotaSnapshot: snapshot,
		LimitAmount:                       snapshot.Limit,
		ConsumedAmount:                    snapshot.ConsumedQuota,
		ReservedAmount:                    snapshot.ReservedQuota,
		RemainingAmount:                   snapshot.RemainingQuota,
	}
}

type UserQuotaSummary struct {
	UserID           string                            `json:"user_id"`
	Daily            UserDailyQuotaSnapshot            `json:"daily"`
	PackageEmergency UserPackageEmergencyQuotaSnapshot `json:"package_emergency"`
}

func NewUserQuotaSummary(summary model.UserQuotaSummary) UserQuotaSummary {
	return UserQuotaSummary{
		UserID:           strings.TrimSpace(summary.UserID),
		Daily:            NewUserDailyQuotaSnapshot(summary.Daily),
		PackageEmergency: NewUserPackageEmergencyQuotaSnapshot(summary.PackageEmergency),
	}
}

type GroupDailyQuotaSnapshot struct {
	model.GroupDailyQuotaSnapshot
	GroupName       string `json:"group_name,omitempty"`
	LimitAmount     int64  `json:"limit_amount"`
	ConsumedAmount  int64  `json:"consumed_amount"`
	ReservedAmount  int64  `json:"reserved_amount"`
	RemainingAmount int64  `json:"remaining_amount"`
}

func NewGroupDailyQuotaSnapshot(snapshot model.GroupDailyQuotaSnapshot, groupName string) GroupDailyQuotaSnapshot {
	return GroupDailyQuotaSnapshot{
		GroupDailyQuotaSnapshot: snapshot,
		GroupName:               strings.TrimSpace(groupName),
		LimitAmount:             snapshot.Limit,
		ConsumedAmount:          snapshot.ConsumedQuota,
		ReservedAmount:          snapshot.ReservedQuota,
		RemainingAmount:         snapshot.RemainingQuota,
	}
}

type LogStatistic struct {
	model.LogStatistic
	ChargeAmount int `json:"charge_amount"`
}

func NewLogStatistic(row *model.LogStatistic) *LogStatistic {
	if row == nil {
		return nil
	}
	return &LogStatistic{
		LogStatistic: *row,
		ChargeAmount: row.Quota,
	}
}

func NewLogStatistics(rows []*model.LogStatistic) []*LogStatistic {
	items := make([]*LogStatistic, 0, len(rows))
	for _, row := range rows {
		items = append(items, NewLogStatistic(row))
	}
	return items
}

type Log struct {
	*model.Log
	ChargeAmount              int64                 `json:"charge_amount"`
	UserDailyChargeAmount     int                   `json:"user_daily_charge_amount"`
	UserEmergencyChargeAmount int                   `json:"user_emergency_charge_amount"`
	RoutingSummary            *PublicRoutingSummary `json:"routing_summary,omitempty"`
}

// PublicRoutingSummary is deliberately limited to the calling user's own
// source choice and settlement outcome. It never contains community channel
// IDs, candidate lists, endpoint topology, or upstream error bodies.
type PublicRoutingSummary struct {
	SourcePolicy         string `json:"source_policy,omitempty"`
	InitialSource        string `json:"initial_source,omitempty"`
	ActualSource         string `json:"actual_source,omitempty"`
	PersonalProviderName string `json:"personal_provider_name,omitempty"`
	FallbackCount        int    `json:"fallback_count"`
}

func NewLog(row *model.Log) *Log {
	if row == nil {
		return nil
	}
	return &Log{
		Log:                       row,
		ChargeAmount:              row.Quota,
		UserDailyChargeAmount:     row.UserDailyQuota,
		UserEmergencyChargeAmount: row.UserEmergencyQuota,
	}
}

func NewLogs(rows []*model.Log) []*Log {
	items := make([]*Log, 0, len(rows))
	for _, row := range rows {
		items = append(items, NewLog(row))
	}
	return items
}

// NewPublicLog omits operational routing topology from a user's own request log.
func NewPublicLog(row *model.Log) *Log {
	if row == nil {
		return nil
	}
	copy := *row
	copy.RouteDecision = ""
	copy.FallbackAttempts = ""
	view := NewLog(&copy)
	view.RoutingSummary = newPublicRoutingSummary(row)
	return view
}

func newPublicRoutingSummary(row *model.Log) *PublicRoutingSummary {
	if row == nil {
		return nil
	}
	summary := &PublicRoutingSummary{
		ActualSource:         strings.TrimSpace(row.UpstreamSource),
		PersonalProviderName: strings.TrimSpace(row.PersonalProviderName),
		FallbackCount:        row.FallbackCount,
	}
	var decision struct {
		Source       string `json:"source"`
		SourcePolicy string `json:"source_policy"`
	}
	if raw := strings.TrimSpace(row.RouteDecision); raw != "" && json.Unmarshal([]byte(raw), &decision) == nil {
		summary.SourcePolicy = strings.TrimSpace(decision.SourcePolicy)
		switch strings.TrimSpace(decision.Source) {
		case "personal_provider", "personal_provider_fallback":
			summary.InitialSource = model.PersonalProviderSourceType
		default:
			summary.InitialSource = "community_package"
		}
	}
	if summary.FallbackCount == 0 && summary.ActualSource != "" {
		// A direct request has no source transition. This also keeps summaries
		// accurate for pinned or explicitly selected channels, whose internal
		// decision source is not a user-facing supply category.
		summary.InitialSource = summary.ActualSource
	}
	if summary.ActualSource == "" && summary.InitialSource == "" && summary.FallbackCount == 0 {
		return nil
	}
	return summary
}

func NewPublicLogs(rows []*model.Log) []*Log {
	items := make([]*Log, 0, len(rows))
	for _, row := range rows {
		items = append(items, NewPublicLog(row))
	}
	return items
}
