import { lstat, readFile, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type { DataManifest } from '../../src/lib/domain/types.js';
import { siteRoot } from './prepare.js';

const GENERATED_NAMESPACES = ['/generated-assets/', '/generated-enemy-assets/'] as const;
const TEXT_EXTENSIONS = new Set(['.html', '.js', '.css', '.json']);
const PROBE_ROUTE = '/api/_deployment-probe';
const FORBIDDEN_FUNCTION_PATHS = [
  '.upstream/',
  'src/lib/generated/',
  'static/generated/',
  'generated-assets/',
  'generated-enemy-assets/',
  'node_modules/ai/',
  'node_modules/@ai-sdk/',
  'node_modules/flexsearch/'
] as const;
const FORBIDDEN_FUNCTION_TEXT = [
  'DEEPSEEK_API_KEY',
  'runDataAgent',
  '@ai-sdk/deepseek',
  '/generated-enemy-assets/'
] as const;

interface BuildPathIndex {
  paths: Set<string>;
  files: Map<string, number>;
  textFiles: string[];
}

interface BuildOutputRoute {
  src?: string;
  dest?: string;
  handle?: string;
}

interface BuildOutputConfig {
  version?: number;
  routes?: BuildOutputRoute[];
  overrides?: Record<string, { path?: string; contentType?: string }>;
}

export interface FunctionBundleStats {
  aliases: number;
  uniqueFunctions: number;
  files: number;
  bytes: number;
  runtime: string;
  target: string;
  largestFiles: { path: string; bytes: number }[];
}

export interface DeploymentOutputStats {
  canonicalRoutes: number;
  localizedRoutes: number;
  occurrenceShards: number;
  staticFiles: number;
  staticBytes: number;
  function: FunctionBundleStats;
}

async function walk(
  directory: string,
  root = directory,
  index: BuildPathIndex = { paths: new Set(), files: new Map(), textFiles: [] }
): Promise<BuildPathIndex> {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    const relative = path.relative(root, file).replaceAll('\\', '/');
    index.paths.add(relative);
    if (entry.isDirectory()) await walk(file, root, index);
    else if (entry.isFile()) {
      index.files.set(relative, (await stat(file)).size);
      if (TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) index.textFiles.push(file);
    }
  }
  return index;
}

async function requireDirectory(directory: string, label: string): Promise<void> {
  let value;
  try {
    value = await stat(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      throw new Error(`${label} 不存在：${directory}`, { cause: error });
    throw error;
  }
  if (!value.isDirectory()) throw new Error(`${label} 不是目录：${directory}`);
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
  buildRoot = path.join(siteRoot, '.vercel', 'output', 'static')
): Promise<void> {
  const index = await walk(buildRoot);
  const missing: string[] = [];
  for (const file of index.textFiles) {
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
      if (!index.paths.has(relative))
        missing.push(`${path.relative(buildRoot, file)} -> ${rawUrl}`);
    }
  }
  if (missing.length)
    throw new Error(
      `最终 static output 存在 ${missing.length} 个无效视觉资源引用：\n${missing.join('\n')}`
    );
  console.log(
    `最终 static output 视觉资源引用闭包验证通过：扫描 ${index.textFiles.length} 个文本文件，索引 ${index.paths.size} 条路径。`
  );
}

function localizedRoutes(manifest: DataManifest): string[] {
  return manifest.publicLocales.flatMap((locale) =>
    manifest.routePaths.map((route) =>
      locale === manifest.publicLocale ? route : `/${locale}${route === '/' ? '' : route}`
    )
  );
}

function routeToOverridePath(route: string): string {
  return route === '/' ? '' : route.slice(1);
}

function routeToDataFile(route: string): string {
  return route === '/' ? '__data.json' : `${route.slice(1)}/__data.json`;
}

async function readJson<T>(file: string, label: string): Promise<T> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      throw new Error(`${label} 不存在：${file}`, { cause: error });
    throw error;
  }
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(`${label} 不是合法 JSON：${file}`, { cause: error });
  }
}

