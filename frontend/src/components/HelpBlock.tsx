interface HelpBlockProps {
  /** Localized clickable summary (e.g. `t('movements.help.adjustment.summary')`). */
  summary: string
  /** Localized expanded body text. */
  body: string
}

/**
 * UI-HELP-MOV / UI-HELP-AUDIT: collapsible in-app guidance. Native
 * <details>/<summary> keeps it zero-state (no local toggle state), consistent
 * with the audit payload collapse precedent (D-P10). Props arrive already
 * localized so the component stays presentational and reusable.
 */
export function HelpBlock({ summary, body }: HelpBlockProps) {
  return (
    <details className="help-block">
      <summary className="muted small">{summary}</summary>
      <p className="muted small">{body}</p>
    </details>
  )
}