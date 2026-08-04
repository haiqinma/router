# Router OpenAPI

本目录统一维护 Router 接口文档。

- `router.openapi.yaml` 是 API 路径、鉴权方式、请求体骨架和响应 envelope 的真源。
- 业务语义、路由规则、计费规则和产品边界仍放在 `docs/` 下对应专题文档中。
- 不再维护 prose API 文档，避免接口路径和代码注册表长期漂移。

维护规则：

1. 新增、删除或改名接口时，同步更新 `router.openapi.yaml`。
2. 路径以 `internal/transport/http/router/api.go`、`internal/transport/http/router/relay.go` 和 `internal/transport/http/router/dashboard.go` 为核对来源。
3. OpenAI / Anthropic 兼容端点只在 OpenAPI 里维护路径和通用请求/响应形态，协议差异继续看 [端点协议](../端点协议.md)。
4. 管理端字段如暂未稳定，先使用通用对象 schema，稳定后再补更细 schema。
