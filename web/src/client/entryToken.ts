export type SensitiveEntryToken =
  | { kind: 'recovery'; token: string }
  | { kind: 'magicLink'; token: string }
  | { kind: 'emailVerification'; token: string }
  | { kind: 'invitation'; token: string }
  | { kind: 'signup'; token: string; invitationToken?: string }
  | {
      /** Return from an external sign-in provider; `token` is the state. */
      kind: 'oidc';
      token: string;
      connectionId: string;
      code: string | null;
      /** The provider reported an error or the person declined. */
      providerError: boolean;
    };

const ENTRY_PATHS: Record<
  string,
  Exclude<SensitiveEntryToken['kind'], 'oidc'>
> = {
  '/auth/recovery': 'recovery',
  '/auth/magic-link': 'magicLink',
  '/auth/verify-email': 'emailVerification',
  '/auth/invitation': 'invitation',
  '/auth/signup': 'signup',
};

const OIDC_RETURN_PATH = /^\/auth\/oidc\/([A-Za-z0-9_.-]{1,64})\/?$/;
const OIDC_RETURN_PARAMETERS = [
  'code',
  'state',
  'error',
  'error_description',
  'scope',
  'authuser',
  'prompt',
  'iss',
  'hd',
];

export function readSensitiveEntryToken(
  pathname: string,
  search: string,
  hash = '',
): SensitiveEntryToken | null {
  const oidcReturn = OIDC_RETURN_PATH.exec(pathname);
  if (oidcReturn) {
    const params = new URLSearchParams(search);
    const state = params.get('state')?.trim();
    const code = params.get('code')?.trim() || null;
    const providerError = params.has('error');
    if (!state || (!code && !providerError)) return null;
    return {
      kind: 'oidc',
      token: state,
      connectionId: oidcReturn[1] as string,
      code,
      providerError,
    };
  }
  const kind = ENTRY_PATHS[pathname.replace(/\/$/, '')];
  if (!kind) return null;

  const fragment = new URLSearchParams(hash.replace(/^#/, ''));
  const tokens = [
    ...fragment.getAll('token'),
    ...new URLSearchParams(search).getAll('token'),
  ];
  if (tokens.length !== 1) return null;
  const token = tokens[0]?.trim();
  if (token && kind === 'signup') {
    const invitationToken = fragment.get('invitationToken')?.trim();
    return invitationToken ? { kind, token, invitationToken } : { kind, token };
  }
  return token ? { kind, token } : null;
}

export function stripSensitiveEntryToken(search: string): string {
  const params = new URLSearchParams(search);
  params.delete('token');
  for (const name of OIDC_RETURN_PARAMETERS) params.delete(name);
  const nextSearch = params.toString();
  return `/${nextSearch ? `?${nextSearch}` : ''}`;
}
