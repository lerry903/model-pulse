import {API_PROTOCOLS} from "../types/provider";
import type {Provider, ProviderConfig} from "../types/provider";
import type {CheckProviderRow, CheckConfigRow, CheckModelRow, CheckRequestTemplateRow} from "../types/database";

type Relation<T> = T | T[] | null;
type TemplateRow = Pick<CheckRequestTemplateRow, "provider_id" | "request_header" | "metadata">;
type ModelRow = Pick<CheckModelRow, "id" | "provider_id" | "model"> & {
  check_request_templates: Relation<TemplateRow>;
};
export type ProviderConfigRecord = Pick<
  CheckConfigRow,
  "id" | "name" | "provider_id" | "protocol" | "model_id" | "endpoint" | "api_key" | "is_maintenance" | "group_name"
> & {
  check_providers: Relation<CheckProviderRow>;
  check_models: Relation<ModelRow>;
};

function one<T>(relation: Relation<T>): T | null {
  if (Array.isArray(relation)) return relation.length === 1 ? relation[0] : null;
  return relation;
}

export function mapProvider(row: CheckProviderRow): Provider {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    officialStatusSource: row.official_status_source,
  };
}

export function mapProviderConfig(row: ProviderConfigRecord): ProviderConfig {
  const provider = one(row.check_providers);
  const model = one(row.check_models);
  const template = model ? one(model.check_request_templates) : null;
  if (!provider || provider.id !== row.provider_id || !model || model.id !== row.model_id || model.provider_id !== row.provider_id) {
    throw new Error(`检测配置 ${row.id} 的供应商或模型关联无效`);
  }
  if (template && template.provider_id !== row.provider_id) {
    throw new Error(`检测配置 ${row.id} 的请求模板供应商不匹配`);
  }
  if (template?.request_header != null && (
    typeof template.request_header !== "object" || Array.isArray(template.request_header) ||
    Object.values(template.request_header).some((value) => typeof value !== "string")
  )) {
    throw new Error(`检测配置 ${row.id} 的请求头必须是字符串字典`);
  }
  if (template?.metadata != null && (typeof template.metadata !== "object" || Array.isArray(template.metadata))) {
    throw new Error(`检测配置 ${row.id} 的请求参数必须是 JSON 对象`);
  }
  if (!API_PROTOCOLS.includes(row.protocol)) throw new Error(`不支持的 API 协议: ${row.protocol}`);
  if (!row.endpoint.trim() || !model.model.trim()) throw new Error(`检测配置 ${row.id} 缺少端点或模型`);
  return {
    id: row.id,
    name: row.name,
    provider: mapProvider(provider),
    protocol: row.protocol,
    endpoint: row.endpoint.trim(),
    model: model.model,
    apiKey: row.api_key,
    is_maintenance: row.is_maintenance,
    groupName: row.group_name || null,
    requestHeaders: template?.request_header ?? null,
    metadata: template?.metadata ?? null,
  };
}
