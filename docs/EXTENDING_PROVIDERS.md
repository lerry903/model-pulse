# 扩展供应商与协议

新增供应商属于数据维护：创建 `check_providers` 记录，再添加同一供应商的模型、可选请求模板及检测配置。无需增加厂商枚举或 SDK 分支。配置方法见[供应商接入](PROVIDER_ONBOARDING.md)。

只有新增请求协议时才需要修改代码：

1. 在 `lib/types/provider.ts` 的 `API_PROTOCOLS` 中注册协议。
2. 在 `lib/providers/ai-sdk-check.ts` 的 `createModel` 中实现适配器。
3. 直接更新 public / dev 初始化脚本的 `api_protocol` 定义。
4. 为实际请求路径、认证、流式响应和参数定制补充测试。
5. 同步独立管理后台的协议选项；供应商选择器始终查询数据库。

官方状态来源独立于供应商和协议。若需增加状态来源，在 `OfficialStatusSource`、`check_providers.official_status_source` 的约束、`lib/official-status/` 与官方状态轮询器中注册实现；未配置来源的供应商不附带状态信息。

本地检查：`pnpm test`、`pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm build`。数据库回归脚本是 `pnpm test:db`，仅在明确要运行独立 PostgreSQL 测试容器时执行。
