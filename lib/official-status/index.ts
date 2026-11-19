/**
 * 官方状态检查器统一入口
 * 根据显式配置的官方状态来源调用检查函数
 */

import type {OfficialStatusResult, OfficialStatusSource} from "../types";
import {checkOpenAIStatus} from "./openai";
import {checkAnthropicStatus} from "./anthropic";

/**
 * 检查指定 Provider 的官方服务状态
 * @param source - 官方状态来源
 * @returns 官方状态检查结果
 */
export async function checkOfficialStatus(
  source: OfficialStatusSource
): Promise<OfficialStatusResult> {
  const checkedAt = new Date().toISOString();

  switch (source) {
    case "openai":
      return checkOpenAIStatus();

    case "anthropic":
      return checkAnthropicStatus();

    default:
      return {
        status: "unknown",
        message: "不支持的官方状态来源",
        checkedAt,
      };
  }
}

/**
 * 批量检查所有 Provider 的官方状态
 * @param sources - 官方状态来源列表
 * @returns Provider 类型到状态结果的映射
 */
export async function checkAllOfficialStatuses(
  sources: OfficialStatusSource[]
): Promise<Map<OfficialStatusSource, OfficialStatusResult>> {
  const results = await Promise.all(
    sources.map(async (source) => {
      const result = await checkOfficialStatus(source);
      return [source, result] as const;
    })
  );

  return new Map(results);
}
