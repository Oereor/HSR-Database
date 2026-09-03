import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { siteRoot } from './prepare.js';

const GENERATED_NAMESPACES = ['/generated-assets/', '/generated-enemy-assets/'] as const;
const TEXT_EXTENSIONS = new Set(['.html', '.js', '.css', '.json']);

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(file)));
    else if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      files.push(file);
  }
  return files;
}

async function existsWithExactCase(root: string, relative: string): Promise<boolean> {
  let current = root;
  for (const segment of relative.split('/')) {
    if (!segment || segment === '.' || segment === '..') return false;
    let names: string[];
    try {
      names = await readdir(current);
    } catch {
      return false;
    }
    if (!names.includes(segment)) return false;
    current = path.join(current, segment);
  }
  try {
    await access(current);
    return true;
  } catch {
    return false;
  }
}

function referencedAssetUrls(text: string): string[] {
  const urls = new Set<string>();
  for (const namespace of GENERATED_NAMESPACES) {
    const pattern = new RegExp(`${namespace.replaceAll('/', '\\/')}[^\\s"'<>\\)\\]}]+`, 'g');
    for (const match of text.matchAll(pattern)) urls.add(match[0]);
  }
  return [...urls];
}

export async function verifyBuildAssetClosure(
  buildRoot = path.join(siteRoot, 'build')
): Promise<void> {
  const files = await walk(buildRoot);
  const missing: string[] = [];
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    for (const rawUrl of referencedAssetUrls(text)) {
      if (rawUrl.includes('${') || rawUrl.includes('{')) continue;
      if (rawUrl.includes('\\')) {
        missing.push(`${path.relative(buildRoot, file)} -> ${rawUrl} (反斜杠 URL)`);
        continue;
      }
      let url: string;
      try {
        url = decodeURIComponent(rawUrl)
          .replace(/&(quot|apos|#x27|#39);$/i, '')
          .split(/[?#]/, 1)[0];
      } catch {
        missing.push(`${path.relative(buildRoot, file)} -> ${rawUrl} (URL 编码非法)`);
        continue;
      }
      if (!url.startsWith('/generated-assets/') && !url.startsWith('/generated-enemy-assets/'))
        continue;
      const relative = url.slice(1);
      if (relative.split('/').includes('..')) {
        missing.push(`${path.relative(buildRoot, file)} -> ${rawUrl} (路径越界)`);
        continue;
      }
      if (!(await existsWithExactCase(buildRoot, relative)))
        missing.push(`${path.relative(buildRoot, file)} -> ${rawUrl}`);
    }
  }
  if (missing.length)
    throw new Error(
      `最终 build 存在 ${missing.length} 个无效视觉资源引用：\n${missing.join('\n')}`
    );
  console.log(`最终 build 视觉资源引用闭包验证通过：扫描 ${files.length} 个文本文件。`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename))
  await verifyBuildAssetClosure();
