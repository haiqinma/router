package model

import (
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// TestHydrateChannelsWithModelCapabilitiesWithDB 验证轻量水合仅依赖 channel_models
// 表即可正确还原每渠道的已选模型与类型:测试库故意只迁移 ChannelModel(不建端点/价格
// 表),若实现误触那些表会直接报错,从而证明轻量路径确实跳过了它们。
func TestHydrateChannelsWithModelCapabilitiesWithDB(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=private"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&ChannelModel{}); err != nil {
		t.Fatalf("auto migrate channel model: %v", err)
	}
	rows := []ChannelModel{
		{ChannelId: "channel-1", Model: "gpt-4o", Type: "text", Selected: true, SortOrder: 1},
		{ChannelId: "channel-1", Model: "dall-e-3", Type: "image", Selected: true, SortOrder: 2},
		{ChannelId: "channel-1", Model: "whisper", Type: "audio", Selected: false, SortOrder: 3},
		{ChannelId: "channel-2", Model: "sora", Type: "video", Selected: true, SortOrder: 1},
	}
	if err := db.Create(&rows).Error; err != nil {
		t.Fatalf("seed channel models: %v", err)
	}

	channelOne := &Channel{Id: "channel-1"}
	channelTwo := &Channel{Id: "channel-2"}
	channelMissing := &Channel{Id: "channel-missing"}
	if err := HydrateChannelsWithModelCapabilitiesWithDB(db, []*Channel{channelOne, channelTwo, channelMissing}); err != nil {
		t.Fatalf("HydrateChannelsWithModelCapabilitiesWithDB returned error: %v", err)
	}

	selectedTypes := func(channel *Channel) map[string]bool {
		types := map[string]bool{}
		for _, row := range channel.GetChannelModels() {
			if row.Selected {
				types[row.Type] = true
			}
		}
		return types
	}

	oneTypes := selectedTypes(channelOne)
	if !oneTypes["text"] || !oneTypes["image"] {
		t.Fatalf("channel-1 selected types = %v, want text+image", oneTypes)
	}
	if oneTypes["audio"] {
		t.Fatalf("channel-1 must not surface unselected audio model: %v", oneTypes)
	}
	twoTypes := selectedTypes(channelTwo)
	if !twoTypes["video"] || len(twoTypes) != 1 {
		t.Fatalf("channel-2 selected types = %v, want video only", twoTypes)
	}
	if len(channelMissing.GetChannelModels()) != 0 {
		t.Fatalf("channel-missing should have no models, got %d", len(channelMissing.GetChannelModels()))
	}
}
