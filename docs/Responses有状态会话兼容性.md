# Responses 有状态会话兼容性

## 适用范围

本文说明 Codex 等客户端调用 `/v1/responses` 时，为什么不能在不同上游账号之间任意切换，以及遇到历史 item ID 不兼容时的处理方式。

## 问题表现

上游可能返回类似错误：

```text
Invalid 'input .id': 'fc_...'. Expected an ID that begins with 'ctc'.
```

其中 `fc_...` 通常是客户端历史中的 `function_call` item ID，`ctc...` 是某些上游会话系统要求的本地 item ID 前缀。

## 根因

Responses 请求可能携带以下状态：

- `previous_response_id`
- `function_call`
- `function_call_output`
- 历史 `input` item ID

这些状态不一定能被另一个上游账号或会话池识别。典型链路是：

1. Codex 会话先从上游 A 获得 `fc_...` item。
2. 上游 A 暂时不可用，Router 选择上游 B。
3. Codex 继续发送原会话历史。
4. 上游 B 只接受自己的 `ctc...` item，于是返回 400。

item ID 不能通过字符串替换解决，因为 ID 同时对应上游保存的会话状态。

## Router 行为

Router 对带状态的 Responses 请求默认不做普通渠道 fallback，以避免：

- `previous_response_id` 在新渠道不存在；
- 工具调用上下文丢失；
- 工具被重复执行；
- 请求在多个账号之间产生不可预测的状态。

对于上游明确返回 item ID 前缀不兼容的 400，Router 会归一化为：

```json
{
  "error": {
    "type": "state_incompatible_error",
    "code": "state_incompatible",
    "message": "当前 Responses 会话与所选上游不兼容，请新建会话后重试"
  }
}
```

这不是渠道余额不足，也不会因此全局禁用渠道或模型端点。

## 状态会话隔离

Router 会为上游返回的 Response ID 和 Responses item ID 建立短期渠道绑定，默认保存 6 小时；启用 Redis 时使用 Redis 共享绑定，未启用 Redis 时使用当前进程内存。

后续请求携带 `previous_response_id` 或历史 item `id` 时：

1. 优先查找原渠道。
2. 原渠道仍可承载当前模型和端点时，固定使用原渠道，不参与普通优先级随机选择。
3. 如果同一请求中的状态 ID 分别绑定到多个渠道，Router 拒绝路由并要求新建会话，不会把会话继续发送到任意一个渠道。
4. 没有可识别绑定的旧历史请求仍按普通规则选择渠道，但一旦上游返回 ID 前缀不兼容，客户端应新建会话。

绑定的是渠道级状态，不代表不同渠道之间可以共享上游会话；渠道内如果还有多个上游账号，会话池仍应由渠道供应商保证一致性。

## 排查和运维建议

1. 用户端新建 Codex 会话，不要继续重放已经产生不兼容 ID 的历史会话。
2. 尽量让一个 Responses 会话固定使用同一渠道和同一上游账号池。
3. 看到 `state_incompatible` 时，优先检查近期是否发生渠道切换、上游账号切换或上游会话重置。
4. 不要把 `fc_` 直接改成 `ctc`，也不要仅凭这个错误自动摘除整个渠道。

## 后续演进

如果未来要支持有状态请求自动切换渠道，需要建立完整的会话绑定和 item ID 映射，并验证工具调用状态；仅修改请求中的 ID 前缀是不安全的。
