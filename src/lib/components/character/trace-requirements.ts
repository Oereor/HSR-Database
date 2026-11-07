import { m } from '$lib/paraglide/messages.js';
import { getLocale } from '$lib/paraglide/runtime.js';

export function traceRequirementText(promotion = 0, level = 0): string {
  const locale = getLocale();
  const requirements: string[] = [];
  if (promotion > 0) requirements.push(m.trace_promotion({ promotion }, { locale }));
  if (level > 0) requirements.push(m.trace_character_level({ level }, { locale }));
  return new Intl.ListFormat(locale, { type: 'conjunction' }).format(requirements);
}
