export const LOCALE_REGISTRY = {
  'zh-CN': {
    textMapCode: 'CHS',
    siteMessageLocale: 'zh-CN',
    enabled: true
  },
  en: {
    textMapCode: 'EN',
    siteMessageLocale: 'en',
    enabled: false
  }
} as const;

export type Locale = keyof typeof LOCALE_REGISTRY;
export type TextMapCode = (typeof LOCALE_REGISTRY)[Locale]['textMapCode'];
export type LocaleConfig = {
  locale: Locale;
  textMapCode: TextMapCode;
  siteMessageLocale: string;
  enabled: boolean;
};

export function getLocaleConfig(locale: string): LocaleConfig {
  const config = LOCALE_REGISTRY[locale as Locale];
  if (!config) throw new Error(`Unsupported locale: ${locale}`);
  return { locale: locale as Locale, ...config };
}

export function getProductionLocale(): LocaleConfig & { locale: 'zh-CN'; textMapCode: 'CHS' } {
  const entry = Object.entries(LOCALE_REGISTRY).find(([, config]) => config.enabled);
  if (!entry) throw new Error('Locale registry has no enabled production locale');
  const config = getLocaleConfig(entry[0]);
  if (config.locale !== 'zh-CN' || config.textMapCode !== 'CHS')
    throw new Error('Production locale must be zh-CN backed by CHS');
  return config as LocaleConfig & { locale: 'zh-CN'; textMapCode: 'CHS' };
}
