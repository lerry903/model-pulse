/** Protocol adapters are code; suppliers are maintained in check_providers. */
export const API_PROTOCOLS = [
  "openai_chat",
  "openai_responses",
  "openai_compatible",
  "anthropic_messages",
  "gemini_native",
] as const;

export type ApiProtocol = typeof API_PROTOCOLS[number];
export type OfficialStatusSource = "openai" | "anthropic";

export interface Provider {
  id: string;
  name: string;
  icon: string | null;
  officialStatusSource: OfficialStatusSource | null;
}

export interface ProviderConfig {
  id: string;
  name: string;
  provider: Provider;
  protocol: ApiProtocol;
  endpoint: string;
  model: string;
  apiKey: string;
  is_maintenance: boolean;
  requestHeaders?: Record<string, string> | null;
  metadata?: Record<string, unknown> | null;
  groupName?: string | null;
}
