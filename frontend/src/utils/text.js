/** Capitalizes only the first letter, leaving the rest of the string as-is
 * (unlike CSS `capitalize`, which uppercases the first letter of every word).
 * Titles are stored however the Dean of Discipline typed them, so this is
 * purely a display concern — never mutate the underlying data with it. */
export function capitalizeFirst(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}
