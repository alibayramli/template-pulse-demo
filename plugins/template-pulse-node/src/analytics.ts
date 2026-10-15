import type {
  DailyActivity,
  Execution,
  ExecutionMetrics,
  ExecutionQuery,
  ExecutionRollup,
} from '@abayramli/backstage-plugin-template-pulse-common';

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
      completed.length + failed > 0
        ? (100 * completed.length) / (completed.length + failed)
        : undefined,
    averageMs: durations.length
      ? durations.reduce((sum, value) => sum + value, 0) / durations.length
      : undefined,
    // Nearest-rank percentile; the UI shows the sample count alongside it.
    p95Ms: durations.length
      ? durations[Math.ceil(durations.length * 0.95) - 1]
      : undefined,
    timedCompleted: durations.length,
  };
}

/** Compute health, adoption and detail pagination from authorized executions. @public */
export function aggregateExecutions(
  rows: Execution[],
  query: ExecutionQuery,
  limit: number,
) {
  function group(by: 'template' | 'user'): ExecutionRollup[] {
    const groups = new Map<string, Execution[]>();
    for (const row of rows) {
      const key =
        by === 'template' ? row.templateRef : row.userRef ?? 'unknown';
      const cohort = groups.get(key) ?? [];
      cohort.push(row);
      groups.set(key, cohort);
    }
    return [...groups.entries()]
      .map(([id, cohort]) => {
        const userName = id === 'unknown' ? 'Unknown user' : id;
        return {
          id,
          name: by === 'template' ? cohort[0].templateName : userName,
          lastRun: cohort.reduce(
            (last, row) => (row.createdAt > last ? row.createdAt : last),
            '',
          ),
          ...summarize(cohort),
        };
      })
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }

  const activity = new Map<string, DailyActivity>();
  const end = Date.parse(query.to);
  for (let day = Date.parse(query.from); day < end; day += 86_400_000) {
    const date = new Date(day).toISOString().slice(0, 10);
    activity.set(date, { date, completed: 0, failed: 0, other: 0, total: 0 });
  }
  for (const row of rows) {
    const day = activity.get(row.createdAt.slice(0, 10));
    if (!day) continue;
    day.total += 1;
    if (row.status === 'completed') day.completed += 1;
    else if (row.status === 'failed') day.failed += 1;
    else day.other += 1;
  }
  // Search and status narrow the detail list, never the health/adoption metrics.
  const terms = query.query?.toLowerCase().split(/\s+/).filter(Boolean) ?? [];
  const matching = rows.filter(
    row =>
      (!query.status || row.status === query.status) &&
      terms.every(term =>
        [row.id, row.templateRef, row.templateName, row.userRef ?? ''].some(
          value => value.toLowerCase().includes(term),
        ),
      ),
  );
  const offset = query.offset ?? 0;
  return {
    items: matching.slice(offset, offset + limit),
    page: {
      offset,
      limit,
      total: matching.length,
      hasMore: offset + limit < matching.length,
    },
    summary: summarize(rows),
    templates: group('template'),
    users: group('user'),
    activity: [...activity.values()],
  };
}
