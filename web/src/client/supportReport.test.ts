// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearFailureReference,
  lastFailureReference,
  recordRequestFailure,
  type FailureReference,
} from './failureReference';
import {
  ALLOWED_PAYLOAD_FIELDS,
  buildSupportReport,
  collectClientContext,
  describeSupportReport,
  NOTE_MAX_CHARACTERS,
  SupportReportInputError,
  type ClientContext,
} from './supportReport';

const REQUEST_ID = '6f1d7a39-2f5e-4a46-9b4a-0c2f7f3f9a10';
// The server character classes (backend `support_reports/payload.py`).
const REFERENCE_CLASS = /^[A-Za-z0-9_./{}:-]{1,200}$/;
const REQUEST_ID_CLASS = /^[A-Za-z0-9._-]{1,128}$/;

const CONTEXT: ClientContext = {
  appVersion: '1.2.3',
  build: '45',
  platform: 'web',
  os: 'Android 14',
  engine: 'Chrome 126',
  locale: 'de',
  theme: 'light',
  online: true,
  localTime: '2026-11-23T10:00:00.000+01:00',
  timeZone: 'Europe/Berlin',
};
const FAILURE: FailureReference = {
  reference: 'PUT:/api/v1/attachments/{id}/content:413:app',
  requestId: 'req-123',
};

/** Every dotted path of an object, containers included. */
function paths(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return [];
  return Object.entries(value as Record<string, unknown>).flatMap(
    ([key, child]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return [path, ...paths(child, path)];
    },
  );
}

beforeEach(() => clearFailureReference());
afterEach(() => vi.unstubAllGlobals());

describe('buildSupportReport', () => {
  it('payload_has_only_allowed_fields', () => {
    const payload = buildSupportReport({
      kind: 'PROBLEM',
      note: '  The photo is missing.  ',
      failure: FAILURE,
      clientContext: CONTEXT,
      clientRequestId: REQUEST_ID,
    });
    expect(payload.note).toBe('The photo is missing.');
    expect(payload.clientRequestId).toBe(REQUEST_ID);
    const allowed = new Set(ALLOWED_PAYLOAD_FIELDS);
    for (const path of paths(payload)) expect(allowed).toContain(path);
    // A field outside the list can never be added through the input.
    const polluted = buildSupportReport({
      kind: 'PROBLEM',
      note: 'x',
      failure: { ...FAILURE, token: 'secret' } as FailureReference,
      clientContext: { ...CONTEXT, deviceId: 'abc' } as ClientContext,
      clientRequestId: REQUEST_ID,
    });
    for (const path of paths(polluted)) expect(allowed).toContain(path);
  });

  it('feedback_never_carries_failure', () => {
    const payload = buildSupportReport({
      kind: 'FEEDBACK',
      note: 'An idea',
      failure: FAILURE,
      clientContext: CONTEXT,
      clientRequestId: REQUEST_ID,
    });
    expect(payload).not.toHaveProperty('failure');
    expect(
      describeSupportReport({ kind: 'FEEDBACK', failure: FAILURE }),
    ).not.toContain('failure');
  });

  it('omits_a_blank_problem_note_and_rejects_blank_feedback', () => {
    const problem = buildSupportReport({
      kind: 'PROBLEM',
      note: '   \n ',
      failure: FAILURE,
      clientContext: CONTEXT,
      clientRequestId: REQUEST_ID,
    });
    expect(problem).not.toHaveProperty('note');
    expect(problem.failure).toEqual(FAILURE);
    expect(() =>
      buildSupportReport({
        kind: 'FEEDBACK',
        note: '  ',
        clientContext: CONTEXT,
        clientRequestId: REQUEST_ID,
      }),
    ).toThrow(SupportReportInputError);
  });

  it('counts_the_note_limit_in_characters_not_utf16_units', () => {
    const emoji = '\u{1F496}'.repeat(NOTE_MAX_CHARACTERS);
    expect(emoji.length).toBe(NOTE_MAX_CHARACTERS * 2);
    const accepted = buildSupportReport({
      kind: 'FEEDBACK',
      note: emoji,
      clientContext: CONTEXT,
      clientRequestId: REQUEST_ID,
    });
    expect([...(accepted.note ?? '')]).toHaveLength(NOTE_MAX_CHARACTERS);
    expect(() =>
      buildSupportReport({
        kind: 'FEEDBACK',
        note: `${emoji}\u{1F496}`,
        clientContext: CONTEXT,
        clientRequestId: REQUEST_ID,
      }),
    ).toThrow(SupportReportInputError);
  });

  it('no_url_token_or_filename_in_payload', () => {
    const unsafe: FailureReference = {
      reference: 'GET:https://x.test/a.jpg?token=abc',
      requestId: 'has space',
    };
    const payload = buildSupportReport({
      kind: 'PROBLEM',
      note: '',
      failure: unsafe,
      clientContext: CONTEXT,
      clientRequestId: REQUEST_ID,
    });
    // An unsafe reference is dropped entirely rather than sent in part.
    expect(payload).not.toHaveProperty('failure');
    const partlySafe = buildSupportReport({
      kind: 'PROBLEM',
      note: '',
      failure: { reference: FAILURE.reference, requestId: 'a b?c' },
      clientContext: CONTEXT,
      clientRequestId: REQUEST_ID,
    });
    expect(partlySafe.failure).toEqual({ reference: FAILURE.reference });
    const text = JSON.stringify(payload);
    expect(text).not.toMatch(/https?:|token|\.jpg|\?/);
  });
});

