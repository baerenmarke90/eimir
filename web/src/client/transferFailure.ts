import { ClientProblemError } from './problemDetails';

/**
 * Names for a failed Transfer export or import (#2173). Each id has a title and
 * a sentence under `transfer.failure.<id>`; the server code is only used to
 * pick the id and is never shown to the person.
 */
export type TransferFailureId =
  | 'exportTooLarge'
  | 'exportFailed'
  | 'exportGeneric'
  | 'exportExpired'
  | 'importTooLarge'
  | 'formatUnsupported'
  | 'fileInvalid'
  | 'members'
  | 'privacy'
  | 'importFailed'
  | 'importExpired';

/** Every id, so the copy can be checked for completeness. */
export const TRANSFER_FAILURE_IDS: readonly TransferFailureId[] = [
  'exportTooLarge',
  'exportFailed',
  'exportGeneric',
  'exportExpired',
  'importTooLarge',
  'formatUnsupported',
  'fileInvalid',
  'members',
  'privacy',
  'importFailed',
  'importExpired',
];

/**
 * Import codes by text. The four file errors share one text because the
 * person's next step is the same: download the export again.
 */
const IMPORT_FAILURES: Record<string, TransferFailureId> = {
  TRANSFER_TOO_LARGE: 'importTooLarge',
  TRANSFER_FORMAT_UNSUPPORTED: 'formatUnsupported',
  TRANSFER_MANIFEST_INVALID: 'fileInvalid',
  TRANSFER_ARCHIVE_UNSAFE: 'fileInvalid',
  TRANSFER_CHECKSUM_MISMATCH: 'fileInvalid',
  TRANSFER_RELATION_INVALID: 'fileInvalid',
  TRANSFER_MEMBER_MAPPING_REQUIRED: 'members',
  TRANSFER_MEMBER_MAPPING_INVALID: 'members',
  TRANSFER_PRIVACY_SCOPE_INVALID: 'privacy',
  TRANSFER_IMPORT_FAILED: 'importFailed',
};

const EXPORT_FAILURES: Record<string, TransferFailureId> = {
  TRANSFER_TOO_LARGE: 'exportTooLarge',
  TRANSFER_EXPORT_FAILED: 'exportFailed',
};

/** The text of a failed export; an unknown or missing code gets the generic one. */
export function exportFailureId(code?: string | null): TransferFailureId {
  return EXPORT_FAILURES[code ?? ''] ?? 'exportGeneric';
}

/** The text of a failed import; an unknown or missing code gets the plain failure. */
export function importFailureId(code?: string | null): TransferFailureId {
  return IMPORT_FAILURES[code ?? ''] ?? 'importFailed';
}

/**
 * A refused import request (for example a file over the size limit) that has its
 * own text. Other problems keep the shared problem state.
 */
export function importRequestFailureId(
  error: unknown,
): TransferFailureId | null {
  if (!(error instanceof ClientProblemError)) return null;
  const id = IMPORT_FAILURES[error.code ?? ''];
  return id && id !== 'importFailed' ? id : null;
}
