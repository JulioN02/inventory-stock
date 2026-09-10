import { useLocale } from './LocaleContext.tsx'
import { en } from './locales/en.ts'
import { es } from './locales/es.ts'
import type { Dictionary, Locale, MessageParams, TFunction } from './types.ts'

const DICTIONARIES: Record<Locale, Dictionary> = { es, en }

export interface UseTranslationResult {
  t: TFunction
  locale: Locale
  setLocale: (next: Locale) => void
}

/**
 * Returns the translation function for the active locale plus the locale
 * itself and its setter. `t(key, params)` replaces every `{token}` occurrence
 * in the dictionary value. React Compiler memoizes the returned object.
 */
export function useTranslation(): UseTranslationResult {
  const { locale, setLocale } = useLocale()
  const dictionary = DICTIONARIES[locale]

  const t: TFunction = (key, params?: MessageParams) => {
    let message = dictionary[key]
    if (params) {
      for (const [token, value] of Object.entries(params)) {
        message = message.replaceAll(`{${token}}`, String(value))
      }
    }
    return message
  }

  return { t, locale, setLocale }
}