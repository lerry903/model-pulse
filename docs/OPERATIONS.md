# Model Pulse 运维手册

本文面向运维与平台工程，描述部署、数据库初始化与日常运行维护要点。

## 1. 运行环境

- Node.js 22.18 及以上
- pnpm 10
- Supabase（PostgreSQL）

## 2. 环境变量

### 必需（服务端）

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_OR_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

其中 `SUPABASE_SERVICE_ROLE_KEY` 用于后台轮询、配置加载和租约续租，必须配置在服务端环境中，禁止暴露到客户端。

### 可选（运行参数）

- `CHECK_NODE_ID`：节点标识（多节点部署必须唯一）
- `CHECK_POLL_INTERVAL_SECONDS`：检测间隔（15–600 秒）
- `CHECK_CONCURRENCY`：并发数（1–20）
- `OFFICIAL_STATUS_CHECK_INTERVAL_SECONDS`：官方状态轮询间隔（60–3600 秒）
- `HISTORY_RETENTION_DAYS`：历史保留天数（7–365）

## 3. 数据库初始化

### 3.1 新建项目

- 生产/正式环境：执行 `supabase/schema.sql`
- 本地开发（dev schema）：执行 `supabase/schema-dev.sql`

> 提示：项目在 `NODE_ENV=development` 时使用 `dev` schema，`pnpm dev` 会自动设置该环境。

### 3.2 数据结构检查

初始化脚本包含供应商、协议、模型、模板、检测配置、历史记录、统计视图和所需函数。应用和独立管理后台使用同一套字段契约。

```sql
SELECT id, name, icon, official_status_source FROM check_providers;
SELECT c.name, p.name AS provider, c.protocol, m.model, c.endpoint
FROM check_configs c
JOIN check_providers p ON p.id = c.provider_id
JOIN check_models m ON m.id = c.model_id;
```

供应商、模型、模板与后台字段契约见 [供应商接入](PROVIDER_ONBOARDING.md)。

## 4. 部署模式

### 4.1 单节点

- 默认行为：该节点执行轮询并写入历史。

### 4.2 多节点

- 使用 `check_poller_leases` 表进行租约选主。
- 只有 leader 节点执行轮询；standby 节点仅提供读取 API。
- 必须为每个节点设置唯一 `CHECK_NODE_ID`，避免租约冲突。

## 5. 运维操作

### 5.1 添加与调整配置

```sql
-- 先确保模型存在
INSERT INTO check_models (provider_id, model)
VALUES ('openai', 'gpt-4o-mini')
ON CONFLICT (provider_id, model) DO NOTHING;

-- 再新增配置实例
INSERT INTO check_configs (name, provider_id, protocol, model_id, endpoint, api_key, enabled)
SELECT 'OpenAI GPT-4o',
       'openai',
       'openai_chat',
       id,
       'https://api.openai.com/v1/chat/completions',
       'sk-xxx',
       true
FROM check_models
WHERE provider_id = 'openai'
  AND model = 'gpt-4o-mini';

-- 维护模式
UPDATE check_configs SET is_maintenance = true WHERE name = 'OpenAI GPT-4o';

-- 禁用
UPDATE check_configs SET enabled = false WHERE name = 'OpenAI GPT-4o';
```

参数优先级固定为：

- `check_request_templates`：跨模型复用的通用默认值
- `check_models`：只负责绑定模型与模板
- `check_configs`：只负责实例连接信息

运行时只读取模型绑定模板中的 `request_header` / `metadata`

### 5.2 分组信息维护

```sql
INSERT INTO group_info (group_name, website_url, tags)
VALUES ('主力服务商', 'https://example.com', 'core,prod');
```

`tags` 为英文逗号分隔字符串，前端会解析展示。

### 5.3 系统通知

```sql
INSERT INTO system_notifications (message, level, is_active)
VALUES ('**注意**：部分服务延迟升高', 'warning', true);
```

### 5.4 历史保留

- 每次写入后自动调用 `prune_check_history`。
- 如需手动清理，可直接调用 RPC：

```sql
SELECT prune_check_history(30);
```

## 6. 监控与日志

关键日志（服务端）：

- `[model-pulse] 初始化后台轮询器...`
- `[model-pulse] 节点角色切换：standby -> leader ...`
- `[model-pulse] 本轮检测明细：...`
- `[官方状态] openai: operational - ...`

建议按关键字 `model-pulse` 与 `[官方状态]` 建立日志告警。

## 7. 常见问题

### 7.1 页面没有任何卡片

- 确认 `check_configs` 至少一条 `enabled = true`。
- 确认对应 `model_id` 已正确关联到 `check_models`。
- 检查服务端是否报缺失环境变量或权限错误。

### 7.2 时间线一直为空

- 查看轮询器日志是否运行。
- 检查 `check_history` 是否有新增记录。
- 确认 `CHECK_POLL_INTERVAL_SECONDS` 未设置过大。

### 7.3 官方状态显示 unknown

- 当前仅 OpenAI/Anthropic 实现官方状态。
- 检查外网访问是否被阻断或 DNS 被限制。

### 7.4 多节点重复写入

- 确认每个节点 `CHECK_NODE_ID` 唯一。
- 检查 `check_poller_leases` 是否可写（需 service role key）。
