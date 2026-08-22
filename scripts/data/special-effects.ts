type RawRecord = Record<string, unknown>;

export type SpecialEffectLinkSource = 'AvatarSkillLink' | 'AvatarServantSkillLink';

export type SpecialEffectDiagnosticCode =
  | 'malformed-relation'
  | 'duplicate-target-id'
  | 'duplicate-relation'
  | 'conflicting-relation'
  | 'duplicate-order'
  | 'unresolved-skill'
  | 'unowned-relation';

export interface SpecialEffectDiagnostic {
  code: SpecialEffectDiagnosticCode;
  source: SpecialEffectLinkSource;
  identity: string;
  detail: string;
}

export interface SpecialEffectAudit {
  diagnostics: SpecialEffectDiagnostic[];
}

export interface NormalizedAvatarSkillLink {
  skillId: string;
  linkedAvatarIds: string[];
  simplifiedLinkedAvatarIds: string[];
  sourceOrder: number;
}

export interface NormalizedServantSkillLink {
  skillId: string;
  linkedAvatarId: string;
  order: number;
  tarotFigurePath: string;
  tarotIconPath: string;
  sourceOrder: number;
}

export interface NormalizedSpecialEffectLinks {
  avatar: NormalizedAvatarSkillLink[];
  servant: NormalizedServantSkillLink[];
  audit: SpecialEffectAudit;
}

export function createSpecialEffectAudit(): SpecialEffectAudit {
  return { diagnostics: [] };
}

export function recordSpecialEffectDiagnostic(
  audit: SpecialEffectAudit,
  diagnostic: SpecialEffectDiagnostic
): void {
  audit.diagnostics.push(diagnostic);
}

export function resolveSpecialEffectSkillLinks<T extends { skillId: string }>(
  links: T[],
  source: SpecialEffectLinkSource,
  knownSkillIds: ReadonlySet<string>,
  audit: SpecialEffectAudit
): T[] {
  return links.filter((link) => {
    if (knownSkillIds.has(link.skillId)) return true;
    recordSpecialEffectDiagnostic(audit, {
      code: 'unresolved-skill',
      source,
      identity: link.skillId,
      detail: `${source} 引用了不存在的 SkillID ${link.skillId}`
    });
    return false;
  });
}

function positiveIntegerId(value: unknown): string | undefined {
  const id = String(value ?? '');
  return /^\d+$/.test(id) && Number(id) > 0 ? id : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function normalizeIdList(
  value: unknown,
  source: SpecialEffectLinkSource,
  identity: string,
  field: string,
  audit: SpecialEffectAudit
): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: string[] = [];
  const seen = new Set<string>();
  for (const rawId of value) {
    const id = positiveIntegerId(rawId);
    if (!id) return undefined;
    if (seen.has(id)) {
      recordSpecialEffectDiagnostic(audit, {
        code: 'duplicate-target-id',
        source,
        identity,
        detail: `${field} 重复引用 Avatar ${id}`
      });
      continue;
    }
    seen.add(id);
    result.push(id);
  }
  return result;
}

function collapseRelations<T extends { sourceOrder: number }>(
  rows: T[],
  source: SpecialEffectLinkSource,
  identityOf: (row: T) => string,
  signatureOf: (row: T) => string,
  audit: SpecialEffectAudit
): T[] {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const identity = identityOf(row);
    grouped.set(identity, [...(grouped.get(identity) ?? []), row]);
  }

  return [...grouped.entries()].flatMap(([identity, candidates]) => {
    if (candidates.length === 1) return candidates;
    const signatures = new Set(candidates.map(signatureOf));
    if (signatures.size > 1) {
      recordSpecialEffectDiagnostic(audit, {
        code: 'conflicting-relation',
        source,
        identity,
        detail: `同一 relation identity 存在 ${signatures.size} 种冲突内容，已全部跳过`
      });
      return [];
    }
    recordSpecialEffectDiagnostic(audit, {
      code: 'duplicate-relation',
      source,
      identity,
      detail: `完全重复 ${candidates.length} 次，已保留首条`
    });
    return [candidates[0]];
  });
}

