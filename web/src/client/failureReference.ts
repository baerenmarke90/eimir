import { FetchError } from '../api/generated/runtime';
import { isCapacitorNative } from '../pwa';
import { ClientProblemError } from './problemDetails';

/**
 * The generalized tester reference of the last failed API request (#2189),
 * for a support report. It is built from the method, the route template, the
 * HTTP status or transport outcome, the problem code and the surface. It never
 * holds a URL, query, id, token, file name or content, and always satisfies the
 * server's reference character class and length limits.
 */
export type FailureReference = { reference: string; requestId?: string };

export interface RequestFailureInfo {
  method: string;
  /** A request path; ids and any query string or fragment are removed here. */
  routeTemplate: string;
  /** HTTP status, 0 when no response reached the app. */
  status: number;
  /** The transport outcome used when `status` is 0; defaults to `network`. */
  outcome?: string;
  code?: string;
  requestId?: string;
}

// Server limits (backend `support_reports/payload.py`).
export const REFERENCE_MAX_LENGTH = 200;
export const REQUEST_ID_MAX_LENGTH = 128;
const CODE_MAX_LENGTH = 64;
const REFERENCE_CLASS = /^[A-Za-z0-9_./{}:-]+$/;
const REQUEST_ID_CLASS = /^[A-Za-z0-9._-]+$/;

const UUID_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLACEHOLDER_SEGMENT = /^\{[A-Za-z0-9_]{1,40}\}$/;
const PLAIN_SEGMENT = /^[A-Za-z0-9_-]+$/;

/** The last failure, with the status and code that identify its error. */
let lastFailure:
  | { reference: FailureReference; status: number; code?: string }
  | undefined;

function isIdentifier(segment: string): boolean {
  if (UUID_SEGMENT.test(segment) || /^\d+$/.test(segment)) return true;
  if (/^[0-9a-f]{8,}$/i.test(segment)) return true;
  // Opaque tokens and slugs mixing letters and digits are ids, not routes.
  return segment.length >= 10 && /\d/.test(segment) && /[A-Za-z]/.test(segment);
}

function templateSegment(rawSegment: string): string {
  let segment = rawSegment;
  try {
    segment = decodeURIComponent(rawSegment);
  } catch {
    return '{id}';
  }
  if (PLACEHOLDER_SEGMENT.test(segment)) return segment;
  // File names, escapes and anything outside a plain path word are not routes.
  if (!PLAIN_SEGMENT.test(segment) || segment.length > 40) return '{id}';
  return isIdentifier(segment) ? '{id}' : segment;
}

