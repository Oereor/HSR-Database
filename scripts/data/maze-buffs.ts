import type { EndgameMode, ResolvedMazeBuff } from '../../src/lib/domain/endgame.js';
import { decimalOf } from './decimal.js';
import { hashOf } from './raw.js';
import { parameterized, textSource } from './domain/shared.js';

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

export function createMazeBuffResolver(
  rows: readonly MazeBuffRow[],
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
    const nameSource = textSource(row.BuffName);
    const descriptionSource = parameterized(row.BuffDesc, row.ParamList);
    if (!nameSource || !descriptionSource) {
      missingLocalizationIds.add(id);
      issues.warn('missing-maze-buff-text-reference', 'MazeBuff 缺少可解析的名称或描述 TextRef', {
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
      ...(nameSource ? { nameSource } : {}),
      ...(descriptionSource ? { descriptionSource } : {}),
      ...(nameHash ? { nameHash } : {}),
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
      if (request.requireDisplay && (!resolved.nameSource || !resolved.descriptionSource))
        issues.fail('maze-buff-text-reference-missing', '玩家展示关系缺少完整 MazeBuff TextRef', {
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