async function verifyStaticSourceCopy(
  staticRoot: string,
  outputIndex: BuildPathIndex
): Promise<void> {
  const sourceIndex = await walk(staticRoot);
  const failures: string[] = [];
  for (const [relative, bytes] of sourceIndex.files) {
    const outputBytes = outputIndex.files.get(relative);
    if (outputBytes === undefined) failures.push(`${relative} (缺失)`);
    else if (outputBytes !== bytes) failures.push(`${relative} (${bytes} -> ${outputBytes} bytes)`);
  }
  if (failures.length)
    throw new Error(`static source 未完整复制到 deployment output：\n${failures.join('\n')}`);
}

async function findFunctionAliases(directory: string, result: string[] = []): Promise<string[]> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.name.endsWith('.func') && (entry.isDirectory() || entry.isSymbolicLink())) {
      result.push(file);
      continue;
    }
    if (entry.isDirectory()) await findFunctionAliases(file, result);
  }
  return result;
}

async function inspectProbeFunction(
  outputRoot: string,
  config: BuildOutputConfig
): Promise<FunctionBundleStats> {
  const functionsRoot = path.join(outputRoot, 'functions');
  await requireDirectory(functionsRoot, 'Vercel functions output');
  const realFunctionsRoot = await realpath(functionsRoot);
  const route = config.routes?.find(({ src, dest }) => {
    if (!src || dest !== PROBE_ROUTE) return false;
    try {
      return new RegExp(src).test(PROBE_ROUTE);
    } catch {
      return false;
    }
  });
  if (!route) throw new Error(`Build Output config 未包含 ${PROBE_ROUTE} 的动态 routing`);

  const alias = path.join(functionsRoot, ...PROBE_ROUTE.slice(1).split('/')) + '.func';
  try {
    await lstat(alias);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      throw new Error(`probe Function artifact 不存在：${alias}`, { cause: error });
    throw error;
  }
  const target = await realpath(alias);
  const relativeTarget = path.relative(realFunctionsRoot, target);
  if (!relativeTarget || relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget))
    throw new Error(`probe Function artifact 指向 output 外部：${target}`);

  const functionConfig = await readJson<{ runtime?: unknown; launcherType?: unknown }>(
    path.join(target, '.vc-config.json'),
    'probe Function config'
  );
  if (
    typeof functionConfig.runtime !== 'string' ||
    !functionConfig.runtime.startsWith('nodejs') ||
    functionConfig.launcherType !== 'Nodejs'
  )
    throw new Error(`probe Function 不是预期的 Node runtime：${JSON.stringify(functionConfig)}`);

  const aliases = await findFunctionAliases(functionsRoot);
  const targets = new Set(await Promise.all(aliases.map((candidate) => realpath(candidate))));
  const index = await walk(target);
  const forbiddenPaths = [...index.files.keys()].filter((file) =>
    FORBIDDEN_FUNCTION_PATHS.some((fragment) => file.includes(fragment))
  );
  const forbiddenText: string[] = [];
  for (const file of index.textFiles) {
    const text = await readFile(file, 'utf8');
    for (const fragment of FORBIDDEN_FUNCTION_TEXT)
      if (text.includes(fragment))
        forbiddenText.push(`${path.relative(target, file).replaceAll('\\', '/')} -> ${fragment}`);
  }
  if (forbiddenPaths.length || forbiddenText.length)
    throw new Error(
      `probe Function 意外包含 Agent/HSR deployment data：\n${[
        ...forbiddenPaths,
        ...forbiddenText
      ].join('\n')}`
    );

  const largestFiles = [...index.files]
    .map(([file, bytes]) => ({ path: file, bytes }))
    .sort((left, right) => right.bytes - left.bytes)
    .slice(0, 10);
  return {
    aliases: aliases.length,
    uniqueFunctions: targets.size,
    files: index.files.size,
    bytes: [...index.files.values()].reduce((total, bytes) => total + bytes, 0),
    runtime: functionConfig.runtime,
    target: relativeTarget.replaceAll('\\', '/'),
    largestFiles
  };
}

