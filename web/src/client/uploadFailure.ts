import { FetchError, ResponseError } from '../api/generated/runtime';
import { i18n } from '../i18n';
import { isCapacitorNative } from '../pwa';
import { ClientProblemError } from './problemDetails';
import {
  ReferenceFlowError,
  type UploadTransferDetail,
  UploadTransferError,
} from './referenceFlow';
import { STORAGE_QUOTA_EXCEEDED } from './storageQuota';

/** The step of an attachment upload that failed. */
export type UploadPhase = 'create' | 'put' | 'finalize' | 'validate' | 'start';
export type UploadMedia = 'image' | 'video' | 'audio' | 'document';
export type UploadFailureReason =
  | 'storageFull'
  | 'tooLarge'
  | 'typeNotAllowed'
  | 'offline'
  | 'connection'
  | 'stalled'
  | 'refused';

export interface UploadFailureContext {
  phase: UploadPhase;
  media: UploadMedia;
  /** Bytes of the selected file; logged only in MiB with one decimal. */
  size?: number;
}

/**
 * An upload failure with a specific, localized reason. `reference` is a short
 * neutral token (step, status or transport outcome, problem code, app/web) a
 * tester can pass on; it never contains a URL, token, file name or content.
 */
export class UploadFailureError extends ReferenceFlowError {
  constructor(
    message: string,
    code: string | undefined,
    readonly reason: UploadFailureReason,
    readonly reference: string,
  ) {
    super(message, code);
    this.name = 'UploadFailureError';
  }
}

interface Observation {
  /** HTTP status, 0 when no response reached the app. */
  status: number;
  code?: string;
  detail: UploadTransferDetail;
  progress?: number;
}

async function problemCode(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.clone().json()) as { code?: unknown };
    return typeof body.code === 'string' && body.code.trim()
      ? body.code.trim()
      : undefined;
  } catch {
    return undefined;
  }
}

async function observe(error: unknown): Promise<Observation> {
  if (error instanceof UploadTransferError)
    return {
      status: error.status,
      code: error.code,
      detail: error.detail,
      progress: error.progress,
    };
  if (error instanceof ResponseError)
    return {
      status: error.response.status,
      code: await problemCode(error.response),
      detail: 'http',
    };
  const problem =
    error instanceof FetchError && error.cause instanceof ClientProblemError
      ? error.cause
      : error instanceof ClientProblemError
        ? error
        : null;
  if (problem)
    return problem.status
      ? { status: problem.status, code: problem.code, detail: 'http' }
      : {
          status: 0,
          detail: problem.kind === 'offline' ? 'network' : 'client',
        };
  // The generated client wraps a rejected fetch; fetch itself rejects with TypeError.
  if (error instanceof FetchError || error instanceof TypeError)
    return { status: 0, detail: 'network' };
  if (error instanceof DOMException && error.name === 'TimeoutError')
    return { status: 0, detail: 'timeout' };
  return { status: 0, detail: 'client' };
}

function reasonFor({ status, code, detail }: Observation): UploadFailureReason {
  if (code?.startsWith(STORAGE_QUOTA_EXCEEDED)) return 'storageFull';
  if (
    code === 'ATTACHMENT_TOO_LARGE' ||
    code === 'REQUEST_BODY_TOO_LARGE' ||
    status === 413
  )
    return 'tooLarge';
  if (code === 'ATTACHMENT_TYPE_NOT_ALLOWED' || status === 415)
    return 'typeNotAllowed';
  if (detail === 'network')
    return typeof navigator !== 'undefined' && navigator.onLine === false
      ? 'offline'
      : 'connection';
  if (detail === 'timeout' || detail === 'stalled') return 'stalled';
  return 'refused';
}

const TOO_LARGE: Record<UploadMedia, string> = {
  image: 'flow.imageTooLarge',
  video: 'video.tooLarge',
  audio: 'voiceNotes.tooLarge',
  document: 'planFiles.tooLarge',
};
const TYPE_NOT_ALLOWED: Record<UploadMedia, string> = {
  image: 'uploadFailure.imageType',
  video: 'video.unsupported',
  audio: 'voiceNotes.unsupported',
  document: 'planFiles.invalidPdf',
};
const REFUSED: Record<UploadMedia, string> = {
  image: 'uploadFailure.image',
  video: 'video.startFailed',
  audio: 'voiceNotes.uploadFailed',
  document: 'planFiles.uploadFailed',
};

function transport(): 'app' | 'web' {
  return isCapacitorNative() ? 'app' : 'web';
}

function referenceFor(
  phase: UploadPhase,
  { status, code, detail }: Observation,
): string {
  return [
    phase,
    detail === 'http' ? String(status) : detail,
    ...(code ? [code] : []),
    transport(),
  ].join('-');
}

/**
 * One concise, privacy-safe console line for testers, e.g.
 * `[eimir.upload] failed phase=put transport=app media=image status=0 detail=network progress=37 sizeMiB=4 online=true`.
 * Only step, media kind, status, problem code, transport outcome, progress and a
 * rounded size: never URLs, tokens, file names or content.
 */
export function logUploadFailure(
  context: UploadFailureContext,
  observation: Partial<Observation> & { reason?: string },
): void {
  const fields: Record<string, string | number | boolean | undefined> = {
    phase: context.phase,
    transport: transport(),
    media: context.media,
    reason: observation.reason,
    status: observation.status,
    code: observation.code,
    detail: observation.detail,
    progress: observation.progress,
    sizeMiB:
      context.size === undefined
        ? undefined
        : Math.round((context.size / (1024 * 1024)) * 10) / 10,
    online:
      typeof navigator === 'undefined' ? undefined : navigator.onLine !== false,
  };
  const line = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
  console.warn(`[eimir.upload] failed ${line}`);
}

/**
 * Turn any upload failure into the error the draft shows: a specific reason in
 * the couple's language, with a neutral reference wherever the cause is not
 * something they can act on themselves. Specific client checks and validation
 * results (a plain {@link ReferenceFlowError}) and cancellations pass through.
 */
export async function describeUploadFailure(
  error: unknown,
  context: UploadFailureContext,
): Promise<Error> {
  if (error instanceof DOMException && error.name === 'AbortError')
    return error;
  if (error instanceof UploadFailureError) return error;
  if (
    error instanceof ReferenceFlowError &&
    !(error instanceof UploadTransferError)
  ) {
    if (error.code) logUploadFailure(context, { code: error.code });
    return error;
  }
  const observation = await observe(error);
  const reason = reasonFor(observation);
  logUploadFailure(context, { ...observation, reason });
  const reference = referenceFor(context.phase, observation);
  const unexpected = context.phase !== 'create';
  const base =
    reason === 'storageFull'
      ? i18n.t('storageQuota.uploadRefused')
      : reason === 'tooLarge'
        ? i18n.t(TOO_LARGE[context.media])
        : reason === 'typeNotAllowed'
          ? i18n.t(TYPE_NOT_ALLOWED[context.media])
          : reason === 'refused'
            ? i18n.t(REFUSED[context.media])
            : i18n.t(`uploadFailure.${reason}`);
  // A full storage, a file over its limit or an unsupported format are clear
  // on their own when the server says so before any byte is sent.
  const withReference =
    reason === 'storageFull' ||
    reason === 'offline' ||
    ((reason === 'tooLarge' || reason === 'typeNotAllowed') && !unexpected)
      ? base
      : `${base} ${i18n.t('uploadFailure.reference', { reference })}`;
  return new UploadFailureError(
    withReference,
    observation.code,
    reason,
    reference,
  );
}
