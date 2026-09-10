// i18n core types — flat dotted keys, derived from the `es` dictionary so a
// missing/extra key in any other locale fails typecheck (design: Dictionary).
import { es } from './locales/es.ts'

export type Locale = 'es' | 'en'

/** Every valid message key, derived from the source-of-truth dictionary. */
export type MessageKey = keyof typeof es

/** A complete locale dictionary — all keys present, all values strings. */
export type Dictionary = Record<MessageKey, string>

/** Interpolation params, e.g. `{ username: 'ada' }` replaces `{username}`. */
export type MessageParams = Record<string, string | number>

/** Translation function exposed by `useTranslation`. */
export type TFunction = (key: MessageKey, params?: MessageParams) => string