describe('describeSupportReport', () => {
  it('lists_the_failure_only_when_one_is_attached', () => {
    expect(
      describeSupportReport({ kind: 'PROBLEM', failure: FAILURE }),
    ).toEqual(['failure', 'app', 'device', 'locale', 'account']);
    expect(describeSupportReport({ kind: 'PROBLEM' })).toEqual([
      'app',
      'device',
      'locale',
      'account',
    ]);
  });
});

describe('collectClientContext', () => {
  it('reads_runtime_facts_without_device_identifiers_within_server_limits', () => {
    vi.stubGlobal('navigator', {
      onLine: false,
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.71 Mobile Safari/537.36',
    });
    document.documentElement.dataset.theme = 'dark';
    const context = collectClientContext();
    expect(context.online).toBe(false);
    expect(context.theme).toBe('dark');
    expect(context.platform).toBe('web');
    expect(context.os).toBe('Android 14');
    expect(context.engine).toBe('Chrome 126');
    expect(context.timeZone).toBe(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    expect(context.localTime).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}([+-]\d{2}:\d{2}|Z)$/,
    );
    const limits: Record<string, number> = {
      appVersion: 32,
      build: 32,
      os: 64,
      engine: 64,
      locale: 35,
      theme: 16,
      localTime: 40,
      timeZone: 64,
    };
    for (const [key, max] of Object.entries(limits)) {
      const value = (context as unknown as Record<string, string>)[key];
      expect(value.length).toBeGreaterThan(0);
      expect(value.length).toBeLessThanOrEqual(max);
    }
    expect(JSON.stringify(context)).not.toContain('Pixel');
    expect(Object.keys(context).sort()).toEqual(
      [
        'appVersion',
        'build',
        'platform',
        'os',
        'engine',
        'locale',
        'theme',
        'online',
        'localTime',
        'timeZone',
      ].sort(),
    );
  });
});

describe('failure reference', () => {
  it('failure_reference_has_no_ids_or_query', () => {
    recordRequestFailure({
      method: 'get',
      routeTemplate: '/memories/123?x=1',
      status: 500,
    });
    expect(lastFailureReference()?.reference).toBe(
      'GET:/memories/{id}:500:web',
    );
    recordRequestFailure({
      method: 'PATCH',
      routeTemplate:
        '/api/v1/spaces/0b6f3c52-9f0a-4c79-8f51-2f8b6a3d6b1e/memories/42/photo.jpg#frag',
      status: 409,
      code: 'VERSION_CONFLICT',
      requestId: 'req-9',
    });
    const last = lastFailureReference();
    expect(last).toEqual({
      reference:
        'PATCH:/api/v1/spaces/{id}/memories/{id}/{id}:409:VERSION_CONFLICT:web',
      requestId: 'req-9',
    });
  });

  it('keeps_only_the_last_failure_and_can_be_cleared', () => {
    recordRequestFailure({
      method: 'GET',
      routeTemplate: '/api/v1/a',
      status: 500,
    });
    recordRequestFailure({
      method: 'GET',
      routeTemplate: '/api/v1/b',
      status: 0,
    });
    expect(lastFailureReference()?.reference).toBe('GET:/api/v1/b:network:web');
    clearFailureReference();
    expect(lastFailureReference()).toBeUndefined();
  });

  it('always_satisfies_the_server_character_class_and_length', () => {
    const nasty = `/${'ab/'.repeat(150)}é ü/a%20b/x=y//z/{already}`;
    recordRequestFailure({
      method: 'delete',
      routeTemplate: nasty,
      status: 502,
      code: 'we ird/code?',
      requestId: 'bad id?',
    });
    const failure = lastFailureReference();
    expect(failure?.reference).toMatch(REFERENCE_CLASS);
    expect(failure?.reference).not.toContain('://');
    expect(failure?.requestId).toBeUndefined();
    recordRequestFailure({
      method: 'GET',
      routeTemplate: '//host.test//x',
      status: 404,
      requestId: 'req_OK-1.2',
    });
    const second = lastFailureReference();
    expect(second?.reference).toMatch(REFERENCE_CLASS);
    expect(second?.reference).not.toContain('://');
    expect(second?.requestId).toMatch(REQUEST_ID_CLASS);
  });

  it('marks_a_native_app_failure_as_app', async () => {
    vi.resetModules();
    vi.doMock('../pwa', () => ({ isCapacitorNative: () => true }));
    const fresh = await import('./failureReference');
    fresh.recordRequestFailure({
      method: 'PUT',
      routeTemplate:
        '/api/v1/attachments/9f3e1c7a-0d6b-4f4e-8a39-0c5d4f2b7a11/content',
      status: 413,
    });
    expect(fresh.lastFailureReference()?.reference).toBe(
      'PUT:/api/v1/attachments/{id}/content:413:app',
    );
    vi.doUnmock('../pwa');
  });
});
