/**
 * A small static line for ServerAdmin history (#2317). Missing values break
 * the line instead of pretending a zero; nothing is drawn below two values.
 * No animation, so reduced motion needs no special case.
 */
export function sparklinePath(
  values: Array<number | null>,
  width: number,
  height: number,
): string {
  const present = values.filter((value): value is number => value !== null);
  if (present.length < 2) return '';
  const min = Math.min(...present);
  const max = Math.max(...present);
  const span = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  let path = '';
  let drawing = false;
  values.forEach((value, index) => {
    if (value === null) {
      drawing = false;
      return;
    }
    const x = (index * step).toFixed(1);
    const y = (height - ((value - min) / span) * height).toFixed(1);
    path += `${drawing ? 'L' : 'M'}${x} ${y} `;
    drawing = true;
  });
  return path.trim();
}

export function Sparkline({
  values,
  label,
  tone = 'brand',
}: {
  values: Array<number | null>;
  label: string;
  tone?: 'brand' | 'danger';
}) {
  const path = sparklinePath(values, 140, 36);
  return (
    <svg
      className={`server-admin-sparkline is-${tone}`}
      viewBox="0 0 140 40"
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      {path ? (
        <path
          d={path}
          transform="translate(0 2)"
          fill="none"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </svg>
  );
}
