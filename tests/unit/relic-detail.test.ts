import { render } from 'svelte/server';
import { afterEach, describe, expect, it } from 'vitest';
import RelicPieceCard from '../../src/lib/components/relic/RelicPieceCard.svelte';
import { buildRelicDomain } from '../../scripts/data/domain/relic';
import { projectRelic } from '../../scripts/data/projection/relic';
import { createTextResolver, loadTextMap } from '../../scripts/data/localization';
import { getLocaleConfig, type Locale } from '../../scripts/data/locale-registry';
import { resolveDataRoot } from '../../scripts/data/paths';
import { readTable } from '../../scripts/data/raw';
import type { RelicSetDomain } from '../../src/lib/domain/neutral';
import type { RelicSet } from '../../src/lib/domain/types';
import { getLocale, overwriteGetLocale } from '../../src/lib/paraglide/runtime.js';
import { m } from '../../src/lib/paraglide/messages.js';

const originalGetLocale = getLocale;
afterEach(() => overwriteGetLocale(originalGetLocale));

const root = resolveDataRoot();

async function domainForSet101(): Promise<RelicSetDomain> {
  const names = [
    'RelicBaseType',
    'ItemComefrom',
    'RelicSetSkillConfig',
    'RelicDataInfo',
    'RelicSetConfig'
  ];
  const entries = await Promise.all(names.map(async (name) => [name, await readTable(root, name)]));
  return buildRelicDomain({ tables: Object.fromEntries(entries) }).find((set) => set.id === '101')!;
}

async function projectSet(domain: RelicSetDomain, locale: Locale): Promise<RelicSet> {
  const config = getLocaleConfig(locale);
  const resolver = await createTextResolver(
    { locale, textMapCode: config.textMapCode },
    await loadTextMap(root, config.textMapCode)
  );
  return projectRelic(domain, {
    locale,
    resolver,
    categoryLabels: { cavern: 'cavern', planar: 'planar' },
    formatEffectSummary: (required, description) => `${required}: ${description}`
  });
}

describe('relic piece lore', () => {
  it('projects the matching name, short description, and full story in each locale', async () => {
    const domain = await domainForSet101();
    expect(domain.pieces[0].loreSource).toMatchObject({
      kind: 'direct',
      ref: { kind: 'symbolic', key: 'RelicStoryContent_31011' }
    });

    const chinese = (await projectSet(domain, 'zh-CN')).pieces[0];
    const english = (await projectSet(domain, 'en')).pieces[0];
    expect(chinese.name).toBe('过客的逢春木簪');
    expect(chinese.description).toContain('枯木曾作发簪');
    expect(chinese.lore).toContain('佚名之人自漫长的沉眠中醒来');
    expect(english.name).toBe("Passerby's Rejuvenated Wooden Hairstick");
    expect(english.description).toContain('A withered twig that was used as a hairstick');
    expect(english.lore).toContain('A distant and yet familiar feeling of nervousness');
    expect(chinese.lore.length).toBeGreaterThan(chinese.description.length);
    expect(english.lore.length).toBeGreaterThan(english.description.length);
  });

  it('omits the story region when upstream lore is absent', async () => {
    const domain = await domainForSet101();
    domain.pieces[0] = { ...domain.pieces[0], loreSource: undefined };
    const piece = (await projectSet(domain, 'zh-CN')).pieces[0];
    expect(piece.lore).toBe('');
    const { body } = render(RelicPieceCard, { props: { piece } });
    expect(body).toContain('data-relic-slot="HEAD"');
    expect(body).not.toContain('data-relic-story-section');
    expect(body).not.toContain('data-relic-lore');
    expect(body).not.toContain('<details');
  });

  it('renders one story region and an initially collapsed disclosure for each real piece', async () => {
    const pieces = (await projectSet(await domainForSet101(), 'zh-CN')).pieces;
    const bodies = pieces
      .slice(0, 2)
      .map((piece) => render(RelicPieceCard, { props: { piece } }).body);
    for (const body of bodies) {
      expect(body).toMatch(/<details[^>]*data-relic-story-section/);
      expect(body).not.toMatch(/<details[^>]*\sopen(?:\s|=|>)/);
      expect(body).toContain('<summary');
      expect(body).not.toContain('<button');
      expect(body.match(/data-relic-lore/g)).toHaveLength(1);
    }
  });

  it('selects the story disclosure label from the active site locale', async () => {
    const piece = (await projectSet(await domainForSet101(), 'zh-CN')).pieces[0];
    const labels: string[] = [];
    for (const locale of ['zh-CN', 'en'] as const) {
      overwriteGetLocale(() => locale);
      const label = m.relic_view_story();
      labels.push(label);
      expect(render(RelicPieceCard, { props: { piece } }).body).toContain(label);
    }
    expect(labels[0]).not.toBe(labels[1]);
  });
});