export async function verifyDeploymentOutput(
  root = siteRoot,
  outputRoot = path.join(root, '.vercel', 'output')
): Promise<DeploymentOutputStats> {
  const staticRoot = path.join(outputRoot, 'static');
  await requireDirectory(staticRoot, 'Vercel static output');
  const config = await readJson<BuildOutputConfig>(
    path.join(outputRoot, 'config.json'),
    'Vercel Build Output config'
  );
  if (config.version !== 3) throw new Error(`Vercel Build Output config version 必须为 3`);
  if (!Array.isArray(config.routes) || !config.overrides || typeof config.overrides !== 'object')
    throw new Error(`Vercel Build Output config 缺少 routes 或 overrides`);

  const manifest = await readJson<DataManifest>(
    path.join(root, 'src', 'lib', 'generated', 'manifest.json'),
    'generated manifest'
  );
  const expectedRoutes = localizedRoutes(manifest);
  const overrideByPath = new Map(
    Object.entries(config.overrides).map(([file, override]) => [override.path, file])
  );
  const outputIndex = await walk(staticRoot);
  const missingRoutes: string[] = [];
  for (const route of expectedRoutes) {
    const outputFile = overrideByPath.get(routeToOverridePath(route));
    if (!outputFile || !outputIndex.files.has(outputFile)) missingRoutes.push(`${route} (HTML)`);
    const dataFile = routeToDataFile(route);
    if (!outputIndex.files.has(dataFile)) missingRoutes.push(`${route} (${dataFile})`);
  }
  if (missingRoutes.length)
    throw new Error(`prerendered public route output 不完整：\n${missingRoutes.join('\n')}`);
  if (overrideByPath.size !== expectedRoutes.length)
    throw new Error(
      `prerendered page override 数量不匹配：expected=${expectedRoutes.length} actual=${overrideByPath.size}`
    );

  for (const required of ['robots.txt', 'sitemap.xml'])
    if (!outputIndex.files.has(required)) throw new Error(`缺少 prerendered endpoint：${required}`);
  const sitemap = await readFile(path.join(staticRoot, 'sitemap.xml'), 'utf8');
  const sitemapEntries = sitemap.match(/<url>/g)?.length ?? 0;
  if (sitemapEntries !== expectedRoutes.length || sitemap.includes(PROBE_ROUTE))
    throw new Error(
      `sitemap route inventory 不匹配：expected=${expectedRoutes.length} actual=${sitemapEntries}`
    );

  let occurrenceShards = 0;
  for (const locale of manifest.publicLocales) {
    const search = await readJson<{ endgameTargets?: { id?: unknown }[] }>(
      path.join(staticRoot, 'generated', locale, 'search.json'),
      `${locale} search index`
    );
    if (!Array.isArray(search.endgameTargets))
      throw new Error(`${locale} search index 缺少 endgameTargets`);
    for (const target of search.endgameTargets) {
      if (typeof target.id !== 'string') throw new Error(`${locale} endgame target ID 非法`);
      const relative = `generated/${locale}/endgame-occurrences/${target.id}`;
      if (!outputIndex.files.has(relative))
        throw new Error(`缺少 prerendered endpoint：${relative}`);
      occurrenceShards += 1;
    }
  }

  await verifyStaticSourceCopy(path.join(root, 'static'), outputIndex);
  await verifyBuildAssetClosure(staticRoot);
  const functionStats = await inspectProbeFunction(outputRoot, config);
  const staticBytes = [...outputIndex.files.values()].reduce((total, bytes) => total + bytes, 0);
  const stats: DeploymentOutputStats = {
    canonicalRoutes: manifest.routePaths.length,
    localizedRoutes: expectedRoutes.length,
    occurrenceShards,
    staticFiles: outputIndex.files.size,
    staticBytes,
    function: functionStats
  };
  console.log(
    `[deploy] hybrid output verified: canonical=${stats.canonicalRoutes}, localized=${stats.localizedRoutes}, occurrence-shards=${stats.occurrenceShards}, static-files=${stats.staticFiles}, static-bytes=${stats.staticBytes}`
  );
  console.log(
    `[deploy] probe function: unique=${functionStats.uniqueFunctions}, aliases=${functionStats.aliases}, files=${functionStats.files}, bytes=${functionStats.bytes}, runtime=${functionStats.runtime}, target=${functionStats.target}`
  );
  for (const file of functionStats.largestFiles)
    console.log(`[deploy] probe function largest: ${file.bytes} ${file.path}`);
  return stats;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename))
  await verifyDeploymentOutput();
