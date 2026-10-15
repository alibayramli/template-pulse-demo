/** @jest-environment node */
import knex, { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import {
  AuthorizeResult,
  type QueryPermissionResponse,
} from '@backstage/plugin-permission-common';
import type { ExecutionQuery } from '@abayramli/backstage-plugin-template-pulse-common';
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
let schema: string | undefined;
const postgresUrl = process.env.TEMPLATE_PULSE_TEST_POSTGRES_URL;
jest.setTimeout(postgresUrl ? 30_000 : 5_000);

// Fixtures describe UTC instants, independent of the PostgreSQL server's time zone.
const timestamp = (value: string) =>
  postgresUrl ? `${value.replace(' ', 'T')}Z` : value;

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
    created_at: timestamp(date),
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
    created_at: timestamp(`${date.slice(0, 17)}10`),
    body: JSON.stringify({ status, output: { secret: 'DO_NOT_SEARCH_ME' } }),
  });
}

beforeEach(async () => {
  schema = postgresUrl
    ? `template_pulse_test_${randomUUID().replace(/-/g, '')}`
    : undefined;
  db = knex(
    postgresUrl
      ? {
          client: 'pg',
          connection: {
            connectionString: postgresUrl,
            options: '-c timezone=Asia/Baku',
          },
          searchPath: [schema!],
        }
      : {
          client: 'better-sqlite3',
          connection: ':memory:',
          useNullAsDefault: true,
        },
  );
  if (schema) await db.raw('CREATE SCHEMA ??', [schema]);
  await db.schema.createTable('tasks', table => {
    table.string('id').primary();
    table.text('spec');
    table.string('status');
    table.string('created_by');
    table.timestamp('created_at', { useTz: true });
  });
  await db.schema.createTable('task_events', table => {
    table.increments('id');
    table.string('task_id').index();
    table.string('event_type');
    table.text('body');
    table.timestamp('created_at', { useTz: true });
  });
  store = new DatabaseHistoryStore(async () => db);
});
afterEach(async () => {
  try {
    if (schema) await db.raw('DROP SCHEMA ?? CASCADE', [schema]);
  } finally {
    await db.destroy();
  }
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

it('sorts retained executions before pagination', async () => {
  for (let index = 0; index < 205; index++)
    await insert(`recent-${String(index).padStart(3, '0')}`);
  await insert('old-slow', 'alice', 'API Service', '2020-01-01 12:00:00');
  await db('task_events').where('task_id', 'old-slow').update({
    created_at: timestamp('2020-01-01 12:01:00'),
  });
  const selection: ExecutionQuery = {
    ...query,
    allTime: true,
    sortBy: 'durationMs',
    sortDirection: 'descending',
  };
  const caller = 'user:default/alice';
  const baseline = await store.search({ ...query, allTime: true }, caller, own, 200);
  expect(baseline.items.map(row => row.id)).not.toContain('old-slow');
  const first = await store.search(selection, caller, own, 200);
  const second = await store.search({ ...selection, offset: 200 }, caller, own, 200);
  expect(first.items[0].id).toBe('old-slow');
  expect(second.items).toHaveLength(6);
  expect(new Set([...first.items, ...second.items].map(row => row.id)).size).toBe(206);
  expect(second.page.hasMore).toBe(false);
  expect(first.summary).toEqual(baseline.summary);
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
    created_at: timestamp('2026-09-10 13:00:00'),
    body: '{}',
  });
  await db('task_events').insert({
    task_id: 'timed',
    event_type: 'completion',
    created_at: timestamp('2026-09-10 13:00:00'),
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

it('aggregates complete history beyond the response bound while SQL paginates details', async () => {
  await insert('alice-one');
  await insert('alice-two');
  await insert('bob-one', 'bob');
  const bounded = new DatabaseHistoryStore(async () => db, 2);
  const all = await bounded.search(query, 'user:default/alice', allow, 1);
  expect(all.summary.total).toBe(3);
  expect(all.items).toHaveLength(1);
  expect(all.page).toEqual({ offset: 0, limit: 1, total: 3, hasMore: true });
  expect(all.window.scanned).toBe(3);
  expect(all.window.truncated).toBe(false);
  const result = await bounded.search(
    { ...query, scope: 'mine' },
    'user:default/alice',
    allow,
    200,
  );
  expect(result.summary.total).toBe(2);
  expect(result.window.truncated).toBe(false);
  expect(result.facets.users).toEqual(['user:default/alice']);
});

it('bounds facets even when the date selection is empty and validates the memory limit', async () => {
  await insert('one', 'alice', 'One');
  await insert('two', 'alice', 'Two');
  const bounded = new DatabaseHistoryStore(async () => db, 1);
  await expect(
    bounded.search(
      { ...query, from: '2026-09-20T00:00:00.000Z' },
      'user:default/alice',
      allow,
      200,
    ),
  ).rejects.toThrow('Too many history filter choices');
  const getClient = async () => db;
  for (const limit of [0, -1, 1.5, 100_001, NaN, Infinity]) {
    expect(() => new DatabaseHistoryStore(getClient, limit)).toThrow(
      'maxHistoryRows',
    );
  }
});

it('fails closed for unknown conditions in any branch and mismatched plugin decisions', async () => {
  await insert('alice-one');
  const unsupported = {
    rule: 'CUSTOM_RULE',
    resourceType: 'scaffolder-task',
    params: {},
  };
  for (const conditions of [
    { anyOf: [owner(['user:default/alice']), unsupported] },
    { not: unsupported },
    { ...owner(['user:default/alice']), resourceType: 'other-resource' },
  ]) {
    await expect(
      store.search(
        query,
        'user:default/alice',
        { ...own, conditions } as QueryPermissionResponse,
        200,
      ),
    ).rejects.toThrow('does not support');
  }
  await expect(
    store.search(
      query,
      'user:default/alice',
      { ...own, pluginId: 'other-plugin' } as QueryPermissionResponse,
      200,
    ),
  ).rejects.toThrow('Unsupported Scaffolder');
});

it('computes success timing percentiles per template and user without counting failed or active timings', async () => {
  for (let index = 1; index <= 20; index++) {
    const id = `timing-${index}`;
    await insert(id, index <= 10 ? 'alice' : 'bob');
    await db('task_events')
      .where('task_id', id)
      .update({
        created_at: timestamp(
          `2026-09-10 12:00:${String(index).padStart(2, '0')}`,
        ),
      });
  }
  await insert('failed', 'alice', 'API Service', undefined, 'failed');
  await insert('cancelled', 'alice', 'API Service', undefined, 'cancelled');
  await insert('running', 'alice', 'Other Template', undefined, 'processing');
  await insert('queued', 'alice', 'Other Template', undefined, 'open');
  const result = await store.search(
    { ...query, status: 'failed' },
    'user:default/alice',
    allow,
    1,
  );
  expect(result.items.map(row => row.id)).toEqual(['failed']);
  expect(result.summary).toEqual({
    total: 24,
    completed: 20,
    failed: 1,
    cancelled: 1,
    active: 2,
    templates: 2,
    users: 2,
    timedCompleted: 20,
    successRate: (100 * 20) / 21,
    averageMs: 10500,
    p95Ms: 19000,
  });
  expect(
    result.users.find(row => row.id === 'user:default/alice'),
  ).toMatchObject({
    timedCompleted: 10,
    averageMs: 5500,
    p95Ms: 10000,
  });
  expect(result.users.find(row => row.id === 'user:default/bob')).toMatchObject(
    {
      timedCompleted: 10,
      averageMs: 15500,
      p95Ms: 20000,
    },
  );
  expect(
    result.templates.find(row => row.name === 'Other Template'),
  ).toMatchObject({
    total: 2,
    timedCompleted: 0,
    averageMs: undefined,
    p95Ms: undefined,
  });
  expect(result.activity.find(row => row.date === '2026-09-10')).toEqual({
    date: '2026-09-10',
    total: 24,
    completed: 20,
    failed: 1,
    other: 3,
  });
});

it('aggregates more than 10000 executions and returns only the requested SQL page', async () => {
  const spec = JSON.stringify({
    templateInfo: {
      entityRef: 'template:default/bulk',
      entity: { metadata: { title: 'Bulk' } },
    },
  });
  await db.batchInsert(
    'tasks',
    Array.from({ length: 10005 }, (_, index) => ({
      id: `bulk-${String(index).padStart(5, '0')}`,
      status: index % 2 ? 'failed' : 'completed',
      created_by: 'user:default/alice',
      created_at: timestamp('2026-09-10 12:00:00'),
      spec,
    })),
    100,
  );
  const bounded = new DatabaseHistoryStore(async () => db, 2);
  const result = await bounded.search(
    { ...query, status: 'failed', offset: 5000 },
    'user:default/alice',
    allow,
    2,
  );
  expect(result.summary).toMatchObject({
    total: 10005,
    completed: 5003,
    failed: 5002,
    timedCompleted: 0,
  });
  expect(result.page).toEqual({
    total: 5002,
    limit: 2,
    offset: 5000,
    hasMore: false,
  });
  expect(result.items.map(row => row.id)).toEqual(['bulk-00003', 'bulk-00001']);
  expect(result.window.scanned).toBe(10005);
  expect(result.window.oldestAt).toBe('2026-09-10T12:00:00.000Z');
});

it('searches literal exclamation marks and backslashes and handles an empty result page', async () => {
  await insert('literal', 'alice', 'Deploy! C:\\service');
  await insert('other', 'bob', 'Deploy anything');
  const result = await store.search(
    { ...query, query: 'deploy! C:\\service' },
    'user:default/alice',
    allow,
    1,
  );
  expect(result.items.map(row => row.id)).toEqual(['literal']);
  const empty = await store.search(
    { ...query, query: 'deploy! C:\\service', offset: 50 },
    'user:default/alice',
    allow,
    1,
  );
  expect(empty.items).toEqual([]);
  expect(empty.page).toEqual({
    offset: 50,
    limit: 1,
    total: 1,
    hasMore: false,
  });
  expect(empty.summary).toEqual(result.summary);
});

it('returns zero metrics for empty history and keeps all-history chart dates bounded', async () => {
  const empty = await store.search(query, 'user:default/alice', allow, 2);
  expect(empty.summary).toMatchObject({
    total: 0,
    completed: 0,
    failed: 0,
    timedCompleted: 0,
  });
  expect(empty.summary.successRate).toBeUndefined();
  expect(empty.summary.averageMs).toBeUndefined();
  expect(empty.window.oldestAt).toBeUndefined();
  expect(empty.activity).toHaveLength(30);
  await insert('old', 'alice', 'Old Template', '2020-01-01 12:00:00');
  const history = await store.search(
    { ...query, allTime: true },
    'user:default/alice',
    allow,
    2,
  );
  expect(history.summary.total).toBe(1);
  expect(history.activity.every(day => day.total === 0)).toBe(true);
});

it('validates schema without modifying it and retries after Scaffolder migrations', async () => {
  await db.schema.alterTable('tasks', table => table.dropColumn('created_by'));
  const getClient = jest.fn(async () => db);
  const history = new DatabaseHistoryStore(getClient);
  await expect(history.initialize()).rejects.toThrow('Scaffolder migrations');
  expect(await db.schema.hasColumn('tasks', 'created_by')).toBe(false);
  await db.schema.alterTable('tasks', table => table.text('created_by'));
  await history.initialize();
  await history.search(query, 'user:default/alice', allow, 2);
  await history.search(query, 'user:default/alice', allow, 2);
  expect(getClient).toHaveBeenCalledTimes(2);
});

it('reads Scaffolder UUID task IDs, nullable creators and standard timestamp columns', async () => {
  await db.schema.dropTable('task_events');
  await db.schema.dropTable('tasks');
  const migrationsDirectory =
    process.env.TEMPLATE_PULSE_TEST_SCAFFOLDER_MIGRATIONS;
  if (migrationsDirectory) {
    await db.migrate.latest({ directory: migrationsDirectory });
  } else {
    await db.schema.createTable('tasks', table => {
      table.uuid('id').primary().notNullable();
      table.text('spec').notNullable();
      table.text('status').notNullable();
      table.dateTime('created_at').notNullable().defaultTo(db.fn.now());
      table.text('created_by').nullable();
    });
    await db.schema.createTable('task_events', table => {
      table.bigIncrements('id').primary();
      table.uuid('task_id').notNullable().references('id').inTable('tasks');
      table.text('body').notNullable();
      table.text('event_type').notNullable();
      table.timestamp('created_at').notNullable().defaultTo(db.fn.now());
    });
  }
  const id = randomUUID();
  await insert(id);
  await db('tasks').where({ id }).update({ created_by: null });
  const result = await store.search(
    { ...query, scope: 'mine', query: id.slice(0, 8) },
    'user:default/alice',
    allow,
    1,
  );
  expect(result.items).toEqual([
    expect.objectContaining({
      id,
      userRef: 'user:default/alice',
      durationMs: 10000,
      createdAt: '2026-09-10T12:00:00.000Z',
    }),
  ]);
  expect(result.summary.total).toBe(1);
});

it('keeps UTC date boundaries and activity days independent of the database session time zone', async () => {
  await insert('late', 'alice', 'API Service', '2026-09-30 23:30:00');
  await insert('next-month', 'alice', 'API Service', '2026-10-01 00:00:00');
  const result = await store.search(query, 'user:default/alice', allow, 2);
  expect(result.items.map(row => row.id)).toEqual(['late']);
  expect(result.items[0].createdAt).toBe('2026-09-30T23:30:00.000Z');
  expect(result.activity.find(day => day.date === '2026-09-30')?.total).toBe(1);
  expect(result.activity.reduce((total, day) => total + day.total, 0)).toBe(1);
});

it('uses the latest template label without counting renamed templates as extra choices', async () => {
  await insert('before', 'alice', 'Old Name', '2026-09-09 12:00:00');
  await insert('after', 'alice', 'New Name', '2026-09-10 12:00:00');
  for (const [id, title] of [
    ['before', 'Old Name'],
    ['after', 'New Name'],
  ]) {
    await db('tasks')
      .where({ id })
      .update({
        spec: JSON.stringify({
          templateInfo: {
            entityRef: 'template:default/stable',
            entity: { metadata: { title } },
          },
        }),
      });
  }
  const bounded = new DatabaseHistoryStore(async () => db, 1);
  const result = await bounded.search(query, 'user:default/alice', allow, 1);
  expect(result.facets.templates).toEqual([
    { id: 'template:default/stable', name: 'New Name' },
  ]);
  expect(result.templates).toEqual([
    expect.objectContaining({
      id: 'template:default/stable',
      name: 'New Name',
      total: 2,
    }),
  ]);
});
