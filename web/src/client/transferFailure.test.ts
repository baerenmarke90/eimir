import { describe, expect, it } from 'vitest';
import { ResponseError } from '../api/generated/runtime';
import en from '../i18n/locales/en.json';
import m5s6 from '../i18n/locales/m5s6';
import { ClientProblemError, normalizeClientError } from './problemDetails';
import {
  exportFailureId,
  importFailureId,
  importRequestFailureId,
  TRANSFER_FAILURE_IDS,
  type TransferFailureId,
} from './transferFailure';

/** Every transfer code the server can store or return (backend ErrorCode.TRANSFER_*). */
const SERVER_CODES = [
  'TRANSFER_FORMAT_UNSUPPORTED',
  'TRANSFER_MANIFEST_INVALID',
  'TRANSFER_ARCHIVE_UNSAFE',
  'TRANSFER_CHECKSUM_MISMATCH',
  'TRANSFER_TOO_LARGE',
  'TRANSFER_RELATION_INVALID',
  'TRANSFER_MEMBER_MAPPING_REQUIRED',
  'TRANSFER_MEMBER_MAPPING_INVALID',
  'TRANSFER_PRIVACY_SCOPE_INVALID',
  'TRANSFER_IMPORT_FAILED',
  'TRANSFER_EXPORT_FAILED',
];

describe('export failure names', () => {
  it.each([
    ['TRANSFER_TOO_LARGE', 'exportTooLarge'],
    ['TRANSFER_EXPORT_FAILED', 'exportFailed'],
  ])('%s has its own text', (code, id) => {
    expect(exportFailureId(code)).toBe(id);
  });

  it.each([
    'TRANSFER_IMPORT_FAILED',
    'TRANSFER_MANIFEST_INVALID',
    'SOMETHING_ELSE',
    '',
    null,
    undefined,
  ])('falls back to the generic text for %s', (code) => {
    expect(exportFailureId(code)).toBe('exportGeneric');
  });
});

describe('import failure names', () => {
  it.each([
    ['TRANSFER_TOO_LARGE', 'importTooLarge'],
    ['TRANSFER_FORMAT_UNSUPPORTED', 'formatUnsupported'],
    ['TRANSFER_MANIFEST_INVALID', 'fileInvalid'],
    ['TRANSFER_ARCHIVE_UNSAFE', 'fileInvalid'],
    ['TRANSFER_CHECKSUM_MISMATCH', 'fileInvalid'],
    ['TRANSFER_RELATION_INVALID', 'fileInvalid'],
    ['TRANSFER_MEMBER_MAPPING_REQUIRED', 'members'],
    ['TRANSFER_MEMBER_MAPPING_INVALID', 'members'],
    ['TRANSFER_PRIVACY_SCOPE_INVALID', 'privacy'],
    ['TRANSFER_IMPORT_FAILED', 'importFailed'],
  ])('%s has its own text', (code, id) => {
    expect(importFailureId(code)).toBe(id);
  });

  it.each(['SOMETHING_ELSE', '', null, undefined])(
    'falls back to the plain failure for %s',
    (code) => {
      expect(importFailureId(code)).toBe('importFailed');
    },
  );

  it('shares one text between the four file errors', () => {
    const ids = new Set(
      [
        'TRANSFER_MANIFEST_INVALID',
        'TRANSFER_ARCHIVE_UNSAFE',
        'TRANSFER_CHECKSUM_MISMATCH',
        'TRANSFER_RELATION_INVALID',
      ].map(importFailureId),
    );
    expect(ids).toEqual(new Set<TransferFailureId>(['fileInvalid']));
  });

  it('names a refused import request and leaves other problems alone', () => {
    expect(
      importRequestFailureId(
        new ClientProblemError('validation', 413, 'TRANSFER_TOO_LARGE'),
      ),
    ).toBe('importTooLarge');
    expect(
      importRequestFailureId(
        new ClientProblemError('validation', 415, 'TRANSFER_MANIFEST_INVALID'),
      ),
    ).toBe('fileInvalid');
    expect(
      importRequestFailureId(
        new ClientProblemError('server', 500, 'TRANSFER_IMPORT_FAILED'),
      ),
    ).toBeNull();
    expect(
      importRequestFailureId(new ClientProblemError('offline')),
    ).toBeNull();
    expect(importRequestFailureId(new Error('boom'))).toBeNull();
    expect(importRequestFailureId(null)).toBeNull();
  });

  it('names a 413 that carries no problem code', () => {
    expect(importRequestFailureId(new ClientProblemError('unknown', 413))).toBe(
      'importTooLarge',
    );
    // Other statuses and other codes keep their own handling.
    expect(
      importRequestFailureId(new ClientProblemError('unknown', 408)),
    ).toBeNull();
    expect(
      importRequestFailureId(new ClientProblemError('server', 502)),
    ).toBeNull();
    expect(
      importRequestFailureId(
        new ClientProblemError('unknown', 413, 'STORAGE_QUOTA_EXCEEDED'),
      ),
    ).toBeNull();
  });

  it('names an HTML 413 from a reverse proxy in front of the API', async () => {
    const html =
      '<html><head><title>413 Request Entity Too Large</title></head></html>';
    const refused = new ResponseError(
      new Response(html, {
        status: 413,
        headers: { 'Content-Type': 'text/html' },
      }),
    );
    const normalized = await normalizeClientError(refused);
    expect(normalized.status).toBe(413);
    expect(normalized.code).toBeUndefined();
    expect(importRequestFailureId(normalized)).toBe('importTooLarge');
  });

  it('gives every server code a text on export or import', () => {
    for (const code of SERVER_CODES) {
      const named =
        exportFailureId(code) !== 'exportGeneric' ||
        importFailureId(code) !== 'importFailed' ||
        code === 'TRANSFER_IMPORT_FAILED';
      expect(named, code).toBe(true);
    }
  });
});

describe('failure copy', () => {
  const german = m5s6.transfer.failure as Record<
    string,
    { title: string; body: string }
  >;
  const english = en.transfer.failure as Record<
    string,
    { title: string; body: string }
  >;

  it.each(TRANSFER_FAILURE_IDS)(
    '%s has a title and a sentence in German and English',
    (id) => {
      for (const copy of [german[id], english[id]]) {
        expect(copy.title.length).toBeGreaterThan(0);
        expect(copy.body.length).toBeGreaterThan(0);
      }
    },
  );

  it('has no text without an id', () => {
    expect(Object.keys(german).sort()).toEqual(
      [...TRANSFER_FAILURE_IDS].sort(),
    );
    expect(Object.keys(english).sort()).toEqual(
      [...TRANSFER_FAILURE_IDS].sort(),
    );
  });

  it('never shows a technical code', () => {
    const everything = JSON.stringify([german, english]);
    expect(everything).not.toMatch(/TRANSFER_[A-Z_]+/);
  });

  it('does not talk as "wir" and does not name the Space', () => {
    const everything = JSON.stringify(german).toLowerCase();
    expect(everything).not.toMatch(/\bwir\b|\buns\b|\bspace\b|\braum\b/);
  });
});
