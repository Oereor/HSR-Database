import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EndgameMode, EndgameModeDataset } from '../../src/lib/domain/endgame';
import {
  buildAnomalyArbitrationLocalNavigation,
  buildApocalypticShadowLocalNavigation,
  buildMocLocalNavigation,
  buildPureFictionLocalNavigation
} from '../../src/lib/domain/endgame-navigation';
import { buildGroupView, buildPeriodView } from '../../src/lib/domain/endgame-view';

const generatedRoot = path.resolve('src', 'lib', 'generated');

async function groupView(mode: EndgameMode, groupId: number) {
  const dataset = JSON.parse(
    await readFile(path.join(generatedRoot, 'endgame', `${mode}.json`), 'utf8')
  ) as EndgameModeDataset;
  const group = dataset.groups.find((candidate) => candidate.groupId === groupId)!;
  return buildGroupView(group, [buildPeriodView(group)], new Map());
}

describe('Endgame local navigation presentation', () => {
  it('MoC 生成 01–12 并保留 query route', async () => {
    const view = await groupView('moc', 1034);
    if (view.mode !== 'moc') throw new Error('MoC view mode 不匹配');
    const navigation = buildMocLocalNavigation(view.encounters, '5312');
    expect(navigation.sections[0].items.map((item) => item.label)).toEqual([
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
      '07',
      '08',
      '09',
      '10',
      '11',
      '12'
    ]);
    expect(navigation.currentLabel).toBe('关卡 12');
    expect(navigation.sections[0].items.at(-1)).toMatchObject({
      href: '?encounter=5312',
      current: true
    });
  });

  it('PF 与 AS 生成独立的难度 1–4 navigation', async () => {
    const pureFiction = await groupView('pf', 2025);
    const shadow = await groupView('as', 3020);
    if (pureFiction.mode !== 'pf' || shadow.mode !== 'as')
      throw new Error('Endgame view mode 不匹配');
    const pfNavigation = buildPureFictionLocalNavigation(pureFiction.encounters, '20254');
    const asNavigation = buildApocalypticShadowLocalNavigation(shadow.encounters, '30204');
    for (const navigation of [pfNavigation, asNavigation]) {
      expect(navigation.sections[0].items.map((item) => item.label)).toEqual([
        '难度 1',
        '难度 2',
        '难度 3',
        '难度 4'
      ]);
      expect(navigation.sections[0].items.at(-1)?.current).toBe(true);
      expect(navigation.currentLabel).toBe('难度 4');
    }
  });

  it('AA 保留骑士与王棋分组以及 normal/hard ownership', async () => {
    const view = await groupView('aa', 8);
    if (view.mode !== 'aa') throw new Error('AA view mode 不匹配');
    const navigation = buildAnomalyArbitrationLocalNavigation(view.encounters, '804:hard');
    expect(navigation.sections.map((section) => section.label)).toEqual(['骑士', '王棋']);
    expect(navigation.sections.map((section) => section.items.length)).toEqual([3, 2]);
    expect(navigation.sections[1].items.map((item) => item.label)).toEqual([
      '将杀王棋',
      '将杀王棋•绝境'
    ]);
    expect(navigation.sections[1].items[1]).toMatchObject({
      href: '?encounter=804%3Ahard',
      current: true
    });
    expect(navigation.currentLabel).toBe('将杀王棋•绝境');
  });
});
