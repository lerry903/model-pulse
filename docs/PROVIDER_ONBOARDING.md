# 供应商接入

供应商在 `check_providers` 中维护，请求协议在检测配置 `check_configs.protocol` 中选择。供应商名称不参与 SDK 分支判断。

## 维护入口

沿用独立管理后台；此仓库提供监测、公开面板和数据库结构。后台应使用以下数据契约：

| 表 | 关键字段 | 作用 |
| --- | --- | --- |
| `check_providers` | `id`、`name`、`icon`、`official_status_source` | 维护供应商身份 |
| `check_request_templates` | `provider_id`、`request_header`、`metadata` | 维护请求参数模板 |
| `check_models` | `provider_id`、`model`、`template_id` | 维护模型及模板绑定 |
| `check_configs` | `provider_id`、`protocol`、`model_id`、`endpoint`、`api_key` | 维护检测实例 |

后台的供应商选择器应查询 `check_providers`，模型和模板选择器按 `provider_id` 筛选。配置、模型、模板必须属于同一供应商，数据库通过组合外键约束双向更新。协议选项对应下表的固定适配器。后台未同步这些字段前，可通过 Supabase Studio 维护；独立后台源码不在当前工作区。

## 协议

| protocol | SDK / API | endpoint 示例 |
| --- | --- | --- |
| `openai_chat` | OpenAI Chat Completions | `https://api.openai.com/v1/chat/completions` |
| `openai_responses` | OpenAI Responses | `https://api.openai.com/v1/responses` |
| `openai_compatible` | OpenAI-compatible Chat Completions | 供应商的 `/chat/completions` 地址 |
| `anthropic_messages` | Anthropic Messages | `https://api.anthropic.com/v1/messages` |
| `gemini_native` | Google 原生流式 API | `https://generativelanguage.googleapis.com/v1beta` |

协议显式选择，不根据供应商身份或 URL 自动切换。端点可填写 base URL 或完整方法 URL；SDK 使用配置模型 ID 生成实际请求。原生 Gemini 支持自定义代理域名和查询参数。

## xAI Grok 与智谱 GLM

初始化数据库时已提供 `xai`、`zhipu` 两条供应商记录。它们都可以使用 `openai_compatible`，模型 ID 和 Key 按各自账号实际权限填写。

| 供应商 | provider_id | endpoint |
| --- | --- | --- |
| xAI | `xai` | `https://api.x.ai/v1/chat/completions` |
| 智谱通用 API | `zhipu` | `https://open.bigmodel.cn/api/paas/v4/chat/completions` |

接口地址、模型名称和访问权限以[智谱官方文档](https://docs.bigmodel.cn/cn/guide/develop/openai/introduction)、[xAI 官方文档](https://docs.x.ai/docs/api-reference)及各自控制台为准。

[GLM Coding Plan](https://docs.bigmodel.cn/cn/coding-plan/overview)有独立的套餐适用范围；上表针对国内通用 API，不能直接用套餐额度替代通用 API 配置。

以下示例在 `public` schema 中添加 GLM 检测；开发环境使用 `dev` schema。先替换模型与 Key 占位符，重复插入配置会增加检测实例。

```sql
WITH model_row AS (
    INSERT INTO public.check_models (provider_id, model)
    VALUES ('zhipu', 'REPLACE_WITH_GLM_MODEL_ID')
    ON CONFLICT (provider_id, model) DO UPDATE SET model = EXCLUDED.model
    RETURNING id
)
INSERT INTO public.check_configs
    (name, provider_id, protocol, model_id, endpoint, api_key, enabled, group_name)
SELECT 'GLM 官方', 'zhipu', 'openai_compatible', id,
       'https://open.bigmodel.cn/api/paas/v4/chat/completions',
       'REPLACE_WITH_GLM_API_KEY', true, '智谱'
FROM model_row;
```

接入其他供应商时先创建供应商记录，然后照上述方式添加模型与配置，无需修改 TypeScript 联合类型或增加厂商分支：

```sql
INSERT INTO public.check_providers (id, name)
VALUES ('my-vendor', '我的供应商');
```

## 展示、官方状态与请求参数

- 名称读取供应商记录。`icon` 支持 `openai`、`gemini`、`anthropic`、`xai`、`zhipu`；空值或其他图标键显示通用图标。
- `official_status_source` 可为 `openai`、`anthropic` 或 `NULL`；空值不附带官方状态。Grok、GLM 不会自动关联 OpenAI 官方状态。
- 模型、模板、供应商和检测配置变更会触发配置版本更新，已打开面板通过 SSE 重拉数据。
- 请求模板头覆盖 SDK 同名请求头，`metadata` 在发送前合并到 JSON 请求体；`model`、`prompt`、`messages`、`abortSignal` 是保留字段。
- OpenAI 适配器支持模型名推理指令。未使用推理强度的检测默认限制输出为 24 token；长思考模型应按供应商文档通过模板设置思考开关或输出预算。
- 公开状态 API 的每条检测记录包含 `provider` 对象及 `protocol`，不输出 API Key 或模板请求头。
