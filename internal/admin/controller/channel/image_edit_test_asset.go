package channel

import _ "embed"

// defaultChannelImageEditTestImage 是图片编辑测试的内置原图。
// 之前默认原图依赖外部应用(yeying)的在线地址,域名变更后测试会拉取失败;
// 这里改为编译期内嵌,彻底消除对外部网络与可变域名的依赖,保证测试稳定。
//
//go:embed assets/blue_blank.png
var defaultChannelImageEditTestImage []byte

// defaultChannelImageEditTestImageName 内置原图在 multipart 上传时使用的文件名。
const defaultChannelImageEditTestImageName = "blue_blank.png"

// defaultChannelImageEditTestSource 是构建异步任务去重 key 时,
// 代表“使用内置原图”的稳定哨兵值(不再使用会变的外部 URL)。
const defaultChannelImageEditTestSource = "builtin:blue_blank.png"
