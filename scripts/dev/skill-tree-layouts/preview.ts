import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import {
  skillTreeLineStyle,
  skillTreeRingStyle
} from '../../../src/lib/domain/training/skill-tree-connections.js';
import {
  layoutHalfSize,
  skillTreeViewBox,
  type LayoutSlug
} from '../../../src/lib/domain/training/skill-tree-layout.js';
import { readLayouts } from './validate';
import paths from './paths.json';

const names: Record<LayoutSlug, string> = {
  destruction: '毁灭',
  hunt: '巡猎',
  erudition: '智识',
  harmony: '同谐',
  nihility: '虚无',
  preservation: '存护',
  abundance: '丰饶',
  remembrance: '记忆',
  elation: '欢愉'
};
const layouts = readLayouts();
const halfSize = layoutHalfSize(layouts);
const viewBox = skillTreeViewBox(halfSize);
const repo = resolve(import.meta.dirname, '../../..');
const audit = resolve(repo, 'data/audit/skill-tree-layouts');

function connectionLayer(
  connections: string[],
  referenceRadius: number,
  style = skillTreeLineStyle
) {
  return `<g fill="none" stroke="${style.stroke}" opacity="${style.opacity}" stroke-width="${style.width * referenceRadius}" stroke-linecap="round" stroke-linejoin="round">
    ${connections.map((d) => `<path d="${d}"/>`).join('')}
  </g>`;
}

