# Scripts Specification

本文说明 `scripts/` 目录下脚本和相关模板文件的用途、典型调用方式以及主要返回语义。脚本路径均为仓库相对路径。

## 脚本总览

| 文件 | 用途 | 典型场景 |
| --- | --- | --- |
| `scripts/starter.sh` | 启动、停止或重启 Router 进程 | 本地运行、部署后拉起服务、进程重启 |
| `scripts/deploy.sh` | 构建前后端产物并替换部署目录中的 Router 二进制 | 单机部署或手工发布 |
| `scripts/package.sh` | 基于 Git tag 或远端 `main` 生成发布包 | 制作可分发版本包 |
| `scripts/health-check.sh` | 检查 Router 存活、就绪和依赖状态 | 部署验收、启动等待、故障排查 |
| `scripts/config_backup.sh` | 加密备份运行配置文件 | 升级或变更前保存当前配置 |
| `scripts/copy-for-upgrade.sh` | 升级时把当前配置复制到目标版本目录 | 新版本目录准备、配置迁移 |
| `scripts/sync.sh` | 将当前分支同步到上游分支并按配置推送 | Fork 仓库同步、日常开发同步 |
| `scripts/pr.sh` | 辅助安装 GitHub CLI 并创建 Pull Request | 从当前分支向上游提交 PR |
| `scripts/test_provider_latency.sh` | 测试 OpenAI 兼容接口的请求延迟 | 供应商链路连通性和延迟抽样 |

## 运行控制

### `scripts/starter.sh`

用于管理当前项目目录下的 Router 进程。

```bash
scripts/starter.sh start
scripts/starter.sh stop
scripts/starter.sh restart
```

主要行为：

- 默认执行 `start`。
- 启动 `build/router`，并将进程号写入 `run/router.pid`。
- 日志目录默认是 `logs/`，可通过 `ROUTER_LOG_DIR` 覆盖。
- 服务端口默认是 `3011`，可通过 `ROUTER_PORT` 覆盖。

### `scripts/deploy.sh`

用于构建并部署当前代码到目标部署目录。

```bash
scripts/deploy.sh
scripts/deploy.sh --skip-web
```

主要行为：

- 默认先执行前端依赖安装和构建，再构建后端二进制。
- 停止目标部署目录中的旧进程后替换 `build/router`。
- 替换二进制前会备份旧二进制文件。
- 部署完成后重新启动服务并校验 pid。

常用环境变量：

- `ROUTER_DEPLOY_DIR`：目标部署目录，默认 `/opt/deploy/router`。
- `ROUTER_BUILD_WEB=0`：跳过前端构建。
- `ROUTER_STARTUP_WAIT_SECONDS`：启动后等待秒数，默认 `3`。

## 打包与升级

### `scripts/package.sh`

用于生成发布包。

```bash
scripts/package.sh
scripts/package.sh v1.2.3
```

主要行为：

- 不传 tag 时，拉取远端 `origin/main`，并基于当前最大语义化 tag 自动生成下一个 patch tag。
- 传入 `v<major>.<minor>.<patch>` 时，基于指定 tag 打包。
- 打包内容包括后端二进制、前端 `web/dist`、配置模板和必要脚本。
- 发布包输出到 `output/` 目录。

常用环境变量：

- `AUTO_BUILD=false`：跳过自动构建，使用已有构建产物。
- `PACKAGE_REMOTE`：指定远端名称，默认 `origin`。
- `KEEP_STAGE=1`：保留打包临时目录。

### `scripts/copy-for-upgrade.sh`

用于升级过程中把当前版本配置复制到目标版本目录。

```bash
scripts/copy-for-upgrade.sh /opt/deploy/router-v1.2.3
```

主要行为：

- 必须传入一个目标目录的全路径。
- 将项目根目录下的 `config.yaml` 复制到目标目录下。
- 直接替换目标目录中的 `config.yaml`，不创建备份。
- 返回值 `0` 表示复制成功；参数错误、目标目录不存在或源配置不存在时返回非 `0`。

## 配置备份

### `scripts/config_backup.sh`

用于加密备份运行配置。

```bash
scripts/config_backup.sh
```

主要行为：

