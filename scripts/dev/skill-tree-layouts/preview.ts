import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  layoutHalfSize,
  type LayoutSlug
} from '../../../src/lib/domain/training/skill-tree-layout.js';
import { readLayouts } from './validate';

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
const viewBox = `-${halfSize} -${halfSize} ${2 * halfSize} ${2 * halfSize}`;

const cards = layouts.map(({ slug, nodes, referenceRadius }) => {
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

const output = resolve(
  import.meta.dirname,
  '../../../data/audit/skill-tree-layouts/geometry-preview.html'
);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, html, 'utf8');
console.log(output);
