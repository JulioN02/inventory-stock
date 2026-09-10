// i18n public barrel — single import surface for the whole module (task 1.8).

export { LOCALE_STORAGE_KEY, isLocale, LocaleProvider, useLocale } from './LocaleContext.tsx'
export type { LocaleContextValue } from './LocaleContext.tsx'
export { useTranslation } from './useTranslation.ts'
export type { UseTranslationResult } from './useTranslation.ts'
export { es } from './locales/es.ts'
export { en } from './locales/en.ts'
export { ERROR_CODES, ERROR_MESSAGE_KEYS, localizeError, lookupErrorKey, UNKNOWN_ERROR_KEY } from './errors.ts'
export type { ErrorCode } from './errors.ts'
export { formatDateTime, formatNumber } from './formatters.ts'
export { KNOWN_ROLES, ROLE_LABEL_KEYS, isKnownRole, localizeRole } from './roles.ts'
export type { KnownRole } from './roles.ts'
export type { Dictionary, Locale, MessageKey, MessageParams, TFunction } from './types.ts'