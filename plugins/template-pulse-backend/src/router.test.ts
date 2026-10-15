/** @jest-environment node */
import express from 'express';
import { createServer, type Server } from 'node:http';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import { createRouter } from './router';

const credentials = {
  principal: { type: 'user', userEntityRef: 'user:default/alice' },
};

let server: Server;
let baseUrl: string;
const authorize = jest.fn();
const search = jest.fn();
const listTasks = jest.fn();
const getLogs = jest.fn();
const getCredentials = jest.fn();
const params = {
  scope: 'all',
  from: '2026-09-01T00:00:00.000Z',
  to: '2026-10-01T00:00:00.000Z',
};
const request = (changes: Record<string, string> = {}, path = '/analytics') =>
  fetch(`${baseUrl}${path}?${new URLSearchParams({ ...params, ...changes })}`);

beforeEach(async () => {
  authorize.mockReset().mockResolvedValue([{ result: AuthorizeResult.ALLOW }]);
  search.mockReset().mockResolvedValue({ items: [], summary: { total: 0 } });
  listTasks.mockReset();
  getLogs.mockReset();
  getCredentials.mockReset().mockResolvedValue(credentials);
  const app = express();
  const options = {
    httpAuth: {
      credentials: getCredentials,
    },
    permissions: { authorize },
    scaffolder: { listTasks, getLogs },
    cache: {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
    },
    logger: { debug: jest.fn() },
    maxTasks: 200,
    history: { search },
  } as unknown as Parameters<typeof createRouter>[0];
  app.use('/service', createRouter({ ...options, history: undefined }));
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

it('requires user authentication for analytics and access discovery before upstream calls', async () => {
  getCredentials.mockRejectedValue(Object.assign(new Error('Authentication required'), { name: 'NotAllowedError' }));
  for (const path of ['/analytics', '/permissions', '/service/analytics']) {
    expect((await request({}, path)).status).toBe(403);
  }
  expect(getCredentials).toHaveBeenCalledWith(expect.anything(), { allow: ['user'] });
  expect(authorize).not.toHaveBeenCalled();
  expect(search).not.toHaveBeenCalled();
  expect(listTasks).not.toHaveBeenCalled();
});
afterEach(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve())),
  );
});

it('rejects analytics access before making an upstream request', async () => {
  authorize.mockResolvedValue([{ result: AuthorizeResult.DENY }]);
  expect((await request()).status).toBe(403);
  expect(search).not.toHaveBeenCalled();
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

it('validates queries and forwards caller credentials to the history client', async () => {
  const invalidQueries: Record<string, string>[] = [
    { offset: '-1' },
    { offset: '1.5' },
    { offset: '9007199254740992' },
    { allTime: 'yes' },
    { status: 'invalid' },
    { sortBy: 'spec' },
    { sortBy: 'duration_ms DESC; DROP TABLE tasks' },
    { sortDirection: 'sideways' },
  ];
  for (const changes of invalidQueries) {
    expect((await request(changes)).status).toBe(400);
    expect(search).not.toHaveBeenCalled();
  }
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
    credentials,
    200,
  );
});

it('keeps service analytics independent of execution search and status', async () => {
  listTasks.mockResolvedValue({
    totalItems: 3,
    items: [
      { id: 'successful-run', status: 'completed', template: 'api-service' },
      { id: 'failed-run', status: 'failed', template: 'api-service' },
      { id: 'other-template', status: 'completed', template: 'other' },
    ].map(({ template, ...task }) => ({
      ...task,
      createdAt: '2026-09-10T12:00:00.000Z',
      spec: {
        user: { ref: 'user:default/alice' },
        templateInfo: {
          entityRef: `template:default/${template}`,
          entity: { metadata: { title: template } },
        },
      },
    })),
  });
  getLogs.mockResolvedValue([
    { type: 'completion', createdAt: '2026-09-10T12:00:10.000Z', body: {} },
  ]);
  const selection = {
    scope: 'mine',
    templateRef: 'template:default/api-service',
    query: ' API ALICE run ',
    status: 'failed',
  };
  const response = await request(selection, '/service/analytics');
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.items.map((item: { id: string }) => item.id)).toEqual([
    'failed-run',
  ]);
  expect(result.page).toEqual({
    offset: 0,
    limit: 200,
    total: 1,
    hasMore: false,
  });
  expect(result.summary).toEqual(
    expect.objectContaining({ total: 2, successRate: 50, averageMs: 10000 }),
  );
  expect(result.templates).toHaveLength(1);
  expect(result.users).toHaveLength(1);
  expect(result.activity.find((day: { total: number }) => day.total)).toEqual({
    date: '2026-09-10',
    total: 2,
    completed: 1,
    failed: 1,
    other: 0,
  });
  const empty = await (
    await request({ ...selection, query: 'completed' }, '/service/analytics')
  ).json();
  expect(empty.items).toEqual([]);
  expect(empty.page.total).toBe(0);
  expect(empty.summary).toEqual(result.summary);
  expect(empty.templates).toEqual(result.templates);
  expect(empty.users).toEqual(result.users);
  expect(empty.activity).toEqual(result.activity);
});
