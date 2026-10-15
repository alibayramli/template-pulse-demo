import { InputError, NotAllowedError } from '@backstage/errors';
import type {
  BackstageCredentials,
  BackstageUserPrincipal,
  PermissionsService,
} from '@backstage/backend-plugin-api';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import {
  executionsReadAllPermission,
  executionsReadPermission,
  executionSortFields,
  type ExecutionQuery,
  type ExecutionSortField,
} from '@abayramli/backstage-plugin-template-pulse-common';

/** Validate the execution analytics HTTP query. @public */
export function parseExecutionQuery(
  values: Record<string, unknown>,
): ExecutionQuery {
  function value(key: string, maxLength = 255) {
    const input = values[key];
    if (input === undefined || input === '') return undefined;
    if (typeof input !== 'string' || input.length > maxLength)
      throw new InputError(`Invalid ${key}`);
    return input;
  }
  const scope = value('scope') ?? 'mine';
  if (scope !== 'mine' && scope !== 'all')
    throw new InputError('scope must be mine or all');
  const from = value('from');
  const to = value('to');
  for (const date of [from, to]) {
    if (
      !date ||
      !/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(date) ||
      !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString() !== date
    ) {
      throw new InputError('from and to must be UTC midnight timestamps');
    }
  }
  const length = Date.parse(to!) - Date.parse(from!);
  if (length <= 0 || length > 366 * 86_400_000)
    throw new InputError('Date range must be between 1 and 366 days');
  const status = value('status');
  if (
    status &&
    !['open', 'processing', 'completed', 'failed', 'cancelled'].includes(status)
  )
    throw new InputError('Invalid status');
  const allTime = value('allTime');
  if (allTime !== undefined && allTime !== 'true' && allTime !== 'false')
    throw new InputError('Invalid allTime');
  const offset = value('offset');
  if (
    offset !== undefined &&
    (!/^\d+$/.test(offset) || !Number.isSafeInteger(Number(offset)))
  )
    throw new InputError('Invalid offset');
  const sortBy = value('sortBy');
  if (sortBy && !executionSortFields.includes(sortBy as ExecutionSortField))
    throw new InputError('Invalid sortBy');
  const sortDirection = value('sortDirection');
  if (
    sortDirection &&
    sortDirection !== 'ascending' &&
    sortDirection !== 'descending'
  )
    throw new InputError('Invalid sortDirection');
  return {
    scope,
    from: from!,
    to: to!,
    templateRef: value('templateRef'),
    userRef: value('userRef'),
    status,
    query: value('query', 200)?.trim(),
    allTime: allTime === 'true',
    offset: Number(offset ?? 0),
    sortBy: (sortBy as ExecutionSortField | undefined) ?? 'createdAt',
    sortDirection: sortDirection === 'ascending' ? 'ascending' : 'descending',
  };
}

/** Check analytics access and prevent queries for another user's personal history. @public */
export async function authorizeExecutionQuery(options: {
  query: ExecutionQuery;
  credentials: BackstageCredentials<BackstageUserPrincipal>;
  permissions: PermissionsService;
}) {
  const { query, credentials, permissions } = options;
  const permission =
    query.scope === 'all'
      ? executionsReadAllPermission
      : executionsReadPermission;
  const [decision] = await permissions.authorize([{ permission }], {
    credentials,
  });
  if (decision?.result !== AuthorizeResult.ALLOW)
    throw new NotAllowedError('Execution analytics access denied');
  const callerRef = credentials.principal.userEntityRef;
  if (query.scope === 'mine' && query.userRef && query.userRef !== callerRef)
    throw new NotAllowedError('Own analytics cannot query another user');
}
