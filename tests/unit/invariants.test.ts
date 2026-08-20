import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTextHash, type TextHash } from '../../src/lib/domain/types';

const root = process.cwd();

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? sourceFiles(target) : Promise.resolve([target]);
    })
  );
  return files.flat().filter((file) => /\.(?:ts|svelte|css)$/.test(file));
}

describe('重构 invariants', () => {
  it('TextHash 只能由十进制字符串验证构造', () => {
    const acceptHash = (hash: TextHash): string => hash;
    const hash = parseTextHash('6186714091647966180');
    expect(hash).toBe('6186714091647966180');
    expect(acceptHash(hash!)).toBe('6186714091647966180');
    expect(parseTextHash(6186714091647966180n)).toBeUndefined();
    expect(parseTextHash('hash-1001')).toBeUndefined();
    // @ts-expect-error Plain strings must not enter the direct Hash API without validation.
    acceptHash('6186714091647966180');
  });

  it('运行时代码只声明唯一简中 TextMap 路径', async () => {
    const files = await sourceFiles(path.join(root, 'scripts'));
    const sources = await Promise.all(files.map((file) => readFile(file, 'utf8')));
    const combined = sources.join('\n');
    expect(combined).toContain("path.join(root, 'TextMap', 'TextMapCHS.json')");
    expect(combined).not.toMatch(/TextMapMain|TextMap(?:EN|JP|KR|CHT)|i18n|locale state/i);
  });

  it('属性色与技能橙色各自只有一个运行时定义位置', async () => {
    const files = await sourceFiles(path.join(root, 'src'));
    const colorPattern = /#(?:b6b6b6|f25740|6dc4ea|d46aeb|7ad8a5|8a86de|fee554)/gi;
    const orangePattern = /#f2a45f/gi;
    const elementFiles: string[] = [];
    const orangeFiles: string[] = [];
    for (const file of files) {
      const source = await readFile(file, 'utf8');
      if (colorPattern.test(source)) elementFiles.push(path.relative(root, file));
      colorPattern.lastIndex = 0;
      if (orangePattern.test(source)) orangeFiles.push(path.relative(root, file));
      orangePattern.lastIndex = 0;
    }
    expect(elementFiles).toEqual([path.join('src', 'lib', 'domain', 'elements.ts')]);
    expect(orangeFiles).toEqual([path.join('src', 'styles', 'app.css')]);
  });

  it('浏览器源码不读取原始 Config 或完整 TextMap', async () => {
    const files = await sourceFiles(path.join(root, 'src'));
    const sources = await Promise.all(files.map((file) => readFile(file, 'utf8')));
    expect(sources.join('\n')).not.toMatch(
      /AvatarSkillConfig|EquipmentSkillConfig|TextMapCHS\.json/
    );
  });

  it('视觉资源只按 ID 解析且浏览器不读取 sibling 仓库', async () => {
    const files = await sourceFiles(path.join(root, 'src'));
    const sources = await Promise.all(files.map((file) => readFile(file, 'utf8')));
    const combined = sources.join('\n');
    expect(combined).not.toMatch(/\.\.\/StarRailRes|icon\/avatar/);
    expect(combined).toContain("'characters/preview'");
    expect(combined).toContain("'characters/portrait'");
  });

  it('共享 Overview card 不包含 Character 或 Enemy 领域语义', async () => {
    const source = await readFile(
      path.join(root, 'src', 'lib', 'components', 'EntityOverviewCard.svelte'),
      'utf8'
    );
    expect(source).not.toMatch(
      /CatalogEntry|Character|Enemy|rarity|pathName|elementName|weakness|rank/i
    );
    expect(source).toContain('<slot name="overlay" />');
    expect(source).toContain('<slot name="title" />');
    expect(source).toContain('<slot name="metadata" />');
    expect(source).not.toMatch(/subtitle|__fade|slot name="tags"/);
  });

  it('游戏文本始终通过安全 token 渲染而不使用 raw HTML', async () => {
    const files = await sourceFiles(path.join(root, 'src'));
    const sources = await Promise.all(files.map((file) => readFile(file, 'utf8')));
    expect(sources.join('\n')).not.toContain('{@html');
  });

  it('搜索页只声明简体中文能力', async () => {
    const source = await readFile(
      path.join(root, 'src', 'routes', 'search', '+page.svelte'),
      'utf8'
    );
    expect(source).toContain('简体中文搜索');
    expect(source).not.toMatch(/多语言|其他语言|language switch/i);
  });

  it('浏览器领域不再暴露物品、材料或敌人掉落入口', async () => {
    const files = await sourceFiles(path.join(root, 'src'));
    const sources = await Promise.all(files.map((file) => readFile(file, 'utf8')));
    const combined = sources.join('\n');
    expect(combined).not.toMatch(/href=["'`]\/items|kind:\s*["']item["']|MaterialCost/);
    expect(combined).not.toMatch(/detail\.drops|晋阶材料|养成材料|掉落物/);
  });
});
