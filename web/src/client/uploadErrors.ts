import { i18n } from '../i18n';

/** A localized upload/reference-flow failure with an optional machine code. */
export class ReferenceFlowError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ReferenceFlowError';
  }
}

/** Where the byte transfer stopped, without any request or file content. */
export type UploadTransferDetail =
  | 'http'
  | 'network'
  | 'timeout'
  | 'stalled'
  | 'client';

/**
 * The byte PUT failed. It keeps the generic message for existing callers and
 * adds only privacy-safe facts for {@link describeUploadFailure}: the HTTP
 * status (0 when the transport never saw one), the server's problem code and
 * how far the bytes got. Never the URL, a token or the file name.
 */
export class UploadTransferError extends ReferenceFlowError {
  constructor(
    readonly detail: UploadTransferDetail,
    readonly status = 0,
    code?: string,
    readonly progress?: number,
  ) {
    super(i18n.t('flow.uploadFailed'), code);
    this.name = 'UploadTransferError';
  }
}
