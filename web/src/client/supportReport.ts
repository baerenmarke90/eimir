import type { SupportReportCreate } from '../api/generated/models/SupportReportCreate';
import { resolvedLocale } from '../i18n';
import { isCapacitorNative } from '../pwa';
import {
  type FailureReference,
  isSafeReference,
  safeRequestId,
} from './failureReference';
import { identityBuildVariable } from './identityEnvironment';

export type SupportReportKind = 'PROBLEM' | 'FEEDBACK';

/** App and device facts that help reproduce a report; no device identifiers. */
export interface ClientContext {
  appVersion: string;
  build: string;
  platform: 'app' | 'web';
  os: string;
  engine: string;
  locale: string;
  theme: string;
  online: boolean;
  localTime: string;
  timeZone: string;
}

/** Server limit of the note, counted in characters (code points). */
export const NOTE_MAX_CHARACTERS = 2000;

/**
 * The only fields a report may carry: top-level and nested names as dotted
 * paths. The server pins the same list with a strict schema (backend
 * `support_reports/payload.py`); a test keeps the builder inside it.
 */
export const ALLOWED_PAYLOAD_FIELDS: readonly string[] = [
  'clientRequestId',
  'kind',
  'note',
  'failure',
  'failure.reference',
  'failure.requestId',
  'client',
  'client.appVersion',
  'client.build',
  'client.platform',
  'client.os',
  'client.engine',
  'client.locale',
  'client.theme',
  'client.online',
  'client.localTime',
  'client.timeZone',
];

/** What the sheet lists as "what is sent"; keys, never localized text. */
export type SupportReportItem =
  | 'failure'
  | 'app'
  | 'device'
  | 'locale'
  | 'account';

export type SupportReportInputProblem = 'noteRequired' | 'noteTooLong';

/** Raised before anything is sent when the note cannot be accepted. */
export class SupportReportInputError extends Error {
  constructor(readonly problem: SupportReportInputProblem) {
    super(`Support report note is invalid (${problem}).`);
    this.name = 'SupportReportInputError';
  }
}

const characters = (value: string) => Array.from(value);

/** The trimmed note, and the problem that would stop a send, if any. */
export function checkSupportNote(
  kind: SupportReportKind,
  note: string,
): { note: string; problem?: SupportReportInputProblem } {
  const trimmed = note.trim();
  if (characters(trimmed).length > NOTE_MAX_CHARACTERS)
    return { note: trimmed, problem: 'noteTooLong' };
  if (kind === 'FEEDBACK' && trimmed === '')
    return { note: trimmed, problem: 'noteRequired' };
  return { note: trimmed };
}

function cap(value: string, max: number): string {
  const units = characters(value);
  return units.length <= max ? value : units.slice(0, max).join('');
}

function sanitizeContext(
  context: ClientContext,
): SupportReportCreate['client'] {
  return {
    appVersion: cap(context.appVersion, 32),
    build: cap(context.build, 32),
    platform: context.platform === 'app' ? 'app' : 'web',
    os: cap(context.os, 64),
    engine: cap(context.engine, 64),
    locale: cap(context.locale, 35),
    theme: cap(context.theme, 16),
    online: context.online === true,
    localTime: cap(context.localTime, 40),
    timeZone: cap(context.timeZone, 64),
  };
}

/** A reference the server would refuse is dropped whole, never sent in part. */
function sanitizeFailure(
  failure: FailureReference | undefined,
): FailureReference | undefined {
  if (!failure || !isSafeReference(failure.reference)) return undefined;
  const requestId = safeRequestId(failure.requestId);
  return requestId
    ? { reference: failure.reference, requestId }
    : { reference: failure.reference };
}

export function buildSupportReport(input: {
  kind: SupportReportKind;
  note: string;
  failure?: FailureReference;
  clientContext: ClientContext;
  clientRequestId: string;
}): SupportReportCreate {
  const { note, problem } = checkSupportNote(input.kind, input.note);
  if (problem) throw new SupportReportInputError(problem);
  const failure =
    input.kind === 'PROBLEM' ? sanitizeFailure(input.failure) : undefined;
  return {
    clientRequestId: input.clientRequestId,
    kind: input.kind,
    ...(note ? { note } : {}),
    ...(failure ? { failure } : {}),
    client: sanitizeContext(input.clientContext),
  };
}

