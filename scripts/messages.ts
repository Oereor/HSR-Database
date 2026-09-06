import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parse } from 'lossless-json';
import { compile } from '@inlang/paraglide-js';
import options from '../paraglide.config.js';
import { getGeneratedLocales, type Locale } from './data/locale-registry.js';

export type SiteMessageCatalog = Record<string, string>;
export type SiteMessageCatalogs = Record<Locale, SiteMessageCatalog>;

function messageParameters(value: string, key: string): string[] {
  const parameters = [
    ...new Set([...value.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)].map((match) => match[1]))
  ].sort();
  if (/[{}]/.test(value.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, '')))
    throw new Error(`Invalid message parameter syntax: ${key}`);
  return parameters;
}

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
    const params = messageParameters(value, key);
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
  const settings = JSON.parse(
    await readFile(new URL('../project.inlang/settings.json', import.meta.url), 'utf8')
  ) as { baseLocale?: unknown; locales?: unknown };
  const expectedLocales = getGeneratedLocales().map(({ siteMessageLocale }) => siteMessageLocale);
  if (
    settings.baseLocale !== 'zh-CN' ||
    !Array.isArray(settings.locales) ||
    JSON.stringify(settings.locales) !== JSON.stringify(expectedLocales)
  )
    throw new Error(
      `Site-message locales must match generated locales: ${expectedLocales.join(', ')}`
    );
  const catalogs = Object.fromEntries(
    await Promise.all(
      expectedLocales.map(async (locale) => [
        locale,
        validateMessageSource(
          await readFile(new URL(`../messages/${locale}.json`, import.meta.url), 'utf8'),
          required
        )
      ])
    )
  ) as SiteMessageCatalogs;
  const base = catalogs['zh-CN'];
  const differences: string[] = [];
  for (const locale of expectedLocales.filter((locale) => locale !== 'zh-CN') as Locale[]) {
    const target = catalogs[locale];
    const baseKeys = Object.keys(base).sort();
    const targetKeys = Object.keys(target).sort();
    const missingInTarget = baseKeys.filter((key) => !(key in target));
    const extraInTarget = targetKeys.filter((key) => !(key in base));
    if (extraInTarget.length) differences.push(`missing in zh-CN: ${extraInTarget.join(', ')}`);
    if (missingInTarget.length) differences.push(`extra in zh-CN: ${missingInTarget.join(', ')}`);
    if (missingInTarget.length)
      differences.push(`missing in ${locale}: ${missingInTarget.join(', ')}`);
    if (extraInTarget.length) differences.push(`extra in ${locale}: ${extraInTarget.join(', ')}`);
    for (const key of baseKeys.filter((key) => key in target)) {
      const baseParams = messageParameters(base[key], key);
      const targetParams = messageParameters(target[key], key);
      if (JSON.stringify(baseParams) !== JSON.stringify(targetParams))
        differences.push(
          `placeholder mismatch ${key}: zh-CN={${baseParams.join(',')}} ${locale}={${targetParams.join(',')}}`
        );
    }
  }
  if (differences.length)
    throw new Error(`Site-message locale parity failed:\n${differences.join('\n')}`);
  return catalogs;
}
export async function compileSiteMessages() {
  const catalogs = await validateSiteMessageFiles();
  await compile(options);
  console.log(
    `Site messages: ${Object.keys(catalogs['zh-CN']).length} messages across ${Object.keys(catalogs).length} locales validated and compiled`
  );
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await compileSiteMessages();
