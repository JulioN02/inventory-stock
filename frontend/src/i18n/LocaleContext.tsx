import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Locale } from './types.ts'

/** localStorage key for the persisted locale (spec I1). */
export const LOCALE_STORAGE_KEY = 'ui.locale'

const FALLBACK_LOCALE: Locale = 'es'

/** Runtime guard for values read from localStorage. */
export function isLocale(value: unknown): value is Locale {
  return value === 'es' || value === 'en'
}

function readInitialLocale(): Locale {
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY)
  return isLocale(stored) ? stored : FALLBACK_LOCALE
}

export interface LocaleContextValue {
  locale: Locale
  setLocale: (next: Locale) => void
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

/**
 * Holds the active locale, persists it to localStorage on every change and
 * keeps `document.documentElement.lang` in sync (spec I1/I2). Defaults to
 * Spanish on first visit. React Compiler memoizes the value object — no
 * manual useMemo/useCallback.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readInitialLocale)

  useEffect(() => {
    document.documentElement.lang = locale
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  }, [locale])

  function setLocale(next: Locale): void {
    setLocaleState(next)
  }

  return <LocaleContext.Provider value={{ locale, setLocale }}>{children}</LocaleContext.Provider>
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider')
  return ctx
}