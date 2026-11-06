import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import { afterEach, expect, it } from 'vitest';
import EquipmentRecommendationSection from '../../src/lib/components/character/EquipmentRecommendationSection.svelte';
import { resolveEquipmentRecommendation } from '../../src/lib/domain/equipment-recommendation-view';
import type {
  Character,
  CatalogEntry,
  RelicCatalogEntry,
  RelicProperty
} from '../../src/lib/domain/types';
import { getLocale, overwriteGetLocale } from '../../src/lib/paraglide/runtime.js';

const originalGetLocale = getLocale;
afterEach(() => overwriteGetLocale(originalGetLocale));

function readView<T>(locale: string, path: string): T {
  return JSON.parse(readFileSync(`src/lib/generated/views/${locale}/${path}.json`, 'utf8'));
}

for (const locale of ['zh-CN', 'en'] as const) {
  it.each(['1001', '1301', '1501'])(
    `${locale} recommendation preserves every ordered link and property for %s`,
    (id) => {
      overwriteGetLocale(() => locale);
      const character = readView<Character>(locale, `details/characters/${id}`);
      const recommendation = resolveEquipmentRecommendation(
        character.equipmentRecommendation,
        readView<CatalogEntry[]>(locale, 'catalogs/light-cones'),
        readView<RelicCatalogEntry[]>(locale, 'catalogs/relics'),
        readView<RelicProperty[]>(locale, 'catalogs/relic-properties')
      );
      const body = render(EquipmentRecommendationSection, { props: { recommendation } }).body;
      const prefix = locale === 'en' ? '/en' : '';
      expect([...body.matchAll(/href="([^"]+)"/g)].map((match) => match[1])).toEqual([
        ...recommendation.lightCones.map((entry) => `${prefix}/light-cones/${entry.id}/`),
        ...[...recommendation.cavernSets, ...recommendation.planarSets].map(
          (entry) => `${prefix}/relics/${entry.id}/`
        )
      ]);
      const slots = [...body.matchAll(/data-relic-slot="([^"]+)"[^>]*>([\s\S]*?)<\/section>/g)];
      expect(slots.map((match) => match[1])).toEqual(recommendation.mainStats.map((s) => s.slot));
      for (const [index, stat] of recommendation.mainStats.entries()) {
        const content = slots[index][2];
        const positions = stat.properties.map((property) => content.indexOf(property.name));
        expect(positions.every((position) => position >= 0)).toBe(true);
        expect(positions).toEqual([...positions].sort((a, b) => a - b));
      }
      const subStats = body.slice(body.indexOf('recommendation-substats'));
      const positions = recommendation.subStats.map((property) => subStats.indexOf(property.name));
      expect(positions.every((position) => position >= 0)).toBe(true);
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
      expect((body.match(/class="relic-property-token[\s"]/g) ?? []).length).toBe(
        recommendation.mainStats.reduce((count, stat) => count + stat.properties.length, 0) +
          recommendation.subStats.length
      );
    }
  );
}
