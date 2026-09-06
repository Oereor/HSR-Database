import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parse } from 'lossless-json';
import { compile } from '@inlang/paraglide-js';
import options from '../paraglide.config.js';

export function validateMessageSource(
  source: string,
  required: Record<string, string[]>
): Record<string, string> {
  // Unlike JSON.parse, this rejects duplicate keys rather than silently keeping the last.
  const parsed = parse(source);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('Messages must be a JSON object');
  const messages = parsed as Record<string, unknown>;
  for (const [key, value] of Object.entries(messages)) {
    if (!/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(key) || typeof value !== 'string' || !value.trim())
      throw new Error(`Invalid site message: ${key}`);
    const params = [
      ...new Set([...value.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)].map((match) => match[1]))
    ].sort();
    if (/[{}]/.test(value.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, '')))
      throw new Error(`Invalid message parameter syntax: ${key}`);
    if (required[key] && JSON.stringify(params) !== JSON.stringify([...required[key]].sort()))
      throw new Error(`Message parameter contract changed: ${key}`);
  }
  for (const key of Object.keys(required))
    if (!(key in messages)) throw new Error(`Missing required message: ${key}`);
  return messages as Record<string, string>;
}

export async function validateSiteMessageFiles() {
  const required = JSON.parse(
    await readFile(new URL('../messages/contracts.json', import.meta.url), 'utf8')
  );
  const source = await readFile(new URL('../messages/zh-CN.json', import.meta.url), 'utf8');
  const messages = validateMessageSource(source, required);
  const settings = JSON.parse(
    await readFile(new URL('../project.inlang/settings.json', import.meta.url), 'utf8')
  );
  if (settings.baseLocale !== 'zh-CN' || JSON.stringify(settings.locales) !== '["zh-CN"]')
    throw new Error('Phase 1 site messages must remain zh-CN only');
  return messages;
}
export async function compileSiteMessages() {
  const messages = await validateSiteMessageFiles();
  await compile(options);
  console.log(
    `Site messages: ${Object.keys(messages).length} zh-CN messages validated and compiled`
  );
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await compileSiteMessages();
