import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import {
  createSkillPreviewControls,
  createTrainingSkillTargets,
  createTrainingTraceSummary
} from '../../src/lib/domain/training/detail-view';
import {
  createDefaultCharacterTrainingTarget,
  calculateCharacterTrainingTarget,
  calculateLightConeTrainingTarget
} from '../../src/lib/domain/training/index';
import type { Character, CatalogEntry } from '../../src/lib/domain/types';
import type {
  CharacterTrainingData,
  LightConeTrainingData,
  TrainingSharedData,
  MaterialCatalog
} from '../../src/lib/domain/training/types';
import SkillCardPanel from '../../src/lib/components/character/SkillCardPanel.svelte';
import TraceCardPanel from '../../src/lib/components/character/TraceCardPanel.svelte';
import TrainingSection from '../../src/lib/components/training/TrainingSection.svelte';
import MaterialCostList from '../../src/lib/components/training/MaterialCostList.svelte';
import DetailPage from '../../src/lib/components/shared/DetailPage.svelte';
import InfoToast from '../../src/lib/components/shared/InfoToast.svelte';
import TrainingTraceSummary from '../../src/lib/components/training/TrainingTraceSummary.svelte';
import TrainingTargetSummary from '../../src/lib/components/training/TrainingTargetSummary.svelte';

vi.mock('$app/stores', async () => {
  const { readable } = await import('svelte/store');
  return { page: readable({ url: new URL('http://localhost/characters/1001/') }) };
});

const json = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8'));
const data = (id: string) =>
  json<CharacterTrainingData>(`static/generated/training/characters/${id}.json`);
const view = (id: string, locale = 'zh-CN') =>
  json<Character>(`src/lib/generated/views/${locale}/details/characters/${id}.json`);

