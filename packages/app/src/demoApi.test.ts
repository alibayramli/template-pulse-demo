import { aggregateExecutions } from '@abayramli/backstage-plugin-template-pulse-node';
import type { ExecutionQuery } from '@abayramli/backstage-plugin-template-pulse-common';
import { createDemoExecutions, DemoExecutionsApi } from './demoApi';

const now = Date.parse('2026-10-14T22:00:00Z');
const query: ExecutionQuery = {
  scope: 'all',
  from: '2026-09-15T00:00:00Z',
  to: '2026-10-15T00:00:00Z',
};

it('provides only finished fictional runs, including older history', () => {
  const rows = createDemoExecutions(now);
  expect(rows).toHaveLength(350);
  expect(new Set(rows.map(row => row.id)).size).toBe(350);
  expect(new Set(rows.map(row => row.templateRef)).size).toBe(50);
  expect(new Set(rows.map(row => row.userRef)).size).toBe(100);
  expect(
    rows.every(row =>
      ['completed', 'failed', 'cancelled'].includes(row.status),
    ),
  ).toBe(true);
  expect(
    rows.every(row => Date.parse(row.createdAt) + row.durationMs! < now),
  ).toBe(true);
});

it('grants organization viewing without a personal identity', async () => {
  expect(await new DemoExecutionsApi(now).getAccess()).toEqual({
    canReadOwn: false,
    canReadAll: true,
    canSearchHistory: true,
  });
});

it('matches the real backend analytics for every metric and rollup', async () => {
  const rows = createDemoExecutions(now).filter(
    row => row.createdAt >= query.from && row.createdAt < query.to,
  );
  const expected = aggregateExecutions(rows, query, 50);
  const result = await new DemoExecutionsApi(now).getAnalytics(query);
  expect(result).toMatchObject(expected);
  expect(result.summary).toMatchObject({
    total: 250,
    templates: 50,
    users: 100,
  });
  expect(result.activity.reduce((sum, day) => sum + day.total, 0)).toBe(250);
});

it('search and status filter the run list without changing analytics', async () => {
  const api = new DemoExecutionsApi(now);
  const all = await api.getAnalytics(query);
  const filteredQuery = { ...query, query: 'python', status: 'failed' };
  const filtered = await api.getAnalytics(filteredQuery);
  expect(filtered.summary).toEqual(all.summary);
  expect(filtered.templates).toEqual(all.templates);
  expect(filtered.activity).toEqual(all.activity);
  expect(filtered.page.total).toBeGreaterThan(0);
  expect(
    filtered.items.every(
      row => row.templateRef.includes('python') && row.status === 'failed',
    ),
  ).toBe(true);
});

it('supports cohort drilldown, user labels, and a recoverable empty result', async () => {
  const api = new DemoExecutionsApi(now);
  const result = await api.getAnalytics({
    ...query,
    templateRef: 'template:default/nodejs-api',
    userRef: 'user:default/admin',
  });
  expect(result.summary.total).toBe(1);
  expect(result.facets.templates).toHaveLength(50);
  expect(result.facets.users).toHaveLength(100);
  expect(
    await api.getUserNames(['user:default/jordan-lee', 'user:default/missing']),
  ).toEqual({ 'user:default/jordan-lee': 'Jordan Lee' });
  const empty = await api.getAnalytics({
    ...query,
    templateRef: 'template:default/missing',
  });
  expect(empty.summary.total).toBe(0);
  expect(empty.summary.successRate).toBeUndefined();
  expect(empty.items).toEqual([]);
});

it('paginates all retained history without duplicates and limits chart dates', async () => {
  const api = new DemoExecutionsApi(now);
  const ids: string[] = [];
  for (let offset = 0; offset < 350; offset += 50) {
    const result = await api.getAnalytics({ ...query, allTime: true, offset });
    expect(result.summary.total).toBe(350);
    expect(result.page.total).toBe(350);
    expect(result.page.hasMore).toBe(offset < 300);
    expect(result.activity).toHaveLength(30);
    expect(result.activity.reduce((sum, day) => sum + day.total, 0)).toBe(250);
    ids.push(...result.items.map(row => row.id));
  }
  expect(new Set(ids).size).toBe(350);
});

it('keeps the default window populated on future visits and at midnight UTC', async () => {
  const future = Date.parse('2028-01-01T00:00:00Z');
  const result = await new DemoExecutionsApi(future).getAnalytics({
    ...query,
    from: '2027-12-03T00:00:00Z',
    to: '2028-01-02T00:00:00Z',
  });
  expect(result.summary.total).toBe(250);
  expect(
    createDemoExecutions(now)
      .map(row => row.id)
      .sort(),
  ).toEqual(
    createDemoExecutions(future)
      .map(row => row.id)
      .sort(),
  );
});

it('honors cancelled requests and rejects invalid ranges', async () => {
  const api = new DemoExecutionsApi(now);
  const controller = new AbortController();
  controller.abort();
  await expect(
    api.getAnalytics(query, controller.signal),
  ).rejects.toBeDefined();
  await expect(api.getAnalytics({ ...query, from: 'bad' })).rejects.toThrow(
    'valid date range',
  );
});
