export type SensitiveEntryToken =
  | { kind: 'recovery'; token: string }
  | { kind: 'magicLink'; token: string }
  | { kind: 'emailVerification'; token: string }
  | { kind: 'invitation'; token: string }
  | { kind: 'signup'; token: string };

const ENTRY_PATHS: Record<string, SensitiveEntryToken['kind']> = {
  '/auth/recovery': 'recovery',
  '/auth/magic-link': 'magicLink',
  '/auth/verify-email': 'emailVerification',
  '/auth/invitation': 'invitation',
  '/auth/signup': 'signup',
};

export function readSensitiveEntryToken(
  pathname: string,
  search: string,
): SensitiveEntryToken | null {
  const kind = ENTRY_PATHS[pathname.replace(/\/$/, '')];
  if (!kind) return null;

  const token = new URLSearchParams(search).get('token')?.trim();
  return token ? { kind, token } : null;
}

export function stripSensitiveEntryToken(search: string): string {
  const params = new URLSearchParams(search);
  params.delete('token');
  const nextSearch = params.toString();
  return `/${nextSearch ? `?${nextSearch}` : ''}`;
}
