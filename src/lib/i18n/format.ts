import type { Locale } from '$lib/paraglide/runtime.js';

export function formatLocalizedList(values: readonly string[], locale: Locale): string {
  return values.join(locale === 'zh-CN' ? '、' : ', ');
}
