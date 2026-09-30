import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import EnemySkillDetail from '../../src/lib/components/enemy/EnemySkillDetail.svelte';
import EnemySkillSelector from '../../src/lib/components/enemy/EnemySkillSelector.svelte';
import type { EnemySkillView } from '../../src/lib/domain/enemy-view';
import { parseDecimal } from '../../scripts/data/decimal';
import { getLocale, overwriteGetLocale } from '../../src/lib/paraglide/runtime.js';
import * as m from '../../src/lib/paraglide/messages.js';

const originalGetLocale = getLocale;
afterEach(() => overwriteGetLocale(originalGetLocale));

const skill: EnemySkillView = {
  id: 'synthetic',
  name: 'Synthetic Skill',
  description: 'Synthetic official description',
  kind: 'skill',
  tag: { code: 'synthetic', label: 'Synthetic tag', known: false },
  phases: [1],
  extraEffects: []
};
const renderSkill = (value: EnemySkillView) =>
  render(EnemySkillDetail, { props: { skill: value } }).body;
const rows = (body: string) => [
  ...body.matchAll(/<div[^>]*class="enemy-skill-fact-row[^>]*>([\s\S]*?)<\/div>/g)
];
const headings = (body: string, level: number) =>
  [...body.matchAll(new RegExp(`<h${level}[^>]*>([\\s\\S]*?)<\\/h${level}>`, 'g'))].map((match) =>
    match[1].replace(/<!--[\s\S]*?-->/g, '').trim()
  );

describe('enemy skill presentation', () => {
  const useLocale = () => overwriteGetLocale(() => 'zh-CN');

  it.each(['zh-CN', 'en'] as const)(
    'groups multiple targets and unlabelled candidates (%s)',
    (locale) => {
      overwriteGetLocale(() => locale);
      const body = renderSkill({
        ...skill,
        detail: {
          damage: [
            { target: 'primary', multipliers: [parseDecimal('9')], scaling: 'attack' },
            { target: 'adjacent', multipliers: [parseDecimal('2')], scaling: 'attack' },
            {
              multipliers: ['0.9', '1.1', '1.8', '2.2'].map((value) => parseDecimal(value)),
              scaling: 'attack'
            }
          ]
        }
      });
      expect(headings(body, 4)).toEqual([m.enemy_skill_numeric_information()]);
      expect(headings(body, 5)).toEqual([m.enemy_skill_damage_multiplier()]);
      const damageRows = rows(body);
      expect(damageRows).toHaveLength(3);
      expect(damageRows[0][0]).toContain('data-damage-target="primary"');
      expect(damageRows[0][1]).toContain(m.enemy_skill_target_primary());
      expect(damageRows[0][1]).toContain(m.enemy_skill_attack_ratio({ percent: '900%' }));
      expect(damageRows[1][1]).toContain(m.enemy_skill_target_adjacent());
      expect(damageRows[1][1]).toContain('200%');
      expect(damageRows[2][0]).not.toContain('data-damage-target=');
      expect(damageRows[2][1]).not.toContain('<span');
      expect(damageRows[2][1]).toContain('enemy-skill-fact-value--unlabelled');
      expect(damageRows[2][1]).toContain(
        m.enemy_skill_attack_ratio({ percent: '90% / 110% / 180% / 220%' })
      );
      expect(damageRows[2][1].match(/<strong\b/g)).toHaveLength(1);
      expect(body).toContain(skill.description);
    }
  );

  it.each([undefined, 'primary'] as const)(
    'separates base chance from optional target %s',
    (target) => {
      useLocale();
      const body = renderSkill({
        ...skill,
        detail: { applications: [{ target, baseChance: parseDecimal('1.2') }] }
      });
      expect(headings(body, 4)).toEqual([m.enemy_skill_numeric_information()]);
      expect(headings(body, 5)).toEqual([m.enemy_skill_base_chance()]);
      const [row] = rows(body);
      expect(row[0]).toContain('data-base-chance');
      expect(row[1]).toContain('120%');
      expect(row[1]).not.toContain(m.enemy_skill_base_chance());
      expect(row[0]).not.toContain('data-status-id');
      if (target) {
        expect(row[1]).toContain(m.enemy_skill_target_primary());
        expect(row[1]).not.toContain('enemy-skill-fact-value--unlabelled');
      } else {
        expect(row[1]).not.toContain('<span');
        expect(row[1]).toContain('enemy-skill-fact-value--unlabelled');
      }
    }
  );

  it('retains the visible association of named applications with different chances', () => {
    useLocale();
    const applications = [
      { name: 'Synthetic effect A', statusId: 'a', baseChance: parseDecimal('0.5') },
      {
        name: 'Synthetic effect B',
        statusId: 'b',
        target: 'primary' as const,
        baseChance: parseDecimal('0.8')
      }
    ];
    const body = renderSkill({ ...skill, detail: { applications } });
    expect(headings(body, 5)).toEqual([m.enemy_skill_base_chance()]);
    for (const application of applications) {
      expect(body).toContain(application.name);
      expect(body).toContain(`data-status-id="${application.statusId}"`);
    }
    expect(rows(body).map((row) => row[1].match(/\d+%/)?.[0])).toEqual(['50%', '80%']);
  });

  it('groups action shifts once per kind in first-occurrence order, without invented targets', () => {
    useLocale();
    const body = renderSkill({
      ...skill,
      detail: {
        actionShifts: [
          { kind: 'delay', ratio: parseDecimal('0.5') },
          { kind: 'advance', ratio: parseDecimal('1') },
          { kind: 'delay', ratio: parseDecimal('0.25') }
        ]
      }
    });
    expect(headings(body, 5)).toEqual([
      m.enemy_skill_action_delay(),
      m.enemy_skill_action_advance()
    ]);
    const shiftRows = rows(body);
    expect(shiftRows.map((row) => row[1].match(/\d+%/)?.[0])).toEqual(['50%', '25%', '100%']);
    for (const row of shiftRows) {
      expect(row[1]).not.toContain('<span');
      expect(row[1]).toContain('enemy-skill-fact-value--unlabelled');
    }
  });

  it.each([
    undefined,
    { damage: [], applications: [], actionShifts: [] },
    {
      applications: [
        { target: 'primary' as const, baseChance: parseDecimal('0.5') },
        { target: 'primary' as const, baseChance: parseDecimal('0.8') }
      ]
    }
  ])('omits the entire supplemental section when no numeric fact is displayable (%j)', (detail) => {
    useLocale();
    const body = renderSkill({ ...skill, detail });
    expect(body).not.toContain('data-enemy-skill-facts');
    expect(headings(body, 4)).toEqual([]);
    expect(body).toContain(skill.description);
  });
});

describe('enemy skill selector and header', () => {
  const damageType = { element: 'Wind', name: 'Synthetic element' };

  it('keeps an aria-hidden icon slot in every native button', () => {
    const body = render(EnemySkillSelector, {
      props: {
        skills: [
          { ...skill, damageType },
          { ...skill, id: 'unlabelled', name: 'Long synthetic skill name' }
        ],
        selectedSkillId: skill.id,
        onSelect: () => undefined
      }
    }).body;
    const buttons = [...body.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)];
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button[0]).toContain('type="button"');
      expect(button[1]).toMatch(/class="enemy-skill-selector__icon[^"]*" aria-hidden="true"/);
    }
    expect(buttons[0][0]).toContain('aria-pressed="true"');
    expect(buttons[0][1]).toContain('data-icon-kind="element"');
    expect(buttons[1][0]).toContain('aria-pressed="false"');
    expect(buttons[1][1]).not.toContain('data-icon-kind');
  });

  it('puts the plain element metadata inside the header before the existing type tag', () => {
    const body = renderSkill({ ...skill, damageType });
    const header = body.match(/<header[^>]*>([\s\S]*?)<\/header>/)![1];
    expect(header).toContain(damageType.name);
    expect(header.indexOf('data-icon-kind="element"')).toBeLessThan(
      header.indexOf('data-skill-effect=')
    );
    expect(body.match(/data-icon-kind="element"/g)).toHaveLength(1);
  });

  it('renders a type without an attribute placeholder', () => {
    const header = renderSkill(skill).match(/<header[^>]*>([\s\S]*?)<\/header>/)![1];
    expect(header).toContain('data-skill-effect="synthetic"');
    expect(header).not.toContain('data-icon-kind');
  });
});
