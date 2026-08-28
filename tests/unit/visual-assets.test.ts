import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import {
  resolveCharacterPreviewAsset,
  resolveCharacterPortraitAsset,
  resolveLightConePreviewAsset,
  resolveLightConePortraitAsset,
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
  generateLightConePortraitAssets,
  generateVisualAssets,
  manifestCoversRequirements,
  PATH_SOURCE_NAMES,
  readCharacterPreviewSources,
  readLightConePreviewSources,
  readLightConePortraitSources,
  readRelicPropertyIconSources,
  readRelicSetIconSources,
  readAssetManifest,
  readAssetRequirements,
  VISUAL_ASSET_SCHEMA_VERSION,
  resolveIndexedAssetPath,
  validateGeneratedAssetFiles,
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
  lightConePortraits?: string[];
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
    previews: available(options?.lightConePreviews ?? []),
    portraits: available(options?.lightConePortraits ?? [])
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
      'image/light_cone_portrait',
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
      lightConePortraits: ['20000'],
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
    expect(resolveLightConePortraitAsset('20000', source)).toBe(
      '/generated-assets/light-cones/portrait/20000.webp'
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
    expect(resolveLightConePortraitAsset('20001', source)).toBeUndefined();
    expect(resolveCharacterPortraitAsset('../1001', source)).toBeUndefined();
    expect(resolveLightConePortraitAsset('../20000', source)).toBeUndefined();
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
      lightConePreviews: ['20000'],
      lightConePortraits: ['20000'],
      elements: ['Fire'],
      paths: ['Warrior']
    });
    expect(
      manifestCoversRequirements(source, {
        characterIds: ['1001'],
        lightConeIds: ['20000'],
        relicSetIds: [],
        relicPropertyIcons: [],
        elements: ['Fire'],
        paths: ['Warrior']
      })
    ).toBe(true);
    expect(
      manifestCoversRequirements(source, {
        characterIds: ['1001', '1002'],
        lightConeIds: ['20000'],
        relicSetIds: [],
        relicPropertyIcons: [],
        elements: ['Fire'],
        paths: ['Warrior']
      })
    ).toBe(false);
  });

  it('小型 portrait fixture 保持比例并生成不放大的 960px 内透明 WebP', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'hsr-assets-image-'));
    temporaryDirectories.push(root);
    const source = path.join(root, 'source.png');
    const portrait = path.join(root, 'portrait.webp');
    const icon = path.join(root, 'icon.png');
    await sharp({
      create: {
        width: 904,
        height: 1260,
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
    expect(portraitMeta).toMatchObject({ format: 'webp', width: 689, height: 960, hasAlpha: true });
    expect(iconMeta).toMatchObject({ format: 'png', width: 64, height: 64, hasAlpha: true });
  });

  it('光锥 portrait 生成将有效 index PNG 写入隔离 WebP 输出目录', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'hsr-light-cone-portrait-generate-'));
    temporaryDirectories.push(root);
    const portraitDirectory = path.join(root, 'image', 'light_cone_portrait');
    const indexDirectory = path.join(root, 'index_new', 'cn');
    const outputDirectory = path.join(root, 'output');
    await Promise.all([
      mkdir(portraitDirectory, { recursive: true }),
      mkdir(indexDirectory, { recursive: true })
    ]);
    await sharp({
      create: {
        width: 904,
        height: 1260,
        channels: 4,
        background: { r: 50, g: 60, b: 70, alpha: 0.5 }
      }
    })
      .png()
      .toFile(path.join(portraitDirectory, '20000.png'));
    await writeFile(
      path.join(indexDirectory, 'light_cones.json'),
      JSON.stringify({
        20000: { id: '20000', portrait: 'image/light_cone_portrait/20000.png' }
      })
    );

    const generated = await generateLightConePortraitAssets(root, ['20000'], outputDirectory);
    const output = path.join(outputDirectory, '20000.webp');
    const files = await readdir(outputDirectory);
    const metadata = await sharp(output).metadata();

    expect(generated).toEqual({ available: ['20000'], missing: [] });
    expect(files.filter((file) => file.endsWith('.webp'))).toHaveLength(generated.available.length);
    expect(metadata).toMatchObject({ format: 'webp', width: 689, height: 960 });
    expect(metadata.width! / metadata.height!).toBeCloseTo(904 / 1260, 3);
  });

  it('当前 manifest 覆盖角色、光锥、遗器套装、遗器属性和语义图标需求', async () => {
    const requirements = await readAssetRequirements();
    const generated = await readAssetManifest();
    expect(requirements.characterIds).toHaveLength(97);
    expect(requirements.lightConeIds).toHaveLength(169);
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
    expect(generated!.characters.previews.missing).toEqual(['1512', '1513']);
    expect(generated!.characters.portraits.missing).toEqual(['1512', '1513']);
    for (const id of ['20000', '21015', '23000']) {
      expect(requirements.lightConeIds).toContain(id);
      expect(generated!.lightCones.previews.available).toContain(id);
    }
    expect(generated!.lightCones.previews.missing).toEqual(['21066', '22008', '23063', '23064']);
    expect(generated!.lightCones.portraits.missing).toEqual(['21066', '22008', '23063', '23064']);
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
    expect(resolveLightConePortraitAsset('20000', parsed)).toBeUndefined();
    expect(resolveRelicSetIconAsset('101', parsed)).toBeUndefined();
    expect(resolveRelicPropertyIconAsset('IconAttack', parsed)).toBeUndefined();
  });

  it('角色 preview index 解析上游已有 ID 并为缺失的 4.5 资源保留 fallback', async () => {
    const root = assertAssetRoot(resolveAssetRoot());
    const requirements = await readAssetRequirements();
    const sources = await readCharacterPreviewSources(root, requirements.characterIds);
    const index = JSON.parse(
      await readFile(path.join(root, 'index_new', 'cn', 'characters.json'), 'utf8')
    ) as Record<string, { preview?: string }>;
    expect(sources.size).toBe(95);
    expect(Object.values(index).filter((entry) => entry.preview)).toHaveLength(95);
    expect([...sources.keys()].sort()).toEqual(
      requirements.characterIds.filter((id) => !['1512', '1513'].includes(id))
    );
    expect(requirements.characterIds.filter((id) => !sources.has(id))).toEqual(['1512', '1513']);
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

  it('光锥 preview index 显式映射已有的 165 张 348×408 PNG', async () => {
    const root = assertAssetRoot(resolveAssetRoot());
    const requirements = await readAssetRequirements();
    const sources = await readLightConePreviewSources(root, requirements.lightConeIds);
    const index = JSON.parse(
      await readFile(path.join(root, 'index_new', 'cn', 'light_cones.json'), 'utf8')
    ) as Record<string, { id?: string; preview?: string }>;
    expect(sources.size).toBe(165);
    expect(Object.values(index).filter((entry) => entry.preview)).toHaveLength(165);
    expect([...sources.keys()].sort()).toEqual(
      requirements.lightConeIds.filter((id) => !['21066', '22008', '23063', '23064'].includes(id))
    );
    expect(requirements.lightConeIds.filter((id) => !sources.has(id))).toEqual([
      '21066',
      '22008',
      '23063',
      '23064'
    ]);
    for (const id of ['20000', '21015', '23000']) {
      expect(index[id]).toMatchObject({
        id,
        preview: `image/light_cone_preview/${id}.png`
      });
      const metadata = await sharp(sources.get(id)!).metadata();
      expect(metadata).toMatchObject({ format: 'png', width: 348, height: 408 });
    }
  });

  it('光锥 portrait index 只读取上游已有的 165 张图片', async () => {
    const root = assertAssetRoot(resolveAssetRoot());
    const requirements = await readAssetRequirements();
    const sources = await readLightConePortraitSources(root, requirements.lightConeIds);
    const index = JSON.parse(
      await readFile(path.join(root, 'index_new', 'cn', 'light_cones.json'), 'utf8')
    ) as Record<string, { id?: string; portrait?: string }>;
    expect(sources.size).toBe(165);
    expect([...sources.keys()].sort()).toEqual(
      requirements.lightConeIds.filter((id) => !['21066', '22008', '23063', '23064'].includes(id))
    );
    expect(requirements.lightConeIds.filter((id) => !sources.has(id))).toEqual([
      '21066',
      '22008',
      '23063',
      '23064'
    ]);
    for (const id of sources.keys()) {
      expect(index[id]).toMatchObject({
        id,
        portrait: `image/light_cone_portrait/${id}.png`
      });
      expect(path.relative(root, sources.get(id)!).replaceAll('\\', '/')).toBe(
        `image/light_cone_portrait/${id}.png`
      );
    }
  });

  it('光锥 portrait index 拒绝错误目录、越界路径和不一致 ID', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'hsr-light-cone-portrait-index-'));
    temporaryDirectories.push(root);
    const indexDirectory = path.join(root, 'index_new', 'cn');
    await mkdir(indexDirectory, { recursive: true });
    const readSources = async (entry: unknown) => {
      await writeFile(
        path.join(indexDirectory, 'light_cones.json'),
        JSON.stringify({ 20000: entry })
      );
      return readLightConePortraitSources(root, ['20000']);
    };
    await expect(
      readSources({ id: '20000', portrait: 'image/light_cone_preview/20000.png' })
    ).rejects.toThrow(/light_cone_portrait/);
    await expect(readSources({ id: '20000', portrait: '../outside.png' })).rejects.toThrow(/越界/);
    await expect(
      readSources({ id: '20001', portrait: 'image/light_cone_portrait/20000.png' })
    ).rejects.toThrow(/identity/);
    await expect(readSources({ id: '20000', portrait: '' })).rejects.toThrow(/有效资源路径/);
    await expect(readSources({ id: '20000', portrait: 20000 })).rejects.toThrow(/有效资源路径/);
  });

  it('四类 index 将 null 与缺字段识别为临时缺失，但仍校验记录 identity', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'hsr-null-index-'));
    temporaryDirectories.push(root);
    const indexDirectory = path.join(root, 'index_new', 'cn');
    await mkdir(indexDirectory, { recursive: true });
    await Promise.all([
      writeFile(
        path.join(indexDirectory, 'characters.json'),
        JSON.stringify({ 1001: { preview: null }, 1002: {} })
      ),
      writeFile(
        path.join(indexDirectory, 'light_cones.json'),
        JSON.stringify({ 20000: { id: '20000', preview: null, portrait: null } })
      ),
      writeFile(
        path.join(indexDirectory, 'relic_sets.json'),
        JSON.stringify({ 101: { id: '101', icon: null } })
      ),
      writeFile(
        path.join(indexDirectory, 'properties.json'),
        JSON.stringify({ HP: { type: 'HP', icon: null } })
      )
    ]);

    await expect(readCharacterPreviewSources(root, ['1001', '1002'])).resolves.toEqual(new Map());
    await expect(readLightConePreviewSources(root, ['20000'])).resolves.toEqual(new Map());
    await expect(readLightConePortraitSources(root, ['20000'])).resolves.toEqual(new Map());
    await expect(readRelicSetIconSources(root, ['101'])).resolves.toEqual(new Map());
    await expect(
      readRelicPropertyIconSources(root, [{ propertyType: 'HP', iconKey: 'IconHP' }])
    ).resolves.toEqual(new Map());

    await writeFile(
      path.join(indexDirectory, 'light_cones.json'),
      JSON.stringify({ 20000: { id: '20001', preview: null } })
    );
    await expect(readLightConePreviewSources(root, ['20000'])).rejects.toThrow(/identity/);
  });

  it('生成器继续同步实际存在的资源，并只将 null 与 ENOENT 记为 missing', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'hsr-partial-assets-'));
    temporaryDirectories.push(root);
    const outputRoot = path.join(root, 'output');
    const indexDirectory = path.join(root, 'index_new', 'cn');
    const previewDirectory = path.join(root, 'image', 'character_preview');
    const portraitDirectory = path.join(root, 'image', 'character_portrait');
    await Promise.all([
      mkdir(indexDirectory, { recursive: true }),
      mkdir(previewDirectory, { recursive: true }),
      mkdir(portraitDirectory, { recursive: true })
    ]);
    await Promise.all([
      writeFile(
        path.join(indexDirectory, 'characters.json'),
        JSON.stringify({
          1001: { preview: 'image/character_preview/1001.png' },
          1002: { preview: null },
          1003: { preview: 'image/character_preview/1003.png' }
        })
      ),
      writeFile(path.join(indexDirectory, 'light_cones.json'), '{}'),
      writeFile(path.join(indexDirectory, 'relic_sets.json'), '{}'),
      writeFile(path.join(indexDirectory, 'properties.json'), '{}'),
      sharp({
        create: {
          width: 32,
          height: 32,
          channels: 4,
          background: { r: 1, g: 2, b: 3, alpha: 1 }
        }
      })
        .png()
        .toFile(path.join(previewDirectory, '1001.png')),
      sharp({
        create: {
          width: 32,
          height: 48,
          channels: 4,
          background: { r: 4, g: 5, b: 6, alpha: 1 }
        }
      })
        .png()
        .toFile(path.join(portraitDirectory, '1001.png'))
    ]);

    const generated = await generateVisualAssets(
      root,
      {
        characterIds: ['1001', '1002', '1003'],
        lightConeIds: [],
        relicSetIds: [],
        relicPropertyIcons: [],
        elements: [],
        paths: []
      },
      outputRoot
    );
    const candidate: VisualAssetManifest = {
      schemaVersion: VISUAL_ASSET_SCHEMA_VERSION,
      generatedAt: '2026-01-01T00:00:00.000Z',
      ...generated
    };

    expect(candidate.characters.previews).toEqual({
      available: ['1001'],
      missing: ['1002', '1003']
    });
    expect(candidate.characters.portraits).toEqual({
      available: ['1001'],
      missing: ['1002', '1003']
    });
    await expect(validateGeneratedAssetFiles(candidate, outputRoot)).resolves.toBeUndefined();
    expect(await readdir(path.join(outputRoot, 'characters', 'preview'))).toEqual(['1001.png']);

    await Promise.all([
      writeFile(
        path.join(indexDirectory, 'characters.json'),
        JSON.stringify({
          1001: { preview: 'image/character_preview/1001.png' },
          1002: { preview: 'image/character_preview/1002.png' },
          1003: { preview: 'image/character_preview/1003.png' }
        })
      ),
      sharp({
        create: {
          width: 32,
          height: 32,
          channels: 4,
          background: { r: 7, g: 8, b: 9, alpha: 1 }
        }
      })
        .png()
        .toFile(path.join(previewDirectory, '1002.png')),
      sharp({
        create: {
          width: 32,
          height: 48,
          channels: 4,
          background: { r: 10, g: 11, b: 12, alpha: 1 }
        }
      })
        .png()
        .toFile(path.join(portraitDirectory, '1002.png'))
    ]);
    const recovered = await generateVisualAssets(
      root,
      {
        characterIds: ['1001', '1002', '1003'],
        lightConeIds: [],
        relicSetIds: [],
        relicPropertyIcons: [],
        elements: [],
        paths: []
      },
      outputRoot
    );
    expect(recovered.characters.previews).toEqual({
      available: ['1001', '1002'],
      missing: ['1003']
    });
    expect(recovered.characters.portraits).toEqual({
      available: ['1001', '1002'],
      missing: ['1003']
    });
  });

  it('损坏图片保持致命错误，暂存失败不会触及已有发布目录', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'hsr-corrupt-assets-'));
    temporaryDirectories.push(root);
    const outputRoot = path.join(root, 'staging');
    const publishedRoot = path.join(root, 'published');
    const indexDirectory = path.join(root, 'index_new', 'cn');
    const previewDirectory = path.join(root, 'image', 'character_preview');
    const portraitDirectory = path.join(root, 'image', 'character_portrait');
    await Promise.all([
      mkdir(indexDirectory, { recursive: true }),
      mkdir(previewDirectory, { recursive: true }),
      mkdir(portraitDirectory, { recursive: true }),
      mkdir(publishedRoot, { recursive: true })
    ]);
    await Promise.all([
      writeFile(
        path.join(indexDirectory, 'characters.json'),
        JSON.stringify({ 1001: { preview: 'image/character_preview/1001.png' } })
      ),
      writeFile(path.join(indexDirectory, 'light_cones.json'), '{}'),
      writeFile(path.join(indexDirectory, 'relic_sets.json'), '{}'),
      writeFile(path.join(indexDirectory, 'properties.json'), '{}'),
      writeFile(path.join(previewDirectory, '1001.png'), 'not a png'),
      writeFile(path.join(portraitDirectory, '1001.png'), 'not a png'),
      writeFile(path.join(publishedRoot, 'sentinel.txt'), 'old cache')
    ]);

    await expect(
      generateVisualAssets(
        root,
        {
          characterIds: ['1001'],
          lightConeIds: [],
          relicSetIds: [],
          relicPropertyIcons: [],
          elements: [],
          paths: []
        },
        outputRoot
      )
    ).rejects.toThrow(/无法生成视觉资源 1001/);
    await expect(readFile(path.join(publishedRoot, 'sentinel.txt'), 'utf8')).resolves.toBe(
      'old cache'
    );
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

  it('生成目录仅包含需求驱动的 preview 与光锥 portrait 输出', async () => {
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
    const lightConePortraitFiles = await readdir(
      path.join(process.cwd(), 'static', 'generated-assets', 'light-cones', 'portrait')
    );
    expect(lightConePortraitFiles.filter((file) => file.endsWith('.webp'))).toHaveLength(
      generated!.lightCones.portraits.available.length
    );
  });
});
