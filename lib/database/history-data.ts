import type {ApiProtocol, CheckResult, HistorySnapshot} from "../types";
import type {CheckProviderRow} from "../types/database";
import {mapProvider} from "./provider-config";

export interface HistoryRow {
  config_id: string;
  status: string;
  latency_ms: number | null;
  ping_latency_ms: number | null;
  checked_at: string;
  message: string | null;
  name: string;
  protocol: ApiProtocol;
  provider: CheckProviderRow;
  model: string;
  endpoint: string | null;
  group_name: string | null;
}

export function mapHistoryRows(
  rows: HistoryRow[] | null,
  limitPerConfig: number
): HistorySnapshot {
  if (!rows || rows.length === 0) {
    return {};
  }

  const history: HistorySnapshot = {};
  for (const row of rows) {
    const result: CheckResult = {
      id: row.config_id,
      name: row.name,
      protocol: row.protocol,
      provider: mapProvider(row.provider),
      endpoint: row.endpoint ?? "",
      model: row.model,
      status: row.status as CheckResult["status"],
      latencyMs: row.latency_ms,
      pingLatencyMs: row.ping_latency_ms,
      checkedAt: row.checked_at,
      message: row.message ?? "",
      groupName: row.group_name,
    };

    if (!history[result.id]) {
      history[result.id] = [];
    }
    history[result.id].push(result);
  }

  for (const key of Object.keys(history)) {
    history[key] = history[key]
      .sort(
        (a, b) => new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime()
      )
      .slice(0, limitPerConfig);
  }

  return history;
}
