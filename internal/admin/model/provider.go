package model

// Provider stores model provider catalog in a dedicated table.
type Provider struct {
	Id          string `json:"id" gorm:"column:id;primaryKey;type:varchar(64)"`
	Name        string `json:"name" gorm:"type:varchar(128);default:''"`
	BaseURL     string `json:"base_url" gorm:"column:base_url;type:text"`
	OfficialURL string `json:"official_url" gorm:"column:official_url;type:text"`
	SortOrder   int    `json:"sort_order" gorm:"column:sort_order;type:int;not null;default:1000"`
	Source      string `json:"source" gorm:"type:varchar(32);default:'manual'"`
	CreatedAt   int64  `json:"created_at" gorm:"bigint"`
	UpdatedAt   int64  `json:"updated_at" gorm:"bigint"`
}

func (Provider) TableName() string {
	return "providers"
}
