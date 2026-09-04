import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assertDataRoot, auditRoot } from './paths.js';
import { readTable } from './raw.js';
import { syncData } from './sync.js';

const root = assertDataRoot();
await syncData();

const tables = {
  characters: await readTable<any>(root, 'AvatarConfig'),
  servants: await readTable<any>(root, 'AvatarServantConfig'),
  lightCones: await readTable<any>(root, 'EquipmentConfig'),
  relicSets: await readTable<any>(root, 'RelicSetConfig'),
  enemies: await readTable<any>(root, 'MonsterTemplateConfig')
};
const latest = JSON.parse(await readFile(path.join(auditRoot, 'latest.json'), 'utf8')) as Record<
  string,
  unknown
>;
const { routes, ...auditData } = latest;
const report = {
  sourceRoot: root,
  ...auditData,
  routeCounts: Object.fromEntries(
    Object.entries(routes as Record<string, unknown[]>).map(([category, ids]) => [
      category,
      ids.length
    ])
  ),
  duplicateIds: {
    characters: duplicate(tables.characters.map((row) => row.AvatarID)),
    servants: duplicate(tables.servants.map((row) => row.ServantID)),
    lightCones: duplicate(tables.lightCones.map((row) => row.EquipmentID)),
    relicSets: duplicate(tables.relicSets.map((row) => row.SetID)),
    enemies: duplicate(tables.enemies.map((row) => row.MonsterTemplateID))
  }
};
await mkdir(auditRoot, { recursive: true });
await writeFile(path.join(auditRoot, 'audit.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(
  JSON.stringify(
    {
      sourceCommit: auditData.sourceCommit,
      counts: auditData.counts,
      endgame: auditData.endgameAudit,
      missingTextAudit: Object.fromEntries(
        Object.entries(auditData.missingTextAudit as Record<string, { count: number }>).map(
          ([category, summary]) => [category, summary.count]
        )
      ),
      duplicateIds: report.duplicateIds
    },
    null,
    2
  )
);

function duplicate(ids: Array<string | number>): Array<string | number> {
  const seen = new Set<string | number>();
  const duplicates = new Set<string | number>();
  for (const id of ids) (seen.has(id) ? duplicates : seen).add(id);
  return [...duplicates];
}
