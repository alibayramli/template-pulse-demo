import type {
  HttpAuthService,
  PermissionsService,
} from '@backstage/backend-plugin-api';
import { InputError, NotAllowedError } from '@backstage/errors';
import { taskReadPermission } from '@backstage/plugin-scaffolder-common/alpha';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import {
  authorizeExecutionQuery,
  parseExecutionQuery,
} from '@template-pulse/plugin-node';
import Router from 'express-promise-router';
import type { DatabaseHistoryStore } from './historyStore';

export function createRouter(options: {
  httpAuth: HttpAuthService;
  permissions: PermissionsService;
  historyStore: DatabaseHistoryStore;
}) {
  const { httpAuth, permissions, historyStore } = options;
  const router = Router();
  router.get('/modules/template-pulse/analytics', async (req, res) => {
    const query = parseExecutionQuery(req.query);
    const limit = req.query.limit ?? '200';
    if (
      typeof limit !== 'string' ||
      !/^\d+$/.test(limit) ||
      Number(limit) < 1 ||
      Number(limit) > 1000
    )
      throw new InputError('limit must be an integer between 1 and 1000');
    const credentials = await httpAuth.credentials(req, { allow: ['user'] });
    // This endpoint also enforces analytics permissions when called directly.
    await authorizeExecutionQuery({ query, credentials, permissions });
    const [decision] = await permissions.authorizeConditional(
      [{ permission: taskReadPermission }],
      { credentials },
    );
    if (!decision || decision.result === AuthorizeResult.DENY)
      throw new NotAllowedError('Scaffolder task access denied');
    const analytics = await historyStore.search(
      query,
      credentials.principal.userEntityRef,
      decision,
      Number(limit),
    );
    res.setHeader('Cache-Control', 'no-store');
    res.json(analytics);
  });
  return router;
}
