export const ELEMENT_COLORS = {
  Physical: '#b6b6b6',
  Fire: '#f25740',
  Ice: '#6dc4ea',
  Lightning: '#d46aeb',
  Wind: '#7ad8a5',
  Quantum: '#8a86de',
  Imaginary: '#fee554'
} as const;

export type ElementType = keyof typeof ELEMENT_COLORS;

/** Upstream calls the lightning element `Thunder`; the domain model uses `Lightning`. */
export function normalizeElementType(element: string | undefined): string | undefined {
  return element === 'Thunder' ? 'Lightning' : element;
}

export function isElementType(element: string | undefined): element is ElementType {
  return Boolean(element && element in ELEMENT_COLORS);
}

/** Canonical element text colour. Unknown upstream values remain readable. */
export function getElementColor(element: string | undefined): string {
  const normalized = normalizeElementType(element);
  return normalized && isElementType(normalized) ? ELEMENT_COLORS[normalized] : 'inherit';
}
