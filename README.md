<p align="right">
  <strong>中文</strong> | <a href="./README.en.md">English</a> | <a href="./README.ja.md">日本語</a>
</p>

<p align="center">
  <a href="https://github.com/yeying-community/router"><img src="https://raw.githubusercontent.com/yeying-community/router/main/web/public/logo.png" width="150" height="150" alt="router logo"></a>
</p>

<div align="center">

# Router

_通过标准的 OpenAI API 格式访问多家大模型服务，带管理后台，前端可内置到二进制中。_

</div>

## 快速开始（开发）

### 环境要求
- Go 1.22+
- Node.js 16+
- npm/yarn

### 启动后端
```bash
git clone https://github.com/yeying-community/router.git
cd router

cp config.yaml.template config.yaml
# 按需编辑 config.yaml：
# - database.sql_dsn 设为 postgres://... 可强制使用 PostgreSQL
# - 留空则回落 SQLite

go mod download
go run ./cmd/router --config ./config.yaml --log-dir ./logs
```
访问 http://localhost:3011 登录（默认管理员：用户名 `root`，密码 `123456`）。

### 编译后端
```bash
# 如需把前端打包进后端二进制，先构建前端
# npm run build --prefix web

mkdir -p build
go build -o build/router ./cmd/router
```

### 启动前端热更新（可选）
```bash
npm install --prefix web
npm start --prefix web   # 自动代理到 http://localhost:3011
```
如需把前端打包进后端：`npm run build --prefix web` 后重启后端。

## 配置文件与启动（必读）
Router 启动时默认读取当前目录 `config.yaml`，也可以通过 `--config` 指定路径。

**公网部署建议设置：**
- `ucan.aud: did:web:<公网域名>`
- `auth.auto_register_enabled: true`（若希望钱包未绑定可自动注册）
- `database.sql_dsn: postgres://...`（留空会回落 SQLite）

若端口不是默认 3011，建议显式设置 `ucan.aud=did:web:<公网域名>`，否则可能出现 `UCAN audience mismatch`。

### 最小可运行示例（开发）
```bash
cp config.yaml.template config.yaml
# 需要自定义时直接编辑 config.yaml（PG 需设置 database.sql_dsn，公网建议设置 ucan.aud）
go run ./cmd/router --config ./config.yaml --log-dir ./logs
```

### 最小可运行示例（生产）
示例：`/etc/systemd/system/router.service`（节选）
```ini
[Service]
WorkingDirectory=/root/code/router/router_new
ExecStart=/root/code/router/router_new/build/router --config /root/code/router/router_new/config.yaml --port 3011 --log-dir ./logs
```
重启命令（仅示例，不执行）：
```bash
systemctl daemon-reload
systemctl restart router
```

## 配置与文档
- 配置文件说明与示例：`config.yaml.template`
- API 文档：`docs/API.md`

## 生成 OpenAPI 文档（/api/v1）
```bash
go install github.com/swaggo/swag/cmd/swag@latest
./scripts/gen-openapi.sh
# 输出：docs/openapi.json（以及 swagger.json/yaml）
```

## 许可证
MIT License
