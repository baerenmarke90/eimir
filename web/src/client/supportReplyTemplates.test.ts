import { describe, expect, it } from 'vitest';
import { ClientProblemError } from './problemDetails';
import {
  insertTemplate,
  REPLY_TEMPLATE_LIMIT,
  REPLY_TEMPLATE_NAME_MAX,
  REPLY_TEMPLATE_TEXT_MAX,
  replyTemplateErrorKey,
} from './supportReplyTemplates';

describe('reply template limits', () => {
  it('match the server limits', () => {
    expect(REPLY_TEMPLATE_NAME_MAX).toBe(40);
    expect(REPLY_TEMPLATE_TEXT_MAX).toBe(500);
    expect(REPLY_TEMPLATE_LIMIT).toBe(30);
  });
});

describe('insertTemplate', () => {
  it('fills an empty reply', () => {
    expect(insertTemplate('', null, 'Thanks!')).toEqual({
      value: 'Thanks!',
      caret: 7,
    });
  });

  it('inserts at the caret and puts the caret after the inserted text', () => {
    expect(
      insertTemplate('Hello world', { start: 6, end: 6 }, 'dear '),
    ).toEqual({ value: 'Hello dear world', caret: 11 });
  });

  it('replaces a selection', () => {
    expect(
      insertTemplate('Hello world', { start: 6, end: 11 }, 'there'),
    ).toEqual({ value: 'Hello there', caret: 11 });
  });

  it('appends on a new line when there is text and no caret', () => {
    expect(insertTemplate('Hello', null, 'Thanks!')).toEqual({
      value: 'Hello\nThanks!',
      caret: 13,
    });
  });

  it('keeps text beyond the limit', () => {
    const typed = 'a'.repeat(480);
    const template = 'b'.repeat(40);

    const result = insertTemplate(typed, null, template);

    expect(result.value).toBe(`${typed}\n${template}`);
    expect(result.value.length).toBe(521);
  });

  it('clamps a caret outside the text to its end', () => {
    expect(insertTemplate('Hi', { start: 9, end: 9 }, '!')).toEqual({
      value: 'Hi!',
      caret: 3,
    });
  });
});

describe('replyTemplateErrorKey', () => {
  const problem = (
    kind: ClientProblemError['kind'],
    status: number,
    code: string,
  ) => new ClientProblemError(kind, status, code);

  it('names the three template conflicts', () => {
    expect(
      replyTemplateErrorKey(problem('conflict', 409, 'SUPPORT_TEMPLATE_LIMIT')),
    ).toBe('serverAdmin.templates.errors.limit');
    expect(
      replyTemplateErrorKey(
        problem('conflict', 409, 'SUPPORT_TEMPLATE_NAME_TAKEN'),
      ),
    ).toBe('serverAdmin.templates.errors.nameTaken');
    expect(
      replyTemplateErrorKey(
        problem('notFound', 404, 'SUPPORT_TEMPLATE_NOT_FOUND'),
      ),
    ).toBe('serverAdmin.templates.errors.notFound');
  });

  it('falls back to the report messages', () => {
    expect(replyTemplateErrorKey(problem('offline', 0, 'OFFLINE'))).toBe(
      'serverAdmin.reports.errors.offline',
    );
    expect(replyTemplateErrorKey(new Error('boom'))).toBe(
      'serverAdmin.reports.errors.generic',
    );
  });
});
