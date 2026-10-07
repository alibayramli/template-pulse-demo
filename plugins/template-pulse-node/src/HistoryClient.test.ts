/** @jest-environment node */
import { createServer, type Server } from 'node:http';
import { HistoryClient } from './HistoryClient';

let server: Server;
let baseUrl: string;
let status: number;
const requests: { url?: string; authorization?: string }[] = [];
const getPluginRequestToken = jest.fn();
const credentials = {
  principal: { type: 'user', userEntityRef: 'user:default/alice' },
};
const query = {
  scope: 'mine' as const,
  from: '2026-09-01T00:00:00.000Z',
  to: '2026-10-01T00:00:00.000Z',
  query: 'legacy alice',
  allTime: true,
  offset: 200,
};

beforeEach(async () => {
  requests.length = 0;
  status = 200;
  getPluginRequestToken
    .mockReset()
    .mockResolvedValue({ token: 'delegated-user-token' });
  server = createServer((req, res) => {
    requests.push({ url: req.url, authorization: req.headers.authorization });
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify(
        status === 200
          ? { items: [], scope: 'mine' }
          : { error: { message: 'Access denied' } },
      ),
    );
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing test server address');
  baseUrl = `http://127.0.0.1:${address.port}/api/scaffolder`;
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve())),
  );
});

function createClient() {
  return new HistoryClient({
    auth: { getPluginRequestToken },
    discovery: {
      getBaseUrl: async (pluginId: string) => {
        expect(pluginId).toBe('scaffolder');
        return baseUrl;
      },
    },
  } as unknown as ConstructorParameters<typeof HistoryClient>[0]);
}

it('calls the module over HTTP with a fresh token on behalf of the caller and all filters', async () => {
  const client = createClient();
  const caller = credentials as Parameters<HistoryClient['search']>[1];
  expect(await client.search(query, caller, 200)).toEqual({
    items: [],
    scope: 'mine',
  });
  getPluginRequestToken.mockResolvedValue({ token: 'new-delegated-token' });
  await client.search({ ...query, offset: 400 }, caller, 200);
  expect(getPluginRequestToken).toHaveBeenCalledTimes(2);
  expect(getPluginRequestToken).toHaveBeenCalledWith({
    onBehalfOf: credentials,
    targetPluginId: 'scaffolder',
  });
  expect(requests.map(req => req.authorization)).toEqual([
    'Bearer delegated-user-token',
    'Bearer new-delegated-token',
  ]);
  const url = new URL(requests[0].url!, baseUrl);
  expect(url.pathname).toBe('/api/scaffolder/modules/template-pulse/analytics');
  expect(Object.fromEntries(url.searchParams)).toEqual({
    ...query,
    allTime: 'true',
    offset: '200',
    limit: '200',
  });
});

it('preserves task access denial and explains a missing Scaffolder module', async () => {
  const client = createClient();
  const caller = credentials as Parameters<HistoryClient['search']>[1];
  status = 403;
  await expect(client.search(query, caller, 200)).rejects.toMatchObject({
    name: 'NotAllowedError',
  });
  status = 404;
  await expect(client.search(query, caller, 200)).rejects.toThrow(
    '@template-pulse/plugin-scaffolder-backend-module-template-pulse',
  );
  status = 500;
  await expect(client.search(query, caller, 200)).rejects.toMatchObject({
    name: 'ResponseError',
  });
});
