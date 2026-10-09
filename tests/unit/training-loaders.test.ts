import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createTrainingLoader } from '../../src/lib/data/training';
import {
  assertCharacterTrainingData,
  assertTrainingSharedData,
  validateTrainingBundle
} from '../../src/lib/domain/training/validation';
import { readSelectedTable, readRaw } from '../../scripts/data/raw';
import { staticGeneratedRoot } from '../../scripts/data/paths';
import { createTextResolver } from '../../scripts/data/localization';
import { projectMaterials } from '../../scripts/data/projection/material';
import { parseTextHash } from '../../src/lib/domain/types';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('training loading and source boundaries', () => {
  it('strictly parses only selected constants while preserving lossless hashes', async () => {
    const root = await mkdtemp(path.join(process.cwd(), '.training-source-'));
    directories.push(root);
    await mkdir(path.join(root, 'ExcelOutput'));
    await writeFile(
      path.join(root, 'ExcelOutput', 'Constants.json'),
      '[{"ConstValueName":"Other","Value":{"IntValue":1,"IntValue":2}},{"ConstValueName":"Selected","Hash":18446744073709551615,"Value":{"IntValue":10},"Text":"escaped \\" } ]"}]'
    );
    expect(await readSelectedTable(root, 'Constants', 'ConstValueName', 'Selected')).toEqual([
      {
        ConstValueName: 'Selected',
        Hash: '18446744073709551615',
        Value: { IntValue: 10 },
        Text: 'escaped " } ]'
      }
    ]);
    await expect(readRaw(root, 'ExcelOutput/Constants.json')).rejects.toThrow('Duplicate key');
    await writeFile(
      path.join(root, 'ExcelOutput', 'Constants.json'),
      '[{"ConstValueName":"Selected","Value":{"IntValue":1,"IntValue":2}}]'
    );
    await expect(
      readSelectedTable(root, 'Constants', 'ConstValueName', 'Selected')
    ).rejects.toThrow('Duplicate key');
    await writeFile(
      path.join(root, 'ExcelOutput', 'Constants.json'),
      '[{"ConstValueName":"Selected"}'
    );
    await expect(
      readSelectedTable(root, 'Constants', 'ConstValueName', 'Selected')
    ).rejects.toThrow('incomplete JSON');
  });

  it('projects each locale with the existing lossless text resolver and rejects missing names', async () => {
    const material = {
      id: '2',
      mainType: 'Virtual',
      subType: 'Virtual',
      rarity: 'Normal',
      iconKey: '2',
      nameSource: {
        kind: 'direct' as const,
        ref: { kind: 'hash' as const, hash: parseTextHash('18446744073709551615')! }
      }
    };
    for (const locale of ['zh-CN', 'en'] as const) {
      const value = locale === 'en' ? 'fixture credits' : '合成信用点';
      const resolver = await createTextResolver(
        { locale, textMapCode: locale === 'en' ? 'EN' : 'CHS' },
        { '18446744073709551615': value }
      );
      expect(projectMaterials([material], locale, resolver).materials[0].name).toBe(value);
    }
    const missing = await createTextResolver({ locale: 'en', textMapCode: 'EN' }, {});
    expect(() => projectMaterials([material], 'en', missing)).toThrow();
  });

  it('loads lazy static shards, isolates locale caches, and retries failed requests', async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      const relative = String(url).slice('/generated/'.length);
      return new Response(await readFile(path.join(staticGeneratedRoot, relative), 'utf8'));
    }) as unknown as typeof fetch;
    const loader = createTrainingLoader(fetcher);
    const [a, b] = await Promise.all([loader.loadCharacter('1510'), loader.loadCharacter('1510')]);
    expect(a).toBe(b);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(loader.loadLightCone('20000')).resolves.toMatchObject({ equipmentId: '20000' });
    const shared = await loader.loadShared();
    const [zh, en] = await Promise.all([loader.loadMaterials('zh-CN'), loader.loadMaterials('en')]);
    assertTrainingSharedData(shared);
    expect(zh.locale).toBe('zh-CN');
    expect(en.locale).toBe('en');
    expect(zh.materials.map((material) => material.id)).toEqual(
      en.materials.map((material) => material.id)
    );
    const retryFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(en)));
    const retry = createTrainingLoader(retryFetch as typeof fetch);
    await expect(retry.loadMaterials('en')).rejects.toMatchObject({ code: 'load-failed' });
    await expect(retry.loadMaterials('en')).resolves.toEqual(en);
    expect(retryFetch).toHaveBeenCalledTimes(2);
    expect(() => loader.loadCharacter('../1510')).toThrow();
    expect(() => loader.loadMaterials('fr' as never)).toThrow();
  });

  it('rejects corrupt shard identities, unknown versions, dangling materials, and wrong locales', async () => {
    const loader = createTrainingLoader(
      vi
        .fn()
        .mockResolvedValue(
          new Response('{"schemaVersion":1,"locale":"zh-CN","materials":[]}')
        ) as typeof fetch
    );
    await expect(loader.loadMaterials('en')).rejects.toMatchObject({
      code: 'material-locale-mismatch'
    });
    expect(() => assertTrainingSharedData({ schemaVersion: 2 })).toThrow();
    const character = JSON.parse(
      await readFile(path.join(staticGeneratedRoot, 'training/characters/1510.json'), 'utf8')
    );
    const shared = JSON.parse(
      await readFile(path.join(staticGeneratedRoot, 'training/shared.json'), 'utf8')
    );
    shared.materials = shared.materials.filter((material: { id: string }) => material.id !== '2');
    expect(() =>
      validateTrainingBundle({ shared, characters: [character], lightCones: [] })
    ).toThrow('missing-material-reference');
    character.profiles[0].nodes[0].prerequisiteIds = ['999999'];
    expect(() => assertCharacterTrainingData(character)).toThrow();
    const wrongIdentity = createTrainingLoader(
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            await readFile(path.join(staticGeneratedRoot, 'training/characters/1001.json'), 'utf8')
          )
        ) as typeof fetch
    );
    await expect(wrongIdentity.loadCharacter('1510')).rejects.toMatchObject({
      code: 'avatar-mismatch'
    });
  });
});