describe('training presentation contracts', () => {
  it('prerenders an empty polite status region before any client notification', () => {
    const html = render(InfoToast).body;
    expect(html).toContain('data-info-toast-region');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-atomic="true"');
    expect(html).not.toMatch(/<button|role="alert"|data-info-toast=/);
  });
  it('places character training and its anchor last when equipment recommendations are absent', () => {
    const html = render(DetailPage, {
      props: { detail: view('1001'), category: 'characters', singular: 'character' }
    }).body;
    const sections = [...html.matchAll(/<section\b[^>]*\bid="([^"]+)"/g)].map((match) => match[1]);
    expect(sections).toEqual(['skills', 'traces', 'eidolons', 'training']);
    const nav = html.match(/<nav\b[^>]*class="[^"]*\bsection-nav\b[^"]*"[\s\S]*?<\/nav>/)![0];
    expect([...nav.matchAll(/href="#([^"]+)"/g)].map((match) => match[1])).toEqual([
      'stats',
      'skills',
      'traces',
      'eidolons',
      'training'
    ]);
  });
  it('maps every actual public progression to its profile, including paid defaults and shared identity', () => {
    const catalog = json<CatalogEntry[]>('src/lib/generated/views/zh-CN/catalogs/characters.json');
    for (const { id } of catalog) {
      const cost = data(id);
      const character = view(id);
      for (const profile of cost.profiles) {
        const cards = (
          profile.enhancedId === 0 ? character.profiles.base : character.profiles.enhanced!
        ).skillCards;
        const controls = createSkillPreviewControls(
          cards,
          profile,
          {},
          {},
          cost.promotions.length - 1
        );
        for (const card of cards)
          for (const progression of card.progressions) {
            const node = profile.nodes.find((node) => node.pointId === progression.id)!;
            if (node.kind === 'skill') {
              expect(controls[progression.id].key).toBe(node.key);
              expect(controls[progression.id].previewLevel).toBe(node.maxLevel);
              expect(controls[progression.id].requiredPromotion).toBeUndefined();
            }
          }
      }
    }
  });
  it('renders two synchronized full-range skill controls with a shared label and promotion tag', () => {
    const cost = data('1510');
    const profile = cost.profiles[0];
    const character = view('1510');
    const controls = createSkillPreviewControls(
      character.profiles.base.skillCards,
      profile,
      { '1510:0:1510004': 12 },
      {},
      4
    );
    expect(controls['1510004']).toMatchObject({
      key: '1510:0:1510004',
      previewLevel: 12,
      jointLabel: true,
      requiredPromotion: 6
    });
    const labels: string[] = [];
    for (const category of ['talent', 'assist']) {
      const card = character.profiles.base.skillCards.find((card) => card.category === category)!;
      const html = render(SkillCardPanel, { props: { card, previewControls: controls } }).body;
      expect(html).toContain('aria-valuenow="12"');
      expect(html).toContain('aria-valuemax="15"');
      expect(html).toContain(`id="skill-progression-${category}-1510004"`);
      expect(html).toContain('data-preview-key="1510:0:1510004"');
      expect(html).toContain('skill-effect-tag');
      labels.push(html.match(/<label[^>]*>([\s\S]*?)<\/label>/)![1]);
    }
    expect(labels[0]).toEqual(labels[1]);
  });
  it('keeps paid traces native, stable and separate from read-only player and fixed nodes', () => {
    const cost = data('1001');
    const profile = cost.profiles[0];
    const traces = view('1001').profiles.base.traces;
    const target = createDefaultCharacterTrainingTarget(cost, 0);
    const props = {
      traces,
      trainingProfile: profile,
      activeTraceIds: target.activeTraceIds,
      onToggleTrace: () => {}
    };
    const html = render(TraceCardPanel, { props }).body;
    expect(html.match(/class="trace-toggle/g)).toHaveLength(13);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(13);
    const inactive = render(TraceCardPanel, { props: { ...props, activeTraceIds: [] } }).body;
    expect(inactive.match(/aria-pressed="false"/g)).toHaveLength(13);
    expect([...html.matchAll(/aria-label="([^"]*)"/g)].map((match) => match[1])).toEqual(
      [...inactive.matchAll(/aria-label="([^"]*)"/g)].map((match) => match[1])
    );
    const player = render(TraceCardPanel, {
      props: { ...props, playerSkillTree: [{ id: '1001101', level: 1 }] }
    }).body;
    expect(player).not.toContain('class="trace-toggle');
    const memory = data('8007');
    const memoryHtml = render(TraceCardPanel, {
      props: {
        traces: view('8007').profiles.base.traces,
        trainingProfile: memory.profiles[0],
        activeTraceIds: createDefaultCharacterTrainingTarget(memory, 0).activeTraceIds,
        onToggleTrace: () => {}
      }
    }).body;
    const fixed = memoryHtml.match(/<article[^>]*data-trace-id="8007501"[\s\S]*?<\/article>/)![0];
    expect(fixed).not.toContain('trace-toggle');
  });
  it('distinguishes loading and retry from cost output, with no duplicate controls', () => {
    const loading = render(TrainingSection, {
      props: { state: 'loading', onRetry: () => {} }
    }).body;
    const error = render(TrainingSection, { props: { state: 'error', onRetry: () => {} } }).body;
    expect(loading).toContain('role="status"');
    expect(loading).not.toContain('data-material-id');
    expect(error).toContain('<button');
    expect(error).not.toContain('data-material-count');
    expect(loading + error).not.toContain('type="range"');
  });
  it('renders noninteractive materials in credit/rarity order and tolerates unavailable icons', () => {
    const catalog: MaterialCatalog = {
      schemaVersion: 1,
      locale: 'en',
      materials: ['999991', '2', '999992'].map((id, index) => ({
        id,
        mainType: 'Synthetic',
        subType: 'Synthetic',
        name: `Synthetic ${id}`,
        rarity: index === 2 ? 'SuperRare' : 'Rare',
        iconKey: id
      }))
    };
    const html = render(MaterialCostList, {
      props: { catalog, cost: { '999991': 2, '2': 3, '999992': 4 } }
    }).body;
    expect([...html.matchAll(/data-material-id="(\d+)"/g)].map((match) => match[1])).toEqual([
      '2',
      '999992',
      '999991'
    ]);
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('/materials/icons/999991');
    expect(html).toContain('Synthetic 999991');
  });
  it('renders receipt groups, unique target sliders and one credit cell per expense group', () => {
    const cost = data('1510');
    const target = createDefaultCharacterTrainingTarget(cost, 0);
    const shared = json<TrainingSharedData>('static/generated/training/shared.json');
    const result = calculateCharacterTrainingTarget(cost, shared, target);
    const character = view('1510');
    const cards = character.profiles.base.skillCards;
    const skillTargets = createTrainingSkillTargets(
      cards,
      cost.profiles[0],
      result.skills,
      result.target.promotion
    );
    const html = render(TrainingSection, {
      props: {
        state: 'ready',
        result,
        catalog: json<MaterialCatalog>('static/generated/zh-CN/materials.json'),
        levelControl: {
          id: 'training-character-level-1510',
          label: 'Synthetic Level',
          value: target.level,
          min: 1,
          max: 80,
          promotion: 6
        },
        skillTargets,
        activeTraces: createTrainingTraceSummary(
          character.profiles.base.traces,
          cost.profiles[0],
          target.activeTraceIds
        ),
        onLevelChange: () => {},
        onSkillTrainingLevelChange: () => {},
        onRetry: () => {}
      }
    }).body;
    expect([...html.matchAll(/data-training-expense="([^"]+)"/g)].map((match) => match[1])).toEqual(
      ['upgrade', 'promotion', 'skill-trace', 'total']
    );
    expect(html.indexOf('data-training-target')).toBeLessThan(
      html.indexOf('data-training-expense')
    );
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    const labels = [...html.matchAll(/<label[^>]*for="([^"]+)"/g)].map((match) => match[1]);
    expect(labels).toContain('training-skill-1510-0-1510004');
    expect(labels).toHaveLength(1 + skillTargets.length);
    expect(html.match(/data-training-skill="1510:0:1510004"/g)).toHaveLength(1);
    const parts = html
      .split(/data-training-expense="(?:upgrade|promotion|skill-trace|total)"/)
      .slice(1);
    for (const part of parts) expect(part.match(/data-material-id="2"/g)).toHaveLength(1);
    expect(html).not.toContain('training-credit-breakdown');
    expect(html).not.toMatch(
      /data-(?:required|supplied|overflow)-exp|training-strategy|training-exp-summary/
    );
    const missingSkill = render(TrainingTargetSummary, {
      props: { skills: [{ ...skillTargets[0], iconKey: undefined }] }
    }).body;
    expect(missingSkill).toContain('training-target__icon-fallback');
    expect(missingSkill).toContain('data-image-fallback');
    expect(missingSkill).not.toContain('skill-effect-tag');
    expect(html).toContain('data-training-trace-group="ability"');
    expect(html).toContain('data-training-trace-group="stat"');
  });
  it('keeps trace summaries strictly read-only, including empty and missing-icon states', () => {
    const traces = view('1001').profiles.base.traces;
    const html = render(TrainingTraceSummary, {
      props: { traces: [{ ...traces[0], iconKey: undefined }] }
    }).body;
    expect(html).toContain(`data-training-trace-id="${traces[0].id}"`);
    expect(html).not.toMatch(/<(?:button|input|a)\b/);
    expect(html).not.toContain('aria-pressed');
    expect(html).not.toContain('data-trace-id=');
    expect(html).toContain('data-image-fallback');
    expect(html).toContain('data-training-trace-group="ability"');
    expect(html).toContain('data-training-trace-group="stat"');
    expect(html).toContain(`data-training-trace-type="${traces[0].type}"`);
    const empty = render(TrainingTraceSummary, { props: { traces: [] } }).body;
    expect(empty).toContain('data-training-trace-count="0"');
    expect(empty).not.toContain('data-training-trace-id=');
  });
  it('reuses the cone receipt without skills, traces or a second total calculation', () => {
    const cost = json<LightConeTrainingData>('static/generated/training/light-cones/20000.json');
    const shared = json<TrainingSharedData>('static/generated/training/shared.json');
    const result = calculateLightConeTrainingTarget(cost, shared, {
      equipmentId: '20000',
      level: 80
    });
    const html = render(TrainingSection, {
      props: {
        state: 'ready',
        result,
        catalog: json<MaterialCatalog>('static/generated/en/materials.json'),
        levelControl: {
          id: 'training-light-cone-level-20000',
          label: 'Synthetic Level',
          value: 80,
          min: 1,
          max: 80,
          promotion: 6
        },
        onLevelChange: () => {},
        onRetry: () => {}
      }
    }).body;
    expect([...html.matchAll(/data-training-expense="([^"]+)"/g)].map((match) => match[1])).toEqual(
      ['upgrade', 'promotion', 'total']
    );
    expect(html.match(/type="range"/g)).toHaveLength(1);
    expect(html).not.toContain('data-training-skill');
    expect(html).not.toContain('data-training-trace-count');
  });
});
