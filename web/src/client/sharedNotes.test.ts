import { describe, expect, it } from 'vitest';
import {
  continueBulletOnEnter,
  insertBulletAtCaret,
  isPresentationOnlyChange,
  noteDisplayTitle,
  noteExcerpt,
  noteMatchesQuery,
  parseNoteBlocks,
  splitPinned,
} from './sharedNotes';

describe('shared note text', () => {
  it('groups bullet lines into one list and keeps paragraphs apart', () => {
    expect(parseNoteBlocks('Intro\n\n• one\n• two\nOutro\n• three')).toEqual([
      { kind: 'paragraph', text: 'Intro' },
      { kind: 'list', items: ['one', 'two'] },
      { kind: 'paragraph', text: 'Outro' },
      { kind: 'list', items: ['three'] },
    ]);
  });

  it('does not treat a bullet character without the marker space as a list', () => {
    expect(parseNoteBlocks('•not a list')).toEqual([
      { kind: 'paragraph', text: '•not a list' },
    ]);
  });

  it('names an untitled note by its first line and leaves that line out of the excerpt', () => {
    const note = {
      title: '',
      body: 'Door code 4172\n• bins on Monday\nQuiet hours',
    };
    expect(noteDisplayTitle(note, 'Untitled')).toBe('Door code 4172');
    expect(noteExcerpt(note)).toBe('bins on Monday · Quiet hours');
  });

  it('shortens a long first line and then keeps all text in the excerpt', () => {
    const long = 'x'.repeat(60);
    const note = { title: '', body: `${long}\nsecond` };
    expect(noteDisplayTitle(note, 'Untitled')).toBe(`${'x'.repeat(40)}…`);
    expect(noteExcerpt(note)).toBe(`${long} · second`);
  });

  it('prefers the written title and shows every line in the excerpt', () => {
    const note = { title: ' Flat ', body: '• a\n• b' };
    expect(noteDisplayTitle(note, 'Untitled')).toBe('Flat');
    expect(noteExcerpt(note)).toBe('a · b');
  });

  it('falls back to the localized label for an empty note', () => {
    expect(noteDisplayTitle({ title: ' ', body: '' }, 'Untitled')).toBe(
      'Untitled',
    );
  });

  it('matches a search over title and text without regard to case', () => {
    const note = { title: 'Holiday Flat', body: 'Key box left of the door' };
    expect(noteMatchesQuery(note, 'flat')).toBe(true);
    expect(noteMatchesQuery(note, 'KEY BOX')).toBe(true);
    expect(noteMatchesQuery(note, 'garden')).toBe(false);
    expect(noteMatchesQuery(note, '  ')).toBe(true);
  });

  it('keeps the recency order inside the pinned and the other group', () => {
    const notes = [
      { id: 'a', pinned: false },
      { id: 'b', pinned: true },
      { id: 'c', pinned: false },
      { id: 'd', pinned: true },
    ];
    const { pinned, rest } = splitPinned(notes);
    expect(pinned.map((note) => note.id)).toEqual(['b', 'd']);
    expect(rest.map((note) => note.id)).toEqual(['a', 'c']);
  });
});

describe('bullet editing', () => {
  it('inserts the marker at the start of the caret line once', () => {
    expect(insertBulletAtCaret('one\ntwo', 5)).toEqual({
      value: 'one\n• two',
      caret: 7,
    });
    expect(insertBulletAtCaret('', 0)).toEqual({ value: '• ', caret: 2 });
    const again = insertBulletAtCaret('• two', 3);
    expect(again.value).toBe('• two');
  });

  it('continues the list on Enter and ends it on an empty bullet', () => {
    expect(continueBulletOnEnter('• one', 5, 5)).toEqual({
      value: '• one\n• ',
      caret: 8,
    });
    expect(continueBulletOnEnter('• one\n• ', 8, 8)).toEqual({
      value: '• one\n',
      caret: 6,
    });
  });

  it('leaves Enter alone outside a bullet or inside the marker', () => {
    expect(continueBulletOnEnter('plain', 5, 5)).toBeNull();
    expect(continueBulletOnEnter('• one', 1, 1)).toBeNull();
  });
});

describe('edit conflicts', () => {
  const base = { title: 'Flat', body: 'Door code' };

  it('treats a change that left the words alone as presentation only', () => {
    expect(isPresentationOnlyChange(base, { ...base })).toBe(true);
  });

  it('asks the writer when the words changed', () => {
    expect(
      isPresentationOnlyChange(base, { title: 'Flat', body: 'Door code 1' }),
    ).toBe(false);
    expect(
      isPresentationOnlyChange(base, { title: 'Flats', body: 'Door code' }),
    ).toBe(false);
  });
});
