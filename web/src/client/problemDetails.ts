import type { ProblemDetails } from '../api/generated/models/ProblemDetails';
import { FetchError, ResponseError } from '../api/generated/runtime';

export type ClientProblemKind =
  | 'validation'
  | 'unauthorized'
  | 'permission'
  | 'notFound'
  | 'conflict'
  | 'rateLimit'
  | 'offline'
  | 'server'
  | 'unknown';

export class ClientProblemError extends Error {
  constructor(
    readonly kind: ClientProblemKind,
    readonly status?: number,
    readonly code?: string,
    /**
     * Seconds until the server allows the same request again, from the
     * standard HTTP `Retry-After` response header (RFC 9110 §10.2.3) when the
     * server sent one. Structured and server-authoritative — never parsed
     * from the `detail` prose string.
     */
    readonly retryAfterSeconds?: number,
  ) {
    super(`Client request failed (${kind}).`);
    this.name = 'ClientProblemError';
  }
}

function isProblemDetails(value: unknown): value is ProblemDetails {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ProblemDetails>;
  return (
    typeof candidate.code === 'string' &&
    typeof candidate.detail === 'string' &&
    typeof candidate.status === 'number' &&
    typeof candidate.title === 'string' &&
    typeof candidate.type === 'string'
  );
}

export function classifyProblemStatus(status: number): ClientProblemKind {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'permission';
  if (status === 404) return 'notFound';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rateLimit';
  if (status === 400 || status === 422) return 'validation';
  if (status >= 500) return 'server';
  return 'unknown';
}

export async function normalizeClientError(
  error: unknown,
): Promise<ClientProblemError> {
  if (error instanceof ClientProblemError) return error;

  if (error instanceof FetchError) {
    return new ClientProblemError('offline');
  }

  if (error instanceof ResponseError) {
    let problem: ProblemDetails | null = null;
    try {
      const body = (await error.response.clone().json()) as unknown;
      if (isProblemDetails(body)) problem = body;
    } catch {
      // Malformed or non-JSON API responses still receive a safe status mapping.
    }

    const status = problem?.status ?? error.response.status;
    const retryAfterHeader = error.response.headers.get('Retry-After');
    const retryAfterSeconds =
      retryAfterHeader !== null && /^\d+$/.test(retryAfterHeader)
        ? Number(retryAfterHeader)
        : undefined;
    return new ClientProblemError(
      classifyProblemStatus(status),
      status,
      problem?.code,
      retryAfterSeconds,
    );
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return new ClientProblemError('offline');
  }

  if (error && typeof error === 'object') {
    const candidate = error as { status?: unknown; code?: unknown };
    if (typeof candidate.status === 'number') {
      return new ClientProblemError(
        classifyProblemStatus(candidate.status),
        candidate.status,
        typeof candidate.code === 'string' ? candidate.code : undefined,
      );
    }
  }

  return new ClientProblemError('unknown');
}

export function clientProblemKind(error: unknown): ClientProblemKind {
  if (error instanceof ClientProblemError) return error.kind;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'offline';
  }
  return 'unknown';
}
