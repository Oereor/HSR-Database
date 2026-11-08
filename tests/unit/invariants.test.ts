import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ELEMENT_COLORS, getElementColor } from '../../src/lib/domain/elements';
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

async function siteStyles(): Promise<string> {
  const layoutPath = path.join(root, 'src', 'routes', '+layout.svelte');
  const layout = await readFile(layoutPath, 'utf8');
  const pending = [...layout.matchAll(/\bimport\s+['"](\.[^'"]+\.css)['"]/g)].map((match) =>
    path.resolve(path.dirname(layoutPath), match[1])
  );
  const sources = new Map<string, string>();
  for (const file of pending) {
    if (sources.has(file)) continue;
    const css = await readFile(file, 'utf8');
    sources.set(file, css);
    for (const [, local] of css.matchAll(/@import\s+['"](\.[^'"]+\.css)['"]/g))
      pending.push(path.resolve(path.dirname(file), local));
  }
  return [...sources.values()].join('\n');
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

  it('生成器只声明受支持的 CHS/EN TextMap，浏览器不读取 TextMap', async () => {
    const files = await sourceFiles(path.join(root, 'scripts'));
    const sources = await Promise.all(files.map((file) => readFile(file, 'utf8')));
    const combined = sources.join('\n');
    expect(combined).toContain("path.join(root, 'TextMap', 'TextMapCHS.json')");
    expect(combined).toContain('TextMapEN.json');
    expect(combined).not.toMatch(/TextMapMain|TextMap(?:JP|KR|CHT)|locale state/i);
  });

  it('站点样式为技能数值色提供唯一的语义 token', async () => {
    const css = await siteStyles();
    expect(css.match(/--skill-scaling-value-color\s*:/g)).toHaveLength(1);
    expect(css).toContain('var(--skill-scaling-value-color)');
  });

  it('属性色解析兼容上游雷属性和未知属性', () => {
    expect(getElementColor('Thunder')).toBe(ELEMENT_COLORS.Lightning);
    expect(getElementColor('Unknown')).toBe('inherit');
  });

  it('浏览器源码不读取原始 Config 或完整 TextMap', async () => {
    const files = await sourceFiles(path.join(root, 'src'));
    const sources = await Promise.all(files.map((file) => readFile(file, 'utf8')));
    expect(sources.join('\n')).not.toMatch(
      /AvatarSkillConfig|EquipmentSkillConfig|TextMap(?:CHS|EN)\.json/
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

  it('游戏文本始终通过安全 token 渲染而不使用 raw HTML', async () => {
    const files = await sourceFiles(path.join(root, 'src'));
    const sources = await Promise.all(files.map((file) => readFile(file, 'utf8')));
    expect(sources.join('\n')).not.toContain('{@html');
  });

  it('搜索页使用共享本地化消息能力', async () => {
    const source = await readFile(
      path.join(root, 'src', 'routes', 'search', '+page.svelte'),
      'utf8'
    );
    expect(source).toContain('search_hero_title');
    expect(source).not.toMatch(/多语言|其他语言|language switch/i);
  });

  it('有限养成材料详情不扩展为独立物品路由或敌人掉落入口', async () => {
    const files = await sourceFiles(path.join(root, 'src'));
    const sources = await Promise.all(files.map((file) => readFile(file, 'utf8')));
    const combined = sources.join('\n');
    expect(combined).not.toMatch(
      /href=["'`]\/(?:en\/)?items(?:\/|["'`])|kind:\s*["']item["']|detail\.drops/
    );
    const routes = await sourceFiles(path.join(root, 'src', 'routes'));
    expect(
      routes.some((file) =>
        path
          .relative(path.join(root, 'src', 'routes'), file)
          .split(path.sep)
          .includes('items')
      )
    ).toBe(false);
  });
});
