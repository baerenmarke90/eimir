export function wishDateProposalQueryKey(
  apiBaseUrl: string,
  accountId: string,
  spaceId: string,
  wishId?: string,
) {
  const scope = ['wish-date-proposal', apiBaseUrl, accountId, spaceId] as const;
  return wishId ? ([...scope, wishId] as const) : scope;
}
