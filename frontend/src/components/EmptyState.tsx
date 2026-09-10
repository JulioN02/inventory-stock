interface EmptyStateProps {
  /** Already-localized message, e.g. `t('products.empty')`. */
  message: string
  /** Number of table columns the row must span. */
  colSpan: number
}

/**
 * Localized "no records" table row (spec V1) — render inside `<tbody>` instead
 * of a blank table. The message is passed in already translated so the
 * component stays presentational and reusable across pages.
 */
export function EmptyState({ message, colSpan }: EmptyStateProps) {
  return (
    <tr>
      <td className="empty-state" colSpan={colSpan}>
        <span role="status">{message}</span>
      </td>
    </tr>
  )
}
