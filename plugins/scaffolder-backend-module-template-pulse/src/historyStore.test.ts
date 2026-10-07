/** @jest-environment node */
import knex, { type Knex } from 'knex';
import {
  AuthorizeResult,
  type QueryPermissionResponse,
} from '@backstage/plugin-permission-common';
import type { ExecutionQuery } from '@template-pulse/plugin-common';
import { DatabaseHistoryStore } from './historyStore';

const allow: QueryPermissionResponse = { result: AuthorizeResult.ALLOW };
const owner = (createdBy: string[]) => ({
  rule: 'IS_TASK_OWNER',
  resourceType: 'scaffolder-task',
  params: { createdBy },
});
const own: QueryPermissionResponse = {
  result: AuthorizeResult.CONDITIONAL,
  pluginId: 'scaffolder',
  resourceType: 'scaffolder-task',
  conditions: owner(['user:default/alice']),
};
const query: ExecutionQuery = {
  scope: 'all',
  from: '2026-09-01T00:00:00.000Z',
  to: '2026-10-01T00:00:00.000Z',
};
let db: Knex;
let store: DatabaseHistoryStore;

async function insert(
  id: string,
  user = 'alice',
  title = 'API Service',
  date = '2026-09-10 12:00:00',
  status = 'completed',
) {
  await db('tasks').insert({
    id,
    status,
    created_by: `user:default/${user}`,
    created_at: date,
    spec: JSON.stringify({
      parameters: { secretInput: 'DO_NOT_SEARCH_ME' },
      user: { ref: `user:default/${user}` },
      templateInfo: {
        entityRef: `template:default/${title
          .toLowerCase()
          .replace(/\W+/g, '-')}`,
        entity: { metadata: { title } },
      },
    }),
  });
  await db('task_events').insert({
    task_id: id,
    event_type: 'completion',
    created_at: `${date.slice(0, 17)}10`,
    body: JSON.stringify({ status, output: { secret: 'DO_NOT_SEARCH_ME' } }),
  });
}

beforeEach(async () => {
  db = knex({
    client: 'better-sqlite3',
    connection: ':memory:',
    useNullAsDefault: true,
  });
  await db.schema.createTable('tasks', table => {
    table.string('id').primary();
    table.text('spec');
    table.string('status');
    table.string('created_by');
    table.string('created_at');
  });
  await db.schema.createTable('task_events', table => {
    table.increments('id');
    table.string('task_id').index();
    table.string('event_type');
    table.text('body');
    table.string('created_at');
  });
  store = new DatabaseHistoryStore(async () => db);
});
afterEach(async () => {
  await db.destroy();
});

it('finds an old match beyond the latest 200 tasks and outside the default date range', async () => {
  for (let i = 0; i < 250; i++) await insert(`recent-${i}`);
  await insert(
    'old-needle',
    'alice',
    'Legacy Billing Service',
    '2020-01-01 12:00:00',
  );
  expect(
    (
      await store.search(
        { ...query, query: 'legacy billing' },
        'user:default/alice',
        allow,
        200,
      )
    ).items,
  ).toHaveLength(0);
  const result = await store.search(
    { ...query, allTime: true, query: 'LEGACY alice' },
    'user:default/alice',
    allow,
    200,
  );
  expect(result.items.map(item => item.id)).toEqual(['old-needle']);
  expect(result.summary.total).toBe(251);
  expect(result.page.total).toBe(1);
  expect(result.window.sourceTotal).toBe(251);
  expect(result.window.truncated).toBe(false);
});

it('paginates matches with complete metrics and no missing or duplicate executions', async () => {
  for (let i = 0; i < 205; i++)
    await insert(`run-${String(i).padStart(3, '0')}`);
  for (let i = 0; i < 5; i++)
    await insert(
      `run-failed-${i}`,
      'alice',
      'API Service',
      undefined,
      'failed',
    );
  await insert('unrelated');
  const selection = { ...query, query: 'run-', status: 'completed' };
  const first = await store.search(selection, 'user:default/alice', allow, 200);
  const second = await store.search(
    { ...selection, offset: 200 },
    'user:default/alice',
    allow,
    200,
  );
  expect(first.items).toHaveLength(200);
  expect(first.summary.total).toBe(211);
  expect(first.summary.failed).toBe(5);
  expect(first.summary.timedCompleted).toBe(206);
  expect(first.summary.averageMs).toBe(10000);
  expect(first.page.total).toBe(205);
  expect(first.page.hasMore).toBe(true);
  expect(second.items).toHaveLength(5);
  expect(second.page.hasMore).toBe(false);
  expect(second.summary).toEqual(first.summary);
  expect(
    new Set([...first.items, ...second.items].map(item => item.id)).size,
  ).toBe(205);
});

