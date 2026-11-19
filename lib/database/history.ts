/**
 * 历史记录管理模块
 */

import "server-only";
import {createAdminClient} from "../supabase/admin";
import type {CheckResult, HistorySnapshot} from "../types";
import {mapHistoryRows} from "./history-data";
import type {HistoryRow} from "./history-data";
import {logError} from "../utils";

/**
 * 每个 Provider 最多保留的历史记录数
 */
export const MAX_POINTS_PER_PROVIDER = 60;

const DEFAULT_RETENTION_DAYS = 30;
const MIN_RETENTION_DAYS = 7;
const MAX_RETENTION_DAYS = 365;

export const HISTORY_RETENTION_DAYS = (() => {
  const raw = Number(process.env.HISTORY_RETENTION_DAYS);
  if (Number.isFinite(raw)) {
    return Math.max(MIN_RETENTION_DAYS, Math.min(MAX_RETENTION_DAYS, raw));
  }
  return DEFAULT_RETENTION_DAYS;
})();

const RPC_RECENT_HISTORY = "get_recent_check_history";
const RPC_PRUNE_HISTORY = "prune_check_history";

/**
 * append 后自动清理的最小间隔：12 小时
 * 避免每个轮询周期都执行一次全表范围 DELETE
 */
const AUTO_PRUNE_INTERVAL_MS = 12 * 60 * 60 * 1000;

type AdminClient = ReturnType<typeof createAdminClient>;

export interface HistoryQueryOptions {
  allowedIds?: Iterable<string> | null;
  limitPerConfig?: number;
}

/**
 * SnapshotStore 负责与数据库交互，提供统一的读/写/清理接口
 */
class SnapshotStore {
  private lastAutoPruneAt = 0;

  async fetch(options?: HistoryQueryOptions): Promise<HistorySnapshot> {
    const normalizedIds = normalizeAllowedIds(options?.allowedIds);
    if (Array.isArray(normalizedIds) && normalizedIds.length === 0) {
      return {};
    }

    const supabase = createAdminClient();
    const limitPerConfig = options?.limitPerConfig ?? MAX_POINTS_PER_PROVIDER;
    const { data, error } = await supabase.rpc(
      RPC_RECENT_HISTORY,
      {
        limit_per_config: limitPerConfig,
        target_config_ids: normalizedIds,
      }
    );

    if (error) {
      logError("获取历史快照失败", error);
      return {};
    }

    return mapHistoryRows(data as HistoryRow[] | null, limitPerConfig);
  }

  async append(results: CheckResult[]): Promise<void> {
    if (results.length === 0) {
      return;
    }

    const supabase = createAdminClient();
    const records = results.map((result) => ({
      config_id: result.id,
      status: result.status,
      latency_ms: result.latencyMs,
      ping_latency_ms: result.pingLatencyMs,
      checked_at: result.checkedAt,
      message: result.message,
    }));

    const { error } = await supabase.from("check_history").insert(records);
    if (error) {
      logError("写入历史记录失败", error);
      return;
    }

    // 顺带写入挑战记录（能力评估数据）；基础设施失败的结果没有 challenge 字段，自然被过滤
    const challengeRecords = results
      .filter((result) => result.challenge)
      .map((result) => ({
        config_id: result.id,
        difficulty: result.challenge!.difficulty,
        category: result.challenge!.category,
        expected_answer: result.challenge!.expectedAnswer,
        response_excerpt: result.challenge!.responseExcerpt,
        passed: result.challenge!.passed,
        latency_ms: result.latencyMs,
        checked_at: result.checkedAt,
      }));
    if (challengeRecords.length > 0) {
      const { error: challengeError } = await supabase
        .from("check_challenges")
        .insert(challengeRecords);
      if (challengeError) {
        logError("写入挑战记录失败", challengeError);
      }
    }

    const now = Date.now();
    if (now - this.lastAutoPruneAt >= AUTO_PRUNE_INTERVAL_MS) {
      this.lastAutoPruneAt = now;
      await this.pruneInternal(supabase);
    }
  }

  async prune(retentionDays: number = HISTORY_RETENTION_DAYS): Promise<void> {
    const supabase = createAdminClient();
    await this.pruneInternal(supabase, retentionDays);
  }

  private async pruneInternal(
    supabase: AdminClient,
    retentionDays: number = HISTORY_RETENTION_DAYS
  ): Promise<void> {
    const { error } = await supabase.rpc(RPC_PRUNE_HISTORY, {
      retention_days: retentionDays,
    });

    if (error) {
      logError("清理历史记录失败", error);
    }
  }
}

export const historySnapshotStore = new SnapshotStore();

function normalizeAllowedIds(
  ids?: Iterable<string> | null
): string[] | null {
  if (!ids) {
    return null;
  }
  const array = Array.from(ids).filter(Boolean);
  return array.length > 0 ? array : [];
}
