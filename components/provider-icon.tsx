"use client";

import {Anthropic, Gemini, OpenAI, XAI, Zhipu} from "@lobehub/icons";
import {Bot} from "lucide-react";
import type {Provider} from "@/lib/types";
import {cn} from "@/lib/utils";

const ICON_MAP: Record<string, React.ComponentType<{className?: string; size?: number}>> = {
  openai: OpenAI, gemini: Gemini, anthropic: Anthropic, xai: XAI, zhipu: Zhipu,
};

export function ProviderIcon({provider, className, size = 18}: {
  provider: Provider;
  className?: string;
  size?: number;
}) {
  const iconKey = provider.icon ?? "";
  const Icon = Object.hasOwn(ICON_MAP, iconKey) ? ICON_MAP[iconKey] : Bot;
  return <Icon className={cn("shrink-0", className)} size={size} />;
}
