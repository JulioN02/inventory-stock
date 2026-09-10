import { useTranslation } from '../i18n/index.ts'

/**
 * Shared loading state (spec V1) — one localized indicator used everywhere so
 * loading never mixes "Loading…"/"Cargando…". `role="status"` announces it to
 * assistive tech; the `.spinner` element is styled in the CSS polish pass.
 */
export function LoadingIndicator() {
  const { t } = useTranslation()
  return (
    <div className="page-loading" role="status">
      <span className="spinner" aria-hidden="true" />
      {t('common.loading')}
    </div>
  )
}
