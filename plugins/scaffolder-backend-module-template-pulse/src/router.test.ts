/** @jest-environment node */
import express from 'express';
import { createServer, type Server } from 'node:http';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import { createRouter } from './router';

let server: Server;
let baseUrl: string;
const authorize = jest.fn();
const authorizeConditional = jest.fn();
const search = jest.fn();
const getCredentials = jest.fn();

const params = {
  scope: 'all',
  from: '2026-09-01T00:00:00.000Z',
  to: '2026-10-01T00:00:00.000Z',
};
const request = (
  changes: Record<string, string> = {},
  path = '/modules/template-pulse/analytics',
) =>
  fetch(`${baseUrl}${path}?${new URLSearchParams({ ...params, ...changes })}`);

beforeEach(async () => {
  authorize.mockReset().mockResolvedValue([{ result: AuthorizeResult.ALLOW }]);
  authorizeConditional
    .mockReset()
    .mockResolvedValue([{ result: AuthorizeResult.ALLOW }]);
  search.mockReset().mockResolvedValue({ items: [], summary: { total: 0 } });
  getCredentials.mockReset().mockResolvedValue({
    principal: { type: 'user', userEntityRef: 'user:default/alice' },
  });
  const app = express();
  const options = {
    httpAuth: {
      credentials: getCredentials,
    },
    permissions: { authorize, authorizeConditional },
    historyStore: { search },
  } as unknown as Parameters<typeof createRouter>[0];
  app.use(createRouter(options));
  app.use(
    (
      error: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const statuses: Record<string, number> = {
        NotAllowedError: 403,
        InputError: 400,
      };
      res.status(statuses[error.name] ?? 500).json({ message: error.message });
    },
  );
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing test server address');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

it('requires user authentication when the Scaffolder module is called directly', async () => {
  getCredentials.mockRejectedValue(Object.assign(new Error('Authentication required'), { name: 'NotAllowedError' }));
  expect((await request()).status).toBe(403);
  expect(getCredentials).toHaveBeenCalledWith(expect.anything(), { allow: ['user'] });
  expect(authorize).not.toHaveBeenCalled();
  expect(authorizeConditional).not.toHaveBeenCalled();
  expect(search).not.toHaveBeenCalled();
});
afterEach(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve())),
  );
});

it('rejects analytics access before querying the database', async () => {
  authorize.mockResolvedValue([{ result: AuthorizeResult.DENY }]);
  expect((await request()).status).toBe(403);
  expect(search).not.toHaveBeenCalled();
  expect(authorizeConditional).not.toHaveBeenCalled();
});

it('cannot query another user through the own-history scope', async () => {
  expect(
    (
      await request({
        scope: 'mine',
        userRef: 'user:default/bob',
        allTime: 'true',
      })
    ).status,
  ).toBe(403);
  expect(search).not.toHaveBeenCalled();
});

it('rejects denied or missing task permission decisions before reading history', async () => {
  for (const decisions of [[{ result: AuthorizeResult.DENY }], []]) {
    authorizeConditional.mockResolvedValue(decisions);
    expect((await request()).status).toBe(403);
    expect(search).not.toHaveBeenCalled();
  }
});

it('validates queries and passes task authorization and caller identity to the store', async () => {
  const invalidQueries: Record<string, string>[] = [
    { offset: '-1' },
    { offset: '1.5' },
    { offset: '9007199254740992' },
    { allTime: 'yes' },
    { status: 'invalid' },
    { sortBy: 'spec' },
    { sortBy: 'duration_ms DESC; DROP TABLE tasks' },
    { sortDirection: 'sideways' },
    { scope: 'unknown' },
    { from: '2026-09-01T12:00:00.000Z' },
    { from: '2026-02-30T00:00:00.000Z' },
    { from: params.to },
    { limit: '0' },
    { limit: '1001' },
    { limit: '1.5' },
  ];
  for (const changes of invalidQueries) {
    expect((await request(changes)).status).toBe(400);
    expect(search).not.toHaveBeenCalled();
  }
  const decision = {
    result: AuthorizeResult.CONDITIONAL,
    pluginId: 'scaffolder',
    resourceType: 'scaffolder-task',
    conditions: {
      rule: 'IS_TASK_OWNER',
      resourceType: 'scaffolder-task',
      params: { createdBy: ['user:default/alice'] },
    },
  };
  authorizeConditional.mockResolvedValue([decision]);
  const response = await request({
    allTime: 'true',
    offset: '200',
    query: ' legacy alice ',
    status: 'failed',
    sortBy: 'durationMs',
    sortDirection: 'ascending',
  });
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(search).toHaveBeenCalledWith(
    expect.objectContaining({
      allTime: true,
      offset: 200,
      query: 'legacy alice',
      status: 'failed',
      sortBy: 'durationMs',
      sortDirection: 'ascending',
    }),
    'user:default/alice',
    decision,
    200,
  );
  expect(authorizeConditional.mock.calls[0][0][0].permission.name).toBe(
    'scaffolder.task.read',
  );
});
