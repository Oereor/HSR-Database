type RawRecord = Record<string, unknown>;

export type AvatarSpecialSkillDiagnosticCode =
  | 'malformed-relation'
  | 'duplicate-relation'
  | 'conflicting-relation'
  | 'unknown-avatar'
  | 'unresolved-show-skill'
  | 'unowned-show-skill'
  | 'missing-anchor'
  | 'ambiguous-anchor';

export interface AvatarSpecialSkillDiagnostic {
  code: AvatarSpecialSkillDiagnosticCode;
  identity: string;
  detail: string;
}

export interface AvatarSpecialSkillTreeAudit {
  diagnostics: AvatarSpecialSkillDiagnostic[];
}

export interface NormalizedAvatarSpecialSkillRelation {
  avatarId: string;
  anchorType: string;
  showSkillId: string;
  sourceOrder: number;
}

export interface AvatarSpecialSkillResolutionContext {
  avatarConfigsById: ReadonlyMap<string, RawRecord>;
  avatarSkillIds: ReadonlySet<string>;
  traceRowsByAvatarId: ReadonlyMap<string, RawRecord[]>;
}

export function createAvatarSpecialSkillTreeAudit(): AvatarSpecialSkillTreeAudit {
  return { diagnostics: [] };
}

export function recordAvatarSpecialSkillDiagnostic(
  audit: AvatarSpecialSkillTreeAudit,
  diagnostic: AvatarSpecialSkillDiagnostic
): void {
  audit.diagnostics.push(diagnostic);
}

function positiveIntegerId(value: unknown): string | undefined {
  const id = String(value ?? '');
  return /^\d+$/.test(id) && Number(id) > 0 ? id : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function normalizeAvatarSpecialSkillRelations(
  rows: RawRecord[],
  audit = createAvatarSpecialSkillTreeAudit()
): NormalizedAvatarSpecialSkillRelation[] {
  const candidates: NormalizedAvatarSpecialSkillRelation[] = [];
  for (const [sourceOrder, row] of rows.entries()) {
    const avatarId = positiveIntegerId(row.AvatarID);
    const anchorType = nonEmptyString(row.AnchorType);
    const showSkillId = positiveIntegerId(row.ShowSkill);
    const identity = avatarId && anchorType ? `${avatarId}:${anchorType}` : `row:${sourceOrder}`;
    if (!avatarId || !anchorType || !showSkillId) {
      recordAvatarSpecialSkillDiagnostic(audit, {
        code: 'malformed-relation',
        identity,
        detail: 'AvatarID、AnchorType 或 ShowSkill 格式无效，已跳过'
      });
      continue;
    }
    candidates.push({ avatarId, anchorType, showSkillId, sourceOrder });
  }

  const byAnchor = new Map<string, NormalizedAvatarSpecialSkillRelation[]>();
  for (const relation of candidates) {
    const identity = `${relation.avatarId}:${relation.anchorType}`;
    byAnchor.set(identity, [...(byAnchor.get(identity) ?? []), relation]);
  }

  const collapsed = [...byAnchor.entries()].flatMap(([identity, relations]) => {
    if (relations.length === 1) return relations;
    const showSkillIds = new Set(relations.map((relation) => relation.showSkillId));
    if (showSkillIds.size > 1) {
      recordAvatarSpecialSkillDiagnostic(audit, {
        code: 'conflicting-relation',
        identity,
        detail: `同一 AvatarID + AnchorType 指向 ${showSkillIds.size} 个 ShowSkill，已全部跳过`
      });
      return [];
    }
    recordAvatarSpecialSkillDiagnostic(audit, {
      code: 'duplicate-relation',
      identity,
      detail: `完全重复 ${relations.length} 次，已保留首条`
    });
    return [relations[0]];
  });

  const seenSkills = new Set<string>();
  return collapsed
    .sort((a, b) => a.sourceOrder - b.sourceOrder)
    .filter((relation) => {
      const identity = `${relation.avatarId}:${relation.showSkillId}`;
      if (!seenSkills.has(identity)) {
        seenSkills.add(identity);
        return true;
      }
      recordAvatarSpecialSkillDiagnostic(audit, {
        code: 'duplicate-relation',
        identity,
        detail: '同一 Avatar 的 ShowSkill 通过多个 AnchorType 重复引用，已保留首条'
      });
      return false;
    });
}

export function resolveAvatarSpecialSkillRelations(
  relations: NormalizedAvatarSpecialSkillRelation[],
  context: AvatarSpecialSkillResolutionContext,
  audit: AvatarSpecialSkillTreeAudit
): NormalizedAvatarSpecialSkillRelation[] {
  return relations.filter((relation) => {
    const relationIdentity = `${relation.avatarId}:${relation.anchorType}:${relation.showSkillId}`;
    const avatar = context.avatarConfigsById.get(relation.avatarId);
    if (!avatar) {
      recordAvatarSpecialSkillDiagnostic(audit, {
        code: 'unknown-avatar',
        identity: relationIdentity,
        detail: `AvatarID ${relation.avatarId} 无法解析，已跳过`
      });
      return false;
    }
    if (!context.avatarSkillIds.has(relation.showSkillId)) {
      recordAvatarSpecialSkillDiagnostic(audit, {
        code: 'unresolved-show-skill',
        identity: relationIdentity,
        detail: `ShowSkill ${relation.showSkillId} 无法从完整 Avatar Skill 索引解析，已跳过`
      });
      return false;
    }
    const avatarSkillIds = new Set(
      (Array.isArray(avatar.SkillList) ? avatar.SkillList : []).map(String)
    );
    if (!avatarSkillIds.has(relation.showSkillId)) {
      recordAvatarSpecialSkillDiagnostic(audit, {
        code: 'unowned-show-skill',
        identity: relationIdentity,
        detail: `Avatar ${relation.avatarId} 的 SkillList 不包含 ShowSkill ${relation.showSkillId}，已跳过`
      });
      return false;
    }

    const matchingPointIds = new Set(
      (context.traceRowsByAvatarId.get(relation.avatarId) ?? [])
        .filter((row) => row.AnchorType === relation.anchorType)
        .map((row) => positiveIntegerId(row.PointID))
        .filter((pointId): pointId is string => !!pointId)
    );
    if (!matchingPointIds.size) {
      recordAvatarSpecialSkillDiagnostic(audit, {
        code: 'missing-anchor',
        identity: relationIdentity,
        detail: `Avatar ${relation.avatarId} 没有 AnchorType ${relation.anchorType} 的 SkillTree point，已跳过`
      });
      return false;
    }
    if (matchingPointIds.size > 1) {
      recordAvatarSpecialSkillDiagnostic(audit, {
        code: 'ambiguous-anchor',
        identity: relationIdentity,
        detail: `Avatar ${relation.avatarId} 的 AnchorType ${relation.anchorType} 匹配多个 SkillTree point，已跳过`
      });
      return false;
    }
    return true;
  });
}

export function indexAvatarSpecialSkillRelations(
  relations: NormalizedAvatarSpecialSkillRelation[]
): Map<string, NormalizedAvatarSpecialSkillRelation[]> {
  const result = new Map<string, NormalizedAvatarSpecialSkillRelation[]>();
  for (const relation of relations)
    result.set(relation.avatarId, [...(result.get(relation.avatarId) ?? []), relation]);
  return result;
}
