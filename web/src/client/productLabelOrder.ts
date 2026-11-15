/** One locale-aware alphabetic order for human-facing labels and titles. */
export function sortByProductLabel<T>(
  items: readonly T[],
  label: (item: T) => string,
  locale: string,
): T[] {
  const order = new Intl.Collator(locale, {
    sensitivity: 'base',
    numeric: true,
  });
  return [...items].sort((left, right) =>
    order.compare(label(left), label(right)),
  );
}
