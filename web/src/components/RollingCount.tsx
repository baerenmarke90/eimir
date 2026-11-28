import type { CSSProperties } from 'react';
import './RollingCount.css';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

/**
 * A line of copy whose number rolls into place digit by digit, like an
 * odometer (#2370; Motion Contract 4.7, the important-day Moment).
 *
 * The component only builds the structure. Each digit is a clipped column
 * with a strip of 0 to 9 that rests on its value; the owner decides when the
 * strip rolls (`.rolling-count-strip` with the catalogue's
 * `eimir-motion-value-roll`), so a remount or return shows the number at
 * rest. `--rolling-order` counts digits from the right for the stagger.
 * Grouping separators and the surrounding words stay still.
 *
 * The strips are decorative (`aria-hidden`); the formatted number stays the
 * readable text (M13). When `value` is not part of `text`, the text renders
 * as it is.
 */
export function RollingCount({ text, value }: { text: string; value: string }) {
  const at = value ? text.indexOf(value) : -1;
  if (at < 0) return <>{text}</>;
  const characters = [...value];
  let order = characters.filter((character) =>
    DIGITS.includes(character as (typeof DIGITS)[number]),
  ).length;
  return (
    <>
      {text.slice(0, at)}
      <span className="rolling-count">
        <span className="sr-only">{value}</span>
        <span className="rolling-count-figures" aria-hidden="true">
          {characters.map((character, index) => {
            const digit = DIGITS.indexOf(character as (typeof DIGITS)[number]);
            if (digit < 0)
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: the characters of one fixed number
                <span key={index}>{character}</span>
              );
            order -= 1;
            return (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: the characters of one fixed number
                key={index}
                className="rolling-count-digit"
                style={
                  {
                    '--rolling-digit': digit,
                    '--rolling-order': order,
                  } as CSSProperties
                }
              >
                <span className="rolling-count-rest">{character}</span>
                <span className="rolling-count-strip">
                  {DIGITS.map((cell) => (
                    <span key={cell}>{cell}</span>
                  ))}
                </span>
              </span>
            );
          })}
        </span>
      </span>
      {text.slice(at + value.length)}
    </>
  );
}
