/*
 * Shared Notes (#1969): pure helpers for free text both partners read and edit.
 *
 * A note body is plain text. A line that starts with the bullet marker is one
 * entry of a list; every other non-empty line is a paragraph. There is no
 * Markdown and no rich text, so the body stays readable in every surface and
 * in an export.
 */
import type { SharedNoteDetail } from '../api/generated/models/SharedNoteDetail';
import { normalizeClientError } from './problemDetails';

export const BULLET_MARKER = '• ';
/** The overview loads this many notes per request and filters them locally. */
export const SHARED_NOTE_PAGE_SIZE = 100;
/** The Wir module shows at most this many pinned notes (Product Owner decision). */
export const WIR_NOTE_LIMIT = 5;
/** The server's limits after trimming (`TITLE_MAX_LENGTH`, `BODY_MAX_LENGTH`). */
export const SHARED_NOTE_TITLE_MAX = 200;
export const SHARED_NOTE_BODY_MAX = 20_000;

export async function sharedNoteApiCall<T>(
  request: () => Promise<T>,
): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw await normalizeClientError(error);
  }
}

export type NoteBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[] };

const BULLET_LINE = /^•\s/;

/** Group consecutive bullet lines into one list; blank lines only separate. */
export function parseNoteBlocks(body: string): NoteBlock[] {
  const blocks: NoteBlock[] = [];
  let list: { kind: 'list'; items: string[] } | null = null;
  for (const line of body.split('\n')) {
    if (BULLET_LINE.test(line)) {
      if (!list) {
        list = { kind: 'list', items: [] };
        blocks.push(list);
      }
      list.items.push(line.replace(/^•\s*/, ''));
      continue;
    }
    list = null;
    if (line.trim()) blocks.push({ kind: 'paragraph', text: line });
  }
  return blocks;
}

function plainLines(body: string): string[] {
  return body
    .split('\n')
    .map((line) => line.replace(/^•\s*/, '').trim())
    .filter(Boolean);
}

const UNTITLED_PREVIEW = 40;

/**
 * One calm line for rows, tiles and sheets: bullets and breaks become dots. A
 * note without a title is named by its first line, which the excerpt then
 * leaves out so the same words are not shown twice.
 */
export function noteExcerpt(
  note: Pick<SharedNoteDetail, 'title' | 'body'>,
): string {
  const lines = plainLines(note.body);
  const named =
    !note.title.trim() && lines[0] && lines[0].length <= UNTITLED_PREVIEW;
  return (named ? lines.slice(1) : lines).join(' · ');
}

/**
 * A note may have no title. Its first line then names it; a note without
 * either (the server rejects that) falls back to the localized label.
 */
export function noteDisplayTitle(
  note: Pick<SharedNoteDetail, 'title' | 'body'>,
  untitled: string,
): string {
  const title = note.title.trim();
  if (title) return title;
  const first = plainLines(note.body)[0];
  if (!first) return untitled;
  return first.length > UNTITLED_PREVIEW
    ? `${first.slice(0, UNTITLED_PREVIEW)}…`
    : first;
}

export function noteMatchesQuery(
  note: Pick<SharedNoteDetail, 'title' | 'body'>,
  query: string,
): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return `${note.title}\n${note.body}`.toLocaleLowerCase().includes(needle);
}

/** Insert the bullet marker at the start of the line holding the caret. */
export function insertBulletAtCaret(
  value: string,
  caret: number,
): { value: string; caret: number } {
  const lineStart = caret === 0 ? 0 : value.lastIndexOf('\n', caret - 1) + 1;
  if (value.startsWith(BULLET_MARKER, lineStart))
    return { value, caret: Math.max(caret, lineStart + BULLET_MARKER.length) };
  return {
    value: value.slice(0, lineStart) + BULLET_MARKER + value.slice(lineStart),
    caret: caret + BULLET_MARKER.length,
  };
}

/**
 * Enter on a bullet line starts the next bullet; Enter on an empty bullet ends
 * the list. Returns null when the line is not a bullet, so the browser's own
 * newline stays in charge.
 */
export function continueBulletOnEnter(
  value: string,
  selectionStart: number,
  selectionEnd: number,
): { value: string; caret: number } | null {
  const lineStart =
    selectionStart === 0 ? 0 : value.lastIndexOf('\n', selectionStart - 1) + 1;
  if (!value.startsWith(BULLET_MARKER, lineStart)) return null;
  // A caret inside the marker is not "at the end of a bullet".
  if (selectionStart < lineStart + BULLET_MARKER.length) return null;
  const lineEndIndex = value.indexOf('\n', selectionEnd);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
  const isEmptyBullet =
    value.slice(lineStart, lineEnd).trim() === BULLET_MARKER.trim();
  if (isEmptyBullet) {
    return {
      value: value.slice(0, lineStart) + value.slice(lineEnd),
      caret: lineStart,
    };
  }
  const insertion = `\n${BULLET_MARKER}`;
  return {
    value:
      value.slice(0, selectionStart) + insertion + value.slice(selectionEnd),
    caret: selectionStart + insertion.length,
  };
}

/** A note needs a title or text; the same rule the server enforces. */
export function noteHasContent(draft: {
  title: string;
  body: string;
}): boolean {
  return Boolean(draft.title.trim() || draft.body.trim());
}

export interface NoteDraft {
  title: string;
  body: string;
}

export function noteDraftOf(
  note: Pick<SharedNoteDetail, 'title' | 'body'>,
): NoteDraft {
  return { title: note.title, body: note.body };
}

export function noteDraftsEqual(left: NoteDraft, right: NoteDraft): boolean {
  return left.title === right.title && left.body === right.body;
}

/**
 * After a 409 the editor refetches the note. When the words are the ones the
 * writer started from, only presentation (pinned, title only on Wir) or the
 * version moved, so the writer's text can be saved on the new version without
 * asking. Any change to the words is a real conflict the writer decides.
 */
export function isPresentationOnlyChange(
  base: NoteDraft,
  latest: Pick<SharedNoteDetail, 'title' | 'body'>,
): boolean {
  return noteDraftsEqual(base, noteDraftOf(latest));
}

/** Pinned notes first, each group keeps the server's recency order. */
export function splitPinned<T extends Pick<SharedNoteDetail, 'pinned'>>(
  notes: readonly T[],
): { pinned: T[]; rest: T[] } {
  return {
    pinned: notes.filter((note) => note.pinned),
    rest: notes.filter((note) => !note.pinned),
  };
}

/**
 * Add the pinned notes whose page is not loaded yet to the loaded pages, keeping
 * the server's recency order (last edit first, newer id first on a tie). A note
 * already on a loaded page wins, because that copy is the fresher one.
 */
export function withPinnedNotes<
  T extends Pick<SharedNoteDetail, 'id' | 'pinned' | 'editedAt'>,
>(paged: readonly T[], pinned: readonly T[]): T[] {
  const loaded = new Set(paged.map((note) => note.id));
  const missing = pinned.filter((note) => note.pinned && !loaded.has(note.id));
  if (missing.length === 0) return [...paged];
  return [...paged, ...missing].sort(
    (left, right) =>
      right.editedAt.getTime() - left.editedAt.getTime() ||
      (left.id < right.id ? 1 : left.id > right.id ? -1 : 0),
  );
}

/** The trimmed title to send; the server stores an empty title as no title. */
export function normalizedTitle(title: string): string {
  return title.trim();
}
