# Router

Router 是一个多模型路由服务，提供 OpenAI 兼容接口、管理后台，以及可随二进制一起发布的前端静态资源。

## 项目简介

- 提供统一的 OpenAI API 兼容入口，接入多家大模型服务
- 提供后台管理、用户与计费相关能力
- 前端位于 `web/`，构建后可随服务端一起发布

## 目录说明

- `cmd/router`：程序入口
- `internal`：后端业务实现与 HTTP 路由
- `web`：管理后台前端
- `scripts`：打包与启动脚本
- `docs`：接口、路由、运营等专题文档

## 本地环境要求

- Go 1.22+
- Node.js 与 npm
- PostgreSQL（`database.sql_dsn` 仅支持 PostgreSQL DSN）

## 本地快速开始

1. 准备本地配置文件：

```bash
cp config.yaml.template config.yaml
```

2. 至少补齐以下配置：

```yaml
database:
  sql_dsn: "postgres://user:password@127.0.0.1:5432/router?sslmode=disable"

auth:
  cookie_secret: "replace-with-random-string"
  jwt_secret: "replace-with-another-random-string"
```

3. 启动后端：

```bash
go mod download
go run ./cmd/router --config ./config.yaml --log-dir ./logs
```

4. 启动前端开发服务器：

```bash
cd web
npm install
VITE_SERVER=http://localhost:3011 npm run dev
```

5. 打开 `http://localhost:5181`。

## 配置说明

- `database.sql_dsn`：必填，且只支持 PostgreSQL DSN。
- `auth.cookie_secret`：不要保留模板中的示例值 `random_string`。
- `auth.jwt_secret`：钱包登录的 access/refresh token 签发与校验依赖该字段；留空会导致相关流程不可用。
- `server.address`：用于密码重置链接、支付回调与跳转 URL 组装；对外部署时应填写可访问地址。
- `cache.type`：缓存后端类型，只支持 `local` 或 `redis`；留空时按旧配置兼容推断。
- `redis.conn_string`：当 `cache.type: redis` 时必填，例如 `redis://:password@127.0.0.1:6379/0`。
- `billing_service.base_url`：渠道账务自动刷新调用独立 Billing 服务的 `/api/v1/internal/billing:query`；Router 不再直接接入各渠道账务接口。
- `ucan.aud`：对外部署或服务端口不是默认 `3011` 时，建议显式设置为 `did:web:<公网域名>`。
- `ucan.trusted_issuer_dids`：使用 Node 中心化 TOTP/UCAN 登录访问 Router 时必须配置 Node 当前 issuer DID；每项必须是 `did:key:z...`，Router 启动时会做格式与验签公钥校验。
- `bootstrap.root_wallet_address`：可选；用于开启“管理员管理管理员”的额外权限，多个地址使用英文逗号分隔。

## 本地验证方式

- 后端启动后访问状态接口：

```bash
curl http://127.0.0.1:3011/api/v1/public/status
```

- 前端启动后访问 `http://localhost:5181`，确认页面能正常加载并请求后端。

## 生产部署

### 部署对象

- Linux 主机上的 Router 发布目录
- 通过 `scripts/package.sh` 生成的发布包
- 使用 `scripts/starter.sh` 管理单实例进程

### 安装包信息

- 打包脚本：`./scripts/package.sh`
- 默认输出目录：`./output`
- 产物命名：`router-<tag>-<commit>.tar.gz`
- 产物内容：
  - `build/router`
  - `config.yaml.template`
  - `scripts/starter.sh`
  - `scripts/health-check.sh`
  - `web/dist`

#### 打包命令

基于已有 tag 重新打包：

```bash
./scripts/package.sh v0.0.1
```

自动选择下一个 patch 版本并打包：

```bash
./scripts/package.sh
```

说明：

- 不带参数时，脚本会基于 `origin/main` 打包。
- 不带参数时，脚本会在本地创建新 tag，并向 `${PACKAGE_REMOTE:-origin}` 推送该 tag。
- `AUTO_BUILD=false` 时，会跳过自动构建，要求产物里已存在 `build/router` 和 `web/dist`。

### 目标环境准备

- 目标机器需提供 `bash`、`tar` 和可执行权限。
- 目标机器需能访问 PostgreSQL。
- 部署目录需允许创建 `logs/` 与 `run/` 目录。
- 如果使用打包脚本构建安装包，构建机还需要 Go、Node.js 和 npm。
- 使用预打包产物部署到目标机时，不需要在目标机额外安装 Go、Node.js 或 npm。

### 部署步骤

#### 1. 生成安装包

```bash
./scripts/package.sh v0.0.1
```

执行完成后，安装包会出现在 `output/` 目录。

#### 2. 拷贝安装包到目标机器

```bash
PACKAGE=router-v0.0.1-abcdef0.tar.gz
scp "output/${PACKAGE}" deploy@your-host:/opt/router/
```

请将 `router-v0.0.1-abcdef0.tar.gz` 替换为实际产物名。

#### 3. 解压安装包

```bash
PACKAGE=router-v0.0.1-abcdef0
mkdir -p /opt/router/releases
tar -xzf "/opt/router/${PACKAGE}.tar.gz" -C /opt/router/releases
cd "/opt/router/releases/${PACKAGE}"
```

