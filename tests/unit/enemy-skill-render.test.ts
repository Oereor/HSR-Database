import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import EnemySkillDetail from '../../src/lib/components/enemy/EnemySkillDetail.svelte';
import type { EnemySkillView } from '../../src/lib/domain/enemy-view';
import { parseDecimal } from '../../scripts/data/decimal';

const skill: EnemySkillView = {
  id: 'synthetic',
  name: 'Synthetic Skill',
  description: 'Synthetic official description',
  kind: 'skill',
  tag: { code: 'synthetic', label: 'Synthetic tag', known: false },
  phases: [1],
  extraEffects: []
};

describe('enemy skill damage rendering', () => {
  it('renders known and unlabelled groups together, with one unit per multiplier list', () => {
    const body = render(EnemySkillDetail, {
      props: {
        skill: {
          ...skill,
          detail: {
            damage: [
              {
                target: 'primary',
                multipliers: ['3'].map((value) => parseDecimal(value)),
                scaling: 'attack'
              },
              {
                multipliers: ['0.9', '1.1', '1.8', '2.2'].map((value) => parseDecimal(value)),
                scaling: 'attack'
              }
            ]
          }
        }
      }
    }).body;
    const rows = [...body.matchAll(/<div[^>]*class="enemy-skill-fact-row[^>]*>([\s\S]*?)<\/div>/g)];
    expect(rows).toHaveLength(2);
    expect(rows[0][0]).toContain('data-damage-target="primary"');
    expect(rows[0][1]).toContain('<span>');
    expect(rows[0][1]).toContain('300%');
    expect(rows[1][0]).not.toContain('data-damage-target=');
    expect(rows[1][1]).not.toContain('<span>');
    expect(rows[1][1]).toContain('90% / 110% / 180% / 220%');
    expect(rows[1][1].match(/<strong\b/g)).toHaveLength(1);
    expect(body).toContain(skill.description);
  });

  it('omits the supplemental section when there are no numeric facts', () => {
    const body = render(EnemySkillDetail, { props: { skill } }).body;
    expect(body).not.toContain('data-enemy-skill-facts');
    expect(body).toContain(skill.description);
  });
});
