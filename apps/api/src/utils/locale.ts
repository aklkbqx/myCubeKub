export const SUPPORTED_LOCALES = ['th', 'en', 'zh', 'ru'] as const;
export type SupportedLocale = typeof SUPPORTED_LOCALES[number];

export const resolveLocaleFromAcceptLanguage = (acceptLanguage: string | null): SupportedLocale => {
    if (!acceptLanguage) return 'th';

    const preferredTags = acceptLanguage
        .split(',')
        .map((segment) => segment.split(';')[0]?.trim().toLowerCase())
        .filter(Boolean);

    for (const tag of preferredTags) {
        const base = tag.split('-')[0];
        if (base && SUPPORTED_LOCALES.includes(base as SupportedLocale)) {
            return base as SupportedLocale;
        }
    }

    return 'th';
};

export const pickLocalizedText = (
    locale: SupportedLocale,
    defaultValue: string | null,
    thaiValue?: string | null
): string | null => {
    if (locale === 'th') {
        return thaiValue || defaultValue || null;
    }

    return defaultValue || thaiValue || null;
};

export const toGoogleLanguageCode = (locale: SupportedLocale): string => {
    if (locale === 'zh') return 'zh-CN';
    if (locale === 'ru') return 'ru';
    if (locale === 'en') return 'en';
    return 'th';
};

export const toIntlLocaleTag = (locale: SupportedLocale): string => {
    if (locale === 'zh') return 'zh-CN';
    if (locale === 'ru') return 'ru-RU';
    if (locale === 'en') return 'en-US';
    return 'th-TH';
};
