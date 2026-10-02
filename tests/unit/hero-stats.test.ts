import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import StatListFixture from '../fixtures/StatListFixture.svelte';
import StatRow from '../../src/lib/components/shared/StatRow.svelte';
import EnemyTemplateBaseStatsPanel from '../../src/lib/components/enemy/EnemyTemplateBaseStatsPanel.svelte';
import type { DecimalString } from '../../src/lib/domain/endgame';
import type { EnemyTemplateBaseStats } from '../../src/lib/domain/types';

const decimal = (value: string): DecimalString => value as DecimalString;

describe('Hero stat presentation', () => {
  it('merges list classes and forwards attributes while making flush spacing opt-in', () => {
    const section = render(StatListFixture).body;
    const flush = render(StatListFixture, { props: { spacing: 'flush' } }).body;
    expect(section).toMatch(/<dl[^>]*class="[^"]*hero-stat-list[^"]*synthetic-list/);
    expect(section).toContain('data-fixture-list="stats"');
    expect(section).not.toContain('hero-stat-list--flush');
    expect(flush).toContain('hero-stat-list--flush');
    expect(flush).toContain('data-fixture-list="stats"');
  });

  it('renders a semantic list with numeric and unavailable text values and forwards field markers', () => {
    const { body } = render(StatListFixture);
    expect(body).toMatch(/<dl[^>]*aria-label="synthetic stat list"/);
    expect(body.match(/<dt[ >]/g)).toHaveLength(2);
    expect(body.match(/<dd[ >]/g)).toHaveLength(2);
    expect(body).toContain('data-fixture-stat="numeric"');
    expect(body).toContain('data-fixture-stat="text"');
    expect(body).toContain('1234');
    expect(body).toContain('synthetic unavailable value');
    expect(body).toContain('stat-value--unavailable');
    expect(body).not.toContain('hero-stat-icon');
    expect(body).not.toContain('<img ');
  });

  it('supports mixed decorative icons and missing icons within one aligned list', () => {
    const { body } = render(StatListFixture, { props: { hasIcons: true } });
    expect(body.match(/<img /g)).toHaveLength(1);
    expect(body).toMatch(/<span[^>]*hero-stat-icon[^>]*aria-hidden="true"/);
    expect(body).toMatch(/<img[^>]*alt=""/);
    expect(body.match(/hero-stat-label-text/g)).toHaveLength(2);
    expect(body).toContain('20px minmax(0, 1fr)');
  });

  it('keeps scaling emphasis opt-in and escapes arbitrary text values', () => {
    const scaling = render(StatRow, {
      props: { label: 'synthetic label', value: '699', tone: 'scaling' }
    }).body;
    const normal = render(StatRow, {
      props: { label: 'synthetic label', value: '<synthetic value>' }
    }).body;
    expect(scaling).toContain('scaling-value');
    expect(normal).not.toContain('scaling-value');
    expect(normal).toContain('&lt;synthetic value>');
  });
});

describe('Enemy template stat adapter', () => {
  const baseStats: EnemyTemplateBaseStats = {
    hp: decimal('1234.6'),
    attack: decimal('18'),
    defence: decimal('210'),
    criticalDamage: decimal('0.5'),
    speed: decimal('102'),
    stance: decimal('90'),
    effectResistance: decimal('0.2'),
    initialDelayRatio: decimal('0.5')
  };
  const fields = [
    'hp',
    'attack',
    'defence',
    'speed',
    'toughness',
    'critical-damage',
    'effect-resistance',
    'initial-action-value'
  ];

  it('preserves all eight fields, order, decimal formatting, toughness conversion and percentages', () => {
    const { body } = render(EnemyTemplateBaseStatsPanel, { props: { baseStats } });
    expect(
      [...body.matchAll(/data-enemy-template-stat="([^"]+)"/g)].map((match) => match[1])
    ).toEqual(fields);
    const values = [...body.matchAll(/<strong[^>]*>([^<]*)<\/strong>/g)].map((match) => match[1]);
    expect(values).toEqual(['1,235', '18', '210', '102', '30', '50%', '20%', '50%']);
    expect(body).not.toContain('stat-value--unavailable');
    expect(body).not.toContain('hero-stat-icon');
  });

  it('marks missing values explicitly while keeping resolved zero values available', () => {
    const { body } = render(EnemyTemplateBaseStatsPanel, {
      props: {
        baseStats: {
          hp: decimal('0'),
          attack: decimal('0'),
          defence: decimal('0'),
          criticalDamage: decimal('0')
        }
      }
    });
    expect(body.match(/stat-value--unavailable/g)).toHaveLength(4);
    expect(body.match(/<strong[^>]*>0<\/strong>/g)).toHaveLength(3);
    expect(body).toMatch(/<strong[^>]*>0%<\/strong>/);
  });

  it('uses the same unavailable treatment when exact toughness conversion is unresolved', () => {
    const { body } = render(EnemyTemplateBaseStatsPanel, {
      props: { baseStats: { ...baseStats, stance: decimal('1') } }
    });
    expect(body.match(/stat-value--unavailable/g)).toHaveLength(1);
    expect(body).toMatch(
      /data-enemy-template-stat="toughness"[\s\S]*?<strong[^>]*stat-value--unavailable/
    );
  });
});
