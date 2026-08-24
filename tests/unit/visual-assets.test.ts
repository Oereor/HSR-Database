import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import {
  resolveCharacterPreviewAsset,
  resolveCharacterPortraitAsset,
  resolveLightConePreviewAsset,
  resolveRelicPropertyIconAsset,
  resolveRelicSetIconAsset,
  resolveElementIconAsset,
  resolvePathIconAsset
} from '../../src/lib/data/visual-assets';
import type { AssetAvailability, VisualAssetManifest } from '../../src/lib/domain/visual-assets';
import { assertAssetRoot, resolveAssetRoot } from '../../scripts/assets/paths';
import {
  ELEMENT_SOURCE_NAMES,
  assertAssetCleanTarget,
  manifestCoversRequirements,
  PATH_SOURCE_NAMES,
  readCharacterPreviewSources,
  readLightConePreviewSources,
  readRelicPropertyIconSources,
  readRelicSetIconSources,
  readAssetManifest,
  readAssetRequirements,
  VISUAL_ASSET_SCHEMA_VERSION,
  resolveIndexedAssetPath,
  writePortraitAsset,
  writeSemanticIconAsset
} from '../../scripts/assets/shared';

sharp.cache(false);

const temporaryDirectories: string[] = [];
const available = (values: string[]): AssetAvailability => ({ available: values, missing: [] });
const manifest = (options?: {
  previews?: string[];
  portraits?: string[];
  lightConePreviews?: string[];
  relicIcons?: string[];
  relicPropertyIcons?: string[];
  elements?: string[];
  paths?: string[];
}): VisualAssetManifest => ({
  schemaVersion: VISUAL_ASSET_SCHEMA_VERSION,
  generatedAt: '2026-01-01T00:00:00.000Z',
  characters: {
    previews: available(options?.previews ?? []),
    portraits: available(options?.portraits ?? [])
  },
  lightCones: {
    previews: available(options?.lightConePreviews ?? [])
  },
  relics: {
    icons: available(options?.relicIcons ?? [])
  },
  relicProperties: {
    icons: available(options?.relicPropertyIcons ?? [])
  },
  elements: available(options?.elements ?? []),
  paths: available(options?.paths ?? [])
});

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) =>
        rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
      )
  );
});