/**
 * The items the sheet lists; they always match what `buildSupportReport` sends.
 * `app` covers version and build; `device` covers platform, system, engine,
 * theme and online state; `locale` covers language, local time and time zone.
 */
export function describeSupportReport(input: {
  kind: SupportReportKind;
  failure?: FailureReference;
}): SupportReportItem[] {
  const failure =
    input.kind === 'PROBLEM' ? sanitizeFailure(input.failure) : undefined;
  return [
    ...(failure ? (['failure'] as const) : []),
    'app',
    'device',
    'locale',
    'account',
  ];
}

function majorVersion(value: string | undefined): string {
  return value?.split(/[._]/, 1)[0] ?? '';
}

/** Operating system name and major version; never the device model. */
function operatingSystem(userAgent: string): string {
  const android = /Android (\d+)/.exec(userAgent);
  if (android) return `Android ${android[1]}`;
  const ios = /(?:iPhone|iPad|iPod).*? OS (\d+)/.exec(userAgent);
  if (ios) return `iOS ${ios[1]}`;
  const windows = /Windows NT (\d+(?:\.\d+)?)/.exec(userAgent);
  if (windows) return `Windows ${windows[1]}`;
  if (/Mac OS X/.test(userAgent)) return 'macOS';
  if (/CrOS/.test(userAgent)) return 'ChromeOS';
  if (/Linux/.test(userAgent)) return 'Linux';
  return '';
}

/** Browser or WebView engine and major version. */
function browserEngine(userAgent: string): string {
  const edge = /Edg(?:e|A|iOS)?\/(\d+)/.exec(userAgent);
  if (edge) return `Edge ${edge[1]}`;
  const firefox = /(?:Firefox|FxiOS)\/(\d+)/.exec(userAgent);
  if (firefox) return `Firefox ${firefox[1]}`;
  const chrome = /(?:Chrome|CriOS)\/(\d+)/.exec(userAgent);
  if (chrome)
    return /; wv\)/.test(userAgent)
      ? `WebView ${chrome[1]}`
      : `Chrome ${chrome[1]}`;
  const safari = /Version\/(\d+).*Safari/.exec(userAgent);
  if (safari) return `Safari ${safari[1]}`;
  return '';
}

interface UserAgentData {
  platform?: string;
  brands?: { brand: string; version: string }[];
}

function clientHints(): UserAgentData | undefined {
  return (navigator as Navigator & { userAgentData?: UserAgentData })
    .userAgentData;
}

function hintedEngine(hints: UserAgentData | undefined): string {
  const brand = hints?.brands?.find(
    ({ brand: name }) => !/not.?a.?brand/i.test(name) && name !== 'Chromium',
  );
  return brand ? `${brand.brand} ${majorVersion(brand.version)}`.trim() : '';
}

/** Local time as ISO 8601 with the UTC offset, e.g. `2026-11-23T10:00:00.000+01:00`. */
function localIsoTime(date: Date): string {
  const pad = (value: number, size = 2) => String(value).padStart(size, '0');
  const offset = -date.getTimezoneOffset();
  const sign = offset < 0 ? '-' : '+';
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `.${pad(date.getMilliseconds(), 3)}` +
    `${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`
  );
}

/**
 * The runtime facts attached to a report. The app version and build come from
 * the build variables (`VITE_EIMIR_APP_VERSION`, `VITE_EIMIR_BUILD`) and read
 * `unknown` when a build does not set them. No device model, identifier,
 * account data or free text is read.
 */
export function collectClientContext(): ClientContext {
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const hints = typeof navigator === 'undefined' ? undefined : clientHints();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const context: ClientContext = {
    appVersion: identityBuildVariable('APP_VERSION').trim() || 'unknown',
    build: identityBuildVariable('BUILD').trim() || 'unknown',
    platform: isCapacitorNative() ? 'app' : 'web',
    os: operatingSystem(userAgent) || hints?.platform || 'unknown',
    engine: browserEngine(userAgent) || hintedEngine(hints) || 'unknown',
    locale: resolvedLocale(),
    theme:
      typeof document !== 'undefined' &&
      document.documentElement.dataset.theme === 'dark'
        ? 'dark'
        : 'light',
    online: typeof navigator === 'undefined' || navigator.onLine !== false,
    localTime: localIsoTime(new Date()),
    timeZone: timeZone || 'unknown',
  };
  return sanitizeContext(context);
}
