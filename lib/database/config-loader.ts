/**
 * 数据库配置加载模块
 */

import "server-only";
import {createAdminClient} from "../supabase/admin";
import {getPollingIntervalMs} from "../core/polling-config";
import type {ProviderConfig} from "../types";
import {mapProviderConfig} from "./provider-config";
import type {ProviderConfigRecord} from "./provider-config";
import {logError} from "../utils";

interface ConfigCache {
  data: ProviderConfig[];
  lastFetchedAt: number;
}

interface ConfigCacheMetrics {
  hits: number;
  misses: number;
}

const cache: ConfigCache = {
  data: [],
  lastFetchedAt: 0,
};

const metrics: ConfigCacheMetrics = {
  hits: 0,
  misses: 0,
};

export function getConfigCacheMetrics(): ConfigCacheMetrics {
  return { ...metrics };
}

export function resetConfigCacheMetrics(): void {
  metrics.hits = 0;
  metrics.misses = 0;
}

/**
 * 从数据库加载启用的 Provider 配置
 * @returns Provider 配置列表
 */
export async function loadProviderConfigsFromDB(options?: {
  forceRefresh?: boolean;
}): Promise<ProviderConfig[]> {
  try {
    const now = Date.now();
    const ttl = getPollingIntervalMs();
    if (!options?.forceRefresh && now - cache.lastFetchedAt < ttl) {
      metrics.hits += 1;
      return cache.data;
    }
    metrics.misses += 1;

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("check_configs")
      .select(
        "id, name, provider_id, protocol, model_id, endpoint, api_key, is_maintenance, group_name, check_providers(id, name, icon, official_status_source), check_models(id, provider_id, model, check_request_templates(provider_id, request_header, metadata))"
      )
      .eq("enabled", true)
      .order("id")
      .returns<ProviderConfigRecord[]>();

    if (error) {
      logError("从数据库加载配置失败", error);
      return [];
    }

    if (!data || data.length === 0) {
      console.warn("[model-pulse] 数据库中没有找到启用的配置");
      cache.data = [];
      cache.lastFetchedAt = now;
      return [];
    }

    const configs = data.flatMap((row) => {
      try {
        return [mapProviderConfig(row)];
      } catch (error) {
        logError("忽略无效的检测配置", error);
        return [];
      }
    });

    cache.data = configs;
    cache.lastFetchedAt = now;
    return configs;
  } catch (error) {
    logError("加载配置时发生异常", error);
    return [];
  }
}
