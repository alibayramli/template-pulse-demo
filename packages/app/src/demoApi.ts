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

const DAY_MS = 86_400_000;
const PAGE_SIZE = 50;

/** Stable fictional records, dated relative to this visit so the demo stays useful. */
export function createDemoExecutions(now = Date.now()): Execution[] {
  const today = Math.floor(now / DAY_MS) * DAY_MS;
  let index = 0;
  const recent = catalog.templates.flatMap((_template, templateIndex) => {
    const count =
      templateIndex < 10
        ? [22, 16, 12, 10, 8, 7, 6, 5, 4, 3][templateIndex]
        : 1 + ((templateIndex * 3) % 7);
    return Array.from({ length: count }, () => {
      const n = index++;
      return makeExecution(n, templateIndex, n % 30);
    });
  });
  const archive = Array.from({ length: 100 }, (_, n) =>
    makeExecution(index++, n % catalog.templates.length, 30 + (n % 60)),
  );
  return [...recent, ...archive].sort(
    (a, b) =>
      b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
  );

  function makeExecution(
    n: number,
    templateIndex: number,
    dayOffset: number,
  ): Execution {
    const template = catalog.templates[templateIndex];
    const user =
      catalog.users[
        (n % 3 === 0 ? n : Math.ceil(n / 2)) % catalog.users.length
      ];
    const bucket = (n * 7 + templateIndex * 13 + Math.floor(n / 3)) % 10;
    let status: Execution['status'] = 'completed';
    if (bucket >= 9) status = 'cancelled';
    else if (bucket >= 7) status = 'failed';
    const durationMs = 1000 + ((n * 7919 + templateIndex * 17011) % 299000);
    const createdAt = Math.min(
      today - dayOffset * DAY_MS + (8 + (n % 12)) * 3_600_000 + n * 1000,
      now - durationMs - 60_000,
    );
    return {
      id: `demo-${String(n + 1).padStart(4, '0')}`,
      templateRef: template.ref,
      templateName: template.name,
      userRef: user.ref,
      status,
      createdAt: new Date(createdAt).toISOString(),
      durationMs,
    };
  }
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
    const offset = Math.max(0, query.offset ?? 0);
    const activity: DailyActivity[] = [];
    for (let day = from; day < to; day += DAY_MS) {
      const date = new Date(day).toISOString().slice(0, 10);
      const daily = rows.filter(row => row.createdAt.slice(0, 10) === date);
      const summary = summarize(daily);
      activity.push({
        date,
        total: summary.total,
        completed: summary.completed,
        failed: summary.failed,
        other: summary.cancelled + summary.active,
      });
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
      activity,
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