#### 4. 准备配置文件

```bash
cp config.yaml.template config.yaml
```

至少确认以下配置项：

- `database.sql_dsn`：必填，且只支持 PostgreSQL DSN。
- `auth.cookie_secret`：必须替换模板示例值。
- `auth.jwt_secret`：如需钱包登录与 refresh token，必须配置。
- `server.address`：如需密码重置链接、支付回调或跳转链接，必须配置为对外可访问地址。
- `cache.type`：缓存后端类型，只支持 `local` 或 `redis`；使用 Redis 时必须同时配置 `redis.conn_string`。
- `ucan.aud`：公网部署或域名/端口非默认值时，建议显式配置。
- `bootstrap.root_wallet_address`：按需配置系统级用户管理钱包地址。

注意：

- `scripts/starter.sh` 启动时始终传入 `--port` 和 `--log-dir`。
- 因此，通过 `starter.sh` 启动时，实际监听端口和日志目录由 `ROUTER_PORT`、`ROUTER_LOG_DIR` 或脚本默认值控制，而不是 `config.yaml` 中的 `server.port`、`server.log_dir`。

#### 5. 启动服务

使用默认端口 `3011` 和默认日志目录 `./logs`：

```bash
./scripts/starter.sh start
```

如需覆盖端口或日志目录：

```bash
ROUTER_PORT=3011 ROUTER_LOG_DIR=/opt/router/logs ./scripts/starter.sh start
```

常用命令：

```bash
./scripts/starter.sh stop
./scripts/starter.sh restart
```

### 健康检查

发布包内提供统一健康检查入口：

```bash
./scripts/health-check.sh
./scripts/health-check.sh --level all --format json
```

检查层级：

- `liveness`：检查 `run/router.pid` 指向的进程（如存在）和公开状态接口可达性。
- `readiness`：在 `liveness` 基础上检查 `/api/v1/public/status` 返回 `success=true`。
- `dependency`：检查 `config.yaml`、PostgreSQL、Redis（仅配置时）和 Billing 服务（仅配置时）。
- `all`：按 `liveness -> readiness -> dependency` 顺序执行。

依赖分类：

- required：`database.sql_dsn`、PostgreSQL 只读查询。
- optional：Redis CLI 或 PostgreSQL CLI 未安装时会返回 `WARN`，避免健康检查脚本反向要求目标机安装额外客户端；Redis/Billing 未配置时返回 `SKIP`。
- optional：Billing 服务仅在 `billing_service.base_url` 已配置时检查；不可达返回 `WARN`，不阻断 Router 基础服务健康。

常用参数：

```bash
./scripts/health-check.sh --level readiness --timeout 5 --retries 12 --interval 5
./scripts/health-check.sh --base-url http://127.0.0.1:3011 --config ./config.yaml
```

### 部署验证方式

1. 检查启动输出是否包含 `Router started`。
2. 检查 PID 文件是否生成：

```bash
cat run/router.pid
```

3. 执行健康检查：

```bash
./scripts/health-check.sh --level readiness
```

4. 检查状态接口：

```bash
curl http://127.0.0.1:3011/api/v1/public/status
```

如使用了 `ROUTER_PORT`，请替换为实际端口。

5. 检查日志：

```bash
tail -n 50 logs/starter.log
tail -n 50 logs/error.log
```

如使用了 `ROUTER_LOG_DIR`，请替换为实际日志目录。

### 回滚方式

部署新版本前，请保留上一个已验证可用的解压目录。

回滚步骤：

1. 进入当前运行版本目录并停止服务：

```bash
cd /opt/router/releases/router-v0.0.2-deadbee
./scripts/starter.sh stop
```

2. 进入上一个版本目录，确认该目录下的 `config.yaml` 可用后重新启动：

```bash
cd /opt/router/releases/router-v0.0.1-abcdef0
./scripts/starter.sh start
```

说明：

- `starter.sh` 的 PID 文件位于各自版本目录下的 `run/router.pid`。
- 回滚前必须先停止当前版本，否则可能因端口占用导致旧版本启动失败。

## 常见问题

- `config file "./config.yaml" not found`：先执行 `cp config.yaml.template config.yaml`。
- `database.sql_dsn is required and only PostgreSQL is supported`：检查 `database.sql_dsn` 是否已配置为 PostgreSQL DSN。
- 钱包登录或 refresh token 流程失败：检查 `auth.jwt_secret` 是否为空。
- 执行 `./scripts/package.sh` 后出现新 tag：这是脚本默认行为；不带参数时会自动创建并推送下一个 patch tag。
- 修改了 `config.yaml` 中的 `server.port`，但启动端口没变：`starter.sh` 会用 `ROUTER_PORT` 或默认值 `3011` 覆盖该配置。
- 修改了 `config.yaml` 中的 `server.log_dir`，但日志目录没变：`starter.sh` 会用 `ROUTER_LOG_DIR` 或默认值 `./logs` 覆盖该配置。
- `starter.sh` 提示 `Binary not found or not executable`：检查发布目录下是否存在 `build/router`，以及打包过程是否成功。

## 相关文档

- [文档索引](./docs/README.md)
- [接口参考](./API_reference.md)
- [UCAN 能力定义](./docs/UCAN能力定义.md)
- [问题排查](./docs/问题排查.md)
