export function buildInvitationLink(origin: string, token: string): string {
  const url = new URL('/auth/invitation', origin);
  url.searchParams.set('token', token);
  return url.toString();
}
