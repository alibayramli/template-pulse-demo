import type {
  CacheService,
  HttpAuthService,
  LoggerService,
  PermissionsService,
} from '@backstage/backend-plugin-api';
import type { ScaffolderService } from '@backstage/plugin-scaffolder-node';
import { AuthorizeResult } from '@backstage/plugin-permission-common';
import { InputError } from '@backstage/errors';
import Router from 'express-promise-router';
import {
  executionsReadAllPermission,
  executionsReadPermission,
  type Execution,
  type ExecutionAnalytics,
} from '@template-pulse/plugin-common';
import {
  aggregateExecutions,
  authorizeExecutionQuery,
  parseExecutionQuery,
  type ExecutionHistory,
} from '@template-pulse/plugin-node';

type Task = Awaited<
  ReturnType<ScaffolderService['listTasks']>
>['items'][number];
type Credentials = Parameters<ScaffolderService['listTasks']>[1]['credentials'];
type Options = {
  httpAuth: HttpAuthService;
  permissions: PermissionsService;
  scaffolder: ScaffolderService;
  cache: CacheService;
  logger: LoggerService;
  maxTasks: number;
  history?: ExecutionHistory;
};

function ownerRef(task: Task): string | undefined {
  // The HTTP task record also carries createdBy. Prefer it over the decorated
  // catalog identity; older Scaffolder service typings only declare spec.user.
  return (
    (task as Task & { createdBy?: string }).createdBy ?? task.spec.user?.ref
  );
}

async function mapLimited<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index]);
      }
    }),
  );
  return results;
}

function taskMetadata(task: Task): Execution {
  return {
    id: task.id,
    templateRef: task.spec.templateInfo?.entityRef ?? 'unknown',
    templateName:
      task.spec.templateInfo?.entity?.metadata.title ??
      task.spec.templateInfo?.entity?.metadata.name ??
      task.spec.templateInfo?.entityRef ??
      'Unknown template',
    userRef: ownerRef(task),
    status: task.status,
    createdAt: task.createdAt,
  };
}

async function projectTask(
  task: Task,
  credentials: Credentials,
  callerRef: string,
  { scaffolder, cache, logger }: Options,
): Promise<Execution> {
  const execution = taskMetadata(task);

  if (!['completed', 'failed', 'cancelled'].includes(task.status))
    return execution;

  // Cache only the timing projection, scoped to the caller. Access is evaluated
  // on each request and task listing still uses the caller's credentials.
  const key = JSON.stringify([
    callerRef,
    task.id,
    task.status,
    task.lastHeartbeatAt,
  ]);
  const cached = await cache.get<{ durationMs: number }>(key);
  if (cached) return { ...execution, durationMs: cached.durationMs };

  try {
    const events = await scaffolder.getLogs(
      { taskId: task.id },
      { credentials },
    );
    const end = events
      .filter(event => ['completion', 'cancelled'].includes(event.type))
      .filter(event => !event.body.status || event.body.status === task.status)
      .map(event => Date.parse(event.createdAt))
      .filter(Number.isFinite)
      .sort((a, b) => b - a)[0];
    const durationMs = end - Date.parse(task.createdAt);
    if (Number.isFinite(durationMs) && durationMs >= 0) {
      execution.durationMs = durationMs;
      await cache.set(key, { durationMs }, { ttl: 60_000 });
    }
  } catch {
    // Retained task metadata can outlive its events. Never infer a finish time
    // from a heartbeat, or send raw event messages to the dashboard.
    logger.debug(`Execution timing unavailable for task ${task.id}`);
  }
  return execution;
}

export function createRouter(options: Options) {
  const { httpAuth, permissions, scaffolder, maxTasks, history } = options;
  const router = Router();

  router.get('/permissions', async (req, res) => {
    const credentials = await httpAuth.credentials(req, { allow: ['user'] });
    const [own, all] = await permissions.authorize(
      [
        { permission: executionsReadPermission },
        { permission: executionsReadAllPermission },
      ],
      { credentials },
    );
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      canSearchHistory: Boolean(history),
      canReadOwn: own?.result === AuthorizeResult.ALLOW,
      canReadAll: all?.result === AuthorizeResult.ALLOW,
    });
  });

  router.get('/analytics', async (req, res) => {
    const query = parseExecutionQuery(req.query);
    const { scope } = query;

    const credentials = await httpAuth.credentials(req, { allow: ['user'] });
    const callerRef = credentials.principal.userEntityRef;
    await authorizeExecutionQuery({ query, credentials, permissions });

    if (history) {
      const analytics = await history.search(query, credentials, maxTasks);
      res.setHeader('Cache-Control', 'no-store');
      res.json(analytics);
      return;
    }
    if (query.allTime || query.offset) {
      throw new InputError(
        'All-history search and result pagination require the database history source.',
      );
    }

    // Page the public service rather than relying on private Scaffolder tables.
    // Its task policy continues to apply, including administrator restrictions.
    const tasks = new Map<string, Task>();
    let sourceTotal: number | undefined;
    let offset = 0;
    let more = false;
    while (offset < maxTasks) {
      const limit = Math.min(100, maxTasks - offset);
      const page = await scaffolder.listTasks(
        {
          createdBy: scope === 'mine' ? callerRef : query.userRef,
          limit,
          offset,
        },
        { credentials },
      );
      sourceTotal = page.totalItems;
      for (const task of page.items) {
        if (scope === 'all' || ownerRef(task) === callerRef)
          tasks.set(task.id, task);
      }
      offset += page.items.length;
      more =
        sourceTotal === undefined
          ? page.items.length === limit
          : offset < sourceTotal;
      if (!page.items.length || !more) break;
    }

    const metadata = [...tasks.values()].map(taskMetadata);
    const from = Date.parse(query.from);
    const to = Date.parse(query.to);
    // Apply cohort filters before reading timings; execution search/status are detail-only.
    // The public Scaffolder service does not support these filters itself.
    const cohort = [...tasks.values()].filter(task => {
      const row = taskMetadata(task);
      const date = Date.parse(row.createdAt);
      return (
        date >= from &&
        date < to &&
        (!query.templateRef || row.templateRef === query.templateRef) &&
        (!query.userRef || row.userRef === query.userRef)
      );
    });
    const rows = await mapLimited(cohort, task =>
      projectTask(task, credentials, callerRef, options),
    );
    rows.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const analytics: ExecutionAnalytics = {
      scope,
      ...aggregateExecutions(rows, query, maxTasks),
      facets: {
        templates: [
          ...new Map(
            metadata.map(row => [
              row.templateRef,
              { id: row.templateRef, name: row.templateName },
            ]),
          ).values(),
        ].sort((a, b) => a.name.localeCompare(b.name)),
        users: [
          ...new Set(
            metadata
              .map(row => row.userRef)
              .filter((ref): ref is string => Boolean(ref)),
          ),
        ].sort(),
      },
      window: {
        historySource: 'service',
        limit: maxTasks,
        scanned: metadata.length,
        sourceTotal,
        truncated: more,
        oldestAt: metadata.map(row => row.createdAt).sort()[0],
        generatedAt: new Date().toISOString(),
      },
    };
    res.setHeader('Cache-Control', 'no-store');
    res.json(analytics);
  });

  return router;
}
