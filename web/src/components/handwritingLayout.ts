import { HANDWRITING_GLYPHS } from './handwritingFont';

/**
 * Lays out short text as single pen strokes in the handwriting font (#2372).
 *
 * Pure and synchronous: words wrap greedily to `maxWidth` font units, each
 * word is written stroke by stroke (the joined letters, then its dots and
 * umlauts, like a person lifting the pen), and every stroke carries its
 * position and length as fractions of the whole pen path, so a steady pen
 * speed can time it. Returns null when the text cannot be written by hand:
 * too long, or a character the font does not have (emoji, non-Latin
 * scripts); the caller then shows the normal type.
 */

/** Longer messages keep the normal type. */
export const HANDWRITING_MAX_CHARACTERS = 280;

/** Baseline to baseline, in font units (1000 per em). */
const LINE_HEIGHT = 1250;
/** Room above the first baseline for ascenders and flourishes. */
const ASCENT = 900;
/** Strokes shorter than this (dots, umlauts) follow their word. */
const LIFT = 70;
const PAD = 60;

/** Forms the font lacks, written the way a hand would. */
const SUBSTITUTES: Readonly<Record<string, string>> = {
  '„': ',,',
  '‚': ',',
  '‘': "'",
  '’': "'",
  '…': '...',
  ' ': ' ',
};

export interface HandwrittenStroke {
  d: string;
  /** Where the stroke starts, as a fraction of the whole pen path. */
  start: number;
  /** Its length, as a fraction of the whole pen path. */
  share: number;
}

export interface HandwrittenLayout {
  viewBox: string;
  /** Width and height in font units. */
  width: number;
  height: number;
  /** The whole pen path in font units, for the writing time. */
  length: number;
  strokes: HandwrittenStroke[];
}

type Point = [number, number];

function lengthOf(points: readonly Point[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1)
    total += Math.hypot(
      points[index][0] - points[index - 1][0],
      points[index][1] - points[index - 1][1],
    );
  return total;
}

const round = (value: number) => Math.round(value * 10) / 10;

/** A Catmull-Rom curve through the font's polyline, as cubic Béziers. */
function smoothPath(points: readonly Point[]): string {
  const at = (p: Point) => `${round(p[0])} ${round(p[1])}`;
  let d = `M${at(points[0])}`;
  if (points.length < 3) {
    for (const point of points.slice(1)) d += `L${at(point)}`;
    return d;
  }
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1: Point = [
      p1[0] + (p2[0] - p0[0]) / 6,
      p1[1] + (p2[1] - p0[1]) / 6,
    ];
    const c2: Point = [
      p2[0] - (p3[0] - p1[0]) / 6,
      p2[1] - (p3[1] - p1[1]) / 6,
    ];
    d += `C${at(c1)} ${at(c2)} ${at(p2)}`;
  }
  return d;
}

function normalize(text: string): string {
  let result = '';
  for (const character of text.replace(/\r\n?/g, '\n').trim())
    result += SUBSTITUTES[character] ?? character;
  return result;
}

const advanceOf = (character: string) =>
  HANDWRITING_GLYPHS[character]?.[0] ?? 0;

const widthOf = (word: string) =>
  [...word].reduce((sum, character) => sum + advanceOf(character), 0);

/** Splits a word that is wider than a line into line-sized pieces. */
function pieces(word: string, maxWidth: number): string[] {
  if (widthOf(word) <= maxWidth) return [word];
  const result: string[] = [];
  let current = '';
  for (const character of word) {
    if (current && widthOf(current + character) > maxWidth) {
      result.push(current);
      current = '';
    }
    current += character;
  }
  if (current) result.push(current);
  return result;
}

export function layoutHandwriting(
  text: string,
  maxWidth: number,
): HandwrittenLayout | null {
  const source = normalize(text);
  if (!source || [...source].length > HANDWRITING_MAX_CHARACTERS) return null;
  for (const character of source)
    if (
      character !== '\n' &&
      character !== ' ' &&
      !HANDWRITING_GLYPHS[character]
    )
      return null;

  const space = advanceOf(' ') || 300;
  const lines: string[][] = [];
  for (const paragraph of source.split('\n')) {
    let line: string[] = [];
    let width = 0;
    for (const word of paragraph.split(/ +/).filter(Boolean))
      for (const piece of pieces(word, maxWidth)) {
        const pieceWidth = widthOf(piece);
        const next = line.length ? width + space + pieceWidth : pieceWidth;
        if (line.length && next > maxWidth) {
          lines.push(line);
          line = [piece];
          width = pieceWidth;
        } else {
          line.push(piece);
          width = next;
        }
      }
    lines.push(line);
  }

  const strokes: Point[][] = [];
  lines.forEach((words, row) => {
    const baseline = ASCENT + row * LINE_HEIGHT;
    let x = 0;
    for (const word of words) {
      const lifts: Point[][] = [];
      for (const character of word) {
        const [advance, glyphStrokes] = HANDWRITING_GLYPHS[character];
        for (const flat of glyphStrokes) {
          const points: Point[] = [];
          for (let i = 0; i + 1 < flat.length; i += 2)
            points.push([flat[i] + x, baseline - flat[i + 1]]);
          (lengthOf(points) < LIFT ? lifts : strokes).push(points);
        }
        x += advance;
      }
      strokes.push(...lifts);
      x += space;
    }
  });
  if (!strokes.length) return null;

  const all = strokes.flat();
  const minX = Math.min(...all.map((p) => p[0])) - PAD;
  const minY = Math.min(0, ...all.map((p) => p[1])) - PAD;
  const maxX = Math.max(...all.map((p) => p[0])) + PAD;
  const maxY =
    Math.max(
      ASCENT + (lines.length - 1) * LINE_HEIGHT + 350,
      ...all.map((p) => p[1]),
    ) + PAD;
  const lengths = strokes.map(lengthOf);
  const total = lengths.reduce((sum, value) => sum + value, 0) || 1;
  let start = 0;
  return {
    viewBox: `${round(minX)} ${round(minY)} ${round(maxX - minX)} ${round(maxY - minY)}`,
    width: maxX - minX,
    height: maxY - minY,
    length: total,
    strokes: strokes.map((points, index) => {
      const share = lengths[index] / total;
      const stroke = { d: smoothPath(points), start, share };
      start += share;
      return stroke;
    }),
  };
}
