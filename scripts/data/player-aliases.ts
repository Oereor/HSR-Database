import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import {
  validatePlayerAliases,
  type CharacterNameSnapshot,
  type PlayerAliasMetadata
} from '../../src/lib/search/name-metadata.js';
import { compareSearchText } from '../../src/lib/search/normalization.js';
import { siteRoot } from './paths.js';
import { officialSnapshotPath } from './search-names.js';

export const playerAliasesPath = path.join(siteRoot, 'data/search/character-player-aliases.json');

/** Production coverage is separate from the existing per-entry alias validation semantics. */
export function assertCompletePlayerAliasSkeleton(
  aliases: PlayerAliasMetadata,
  official: CharacterNameSnapshot
): void {
  const missing = Object.keys(official.characters)
    .filter((id) => !Object.hasOwn(aliases.characters, id))
    .sort(compareSearchText);
  if (missing.length)
    throw new Error(
      `Player alias metadata 缺少 searchable Character IDs：${missing.join(', ')}。请运行 pnpm data:player-aliases:sync`
    );
}

export function serializePlayerAliases(aliases: PlayerAliasMetadata): string {
  // Explicit serialization also preserves codepoint order for IDs with different lengths.
  const entries = Object.keys(aliases.characters)
    .sort(compareSearchText)
    .map(
      (id) =>
        `    ${JSON.stringify(id)}: ${JSON.stringify(aliases.characters[id], null, 2).replaceAll('\n', '\n    ')}`
    );
  return `{\n  "schemaVersion": 1,\n  "characters": {${entries.length ? `\n${entries.join(',\n')}\n  ` : ''}}\n}\n`;
}

/** Insert only new properties; existing tokens, whitespace and escape spelling remain untouched. */
function insertMissingIds(current: string, missing: string[]): string {
  const newline = current.includes('\r\n') ? '\r\n' : '\n';
  let next = current;
  for (const id of missing.sort(compareSearchText)) {
    const source = ts.parseJsonText('player-aliases.json', next);
    const statement = source.statements[0];
    if (
      !statement ||
      !ts.isExpressionStatement(statement) ||
      !ts.isObjectLiteralExpression(statement.expression)
    )
      throw new Error('无法定位 player alias JSON 根对象；文件未修改。');
    const property = statement.expression.properties.find(
      (entry) =>
        ts.isPropertyAssignment(entry) &&
        ts.isStringLiteral(entry.name) &&
        entry.name.text === 'characters'
    );
    if (
      !property ||
      !ts.isPropertyAssignment(property) ||
      !ts.isObjectLiteralExpression(property.initializer)
    )
      throw new Error('无法定位 characters 对象；文件未修改。');
    const object = property.initializer;
    const properties = object.properties.filter(ts.isPropertyAssignment);
    const indentAt = (position: number) =>
      next.slice(next.lastIndexOf('\n', position - 1) + 1, position).match(/^[\t ]*/)?.[0] ?? '';
    const indent = properties.length
      ? indentAt(properties[0].getStart(source)) || '    '
      : `${indentAt(property.getStart(source))}  `;
    const entry = `${JSON.stringify(id)}: {${newline}${indent}  "playerAliases": []${newline}${indent}}`;
    const successor = properties.find(
      (item) => ts.isStringLiteral(item.name) && compareSearchText(item.name.text, id) > 0
    );
    let position: number;
    let insertion: string;
    if (successor) {
      position = successor.getStart(source);
      insertion = `${entry},${newline}${indent}`;
    } else if (properties.length) {
      position = properties[properties.length - 1].end;
      insertion = `,${newline}${indent}${entry}`;
    } else {
      position = object.getStart(source) + 1;
      insertion = `${newline}${indent}${entry}${newline}${indentAt(property.getStart(source))}`;
    }
    next = next.slice(0, position) + insertion + next.slice(position);
  }
  return next;
}

export async function syncPlayerAliasSkeleton(
  files = { official: officialSnapshotPath, aliases: playerAliasesPath }
): Promise<boolean> {
  const official = JSON.parse(await readFile(files.official, 'utf8')) as CharacterNameSnapshot;
  if (
    official.schemaVersion !== 1 ||
    !official.characters ||
    typeof official.characters !== 'object' ||
    Array.isArray(official.characters) ||
    Object.keys(official.characters).some((id) => !/^\d+$/.test(id))
  )
    throw new Error('官方名称快照无效；请运行 pnpm data:search-names:update');
  const current = await readFile(files.aliases, 'utf8');
  const raw = JSON.parse(current) as PlayerAliasMetadata;
  // Diagnose removed IDs without deleting or rewriting any human-maintained data.
  if (
    raw &&
    raw.characters &&
    typeof raw.characters === 'object' &&
    !Array.isArray(raw.characters)
  ) {
    const stale = Object.keys(raw.characters)
      .filter((id) => !Object.hasOwn(official.characters, id))
      .sort(compareSearchText);
    if (stale.length)
      throw new Error(
        `Player alias metadata 包含已不存在或非法的 Character IDs：${stale.join(', ')}。请人工审阅；文件未修改。`
      );
  }
  validatePlayerAliases(raw, official);
  const missing = Object.keys(official.characters).filter(
    (id) => !Object.hasOwn(raw.characters, id)
  );
  if (!missing.length) return false;
  const next = insertMissingIds(current, missing);
  assertCompletePlayerAliasSkeleton(validatePlayerAliases(JSON.parse(next), official), official);
  await writeFile(files.aliases, next, 'utf8');
  console.log(
    `Player alias skeleton 已同步：新增 ${missing.length} Character IDs，保留已有人工 aliases。`
  );
  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename))
  await syncPlayerAliasSkeleton();