export function normalizeSpecialEffectLinks(
  avatarRows: RawRecord[],
  servantRows: RawRecord[],
  audit = createSpecialEffectAudit()
): NormalizedSpecialEffectLinks {
  const avatarCandidates: NormalizedAvatarSkillLink[] = [];
  for (const [sourceOrder, row] of avatarRows.entries()) {
    const fallbackIdentity = `row:${sourceOrder}`;
    const skillId = positiveIntegerId(row.SkillID);
    const identity = skillId ?? fallbackIdentity;
    const linkedAvatarIds = normalizeIdList(
      row.LinkToAvatarIDList,
      'AvatarSkillLink',
      identity,
      'LinkToAvatarIDList',
      audit
    );
    const simplifiedLinkedAvatarIds = normalizeIdList(
      row.LinkToAvatarIDSimplifiedList,
      'AvatarSkillLink',
      identity,
      'LinkToAvatarIDSimplifiedList',
      audit
    );
    if (!skillId || !linkedAvatarIds || !simplifiedLinkedAvatarIds) {
      recordSpecialEffectDiagnostic(audit, {
        code: 'malformed-relation',
        source: 'AvatarSkillLink',
        identity,
        detail: 'SkillID 或 Avatar ID 列表格式无效，已跳过'
      });
      continue;
    }
    avatarCandidates.push({
      skillId,
      linkedAvatarIds,
      simplifiedLinkedAvatarIds,
      sourceOrder
    });
  }

  const servantCandidates: NormalizedServantSkillLink[] = [];
  for (const [sourceOrder, row] of servantRows.entries()) {
    const fallbackIdentity = `row:${sourceOrder}`;
    const skillId = positiveIntegerId(row.SkillID);
    const linkedAvatarId = positiveIntegerId(row.LinkToAvatarID);
    const identity = skillId && linkedAvatarId ? `${skillId}:${linkedAvatarId}` : fallbackIdentity;
    const order = Number(row.Order);
    const tarotFigurePath = nonEmptyString(row.TarotFigurePath);
    const tarotIconPath = nonEmptyString(row.TarotIconPath);
    if (
      !skillId ||
      !linkedAvatarId ||
      !Number.isInteger(order) ||
      order <= 0 ||
      !tarotFigurePath ||
      !tarotIconPath
    ) {
      recordSpecialEffectDiagnostic(audit, {
        code: 'malformed-relation',
        source: 'AvatarServantSkillLink',
        identity,
        detail: 'SkillID、LinkToAvatarID、Order 或 Tarot 路径格式无效，已跳过'
      });
      continue;
    }
    servantCandidates.push({
      skillId,
      linkedAvatarId,
      order,
      tarotFigurePath,
      tarotIconPath,
      sourceOrder
    });
  }

  const avatar = collapseRelations(
    avatarCandidates,
    'AvatarSkillLink',
    (row) => row.skillId,
    (row) => JSON.stringify([row.linkedAvatarIds, row.simplifiedLinkedAvatarIds]),
    audit
  ).sort((a, b) => a.sourceOrder - b.sourceOrder);
  const servant = collapseRelations(
    servantCandidates,
    'AvatarServantSkillLink',
    (row) => `${row.skillId}:${row.linkedAvatarId}`,
    (row) => JSON.stringify([row.order, row.tarotFigurePath, row.tarotIconPath]),
    audit
  ).sort((a, b) => a.order - b.order || a.sourceOrder - b.sourceOrder);

  const servantByOrder = new Map<number, NormalizedServantSkillLink[]>();
  for (const row of servant)
    servantByOrder.set(row.order, [...(servantByOrder.get(row.order) ?? []), row]);
  for (const [order, rows] of servantByOrder)
    if (rows.length > 1)
      recordSpecialEffectDiagnostic(audit, {
        code: 'duplicate-order',
        source: 'AvatarServantSkillLink',
        identity: String(order),
        detail: `${rows.length} 条 relation 使用相同 Order，已按源位置稳定排序`
      });

  return { avatar, servant, audit };
}
