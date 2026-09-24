import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import { afterEach, describe, expect, it } from 'vitest';
import PlayerEquipmentSection from '../../src/lib/components/player/PlayerEquipmentSection.svelte';
import PlayerRelicScoreSummary from '../../src/lib/components/player/PlayerRelicScoreSummary.svelte';
import type { RelicProperty } from '../../src/lib/domain/types';
import { getLocale, overwriteGetLocale } from '../../src/lib/paraglide/runtime.js';
import { m } from '../../src/lib/paraglide/messages.js';
import type { PlayerCharacter } from '../../src/lib/player/contract';
import type {
  PlayerRelicBuildScore,
  PlayerRelicPieceScore,
  PlayerRelicScorePresentation,
  PlayerRelicScoreUnavailableReason
} from '../../src/lib/player/relic-score-contract';
import {
  formatRelicScore,
  formatRelicScorePanelValue,
  formatRelicScorePercent,
  relicScoreUnavailableMessage
} from '../../src/lib/player/relic-score-presentation';

const originalGetLocale = getLocale;
afterEach(() => overwriteGetLocale(originalGetLocale));

const properties: RelicProperty[] = [
  {
    propertyType: 'SpeedDelta',
    name: 'Synthetic SPD',
    iconKey: 'IconSpeed',
    allowedMainSlots: ['FOOT'],
    canBeSubStat: true
  },
  {
    propertyType: 'DefenceDelta',
    name: 'Synthetic DEF',
    iconKey: 'IconDefence',
    allowedMainSlots: [],
    canBeSubStat: true
  },
  {
    propertyType: 'StatusResistanceBase',
    name: 'Synthetic Effect RES',
    iconKey: 'IconStatusResistance',
    allowedMainSlots: [],
    canBeSubStat: true
  }
];

const availablePiece = (score: number): PlayerRelicPieceScore => ({
  status: 'available',
  score,
  mainCompletion: 1,
  benchmarkPercentile: 0.8,
  rawSubUtility: 10,
  effectiveHits: { status: 'exact', known: 4, total: 4, unknownRecommendedSubstats: 0 }
});

const availableBuild = (): Extract<PlayerRelicBuildScore, { status: 'available' }> => ({
  status: 'available',
  score: 86.51,
  coreScore: 85.42,
  statCompletion: 0.825,
  setIntegrity: 2 / 3,
  effectiveHits: { status: 'exact', known: 27, total: 27, unknownRecommendedSubstats: 0 },
  softTarget: {
    progress: 0.75,
    details: [
      {
        stat: 'DefenceAddedRatio',
        currentValue: 3000,
        minimumThreshold: 1600,
        maximumThreshold: 4000,
        progress: 0.75
      },
      {
        stat: 'StatusResistanceBase',
        currentValue: 0.5,
        minimumThreshold: 0,
        maximumThreshold: 0.8,
        progress: 0.625
      }
    ]
  },
  hardBreakpoint: {
    failureRatio: 0.5,
    details: [
      { stat: 'SpeedDelta', currentValue: 200, threshold: 200, passed: true },
      { stat: 'SpeedDelta', currentValue: 198, threshold: 210, passed: false }
    ]
  }
});

const baseCharacter: PlayerCharacter = {
  buildId: 'synthetic-build',
  characterId: '1304',
  display: { area: 'showcase', position: 1, sourceOrder: 0 },
  progression: { rank: 0, level: 80, promotion: 6, enhanced: false },
  skillTree: [],
  lightCone: null,
  relics: [1, 2, 3, 4, 5, 6].map((type) => ({
    type: type as 1 | 2 | 3 | 4 | 5 | 6,
    setId: 'synthetic',
    level: 15,
    mainAffix: null,
    subAffixes: []
  })),
  stats: []
};

const score = (build: PlayerRelicBuildScore = availableBuild()): PlayerRelicScorePresentation => ({
  version: 1,
  build,
  pieces: {
    HEAD: availablePiece(0),
    HAND: availablePiece(99.6),
    BODY: { status: 'unavailable', reason: 'piece-unavailable' },
    FOOT: availablePiece(85.5),
    NECK: availablePiece(55.1)
  }
});

const renderEquipment = (character: PlayerCharacter): string =>
  render(PlayerEquipmentSection, {
    props: { character, catalog: null, relicProperties: properties }
  }).body;

function slotMarkup(body: string, slot: string): string {
  const start = body.indexOf(`data-player-relic-slot="${slot}"`);
  const end = body.indexOf('data-player-relic-slot=', start + 1);
  return body.slice(start, end < 0 ? undefined : end);
}