describe('视觉资源管线', () => {
  it('从网站目录解析默认与显式 HSR_ASSET_ROOT', () => {
    expect(resolveAssetRoot()).toBe(path.resolve(process.cwd(), '../StarRailRes'));
    expect(resolveAssetRoot('../StarRailRes')).toBe(path.resolve(process.cwd(), '../StarRailRes'));
  });

  it('只接受具有 Git 标记、角色 index 和四类源目录的资源仓库', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'hsr-assets-'));
    temporaryDirectories.push(root);
    await mkdir(path.join(root, '.git'));
    for (const relative of [
      'image/character_preview',
      'image/character_portrait',
      'image/light_cone_preview',
      'icon/relic',
      'icon/property',
      'icon/element',
      'icon/path'
    ]) {
      await mkdir(path.join(root, relative), { recursive: true });
    }
    await mkdir(path.join(root, 'index_new', 'cn'), { recursive: true });
    await writeFile(path.join(root, 'index_new', 'cn', 'characters.json'), '{}');
    await writeFile(path.join(root, 'index_new', 'cn', 'light_cones.json'), '{}');
    await writeFile(path.join(root, 'index_new', 'cn', 'relic_sets.json'), '{}');
    await writeFile(path.join(root, 'index_new', 'cn', 'properties.json'), '{}');
    expect(assertAssetRoot(root)).toBe(root);
    await rm(path.join(root, 'image'), { recursive: true });
    expect(() => assertAssetRoot(root)).toThrow(/character_portrait/);
  });

  it('资源清理拒绝网站生成目录之外的路径', () => {
    expect(() => assertAssetCleanTarget(path.resolve(process.cwd(), '../StarRailRes'))).toThrow(
      /拒绝清理/
    );
  });

  it('按稳定 ID 和语义 code 解析 URL，缺图不产生请求路径', () => {
    const source = manifest({
      previews: ['1001'],
      portraits: ['1001'],
      lightConePreviews: ['20000'],
      relicIcons: ['101'],
      relicPropertyIcons: ['IconAttack'],
      elements: ['Lightning'],
      paths: ['Memory']
    });
    expect(resolveCharacterPreviewAsset('1001', source)).toBe(
      '/generated-assets/characters/preview/1001.png'
    );
    expect(resolveCharacterPortraitAsset('1001', source)).toBe(
      '/generated-assets/characters/portrait/1001.webp'
    );
    expect(resolveLightConePreviewAsset('20000', source)).toBe(
      '/generated-assets/light-cones/preview/20000.png'
    );
    expect(resolveRelicSetIconAsset('101', source)).toBe('/generated-assets/relics/icons/101.png');
    expect(resolveRelicPropertyIconAsset('IconAttack', source)).toBe(
      '/generated-assets/relic-properties/IconAttack.png'
    );
    expect(resolveElementIconAsset('Lightning', source)).toBe(
      '/generated-assets/elements/Lightning.png'
    );
    expect(resolvePathIconAsset('Memory', source)).toBe('/generated-assets/paths/Memory.png');
    expect(resolveCharacterPreviewAsset('1002', source)).toBeUndefined();
    expect(resolveLightConePreviewAsset('20001', source)).toBeUndefined();
    expect(resolveCharacterPortraitAsset('../1001', source)).toBeUndefined();
  });

  it('七属性与九命途使用已审计的 StarRailRes 映射', () => {
    expect(ELEMENT_SOURCE_NAMES).toEqual({
      Physical: 'Physical',
      Fire: 'Fire',
      Ice: 'Ice',
      Lightning: 'Thunder',
      Wind: 'Wind',
      Quantum: 'Quantum',
      Imaginary: 'Imaginary'
    });
    expect(PATH_SOURCE_NAMES).toEqual({
      Warrior: 'Destruction',
      Rogue: 'Hunt',
      Mage: 'Erudition',
      Shaman: 'Harmony',
      Warlock: 'Nihility',
      Knight: 'Preservation',
      Priest: 'Abundance',
      Memory: 'Remembrance',
      Elation: 'Elation'
    });
  });

  it('manifest 必须覆盖角色、属性与命途的完整需求集合', () => {
    const source = manifest({
      previews: ['1001'],
      portraits: ['1001'],
      elements: ['Fire'],
      paths: ['Warrior']
    });
    expect(
      manifestCoversRequirements(source, {
        characterIds: ['1001'],
        lightConeIds: [],
        relicSetIds: [],
        relicPropertyIcons: [],
        elements: ['Fire'],
        paths: ['Warrior']
      })
    ).toBe(true);
    expect(
      manifestCoversRequirements(source, {
        characterIds: ['1001', '1002'],
        lightConeIds: [],
        relicSetIds: [],
        relicPropertyIcons: [],
        elements: ['Fire'],
        paths: ['Warrior']
      })
    ).toBe(false);
  });

  it('小型 fixture 生成 960 以内透明 WebP 立绘和 64px PNG 图标', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'hsr-assets-image-'));
    temporaryDirectories.push(root);
    const source = path.join(root, 'source.png');
    const portrait = path.join(root, 'portrait.webp');
    const icon = path.join(root, 'icon.png');
    await sharp({
      create: {
        width: 1200,
        height: 1000,
        channels: 4,
        background: { r: 50, g: 60, b: 70, alpha: 0.5 }
      }
    })
      .png()
      .toFile(source);
    await writePortraitAsset(source, portrait);
    await writeSemanticIconAsset(source, icon);
    const portraitMeta = await sharp(portrait).metadata();
    const iconMeta = await sharp(icon).metadata();
    expect(portraitMeta.format).toBe('webp');
    expect(portraitMeta.width).toBeLessThanOrEqual(960);
    expect(portraitMeta.hasAlpha).toBe(true);
    expect(iconMeta).toMatchObject({ format: 'png', width: 64, height: 64, hasAlpha: true });
  });

  it('当前 manifest 覆盖角色、光锥、遗器套装、遗器属性和语义图标需求', async () => {
    const requirements = await readAssetRequirements();
    const generated = await readAssetManifest();
    expect(requirements.characterIds).toHaveLength(95);
    expect(requirements.lightConeIds).toHaveLength(165);
    expect(requirements.relicSetIds).toHaveLength(60);
    expect(new Set(requirements.relicPropertyIcons.map((entry) => entry.iconKey)).size).toBe(18);
    expect(requirements.elements).toHaveLength(7);
    expect(requirements.paths).toHaveLength(9);
    for (const id of ['1014', '1015', '1508', '1509'])
      expect(requirements.characterIds).toContain(id);
    expect(generated).toBeDefined();
    expect(manifestCoversRequirements(generated!, requirements)).toBe(true);
    for (const id of ['1014', '1015', '1508', '1509']) {
      expect(generated!.characters.previews.available).toContain(id);
      expect(generated!.characters.portraits.available).toContain(id);
    }
    for (const id of ['20000', '21015', '23000']) {
      expect(requirements.lightConeIds).toContain(id);
      expect(generated!.lightCones.previews.available).toContain(id);
    }
    expect(generated!.relics.icons.available).toHaveLength(60);
    expect(generated!.relicProperties.icons.available).toHaveLength(18);
    expect(generated).not.toHaveProperty('characterNames');
  });

  it('空 manifest 安全降级且不暴露任何 URL', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'hsr-assets-empty-'));
    temporaryDirectories.push(root);
    const file = path.join(root, 'manifest.json');
    const empty = manifest();
    await writeFile(file, JSON.stringify(empty));
    const parsed = JSON.parse(await readFile(file, 'utf8')) as VisualAssetManifest;
    expect(resolveCharacterPreviewAsset('1001', parsed)).toBeUndefined();
    expect(resolveCharacterPortraitAsset('1001', parsed)).toBeUndefined();
    expect(resolveLightConePreviewAsset('20000', parsed)).toBeUndefined();
    expect(resolveRelicSetIconAsset('101', parsed)).toBeUndefined();
    expect(resolveRelicPropertyIconAsset('IconAttack', parsed)).toBeUndefined();
  });

  it('角色 preview index 只解析网站需要的 95 个 ID 并拒绝越界路径', async () => {
    const root = assertAssetRoot(resolveAssetRoot());
    const requirements = await readAssetRequirements();
    const sources = await readCharacterPreviewSources(root, requirements.characterIds);
    const index = JSON.parse(
      await readFile(path.join(root, 'index_new', 'cn', 'characters.json'), 'utf8')
    ) as Record<string, { preview?: string }>;
    expect(sources.size).toBe(95);
    expect(Object.values(index).filter((entry) => entry.preview)).toHaveLength(95);
    expect([...sources.keys()].sort()).toEqual(requirements.characterIds);
    expect(() => resolveIndexedAssetPath(root, '../outside.png')).toThrow(/越界/);
    expect(() =>
      resolveIndexedAssetPath(root, 'image/character_preview/../../outside.png')
    ).toThrow(/越界/);
    const sampleId = requirements.characterIds[0];
    expect(
      await readFile(
        path.join(
          process.cwd(),
          'static',
          'generated-assets',
          'characters',
          'preview',
          `${sampleId}.png`
        )
      )
    ).toEqual(await readFile(sources.get(sampleId)!));
  });

  it('光锥 preview index 以网站需求 ID 显式映射 165 张 348×408 PNG', async () => {
    const root = assertAssetRoot(resolveAssetRoot());
    const requirements = await readAssetRequirements();
    const sources = await readLightConePreviewSources(root, requirements.lightConeIds);
    const index = JSON.parse(
      await readFile(path.join(root, 'index_new', 'cn', 'light_cones.json'), 'utf8')
    ) as Record<string, { id?: string; preview?: string }>;
    expect(sources.size).toBe(165);
    expect(Object.values(index).filter((entry) => entry.preview)).toHaveLength(165);
    expect([...sources.keys()].sort()).toEqual(requirements.lightConeIds);
    for (const id of ['20000', '21015', '23000']) {
      expect(index[id]).toMatchObject({
        id,
        preview: `image/light_cone_preview/${id}.png`
      });
      const metadata = await sharp(sources.get(id)!).metadata();
      expect(metadata).toMatchObject({ format: 'png', width: 348, height: 408 });
    }
  });

  it('遗器资源只同步 60 张套装图标与 18 张属性图标，不生成单件遗器图片', async () => {
    const root = assertAssetRoot(resolveAssetRoot());
    const requirements = await readAssetRequirements();
    const setSources = await readRelicSetIconSources(root, requirements.relicSetIds);
    const propertySources = await readRelicPropertyIconSources(
      root,
      requirements.relicPropertyIcons
    );
    expect(setSources.size).toBe(60);
    expect(propertySources.size).toBe(18);
    for (const [id, source] of setSources) {
      expect(path.basename(source)).toBe(`${id}.png`);
      expect(path.basename(source)).not.toMatch(/_\d+\.png$/);
      expect(await sharp(source).metadata()).toMatchObject({
        format: 'png',
        width: 128,
        height: 128
      });
    }
    const generatedRelicFiles = await readdir(
      path.join(process.cwd(), 'static', 'generated-assets', 'relics', 'icons')
    );
    expect(generatedRelicFiles).toHaveLength(60);
    expect(generatedRelicFiles.some((file) => /_\d+\.png$/.test(file))).toBe(false);
  });

  it('生成目录仅包含需求驱动的 preview，旧 avatar 输出不存在', async () => {
    const generated = await readAssetManifest();
    const files = await readdir(
      path.join(process.cwd(), 'static', 'generated-assets', 'characters', 'preview')
    );
    expect(files.filter((file) => file.endsWith('.png'))).toHaveLength(
      generated!.characters.previews.available.length
    );
    await expect(
      readdir(path.join(process.cwd(), 'static', 'generated-assets', 'characters', 'avatar'))
    ).rejects.toMatchObject({ code: 'ENOENT' });
    const lightConeFiles = await readdir(
      path.join(process.cwd(), 'static', 'generated-assets', 'light-cones', 'preview')
    );
    expect(lightConeFiles.filter((file) => file.endsWith('.png'))).toHaveLength(165);
    await expect(
      readdir(path.join(process.cwd(), 'static', 'generated-assets', 'light-cones', 'portrait'))
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