/** `/memories/123?x=1` becomes `/memories/{id}`. Exported for the transport. */
export function routeTemplateOf(path: string): string {
  const withoutQuery = path.split(/[?#]/, 1)[0] ?? '';
  const segments = withoutQuery
    .split('/')
    .filter((segment) => segment !== '')
    .map(templateSegment);
  return `/${segments.join('/')}`;
}

function methodOf(method: string): string {
  const letters = method.toUpperCase().replace(/[^A-Z]/g, '');
  return letters.slice(0, 8) || 'REQUEST';
}

function codeOf(code: string | undefined): string | undefined {
  const cleaned = (code ?? '').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 64);
  return cleaned.slice(0, CODE_MAX_LENGTH) || undefined;
}

function surface(): 'app' | 'web' {
  return isCapacitorNative() ? 'app' : 'web';
}

/** Keep a route within the budget by dropping whole trailing segments. */
function fitRoute(route: string, budget: number): string {
  if (route.length <= budget) return route;
  const cut = route.slice(0, Math.max(budget, 0));
  const slash = cut.lastIndexOf('/');
  return slash > 0 ? cut.slice(0, slash) : '/';
}

/** A request id the server accepts, or undefined when it would be refused. */
export function safeRequestId(value: string | null | undefined) {
  const id = value?.trim();
  return id && id.length <= REQUEST_ID_MAX_LENGTH && REQUEST_ID_CLASS.test(id)
    ? id
    : undefined;
}

/** True only for a reference the server's strict schema accepts. */
export function isSafeReference(reference: string): boolean {
  return (
    reference.length > 0 &&
    reference.length <= REFERENCE_MAX_LENGTH &&
    REFERENCE_CLASS.test(reference) &&
    !reference.includes('://')
  );
}

export function recordRequestFailure(info: RequestFailureInfo): void {
  const method = methodOf(info.method);
  const outcome =
    info.status > 0 ? String(info.status) : codeOf(info.outcome) || 'network';
  const code = codeOf(info.code);
  const tail = `:${outcome}${code ? `:${code}` : ''}:${surface()}`;
  const budget = REFERENCE_MAX_LENGTH - method.length - 1 - tail.length;
  const route = fitRoute(routeTemplateOf(info.routeTemplate), budget);
  const reference = `${method}:${route}${tail}`;
  // The class is guaranteed by construction; this guards future edits.
  if (!isSafeReference(reference)) return;
  const requestId = safeRequestId(info.requestId);
  lastFailure = {
    reference: requestId ? { reference, requestId } : { reference },
    status: info.status > 0 ? info.status : 0,
    code,
  };
}

export function lastFailureReference(): FailureReference | undefined {
  return lastFailure ? { ...lastFailure.reference } : undefined;
}

/**
 * The recorded failure when it is the one behind `error`, the error an error
 * state shows. A later failed background request, a previous screen's failure
 * or an error that did not come from the API is never attached instead: the
 * status must match and, when the error carries a problem code, the code too.
 * An error without a status (offline or unknown) matches only a transport
 * failure, which has no status either.
 */
export function failureReferenceFor(
  error: unknown,
): FailureReference | undefined {
  if (!lastFailure || !(error instanceof ClientProblemError)) return undefined;
  if (!error.status)
    return lastFailure.status === 0 ? lastFailureReference() : undefined;
  if (error.status !== lastFailure.status) return undefined;
  const code = codeOf(error.code);
  if (code && code !== lastFailure.code) return undefined;
  return lastFailureReference();
}

export function clearFailureReference(): void {
  lastFailure = undefined;
}

const SUPPORT_REPORT_PATH = '/api/v1/support-reports';

function transportOutcome(error: unknown): { status: number; outcome: string } {
  if (error instanceof ClientProblemError)
    return error.status
      ? { status: error.status, outcome: 'client' }
      : { status: 0, outcome: error.kind === 'offline' ? 'network' : 'client' };
  if (error instanceof FetchError || error instanceof TypeError)
    return { status: 0, outcome: 'network' };
  if (error instanceof DOMException && error.name === 'TimeoutError')
    return { status: 0, outcome: 'timeout' };
  return { status: 0, outcome: 'client' };
}

async function problemCodeOf(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.clone().json()) as { code?: unknown };
    return typeof body.code === 'string' ? body.code : undefined;
  } catch {
    return undefined;
  }
}

function describeRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
): { method: string; path: string } {
  const target =
    typeof input === 'string' || input instanceof URL ? input : input.url;
  const method =
    init?.method ??
    (typeof input === 'object' && 'method' in input
      ? input.method
      : undefined) ??
    'GET';
  try {
    // The path only: host, query and fragment never reach the reference.
    return {
      method,
      path: new URL(String(target), 'http://placeholder.invalid').pathname,
    };
  } catch {
    return { method, path: '/' };
  }
}

/**
 * Wrap an API transport so a failed request becomes the last failure
 * reference. Responses and errors reach the caller unchanged. The support
 * report endpoints are excluded so a report about a report never replaces the
 * failure it is about; cancellations and 2xx/3xx results are not failures.
 */
export function recordingFailures(transport: typeof fetch): typeof fetch {
  return async (input, init) => {
    const { method, path } = describeRequest(input, init);
    const observed = !path.startsWith(SUPPORT_REPORT_PATH);
    let response: Response;
    try {
      response = await transport(input, init);
    } catch (error) {
      if (
        observed &&
        !(error instanceof DOMException && error.name === 'AbortError')
      ) {
        const { status, outcome } = transportOutcome(error);
        recordRequestFailure({ method, routeTemplate: path, status, outcome });
      }
      throw error;
    }
    if (observed && response.status >= 400) {
      recordRequestFailure({
        method,
        routeTemplate: path,
        status: response.status,
        code: await problemCodeOf(response),
        requestId: response.headers.get('x-request-id') ?? undefined,
      });
    }
    return response;
  };
}
