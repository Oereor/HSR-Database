import { createDeepSeek } from '@ai-sdk/deepseek';
import type { LanguageModel } from 'ai';

export const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-flash';

export class AgentConfigurationError extends Error {
  readonly code = 'AGENT_CONFIGURATION_ERROR';

  constructor(message: string) {
    super(message);
    this.name = 'AgentConfigurationError';
  }
}

export function createDeepSeekModelFromEnv(
  environment: NodeJS.ProcessEnv = process.env
): LanguageModel {
  const apiKey = environment.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) throw new AgentConfigurationError('DEEPSEEK_API_KEY is missing');

  const baseURL = environment.DEEPSEEK_BASE_URL?.trim() || DEFAULT_DEEPSEEK_BASE_URL;
  let parsed: URL;
  try {
    parsed = new URL(baseURL);
  } catch {
    throw new AgentConfigurationError('DEEPSEEK_BASE_URL is invalid');
  }
  if (!['http:', 'https:'].includes(parsed.protocol))
    throw new AgentConfigurationError('DEEPSEEK_BASE_URL must use http or https');

  const provider = createDeepSeek({ apiKey, baseURL: parsed.toString().replace(/\/$/, '') });
  return provider(environment.DEEPSEEK_MODEL?.trim() || DEFAULT_DEEPSEEK_MODEL);
}
