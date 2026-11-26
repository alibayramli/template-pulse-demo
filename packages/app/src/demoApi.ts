import type { ExecutionsApi } from '@abayramli/backstage-plugin-template-pulse';
import type {
  DailyActivity,
  Execution,
  ExecutionAnalytics,
  ExecutionMetrics,
  ExecutionQuery,
  ExecutionRollup,
} from '@abayramli/backstage-plugin-template-pulse-common';
import catalog from './demoCatalog.json';
import { createDemoRuns } from './demoRuns.mjs';

const DAY_MS = 86_400_000;
const PAGE_SIZE = 50;

/** Stable fictional records, dated relative to this visit so the demo stays useful. */
export function createDemoExecutions(now = Date.now()): Execution[] {
  return createDemoRuns(catalog, now);
}

function summarize(rows: Execution[]): ExecutionMetrics {
  const completed = rows.filter(row => row.status === 'completed');
  const failed = rows.filter(row => row.status === 'failed').length;
  const durations = completed
    .map(row => row.durationMs)
    .filter(
      (value): value is number => value !== undefined && Number.isFinite(value),
    )
    .sort((a, b) => a - b);
  return {
    total: rows.length,
    completed: completed.length,
    failed,
    cancelled: rows.filter(row => row.status === 'cancelled').length,
    active: rows.filter(row => ['open', 'processing'].includes(row.status))
      .length,
    users: new Set(rows.map(row => row.userRef).filter(Boolean)).size,
    templates: new Set(
      rows.map(row => row.templateRef).filter(ref => ref !== 'unknown'),
    ).size,
    successRate:
      completed.length + failed
        ? (100 * completed.length) / (completed.length + failed)
        : undefined,
    averageMs: durations.length
      ? durations.reduce((sum, value) => sum + value, 0) / durations.length
      : undefined,
    p95Ms: durations.length
      ? durations[Math.ceil(durations.length * 0.95) - 1]
      : undefined,
    timedCompleted: durations.length,
  };
}

export class DemoExecutionsApi implements ExecutionsApi {
  private readonly rows: Execution[];
  private readonly generatedAt: string;

  constructor(now = Date.now()) {
    this.rows = createDemoExecutions(now);
    this.generatedAt = new Date(now).toISOString();
  }

  async getAccess(signal?: AbortSignal) {
    signal?.throwIfAborted();
    return { canReadOwn: false, canReadAll: true, canSearchHistory: true };
  }

  async getUserNames(refs: string[], signal?: AbortSignal) {
    signal?.throwIfAborted();
    return Object.fromEntries(
      catalog.users
        .filter(user => refs.includes(user.ref))
        .map(user => [user.ref, user.name]),
    );
  }

  async getTeams(signal?: AbortSignal) {
    signal?.throwIfAborted();
    return catalog.teams
      .map(team => ({ id: team.ref, name: team.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getAnalytics(
    query: ExecutionQuery,
    signal?: AbortSignal,
  ): Promise<ExecutionAnalytics> {
    signal?.throwIfAborted();
    const from = Date.parse(query.from);
    const to = Date.parse(query.to);
    if (
      !Number.isFinite(from) ||
      !Number.isFinite(to) ||
      from >= to ||
      to - from > 366 * DAY_MS
    ) {
      throw new Error('Choose a valid date range of up to 366 days.');
    }
    const teamMembers = query.teamRef
      ? new Set(
          catalog.teams.find(team => team.ref === query.teamRef)?.members ?? [],
        )
      : undefined;
    const rows = this.rows.filter(
      row =>
        (query.allTime ||
          (Date.parse(row.createdAt) >= from &&
            Date.parse(row.createdAt) < to)) &&
        (!query.templateRef || row.templateRef === query.templateRef) &&
        (!query.userRef || row.userRef === query.userRef) &&
        (!teamMembers || teamMembers.has(row.userRef ?? '')),
    );
    const terms = query.query?.toLowerCase().split(/\s+/).filter(Boolean) ?? [];
    // Match the real plugin: search/status affect the run list, not cohort metrics.
    const matching = rows.filter(
      row =>
        (!query.status || row.status === query.status) &&
        terms.every(term =>
          [row.id, row.templateRef, row.templateName, row.userRef ?? ''].some(
            value => value.toLowerCase().includes(term),
          ),
        ),
    );
    const field = query.sortBy ?? 'createdAt';
    const direction = query.sortDirection === 'ascending' ? 1 : -1;
    matching.sort((a, b) => {
      const left = a[field];
      const right = b[field];
      if (left === undefined)
        return right === undefined ? b.id.localeCompare(a.id) : 1;
      if (right === undefined) return -1;
      const comparison =
        typeof left === 'number' && typeof right === 'number'
          ? left - right
          : String(left)
              .toLowerCase()
              .localeCompare(String(right).toLowerCase());
      return comparison * direction || b.id.localeCompare(a.id);
    });
    const offset = query.cursor
      ? Number(query.cursor)
      : Math.max(0, query.offset ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new Error('Invalid history cursor.');
    }
    const activity = new Map<string, DailyActivity>();
    for (let day = from; day < to; day += DAY_MS) {
      const date = new Date(day).toISOString().slice(0, 10);
      activity.set(date, { date, total: 0, completed: 0, failed: 0, other: 0 });
    }
    for (const row of rows) {
      const day = activity.get(row.createdAt.slice(0, 10));
      if (!day) continue;
      day.total += 1;
      if (row.status === 'completed') day.completed += 1;
      else if (row.status === 'failed') day.failed += 1;
      else day.other += 1;
    }
    const group = (by: 'template' | 'user'): ExecutionRollup[] => {
      const groups = new Map<string, Execution[]>();
      for (const row of rows) {
        const id =
          by === 'template' ? row.templateRef : row.userRef ?? 'unknown';
        const cohort = groups.get(id) ?? [];
        cohort.push(row);
        groups.set(id, cohort);
      }
      return [...groups]
        .map(([id, cohort]) => ({
          id,
          name: by === 'template' ? cohort[0].templateName : id,
          lastRun: cohort[0].createdAt,
          ...summarize(cohort),
        }))
        .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    };
    // Keep all choices available when drilling into a template or user.
    return {
      items: matching.slice(offset, offset + PAGE_SIZE),
      scope: 'all',
      summary: summarize(rows),
      templates: group('template'),
      users: group('user'),
      activity: [...activity.values()],
      facets: {
        templates: catalog.templates.map(template => ({
          id: template.ref,
          name: template.name,
        })),
        users: catalog.users.map(user => user.ref),
      },
      page: {
        offset,
        limit: PAGE_SIZE,
        total: matching.length,
        hasMore: offset + PAGE_SIZE < matching.length,
        nextCursor:
          offset + PAGE_SIZE < matching.length
            ? String(offset + PAGE_SIZE)
            : undefined,
      },
      window: {
        limit: PAGE_SIZE,
        scanned: this.rows.length,
        sourceTotal: this.rows.length,
        truncated: false,
        oldestAt: this.rows[this.rows.length - 1]?.createdAt,
        generatedAt: this.generatedAt,
      },
    };
  }
}
