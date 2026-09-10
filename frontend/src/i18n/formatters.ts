import type { Locale } from './types.ts'

/**
 * Locale-aware number/date formatting (spec I5) built on Intl — zero deps.
 * Numerics travel as strings from the API (D13) so both accept `string | number`
 * and parse for display only. `NaN`/`Invalid Date` fall back to the raw input
 * instead of rendering "NaN".
 */

// `useGrouping: 'always'` forces the thousands separator for 4-digit numbers.
// CLDR (ICU) gives Spanish `minimumGroupingDigits: 2`, so plain `es` would
// render 1234.56 as "1234,56" — the spec (I5) requires "1.234,56".
const numberFormatters: Record<Locale, Intl.NumberFormat> = {
  es: new Intl.NumberFormat('es', { useGrouping: 'always' }),
  en: new Intl.NumberFormat('en', { useGrouping: 'always' }),
}

const dateTimeFormatters: Record<Locale, Intl.DateTimeFormat> = {
  es: new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }),
  en: new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }),
}

export function formatNumber(value: string | number, locale: Locale): string {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (Number.isNaN(parsed)) return String(value)
  return numberFormatters[locale].format(parsed)
}

export function formatDateTime(value: string | number | Date, locale: Locale): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return dateTimeFormatters[locale].format(date)
}