import type { Component } from 'svelte';

export interface ChangelogMetadata {
  title: string;
  date: string;
}

export interface ChangelogModule {
  default: Component;
  metadata?: unknown;
}

export interface ChangelogEntry extends ChangelogMetadata {
  id: string;
  component: Component;
}

const modules = import.meta.glob<ChangelogModule>('./*.svx', { eager: true });

function fail(source: string, message: string): never {
  throw new Error(`[changelog] ${source}: ${message}`);
}

function validateDate(value: unknown, source: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return fail(source, 'date 必须是 YYYY-MM-DD');
  const [year, month, day] = value.split('-').map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return fail(source, 'date 不是有效日期');
  return value;
}

function validateModule(source: string, module: ChangelogModule): ChangelogEntry {
  if (!module || typeof module !== 'object' || typeof module.default !== 'function')
    fail(source, '缺少可渲染的 Markdown component');
  if (!module.metadata || typeof module.metadata !== 'object' || Array.isArray(module.metadata))
    fail(source, '缺少 frontmatter metadata');
  const metadata = module.metadata as Record<string, unknown>;
  if (typeof metadata.title !== 'string' || !metadata.title.trim())
    fail(source, 'title 必须是非空字符串');
  return {
    id: source.replace(/^\.\//, '').replace(/\.svx$/, ''),
    title: metadata.title.trim(),
    date: validateDate(metadata.date, source),
    component: module.default
  };
}

export function collectChangelogEntries(
  sourceModules: Record<string, ChangelogModule>
): ChangelogEntry[] {
  return Object.entries(sourceModules)
    .map(([source, module]) => validateModule(source, module))
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

export const changelogEntries = collectChangelogEntries(modules);
