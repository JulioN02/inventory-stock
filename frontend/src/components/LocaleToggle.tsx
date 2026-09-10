import { useTranslation } from '../i18n/index.ts'
import type { Locale } from '../i18n/index.ts'

/**
 * ES ⇄ EN locale toggle (spec I2). `role="group"` plus per-button
 * `aria-pressed` expose the active locale to assistive tech, and the active
 * option is visually distinct via `btn-primary`. The visible "ES"/"EN" glyphs
 * are language codes (technical identifiers), not translatable copy.
 */
const LOCALES: readonly Locale[] = ['es', 'en']

export function LocaleToggle() {
  const { locale, setLocale, t } = useTranslation()

  return (
    <div className="locale-toggle" role="group" aria-label={t('layout.locale.label')}>
      {LOCALES.map((option) => {
        const active = locale === option
        return (
          <button
            key={option}
            type="button"
            className={active ? 'btn btn-sm btn-primary' : 'btn btn-sm'}
            aria-pressed={active}
            aria-label={option === 'es' ? t('layout.locale.switchToEs') : t('layout.locale.switchToEn')}
            onClick={() => setLocale(option)}
          >
            {option.toUpperCase()}
          </button>
        )
      })}
    </div>
  )
}