it('enforces task permissions before returning rows, counts, facets and metrics in organization scope', async () => {
  await insert('alice-run');
  await insert('bob-run', 'bob', 'Secret Admin Template');
  const result = await store.search(query, 'user:default/alice', own, 200);
  expect(result.items.map(item => item.id)).toEqual(['alice-run']);
  expect(result.summary.total).toBe(1);
  expect(result.window.sourceTotal).toBe(1);
  expect(result.facets.users).toEqual(['user:default/alice']);
  expect(result.facets.templates.map(item => item.name)).toEqual([
    'API Service',
  ]);
  expect(
    (
      await store.search(
        { ...query, scope: 'mine' },
        'user:default/alice',
        allow,
        200,
      )
    ).items,
  ).toHaveLength(1);
  expect(
    (
      await store.search(
        { ...query, userRef: 'user:default/bob' },
        'user:default/alice',
        own,
        200,
      )
    ).summary.total,
  ).toBe(0);
});

it('applies nested ownership conditions and rejects unsupported rules and denied access', async () => {
  await insert('alice-run');
  await insert('bob-run', 'bob');
  await insert('charlie-run', 'charlie');
  const nested: QueryPermissionResponse = {
    result: AuthorizeResult.CONDITIONAL,
    pluginId: 'scaffolder',
    resourceType: 'scaffolder-task',
    conditions: {
      allOf: [
        { anyOf: [owner(['user:default/alice']), owner(['user:default/bob'])] },
        { not: owner(['user:default/bob']) },
      ],
    },
  };
  expect(
    (await store.search(query, 'user:default/alice', nested, 200)).items.map(
      item => item.id,
    ),
  ).toEqual(['alice-run']);
  await expect(
    store.search(
      query,
      'user:default/alice',
      {
        ...own,
        conditions: {
          rule: 'CUSTOM_RULE',
          resourceType: 'scaffolder-task',
          params: {},
        },
      } as QueryPermissionResponse,
      200,
    ),
  ).rejects.toThrow('does not support');
  await expect(
    store.search(
      query,
      'user:default/alice',
      { result: AuthorizeResult.DENY },
      200,
    ),
  ).rejects.toThrow('access denied');
  expect(
    (
      await store.search(
        query,
        'user:default/alice',
        { ...own, conditions: owner([]) } as QueryPermissionResponse,
        200,
      )
    ).summary.total,
  ).toBe(0);
});

it('uses literal search terms across metadata and never searches or returns secrets', async () => {
  await insert('percent', 'alice', 'Deploy 100%_Ready');
  await insert('other', 'bob', 'Deploy 100XReady', undefined, 'failed');
  const baseline = await store.search(query, 'user:default/alice', allow, 200);
  const result = await store.search(
    { ...query, query: '100%_ ALICE', status: 'completed' },
    'user:default/alice',
    allow,
    200,
  );
  expect(result.items.map(item => item.id)).toEqual(['percent']);
  expect(result.page.total).toBe(1);
  expect(result.summary).toEqual(baseline.summary);
  expect(result.summary.successRate).toBe(50);
  expect(result.templates).toEqual(baseline.templates);
  expect(result.users).toEqual(baseline.users);
  expect(result.activity).toEqual(baseline.activity);
  for (const term of [
    "' OR 1=1 --",
    'DO_NOT_SEARCH_ME',
    'completed',
    'failed',
  ]) {
    const empty = await store.search(
      { ...query, query: term },
      'user:default/alice',
      allow,
      200,
    );
    expect(empty.items).toEqual([]);
    expect(empty.page.total).toBe(0);
    expect(empty.summary).toEqual(baseline.summary);
  }
  expect(JSON.stringify(baseline)).not.toContain('DO_NOT_SEARCH_ME');
});

it('combines date, owner, template and status filters with inclusive start and exclusive end', async () => {
  await insert(
    'start',
    'alice',
    'API Service',
    '2026-09-01 00:00:00',
    'failed',
  );
  await insert('end', 'alice', 'API Service', '2026-10-01 00:00:00', 'failed');
  await insert(
    'before',
    'alice',
    'API Service',
    '2026-08-31 23:59:59',
    'failed',
  );
  await insert('completed');
  await insert('bob-failed', 'bob', 'API Service', undefined, 'failed');
  const result = await store.search(
    {
      ...query,
      userRef: 'user:default/alice',
      templateRef: 'template:default/api-service',
      status: 'failed',
    },
    'user:default/alice',
    allow,
    200,
  );
  expect(result.items.map(item => item.id)).toEqual(['start']);
  expect(result.page.total).toBe(1);
  expect(result.summary.total).toBe(2);
  expect(result.summary.successRate).toBe(50);
});

it('keeps missing timings unavailable and ignores stray logs or mismatched completion statuses', async () => {
  await insert('timed');
  await db('task_events').insert({
    task_id: 'timed',
    event_type: 'log',
    created_at: '2026-09-10 13:00:00',
    body: '{}',
  });
  await db('task_events').insert({
    task_id: 'timed',
    event_type: 'completion',
    created_at: '2026-09-10 13:00:00',
    body: '{"status":"failed"}',
  });
  await insert('missing');
  await db('task_events').where('task_id', 'missing').delete();
  const result = await store.search(query, 'user:default/alice', allow, 200);
  expect(result.items.find(item => item.id === 'timed')?.durationMs).toBe(
    10000,
  );
  expect(
    result.items.find(item => item.id === 'missing')?.durationMs,
  ).toBeUndefined();
  expect(result.summary.timedCompleted).toBe(1);
});
