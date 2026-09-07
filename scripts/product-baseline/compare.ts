import type { ProductBaselineCapture, ProductBaselineDifference } from './model.js';

function sameScalar(left: unknown, right: unknown): boolean {
  return Object.is(left, right);
}

function compareValue(
  expected: unknown,
  actual: unknown,
  domain: string,
  entityId: string,
  path: string,
  differences: ProductBaselineDifference[]
): void {
  if (sameScalar(expected, actual)) return;
  if (Array.isArray(expected) && Array.isArray(actual)) {
    const length = Math.max(expected.length, actual.length);
    for (let index = 0; index < length; index += 1)
      compareValue(
        expected[index],
        actual[index],
        domain,
        entityId,
        `${path}[${index}]`,
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
        path ? `${path}.${key}` : key,
        differences
      );
    return;
  }
  differences.push({ domain, entityId, path: path || '$', expected, actual });
}

export function compareProductBaseline(
  expected: ProductBaselineCapture,
  actual: ProductBaselineCapture
): ProductBaselineDifference[] {
  const differences: ProductBaselineDifference[] = [];
  const compareStableArea = (
    domain: string,
    expectedArea: ProductBaselineCapture['characters'],
    actualArea: ProductBaselineCapture['characters']
  ) => {
    compareValue(expectedArea.order, actualArea.order, domain, 'catalog-order', '', differences);
    for (const id of [...new Set([...expectedArea.order, ...actualArea.order])])
      compareValue(expectedArea.entities[id], actualArea.entities[id], domain, id, '', differences);
  };
  compareValue(
    { ...expected.metadata, approvalReason: undefined },
    { ...actual.metadata, approvalReason: undefined },
    'metadata',
    'zh-CN',
    '',
    differences
  );
  compareStableArea('characters', expected.characters, actual.characters);
  compareStableArea('light-cones', expected.lightCones, actual.lightCones);
  compareStableArea('relics', expected.relics, actual.relics);
  compareValue(
    expected.relics.properties,
    actual.relics.properties,
    'relics',
    'properties',
    '',
    differences
  );
  compareStableArea('enemies', expected.enemies, actual.enemies);
  for (const mode of [
    ...new Set([...Object.keys(expected.endgame.modes), ...Object.keys(actual.endgame.modes)])
  ]) {
    const expectedMode = expected.endgame.modes[mode];
    const actualMode = actual.endgame.modes[mode];
    compareValue(
      expectedMode?.order,
      actualMode?.order,
      'endgame',
      `${mode}:group-order`,
      '',
      differences
    );
    compareValue(
      expectedMode?.recommendations,
      actualMode?.recommendations,
      'endgame',
      `${mode}:recommendations`,
      '',
      differences
    );
    for (const id of [...new Set([...(expectedMode?.order ?? []), ...(actualMode?.order ?? [])])])
      compareValue(
        expectedMode?.groups[id],
        actualMode?.groups[id],
        'endgame',
        `${mode}:${id}`,
        '',
        differences
      );
  }
  for (const [domain, expectedArea, actualArea] of [
    ['homepage', expected.homepage, actual.homepage],
    ['search', expected.search, actual.search],
    ['unresolved-localization', expected.unresolvedLocalization, actual.unresolvedLocalization]
  ] as const)
    compareValue(expectedArea, actualArea, domain, domain, '', differences);
  return differences;
}
