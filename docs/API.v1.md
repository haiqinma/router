# Router API v1（JWT + public/admin/internal）

本文件只描述 **JWT** 使用方式下的 `/api/v1/*` 接口（public/admin/internal 分层）。  
旧接口与兼容接口（如 `/api/*`、`/v1/*`）不在本文档范围。

## 认证方式（JWT）
### 请求头
```
Authorization: Bearer <JWT>
```

### JWT 来源（推荐）
- **钱包登录（public/auth 或 public/common/auth）** 会返回 JWT  
- `/api/v1/public/profile` 支持 **钱包 JWT 或 UCAN**

> 说明  
> - 普通用户 JWT 可访问 public 用户侧接口。  
> - 管理员/Root JWT 才能访问 admin 接口。  
> - `/api/v1/public/user/login` 是密码登录（Session/Cookie），不属于 JWT 主路径；如只用 JWT 可忽略。

## 响应格式说明
- 业务接口（public/admin）一般返回：
```json
{
  "success": true,
  "message": "",
  "data": {}
}
```
- OpenAI 兼容接口（/api/v1/public 下的模型调用）返回 **OpenAI 风格响应**。

---

## Public（公开/用户侧）

### 1) 钱包认证（JWT）
#### proto 风格
- `POST /api/v1/public/common/auth/challenge`
- `POST /api/v1/public/common/auth/verify`
- `POST /api/v1/public/common/auth/refreshToken`

#### web3 风格
- `POST /api/v1/public/auth/challenge`
- `POST /api/v1/public/auth/verify`
- `POST /api/v1/public/auth/refresh`
- `POST /api/v1/public/auth/logout`

#### 个人 profile（JWT 或 UCAN）
- `GET /api/v1/public/profile`

### 2) 公共信息与找回密码
- `GET /api/v1/public/status`
- `GET /api/v1/public/notice`
- `GET /api/v1/public/about`
- `GET /api/v1/public/home_page_content`
- `GET /api/v1/public/reset_password`
- `POST /api/v1/public/user/reset`

### 3) 钱包 OAuth（JWT 认证链路）
- `GET /api/v1/public/oauth/wallet/nonce`
- `POST /api/v1/public/oauth/wallet/login`
- `POST /api/v1/public/oauth/wallet/bind`（需 JWT / UserAuth）

### 4) 用户自助（JWT）
> 说明：`/api/v1/public/user/login` 是密码登录（Session/Cookie），非 JWT；如只用 JWT 可忽略。

- `POST /api/v1/public/user/register`（无需 JWT）
- `POST /api/v1/public/user/login`（Session/Cookie）
- `GET  /api/v1/public/user/logout`（Session/Cookie）
- `GET  /api/v1/public/user/self`（JWT）
- `PUT  /api/v1/public/user/self`（JWT）
- `DELETE /api/v1/public/user/self`（JWT）
- `GET  /api/v1/public/user/dashboard`（JWT）
- `GET  /api/v1/public/user/available_models`（JWT）
- `GET  /api/v1/public/user/token`（JWT）
- `GET  /api/v1/public/user/aff`（JWT）
- `POST /api/v1/public/user/topup`（JWT）

### 5) 个人 Token 管理（JWT）
- `GET    /api/v1/public/token`
- `GET    /api/v1/public/token/search`
- `GET    /api/v1/public/token/:id`
- `POST   /api/v1/public/token`
- `PUT    /api/v1/public/token`
- `DELETE /api/v1/public/token/:id`

### 6) 个人日志（JWT）
- `GET /api/v1/public/log/self`
- `GET /api/v1/public/log/self/stat`
- `GET /api/v1/public/log/self/search`

### 7) 用户侧模型/渠道（JWT）
- `GET /api/v1/public/channel/models`（前端展示供应商/模型）
- `GET /api/v1/public/models-all`（全量模型列表，非 OpenAI 兼容）

### 8) OpenAI 兼容的模型调用（JWT）
> 与 OpenAI API 语义一致，只是路径前缀改为 `/api/v1/public`。

#### 模型列表
- `GET /api/v1/public/models`
- `GET /api/v1/public/models/:model`

#### 文本与多模态
- `POST /api/v1/public/chat/completions`
- `POST /api/v1/public/completions`
- `POST /api/v1/public/embeddings`
- `POST /api/v1/public/moderations`
- `POST /api/v1/public/images/generations`

#### 音频
- `POST /api/v1/public/audio/transcriptions`
- `POST /api/v1/public/audio/translations`
- `POST /api/v1/public/audio/speech`

#### 目前未实现（返回 501）
- `POST /api/v1/public/edits`
- `POST /api/v1/public/images/edits`
- `POST /api/v1/public/images/variations`
- `GET/POST/DELETE /api/v1/public/files*`
- `POST/GET /api/v1/public/fine_tuning/*`
- `POST/GET /api/v1/public/assistants/*`
- `POST/GET /api/v1/public/threads/*`

---

## Admin（运营/管理）
> 需 Admin/Root JWT

### 1) 用户管理
- `GET    /api/v1/admin/user`
- `GET    /api/v1/admin/user/search`
- `GET    /api/v1/admin/user/:id`
- `POST   /api/v1/admin/user`
- `POST   /api/v1/admin/user/manage`
- `PUT    /api/v1/admin/user`
- `DELETE /api/v1/admin/user/:id`

### 2) 渠道管理
- `GET    /api/v1/admin/channel`
- `GET    /api/v1/admin/channel/search`
- `GET    /api/v1/admin/channel/:id`
- `GET    /api/v1/admin/channel/test`
- `GET    /api/v1/admin/channel/test/:id`
- `GET    /api/v1/admin/channel/update_balance`
- `GET    /api/v1/admin/channel/update_balance/:id`
- `POST   /api/v1/admin/channel`
- `PUT    /api/v1/admin/channel`
- `DELETE /api/v1/admin/channel/disabled`
- `DELETE /api/v1/admin/channel/:id`

### 3) 兑换码管理
- `GET    /api/v1/admin/redemption`
- `GET    /api/v1/admin/redemption/search`
- `GET    /api/v1/admin/redemption/:id`
- `POST   /api/v1/admin/redemption`
- `PUT    /api/v1/admin/redemption`
- `DELETE /api/v1/admin/redemption/:id`

### 4) 日志管理
- `GET    /api/v1/admin/log`
- `DELETE /api/v1/admin/log`
- `GET    /api/v1/admin/log/stat`
- `GET    /api/v1/admin/log/search`

### 5) 分组管理
- `GET /api/v1/admin/group`

### 6) 系统配置（Root）
- `GET /api/v1/admin/option`
- `PUT /api/v1/admin/option`

---

## Internal（内部接口）
当前预留，暂无可用接口：
- `/api/v1/internal/*`

---

## 示例（JWT 调用）
```bash
BASE="https://llm.yeying.pub"
JWT="<YOUR_JWT>"

# 模型列表
curl -s -H "Authorization: Bearer $JWT" \
  "$BASE/api/v1/public/models"

# Chat Completions
curl -s -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"model":"deepseek-chat","messages":[{"role":"user","content":"ping"}],"max_tokens":16,"temperature":0}' \
  "$BASE/api/v1/public/chat/completions"
```
