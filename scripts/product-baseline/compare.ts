import type { ProductBaselineCapture, ProductBaselineDifference } from './model.js';

function compareValue(
  expected: unknown,
  actual: unknown,
  domain: string,
  entityId: string,
  valuePath: string,
  differences: ProductBaselineDifference[]
): void {
  if (Object.is(expected, actual)) return;
  if (Array.isArray(expected) && Array.isArray(actual)) {
    const length = Math.max(expected.length, actual.length);
    for (let index = 0; index < length; index += 1)
      compareValue(
        expected[index],
        actual[index],
        domain,
        entityId,
        `${valuePath}[${index}]`,
        differences
      );
    return;
  }
  if (
    expected &&
    actual &&
    typeof expected === 'object' &&
    typeof actual === 'object' &&
    !Array.isArray(expected) &&
    !Array.isArray(actual)
  ) {
    const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort((a, b) =>
      a.localeCompare(b, 'en')
    );
    for (const key of keys)
      compareValue(
        (expected as Record<string, unknown>)[key],
        (actual as Record<string, unknown>)[key],
        domain,
        entityId,
        valuePath ? `${valuePath}.${key}` : key,
        differences
      );
    return;
  }
  differences.push({ domain, entityId, path: valuePath || '$', expected, actual });
}

function compareArea(
  domain: string,
  expected: Record<string, unknown>,
  actual: Record<string, unknown>,
  differences: ProductBaselineDifference[],
  entityPrefix = ''
): void {
  const ids = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort((a, b) =>
    a.localeCompare(b, 'en')
  );
  for (const id of ids)
    compareValue(expected[id], actual[id], domain, `${entityPrefix}${id}`, '', differences);
}

export function compareProductBaseline(
  expected: ProductBaselineCapture,
  actual: ProductBaselineCapture
): ProductBaselineDifference[] {
  const differences: ProductBaselineDifference[] = [];
  compareValue(
    { ...expected.metadata, approvalReason: undefined },
    { ...actual.metadata, approvalReason: undefined },
    'metadata',
    'zh-CN',
    '',
    differences
  );
  compareArea('characters', expected.characters, actual.characters, differences);
  compareArea('light-cones', expected.lightCones, actual.lightCones, differences);
  compareArea('relics', expected.relics, actual.relics, differences);
  compareArea('enemies', expected.enemies, actual.enemies, differences);
  const modes = [
    ...new Set([...Object.keys(expected.endgame.modes), ...Object.keys(actual.endgame.modes)])
  ];
  for (const mode of modes)
    compareArea(
      'endgame',
      expected.endgame.modes[mode] ?? {},
      actual.endgame.modes[mode] ?? {},
      differences,
      `${mode}:`
    );
  compareValue(
    expected.endgame.boundaries,
    actual.endgame.boundaries,
    'endgame',
    'schedule-boundaries',
    '',
    differences
  );
  compareValue(expected.homepage, actual.homepage, 'homepage', 'homepage', '', differences);
  compareValue(expected.search, actual.search, 'search', 'search', '', differences);
  return differences;
}
