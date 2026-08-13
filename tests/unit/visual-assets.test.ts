import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import {
  resolveCharacterAvatarAsset,
  resolveCharacterPortraitAsset,
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
  readAssetManifest,
  readAssetRequirements,
  VISUAL_ASSET_SCHEMA_VERSION,
  writePortraitAsset,
  writeSemanticIconAsset
} from '../../scripts/assets/shared';

sharp.cache(false);

const temporaryDirectories: string[] = [];
const available = (values: string[]): AssetAvailability => ({ available: values, missing: [] });
const manifest = (options?: {
  avatars?: string[];
  portraits?: string[];
  elements?: string[];
  paths?: string[];
}): VisualAssetManifest => ({
  schemaVersion: VISUAL_ASSET_SCHEMA_VERSION,
  generatedAt: '2026-01-01T00:00:00.000Z',
  characters: {
    avatars: available(options?.avatars ?? []),
    portraits: available(options?.portraits ?? [])
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

  it('只接受具有 Git 标记和四类源目录的资源仓库', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'hsr-assets-'));
    temporaryDirectories.push(root);
    await mkdir(path.join(root, '.git'));
    for (const relative of [
      'icon/avatar',
      'image/character_portrait',
      'icon/element',
      'icon/path'
    ]) {
      await mkdir(path.join(root, relative), { recursive: true });
    }
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
      avatars: ['1001'],
      portraits: ['1001'],
      elements: ['Lightning'],
      paths: ['Memory']
    });
    expect(resolveCharacterAvatarAsset('1001', source)).toBe(
      '/generated-assets/characters/avatar/1001.png'
    );
    expect(resolveCharacterPortraitAsset('1001', source)).toBe(
      '/generated-assets/characters/portrait/1001.webp'
    );
    expect(resolveElementIconAsset('Lightning', source)).toBe(
      '/generated-assets/elements/Lightning.png'
    );
    expect(resolvePathIconAsset('Memory', source)).toBe('/generated-assets/paths/Memory.png');
    expect(resolveCharacterAvatarAsset('1002', source)).toBeUndefined();
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
      avatars: ['1001'],
      portraits: ['1001'],
      elements: ['Fire'],
      paths: ['Warrior']
    });
    expect(
      manifestCoversRequirements(source, {
        characterIds: ['1001'],
        elements: ['Fire'],
        paths: ['Warrior']
      })
    ).toBe(true);
    expect(
      manifestCoversRequirements(source, {
        characterIds: ['1001', '1002'],
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

  it('当前 manifest 覆盖 91 个角色、7 属性和 9 命途且无需名称映射', async () => {
    const requirements = await readAssetRequirements();
    const generated = await readAssetManifest();
    expect(requirements.characterIds).toHaveLength(91);
    expect(requirements.elements).toHaveLength(7);
    expect(requirements.paths).toHaveLength(9);
    expect(generated).toBeDefined();
    expect(manifestCoversRequirements(generated!, requirements)).toBe(true);
    expect(generated).not.toHaveProperty('characterNames');
  });

  it('空 manifest 安全降级且不暴露任何 URL', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'hsr-assets-empty-'));
    temporaryDirectories.push(root);
    const file = path.join(root, 'manifest.json');
    const empty = manifest();
    await writeFile(file, JSON.stringify(empty));
    const parsed = JSON.parse(await readFile(file, 'utf8')) as VisualAssetManifest;
    expect(resolveCharacterAvatarAsset('1001', parsed)).toBeUndefined();
    expect(resolveCharacterPortraitAsset('1001', parsed)).toBeUndefined();
  });

  it('生成目录仅包含需求驱动的四类输出', async () => {
    const generated = await readAssetManifest();
    const files = await readdir(
      path.join(process.cwd(), 'static', 'generated-assets', 'characters', 'avatar')
    );
    expect(files.filter((file) => file.endsWith('.png'))).toHaveLength(
      generated!.characters.avatars.available.length
    );
  });
});
