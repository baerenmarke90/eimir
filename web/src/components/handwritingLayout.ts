import { HANDWRITING_GLYPHS } from './handwritingFont';

/**
 * Lays out short text as single pen strokes in the handwriting font (#2372).
 *
 * Pure and synchronous: words wrap greedily to `maxWidth` font units, each
 * word is written stroke by stroke (the joined letters, then its dots and
 * umlauts, like a person lifting the pen), and every stroke carries its
 * position and length as fractions of the whole pen path, so a steady pen
 * speed can time it. Emoji and other symbols the font lacks keep their own
 * form and sit in the line, appearing when the pen reaches them. Returns null
 * when the text cannot be written by hand: too long, or letters of a script
 * the font does not have; the caller then shows the normal type.
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
  /** Emoji and other symbols, shown in place as the pen reaches them. */
  symbols: HandwrittenSymbol[];
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

/** User-perceived characters, so an emoji sequence stays one token. */
function graphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl)
    return [
      ...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(
        text,
      ),
    ].map((part) => part.segment);
  return [...text];
}

/** A grapheme the font writes, or a symbol (emoji) placed into the line. */
type Token = { kind: 'glyph'; text: string } | { kind: 'symbol'; text: string };

const PICTOGRAPH = /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u;
const LETTER = /[\p{L}\p{N}]/u;

/**
 * The font writes Latin letters; emoji and other symbols sit in the line as
 * they are. A letter of another script returns null (normal type).
 */
function tokenOf(grapheme: string): Token | null {
  if (HANDWRITING_GLYPHS[grapheme]) return { kind: 'glyph', text: grapheme };
  if (PICTOGRAPH.test(grapheme) || !LETTER.test(grapheme))
    return { kind: 'symbol', text: grapheme };
  return null;
}

/** An emoji's advance and size in font units, and its share of the pen path. */
const SYMBOL_ADVANCE = 1100;
export const SYMBOL_SIZE = 900;
const SYMBOL_PEN = 700;

const advanceOf = (token: Token) =>
  token.kind === 'symbol'
    ? SYMBOL_ADVANCE
    : (HANDWRITING_GLYPHS[token.text]?.[0] ?? 0);

const widthOf = (word: readonly Token[]) =>
  word.reduce((sum, token) => sum + advanceOf(token), 0);

/** Splits a word that is wider than a line into line-sized pieces. */
function pieces(word: Token[], maxWidth: number): Token[][] {
  if (widthOf(word) <= maxWidth) return [word];
  const result: Token[][] = [];
  let current: Token[] = [];
  for (const token of word) {
    if (current.length && widthOf([...current, token]) > maxWidth) {
      result.push(current);
      current = [];
    }
    current.push(token);
  }
  if (current.length) result.push(current);
  return result;
}

export interface HandwrittenSymbol {
  text: string;
  /** Left edge and baseline, in font units of the view box. */
  x: number;
  y: number;
  /** When it appears, as fractions of the whole pen path (like a stroke). */
  start: number;
  share: number;
}

type PenItem =
  | { kind: 'stroke'; points: Point[] }
  | { kind: 'symbol'; text: string; x: number; y: number };

export function layoutHandwriting(
  text: string,
  maxWidth: number,
): HandwrittenLayout | null {
  const source = normalize(text);
  if (!source) return null;
  const paragraphs: Token[][][] = [];
  let count = 0;
  for (const paragraph of source.split('\n')) {
    const words: Token[][] = [];
    for (const word of paragraph.split(/ +/).filter(Boolean)) {
      const tokens: Token[] = [];
      for (const grapheme of graphemes(word)) {
        const token = tokenOf(grapheme);
        if (!token) return null;
        tokens.push(token);
        count += 1;
      }
      words.push(tokens);
    }
    paragraphs.push(words);
  }
  if (count > HANDWRITING_MAX_CHARACTERS) return null;

  const space = HANDWRITING_GLYPHS[' ']?.[0] || 300;
  const lines: Token[][][] = [];
  for (const paragraph of paragraphs) {
    let line: Token[][] = [];
    let width = 0;
    for (const word of paragraph)
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

  const items: PenItem[] = [];
  lines.forEach((words, row) => {
    const baseline = ASCENT + row * LINE_HEIGHT;
    let x = 0;
    for (const word of words) {
      const lifts: PenItem[] = [];
      for (const token of word) {
        if (token.kind === 'symbol') {
          items.push({ kind: 'symbol', text: token.text, x, y: baseline });
          x += SYMBOL_ADVANCE;
          continue;
        }
        const [advance, glyphStrokes] = HANDWRITING_GLYPHS[token.text];
        for (const flat of glyphStrokes) {
          const points: Point[] = [];
          for (let i = 0; i + 1 < flat.length; i += 2)
            points.push([flat[i] + x, baseline - flat[i + 1]]);
          (lengthOf(points) < LIFT ? lifts : items).push({
            kind: 'stroke',
            points,
          });
        }
        x += advance;
      }
      items.push(...lifts);
      x += space;
    }
  });
  if (!items.length) return null;

  const corners: Point[] = items.flatMap((item) =>
    item.kind === 'stroke'
      ? item.points
      : [
          [item.x, item.y - SYMBOL_SIZE],
          [item.x + SYMBOL_ADVANCE, item.y + SYMBOL_SIZE * 0.25],
        ],
  );
  const minX = Math.min(...corners.map((p) => p[0])) - PAD;
  const minY = Math.min(0, ...corners.map((p) => p[1])) - PAD;
  const maxX = Math.max(...corners.map((p) => p[0])) + PAD;
  const maxY =
    Math.max(
      ASCENT + (lines.length - 1) * LINE_HEIGHT + 350,
      ...corners.map((p) => p[1]),
    ) + PAD;
  const lengths = items.map((item) =>
    item.kind === 'stroke' ? lengthOf(item.points) : SYMBOL_PEN,
  );
  const total = lengths.reduce((sum, value) => sum + value, 0) || 1;
  const strokes: HandwrittenStroke[] = [];
  const symbols: HandwrittenSymbol[] = [];
  let start = 0;
  items.forEach((item, index) => {
    const share = lengths[index] / total;
    if (item.kind === 'stroke')
      strokes.push({ d: smoothPath(item.points), start, share });
    else symbols.push({ text: item.text, x: item.x, y: item.y, start, share });
    start += share;
  });
  return {
    viewBox: `${round(minX)} ${round(minY)} ${round(maxX - minX)} ${round(maxY - minY)}`,
    width: maxX - minX,
    height: maxY - minY,
    length: total,
    strokes,
    symbols,
  };
}