- 读取 `scripts/backup.conf` 中的备份开关、文件名前缀和后缀配置。
- 将项目根目录下的 `config.yaml` 复制到临时目录。
- 如果存在 `/etc/nginx/conf.d/router.conf` 或 `/etc/nginx/conf.d/test-router.conf`，也会复制到临时目录并与 `config.yaml` 同级打包。
- 使用 `gpg` 和 `scripts/.passphrase-file` 生成加密备份文件。
- 备份文件默认写入 `/opt/backup`。
- 若目标备份文件已经存在，脚本会跳过并返回 `255`。

相关文件：

- `scripts/backup.conf.template`：备份配置模板。
- `scripts/.passphrase-file.template`：加密口令文件模板。
- `scripts/.passphrase-file`：实际加密口令文件，运行环境中需要存在且非空。

## 健康检查

### `scripts/health-check.sh`

用于检查 Router 的运行状态和依赖可用性。

```bash
scripts/health-check.sh --level readiness
scripts/health-check.sh --level all --format json
scripts/health-check.sh --wait 30 --base-url http://127.0.0.1:3011
```

主要检查层级：

- `liveness`：进程或 HTTP 服务是否存活。
- `readiness`：服务是否达到可接流量状态。
- `dependency`：检查配置文件、PostgreSQL、Redis 和 Billing 等依赖。
- `all`：执行全部检查。

常用参数：

- `--timeout <seconds>`：单项检查超时时间。
- `--retries <count>`：失败后的重试次数。
- `--interval <seconds>`：重试或等待间隔。
- `--format text|json`：输出格式。
- `--config <path>`：指定配置文件路径。
- `--base-url <url>`：指定 Router 访问地址。
- `--component <name>`：只执行指定组件检查，可重复传入。
- `--wait <seconds>`：在给定时间内等待检查通过。

## 开发协作

### `scripts/sync.sh`

用于同步当前 Git 分支到上游仓库对应分支。

```bash
scripts/sync.sh
AUTO_PUSH=false scripts/sync.sh
```

主要行为：

- 校验当前目录是 Git 仓库且当前分支不是游离 `HEAD`。
- 自动检查 `origin` 和 `upstream` 远端。
- 若缺少 `upstream`，按默认规则提示添加。
- 要求工作区干净，避免 rebase 时覆盖本地改动。
- 默认同步完成后推送到 `origin/<current-branch>`。

### `scripts/pr.sh`

用于辅助创建 GitHub Pull Request。

```bash
scripts/pr.sh
```

主要行为：

- 检查并在支持的系统上尝试安装 GitHub CLI `gh`。
- 基于当前分支、`origin` 和上游仓库创建 PR。
- 支持交互模式和非交互模式。

常用环境变量：

- `AUTO_PUSH=false`：创建 PR 前不自动推送当前分支。
- `INTERACTIVE=false`：使用非交互模式。
- `AUTO_FILL_PR=true`：非交互模式下使用最近提交信息填充 PR 标题和描述。
- `PR_TITLE`、`PR_BODY`：非交互模式下手工指定 PR 标题和描述。

## 测试辅助

### `scripts/test_provider_latency.sh`

用于测试 OpenAI 兼容接口的请求耗时。

```bash
scripts/test_provider_latency.sh <domain> <key> <count> [model]
```

主要行为：

- 请求 `https://<domain>/v1/chat/completions`。
- 默认模型是 `gpt-3.5-turbo`。
- 输出每次请求的 HTTP 状态码和耗时。
- 最终输出平均耗时和标准差。

## 支持文件

| 文件 | 用途 |
| --- | --- |
| `scripts/backup.conf.template` | `config_backup.sh` 的配置模板，控制是否备份、备份文件名前缀和后缀。 |
| `scripts/.passphrase-file.template` | GPG 对称加密口令文件模板。 |
| `scripts/.passphrase-file` | 当前环境实际使用的 GPG 加密口令文件，不应作为公开配置传播。 |

## 返回值约定

除单独说明外，脚本遵循常见 Shell 约定：

- `0`：执行成功。
- 非 `0`：参数错误、依赖缺失、检查失败或执行失败。

特殊返回值：

- `scripts/config_backup.sh`：当备份文件已存在并跳过时，返回 `255`。
- `scripts/copy-for-upgrade.sh`：复制成功时返回 `0`，失败时返回非 `0`，供升级脚本调用判断。
