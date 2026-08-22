import type { EndgameMode, ResolvedMazeBuff } from '../../src/lib/domain/endgame.js';
import type { TextResolver, TextSource } from './localization.js';
import { decimalOf } from './decimal.js';
import { hashOf } from './raw.js';
import { formatGameMarkup } from './text.js';

export interface MazeBuffRow {
  ID: number;
  Lv?: number;
  BuffName?: unknown;
  BuffDesc?: unknown;
  ParamList?: unknown[];
  BuffIcon?: string;
  InBattleBindingKey?: string;
}

export interface MazeBuffDiagnosticContext {
  mode?: EndgameMode;
  groupId?: number;
  configId?: number;
  mazeBuffId?: number;
  table?: string;
  field?: string;
  arrayIndex?: number;
  [key: string]: string | number | undefined;
}

export interface MazeBuffIssueSink {
  fail(code: string, message: string, context: MazeBuffDiagnosticContext): never;
  warn(code: string, message: string, context: MazeBuffDiagnosticContext): void;
}

export interface MazeBuffResolutionAudit {
  distinctReferenced: number;
  resolved: number;
  displayReady: number;
  missingLocalization: number;
  missingIconPath: number;
  missingDescriptionParams: number;
  unusedParams: number;
}

export interface MazeBuffResolveRequest {
  context: MazeBuffDiagnosticContext;
  requireDisplay: boolean;
}

export interface MazeBuffResolver {
  resolve(id: number, request: MazeBuffResolveRequest): ResolvedMazeBuff;
  getAudit(): MazeBuffResolutionAudit;
}

function groupRows(rows: readonly MazeBuffRow[]): Map<number, MazeBuffRow[]> {
  const result = new Map<number, MazeBuffRow[]>();
  for (const row of rows) result.set(row.ID, [...(result.get(row.ID) ?? []), row]);
  return result;
}

function textSource(id: number, field: string): TextSource {
  return { entity: 'MazeBuff', id: String(id), field };
}

export function createMazeBuffResolver(
  rows: readonly MazeBuffRow[],
  text: TextResolver,
  issues: MazeBuffIssueSink
): MazeBuffResolver {
  const rowsById = groupRows(rows);
  const cache = new Map<number, ResolvedMazeBuff>();
  const referencedIds = new Set<number>();
  const resolvedIds = new Set<number>();
  const displayReadyIds = new Set<number>();
  const missingLocalizationIds = new Set<number>();
  const missingIconIds = new Set<number>();
  const missingParamIds = new Set<number>();
  const unusedParamIds = new Set<number>();

  const build = (id: number, context: MazeBuffDiagnosticContext): ResolvedMazeBuff => {
    const matches = (rowsById.get(id) ?? []).filter((row) => Number(row.Lv ?? 1) === 1);
    if (matches.length !== 1)
      issues.fail(
        matches.length ? 'ambiguous-maze-buff-level' : 'unresolved-maze-buff',
        matches.length
          ? '被引用的 MazeBuff 必须恰好存在一条 Lv=1 记录'
          : '被引用的 MazeBuff ID 无法解析',
        { ...context, mazeBuffId: id, levelOneRows: matches.length }
      );
    const row = matches[0];
    const params = (row.ParamList ?? []).map((value, index) => {
      try {
        return decimalOf(value, `MazeBuff ${id}.ParamList[${index}]`);
      } catch (error) {
        return issues.fail(
          'invalid-maze-buff-param',
          error instanceof Error ? error.message : 'MazeBuff 参数无法解析',
          { ...context, mazeBuffId: id, arrayIndex: index }
        );
      }
    });
    const name = text.resolveRef(row.BuffName, textSource(id, 'BuffName')) || undefined;
    const rawDescription = text.resolveRef(row.BuffDesc, textSource(id, 'BuffDesc')) || undefined;
    const formatted = rawDescription
      ? formatGameMarkup(
          rawDescription,
          params.map((value) => Number(value))
        )
      : undefined;
    if (formatted?.diagnostics.length) {
      missingParamIds.add(id);
      const diagnostic = formatted.diagnostics[0];
      issues.fail('invalid-maze-buff-placeholder', 'MazeBuff 描述参数无法完整插值', {
        ...context,
        mazeBuffId: id,
        placeholder: diagnostic.placeholder,
        parameterIndex: diagnostic.parameterIndex
      });
    }
    if (formatted) {
      const used = new Set(formatted.usedParameterIndexes);
      if (params.some((_, index) => !used.has(index))) {
        unusedParamIds.add(id);
        issues.warn('unused-maze-buff-param', 'MazeBuff 存在未被描述使用的尾随参数', {
          ...context,
          mazeBuffId: id
        });
      }
    }
    if (!name || !formatted?.text) {
      missingLocalizationIds.add(id);
      issues.warn('missing-maze-buff-localization', 'MazeBuff 缺少可解析的名称或描述', {
        ...context,
        mazeBuffId: id
      });
    } else displayReadyIds.add(id);
    if (!row.BuffIcon) {
      missingIconIds.add(id);
      issues.warn('missing-maze-buff-icon-path', 'MazeBuff 缺少上游 icon path', {
        ...context,
        mazeBuffId: id
      });
    }
    const nameHash = hashOf(row.BuffName);
    const descriptionHash = hashOf(row.BuffDesc);
    const result: ResolvedMazeBuff = {
      id,
      ...(name ? { name } : {}),
      ...(nameHash ? { nameHash } : {}),
      ...(formatted?.text ? { description: formatted.text } : {}),
      ...(descriptionHash ? { descriptionHash } : {}),
      params,
      ...(row.BuffIcon ? { upstreamIconPath: row.BuffIcon } : {}),
      ...(row.InBattleBindingKey ? { bindingKey: row.InBattleBindingKey } : {})
    };
    resolvedIds.add(id);
    return result;
  };

  return {
    resolve(id, request) {
      referencedIds.add(id);
      const resolved = cache.get(id) ?? build(id, request.context);
      cache.set(id, resolved);
      if (request.requireDisplay && (!resolved.name || !resolved.description))
        issues.fail('maze-buff-not-display-ready', '玩家展示关系缺少完整 MazeBuff 文本', {
          ...request.context,
          mazeBuffId: id
        });
      return resolved;
    },
    getAudit: () => ({
      distinctReferenced: referencedIds.size,
      resolved: resolvedIds.size,
      displayReady: displayReadyIds.size,
      missingLocalization: missingLocalizationIds.size,
      missingIconPath: missingIconIds.size,
      missingDescriptionParams: missingParamIds.size,
      unusedParams: unusedParamIds.size
    })
  };
}
