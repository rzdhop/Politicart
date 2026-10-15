/**
 * Join class names, dropping anything falsy.
 *
 * Every component in this library puts its own class first and the caller's
 * `className` last, so a consumer can always add to -- or override -- what the
 * component brings, without the component having to know about it.
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