const cards = layouts.map(({ slug, nodes, referenceRadius, connections }) => {
  const markers = nodes.map(({ anchorType, center: [x, y], radius, kind }) => {
    return `<g class="${kind}" data-anchor="${anchorType}" data-kind="${kind}">
      <circle cx="${x}" cy="${y}" r="${radius}"><title>${anchorType}</title></circle>
      <text x="${x}" y="${y + radius + 0.06 * referenceRadius}">${anchorType}</text>
    </g>`;
  });
  const cross = 0.035 * referenceRadius;
  return `<figure data-path="${slug}">
    <figcaption>${names[slug]} <span>${nodes.length} 个节点</span></figcaption>
    <svg viewBox="${viewBox}" role="img" aria-label="${names[slug]}技能树" font-size="${0.052 * referenceRadius}">
      <circle class="reference" cx="0" cy="0" r="${referenceRadius}" />
      ${connectionLayer(connections, referenceRadius)}
      ${markers.join('\n')}
      <path class="origin" d="M-${cross} 0H${cross} M0 -${cross}V${cross}" />
    </svg>
  </figure>`;
});

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>九命途技能树布局验收</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #111723; color: #edf3fb; font: 16px system-ui, sans-serif; }
  main { max-width: 74rem; margin: auto; padding: 1rem; }
  h1 { font-size: 1.5rem; margin: 0 0 0.5rem; }
  p { margin: 0 0 0.75rem; color: #c9d5e5; }
  ul { display: flex; flex-wrap: wrap; gap: 0.5rem 1.25rem; margin: 0 0 1rem; padding: 0; list-style: none; }
  li::before { content: '●'; color: var(--color); margin-right: 0.4em; }
  section { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 19rem), 1fr)); gap: 0.75rem; }
  figure { min-width: 0; margin: 0; background: #1c2637; border: 1px solid #36455b; border-radius: 0.75rem; }
  figcaption { display: flex; justify-content: space-between; padding: 0.75rem 1rem 0; font-weight: 650; }
  figcaption span { color: #c9d5e5; font-weight: 400; }
  svg { width: 100%; height: auto; display: block; }
  circle { fill: var(--color); }
  .reference, .origin { fill: none; stroke: #93a1b6; stroke-width: 1; vector-effect: non-scaling-stroke; }
  .origin { stroke: #edf3fb; opacity: 0.7; }
  .skill { --color: #83ceff; }
  .ability { --color: #ffd285; }
  .stat { --color: #a6e5bc; }
  text { fill: #edf3fb; text-anchor: middle; font-weight: 650; }
</style>
</head>
<body>
<main>
  <h1>九命途技能树布局验收</h1>
  <p>灰色圆环和十字标记参考外环与圆心。所有图使用相同的比例。</p>
  <ul aria-label="节点类别">
    <li class="skill">固有技能</li>
    <li class="ability">额外能力</li>
    <li class="stat">属性加成</li>
  </ul>
  <section aria-label="命途布局">
    ${cards.join('\n')}
  </section>
</main>
</body>
</html>
`;

const output = resolve(audit, 'geometry-preview.html');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, html, 'utf8');
console.log(output);

interface Calibration {
  source: { file: string; sha256: string; width: number; height: number };
  reference: { shape: string; center: [number, number]; radius: number };
}

async function writeConnectionAudit(screenshots: string, diagnostics: string) {
  const calibration: Partial<Record<LayoutSlug, Calibration>> = JSON.parse(
    readFileSync(diagnostics, 'utf8')
  );
  const directory = resolve(audit, 'connections');
  mkdirSync(directory, { recursive: true });
  const figures = await Promise.all(
    layouts.map(async ({ slug, nodes, connections, halfSize: crop, referenceRadius }) => {
      const file = paths[slug].file;
      const screenshot = readFileSync(resolve(screenshots, file));
      const sha256 = createHash('sha256').update(screenshot).digest('hex');
      const entry = calibration[slug];
      const reference = entry?.reference;
      if (
        entry?.source.file !== file ||
        entry.source.sha256 !== sha256 ||
        reference?.shape !== 'circle' ||
        !Number.isFinite(reference.radius) ||
        reference.radius <= 0 ||
        !Array.isArray(reference.center) ||
        reference.center.length !== 2 ||
        !reference.center.every(Number.isFinite)
      )
        throw new Error(`${slug}: screenshot does not match a valid circular calibration`);
      const { width, height } = entry.source;
      const image = sharp(screenshot);
      const metadata = await image.metadata();
      if (width !== metadata.width || height !== metadata.height)
        throw new Error(`${slug}: calibrated screenshot dimensions differ`);
      const transform = `translate(${reference.center.join(' ')}) scale(${reference.radius / referenceRadius})`;
      const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <g transform="${transform}">${connectionLayer(connections, referenceRadius, { stroke: '#15ffe6', opacity: 0.76, width: 0.0045 })}</g>
      </svg>`;

      const iconWidth = 1.28 * halfSize;
      let watermark = '';
      try {
        const icon = readFileSync(
          resolve(repo, 'static/generated-assets/paths/large', `${paths[slug].pathCode}.png`)
        );
        watermark = `<image x="${-iconWidth / 2}" y="${-iconWidth / 2}" width="${iconWidth}" height="${iconWidth}" opacity="0.08" href="data:image/png;base64,${icon.toString('base64')}"/>`;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      const markers = nodes.map(
        ({ anchorType, center: [x, y], radius }) => `
        <circle cx="${x}" cy="${y}" r="${radius}" fill="#050609" stroke="#cbd2e0" stroke-opacity="0.45" stroke-width="0.003"/>
        <g transform="translate(${x} ${y}) scale(0.001)">
          <text y="12" fill="#e1e5ec" text-anchor="middle" font-size="37">${anchorType.slice(5)}</text>
        </g>
      `
      );
      const template = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="720" viewBox="${skillTreeViewBox(crop)}">
        <rect x="${-crop}" y="${-crop}" width="${2 * crop}" height="${2 * crop}" fill="#111723"/>
        ${watermark}
        <circle r="${referenceRadius}" fill="none" stroke="${skillTreeRingStyle.stroke}" opacity="${skillTreeRingStyle.opacity}" stroke-width="${skillTreeRingStyle.width * referenceRadius}"/>
        ${connectionLayer(connections, referenceRadius)}
        <g font-family="sans-serif">${markers.join('')}</g>
      </svg>`;
      await Promise.all([
        image
          .composite([{ input: Buffer.from(overlay) }])
          .png()
          .toFile(resolve(directory, `${slug}-overlay.png`)),
        sharp(Buffer.from(template))
          .png()
          .toFile(resolve(directory, `${slug}-template.png`))
      ]);
      return `<figure>
        <figcaption>${names[slug]} · ${connections.length} 条路径</figcaption>
        <a href="${slug}-overlay.png"><img src="${slug}-overlay.png" alt="${names[slug]}截图叠加图"></a>
        <a href="${slug}-template.png"><img src="${slug}-template.png" alt="${names[slug]}归一化模板"></a>
      </figure>`;
    })
  );
  const index = resolve(directory, 'index.html');
  writeFileSync(
    index,
    `<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>九命途技能树连线验收</title>
<style>
  body { background: #111723; color: #edf3fb; font: 16px system-ui, sans-serif; }
  main { max-width: 74rem; margin: auto; padding: 1rem; }
  figure { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .5rem; margin: 0 0 1.5rem; }
  figcaption { grid-column: 1 / -1; font-weight: 650; }
  img { display: block; width: 100%; height: auto; }
  @media (max-width: 35rem) { figure { grid-template-columns: minmax(0, 1fr); } }
</style>
<main>
  <h1>九命途技能树连线验收</h1>
  <p>左图的青线为正式配置叠加到原图的结果。右图使用正式节点尺寸、坐标和画布裁切。</p>
  ${figures.join('\n')}
</main>
</html>
`,
    'utf8'
  );
  console.log(index);
}

const { values } = parseArgs({
  options: { calibration: { type: 'string' }, screenshots: { type: 'string' } }
});
if (values.screenshots && !values.calibration)
  throw new Error('--screenshots requires --calibration');
if (values.calibration)
  await writeConnectionAudit(
    resolve(values.screenshots ?? resolve(repo, '../Codex-Prompt/Database-Skill-Tree-Images')),
    resolve(values.calibration)
  );