describe('Relic Score Phase 2B presentation', () => {
  it('formats scores to one decimal only in the UI and shares the Player panel number scale', () => {
    expect(formatRelicScore(90)).toBe('90.0');
    expect(formatRelicScore(90.04)).toBe('90.0');
    expect(formatRelicScore(90.0625)).toBe('90.1');
    expect(formatRelicScore(87.36)).toBe('87.4');
    expect(formatRelicScore(0)).toBe('0.0');
    expect(formatRelicScore(100)).toBe('100.0');
    expect(formatRelicScorePercent(0.825)).toBe('83%');
    expect(formatRelicScorePercent(2 / 3)).toBe('67%');
    expect(formatRelicScorePanelValue('StatusResistanceBase', 0.5)).toBe('50.0%');
    expect(formatRelicScorePanelValue('DefenceAddedRatio', 4000)).toBe('4000');
    expect(formatRelicScorePanelValue('SpeedDelta', 200)).toBe('200');
  });

  it('places a compact summary before the grid and associates piece scores by canonical slot', () => {
    const character = { ...baseCharacter, relicScore: score() };
    const body = renderEquipment(character);
    expect(body.indexOf('data-player-relic-score-summary')).toBeGreaterThan(
      body.indexOf(m.player_equipment_relics())
    );
    expect(body.indexOf('data-player-relic-score-summary')).toBeLessThan(
      body.indexOf('player-equipment__relic-grid')
    );
    expect(body).toContain('data-player-build-score');
    expect(body).toMatch(/data-player-build-score[^>]*>86\.5</);
    expect(body).toMatch(/data-player-effective-hits[\s\S]*?<strong[^>]*>27<\/strong>/);
    expect(body).toContain('83%');
    expect(body).toContain('67%');
    expect(slotMarkup(body, 'HEAD')).toMatch(
      /data-player-relic-piece-score[\s\S]*?<strong[^>]*>0\.0<\/strong>/
    );
    expect(slotMarkup(body, 'HAND')).toMatch(
      /data-player-relic-piece-score[\s\S]*?<strong[^>]*>99\.6<\/strong>/
    );
    expect(slotMarkup(body, 'HAND')).toMatch(/aria-label="[^"]*99\.6"/);
    expect(slotMarkup(body, 'HEAD')).toContain('+15');
    expect(slotMarkup(body, 'BODY')).toMatch(
      /data-player-relic-piece-score[\s\S]*?<strong[^>]*>—<\/strong>/
    );
    expect(slotMarkup(body, 'FOOT')).toMatch(
      /data-player-relic-piece-score[\s\S]*?<strong[^>]*>85\.5<\/strong>/
    );
    expect(slotMarkup(body, 'OBJECT')).toMatch(
      /data-player-relic-piece-score[\s\S]*?<strong[^>]*>—<\/strong>/
    );
    const integerBuild = availableBuild();
    integerBuild.score = 90;
    const integerBuildBody = render(PlayerRelicScoreSummary, {
      props: { score: integerBuild, properties }
    }).body;
    expect(integerBuildBody).toMatch(/data-player-build-score[^>]*>90\.0</);
  });

  it('keeps unavailable, partial and exact hit counts distinct', () => {
    const zero = availableBuild();
    zero.effectiveHits = {
      status: 'exact',
      known: 0,
      total: 0,
      unknownRecommendedSubstats: 0
    };
    const zeroBody = render(PlayerRelicScoreSummary, { props: { score: zero, properties } }).body;
    expect(zeroBody).toMatch(/data-player-effective-hits[\s\S]*?<strong[^>]*>0<\/strong>/);
    const partial = availableBuild();
    partial.effectiveHits = {
      status: 'partial',
      known: 23,
      total: null,
      unknownRecommendedSubstats: 2
    };
    const partialBody = render(PlayerRelicScoreSummary, {
      props: { score: partial, properties }
    }).body;
    expect(partialBody).toContain(m.player_relic_score_at_least({ count: 23 }));
    expect(partialBody).toContain(m.player_relic_score_hits_partial());
    const unavailable = availableBuild();
    unavailable.effectiveHits = {
      status: 'unavailable',
      known: 0,
      total: null,
      unknownRecommendedSubstats: 0
    };
    const unavailableBody = render(PlayerRelicScoreSummary, {
      props: { score: unavailable, properties }
    }).body;
    expect(unavailableBody).toMatch(/data-player-effective-hits[\s\S]*?<strong[^>]*>—<\/strong>/);
  });

  it('shows target and breakpoint states with localized panel labels and no raw stat text', () => {
    const body = render(PlayerRelicScoreSummary, {
      props: { score: availableBuild(), properties }
    }).body;
    expect(body).toContain('data-player-soft-target');
    expect(body).toContain('data-player-hard-breakpoint');
    expect(body).toContain('75%');
    expect(body).toContain(m.player_relic_score_passed_count({ passed: 1, total: 2 }));
    expect(body).toMatch(/<details[^>]*data-player-score-details/);
    expect(body).toContain('Synthetic DEF');
    expect(body).toContain('Synthetic Effect RES');
    expect(body).toContain('Synthetic SPD');
    expect(body).toContain('50.0%');
    expect(body).toContain('3000');
    const visibleText = body.replace(/<[^>]*>/g, ' ');
    expect(visibleText).not.toMatch(/DefenceAddedRatio|StatusResistanceBase|SpeedDelta/);
    const noTargets = availableBuild();
    noTargets.softTarget = { progress: 0, details: [] };
    noTargets.hardBreakpoint = { failureRatio: 0, details: [] };
    const absentBody = render(PlayerRelicScoreSummary, {
      props: { score: noTargets, properties }
    }).body;
    expect(absentBody).not.toContain('data-player-soft-target');
    expect(absentBody).not.toContain('data-player-hard-breakpoint');
    expect(absentBody).not.toContain('data-player-score-details');
  });

  it('shows pass and fail for individual breakpoints', () => {
    for (const passed of [true, false]) {
      const build = availableBuild();
      build.hardBreakpoint.details = [
        { stat: 'SpeedDelta', currentValue: passed ? 200 : 198, threshold: 200, passed }
      ];
      const body = render(PlayerRelicScoreSummary, { props: { score: build, properties } }).body;
      expect(body).toContain(
        passed ? m.player_relic_score_passed() : m.player_relic_score_failed()
      );
    }
  });

  it('keeps available pieces when the build is unavailable and tolerates an optional score field', () => {
    const unavailableBuild = { status: 'unavailable', reason: 'incomplete-build' } as const;
    const body = renderEquipment({ ...baseCharacter, relicScore: score(unavailableBuild) });
    expect(body).toMatch(/data-player-build-score[^>]*>—</);
    expect(body).toContain(m.player_relic_score_incomplete_build());
    expect(slotMarkup(body, 'HEAD')).toContain('data-player-relic-piece-score');
    const legacy = renderEquipment(baseCharacter);
    expect(legacy).toContain('data-player-relic-slot="HEAD"');
    expect(legacy).not.toContain('data-player-relic-score-summary');
    expect(legacy).not.toContain('data-player-relic-piece-score');
    const empty = renderEquipment({
      ...baseCharacter,
      relics: [],
      relicScore: score(unavailableBuild)
    });
    expect(empty).toContain('data-player-relic-slot="HEAD"');
    expect(empty).not.toContain('data-player-relic-piece-score');
  });

  it('localizes every public unavailability reason in zh and en without exposing codes', () => {
    const reasons: PlayerRelicScoreUnavailableReason[] = [
      'profile-unavailable',
      'recommendation-unavailable',
      'benchmark-unavailable',
      'incomplete-build',
      'piece-unavailable',
      'panel-unavailable',
      'score-unavailable'
    ];
    for (const locale of ['zh-CN', 'en'] as const) {
      overwriteGetLocale(() => locale);
      for (const reason of reasons) {
        const message = relicScoreUnavailableMessage(reason);
        expect(message.trim().length).toBeGreaterThan(0);
        expect(message).not.toBe(reason);
        const body = render(PlayerRelicScoreSummary, {
          props: { score: { status: 'unavailable', reason }, properties }
        }).body;
        expect(body).toContain(message);
        expect(body.replace(/<[^>]*>/g, ' ')).not.toContain(reason);
      }
    }
  });

  it('keeps presentation imports separate from server scoring and benchmark artifacts', () => {
    for (const file of [
      'src/lib/components/player/PlayerRelicScoreSummary.svelte',
      'src/lib/components/player/PlayerRelicCard.svelte',
      'src/lib/player/relic-score-presentation.ts'
    ]) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toMatch(
        /\$lib\/server\/relic-score|farming-benchmarks\.json|profile-overrides|scoring-config|scoreBuild\(|fetch\(/
      );
    }
  });
});
