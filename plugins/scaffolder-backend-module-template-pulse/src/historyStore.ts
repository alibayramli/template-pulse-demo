import type { Knex } from 'knex';
import { InputError, NotAllowedError } from '@backstage/errors';
import {
  AuthorizeResult,
  type PermissionCondition,
  type PermissionCriteria,
  type QueryPermissionResponse,
} from '@backstage/plugin-permission-common';
import type {
  DailyActivity,
  Execution,
  ExecutionAnalytics,
  ExecutionQuery,
} from '@abayramli/backstage-plugin-template-pulse-common';
import {
  executionProjection,
  filterExecutionDetails,
  mapMetrics,
  metricsQuery,
  orderExecutionDetails,
} from './historySql';

type HistoryQuery = ExecutionQuery & { teamMembers?: string[] };

function applyConditions(
  query: Knex.QueryBuilder,
  criteria: PermissionCriteria<PermissionCondition>,
) {
  if ('allOf' in criteria) {
    if (!criteria.allOf.length) query.whereRaw('1 = 1');
    for (const condition of criteria.allOf)
      query.andWhere(builder => applyConditions(builder, condition));
  } else if ('anyOf' in criteria) {
    if (!criteria.anyOf.length) query.whereRaw('1 = 0');
    else
      query.andWhere(builder => {
        for (const condition of criteria.anyOf)
          builder.orWhere(branch => applyConditions(branch, condition));
      });
  } else if ('not' in criteria) {
    query.whereNot(builder => applyConditions(builder, criteria.not));
  } else {
    const owners = criteria.params?.createdBy;
    if (
      criteria.resourceType !== 'scaffolder-task' ||
      criteria.rule !== 'IS_TASK_OWNER' ||
      !Array.isArray(owners) ||
      !owners.every(owner => typeof owner === 'string')
    ) {
      // Never drop a policy condition that this database adapter cannot enforce.
      throw new NotAllowedError(
        'Database history does not support this task permission condition. Use the service history source for custom task rules.',
      );
    }
    query.whereIn('t.created_by', owners);
  }
}

function isoDate(value: Date | string) {
  if (value instanceof Date) return value.toISOString();
  return new Date(
    value.includes('T') ? value : `${value.replace(' ', 'T')}Z`,
  ).toISOString();
}

/** Read-only adapter for the standard Scaffolder SQL task store. */
export class DatabaseHistoryStore {
  private database?: Promise<Knex>;

  constructor(
    private readonly getClient: () => Promise<Knex>,
    private readonly maxHistoryRows = 10_000,
  ) {
    if (
      !Number.isInteger(maxHistoryRows) ||
      maxHistoryRows < 1 ||
      maxHistoryRows > 100_000
    ) {
      throw new Error(
        'templatePulse.maxHistoryRows must be an integer between 1 and 100000.',
      );
    }
  }

  /** Called after Scaffolder startup, when its own migrations have completed. */
  async initialize(): Promise<void> {
    await this.getDatabase();
  }

  private getDatabase(): Promise<Knex> {
    this.database ??= this.validateDatabase().catch(error => {
      this.database = undefined;
      throw error;
    });
    return this.database;
  }

  private async validateDatabase(): Promise<Knex> {
    const db = await this.getClient();
    const client = db.client.config.client;
    if (
      !['pg', 'postgres', 'postgresql', 'better-sqlite3', 'sqlite3'].includes(
        client,
      )
    ) {
      throw new Error(
        'Database history supports PostgreSQL and SQLite Scaffolder task stores.',
      );
    }
    // Scaffolder owns these tables and migrations, as well as the connection pool.
    const [taskColumns, eventColumns] = await Promise.all([
      db('tasks').columnInfo(),
      db('task_events').columnInfo(),
    ]);
    if (
      !['id', 'spec', 'status', 'created_at', 'created_by'].every(
        key => key in taskColumns,
      ) ||
      !['task_id', 'body', 'event_type', 'created_at'].every(
        key => key in eventColumns,
      )
    ) {
      throw new Error(
        'The Scaffolder task store schema is incompatible with database history. Check that Scaffolder migrations have completed and use service history for custom task stores.',
      );
    }
    return db;
  }

  async search(
    query: HistoryQuery,
    callerRef: string,
    decision: QueryPermissionResponse,
    limit: number,
  ): Promise<ExecutionAnalytics> {
    if (query.teamRef && !query.teamMembers)
      throw new InputError(
        'Team membership must be resolved before reading history',
      );
    if (decision.result === AuthorizeResult.DENY)
      throw new NotAllowedError('Scaffolder task access denied');
    if (
      decision.result === AuthorizeResult.CONDITIONAL &&
      (decision.pluginId !== 'scaffolder' ||
        decision.resourceType !== 'scaffolder-task')
    ) {
      throw new NotAllowedError(
        'Unsupported Scaffolder task permission decision',
      );
    }
    const db = await this.getDatabase();
    const postgres = ['pg', 'postgres', 'postgresql'].includes(
      db.client.config.client,
    );
    // A single snapshot keeps counts, metrics and details consistent during active task updates.
    return db.transaction(
      transaction =>
        this.searchDatabase(
          transaction,
          postgres,
          query,
          callerRef,
          decision,
          limit,
        ),
      postgres
        ? { isolationLevel: 'repeatable read', readOnly: true }
        : undefined,
    );
  }

  private async searchDatabase(
    db: Knex,
    postgres: boolean,
    query: HistoryQuery,
    callerRef: string,
    decision: QueryPermissionResponse,
    limit: number,
  ): Promise<ExecutionAnalytics> {
    const json = (column: string, path: string[]) =>
      postgres
        ? `(${column}::jsonb #>> '{${path.join(',')}}')`
        : `json_extract(${column}, '$.${path.join('.')}')`;
    const userRef = `COALESCE(t.created_by, ${json('t.spec', [
      'user',
      'ref',
    ])})`;
    const templateRef = `COALESCE(${json('t.spec', [
      'templateInfo',
      'entityRef',
    ])}, 'unknown')`;
    const templateName = `COALESCE(${json('t.spec', [
      'templateInfo',
      'entity',
      'metadata',
      'title',
    ])}, ${json('t.spec', [
      'templateInfo',
      'entity',
      'metadata',
      'name',
    ])}, ${json('t.spec', ['templateInfo', 'entityRef'])}, 'Unknown template')`;
    const base = db('tasks as t');
    if (decision.result === AuthorizeResult.CONDITIONAL)
      applyConditions(base, decision.conditions);
    if (query.scope === 'mine') base.whereRaw(`${userRef} = ?`, [callerRef]);
    else if (query.userRef) base.whereRaw(`${userRef} = ?`, [query.userRef]);
    if (query.teamMembers) {
      if (query.teamMembers.length)
        base.whereRaw(
          `${userRef} IN (${query.teamMembers.map(() => '?').join(', ')})`,
          query.teamMembers,
        );
      else base.whereRaw('1 = 0');
    }

    // Membership intersects task permissions before any counts or facets.
    const metadata = (source: Knex.QueryBuilder) =>
      source
        .clone()
        .select(
          't.id',
          't.status',
          't.created_at',
          db.raw(`${templateRef} AS template_ref`),
          db.raw(`${templateName} AS template_name`),
          db.raw(`${userRef} AS user_ref`),
        );
    const latestTemplates = db
      .from(metadata(base).as('authorized'))
      .select(
        'template_ref AS id',
        'template_name AS name',
        db.raw(
          'ROW_NUMBER() OVER (PARTITION BY template_ref ORDER BY created_at DESC, id DESC) AS latest_rank',
        ),
      );

    // Facets cover authorized retained history, including templates outside the current date range.
    // A transaction has one connection; execute its statements sequentially.
    const counts = await base.clone().count({ total: 't.id' }).first();
    const templateChoices = await db
      .from(latestTemplates.as('template_choices'))
      .select('id', 'name')
      .where('latest_rank', 1)
      .limit(this.maxHistoryRows + 1);
    const userChoices = await base
      .clone()
      .distinct(db.raw(`${userRef} as ref`))
      .limit(this.maxHistoryRows + 1);
    if (
      templateChoices.length > this.maxHistoryRows ||
      userChoices.length > this.maxHistoryRows
    ) {
      throw new InputError(
        'Too many history filter choices. Select a user or ask your administrator to review templatePulse.maxHistoryRows.',
      );
    }
    const cohort = base.clone();
    if (!query.allTime) {
      cohort
        .where(
          't.created_at',
          '>=',
          postgres ? query.from : query.from.slice(0, 19).replace('T', ' '),
        )
        .where(
          't.created_at',
          '<',
          postgres ? query.to : query.to.slice(0, 19).replace('T', ' '),
        );
    }
    if (query.templateRef)
      cohort.whereRaw(`${templateRef} = ?`, [query.templateRef]);
    const executions = executionProjection(db, metadata(cohort), postgres);
    const details = filterExecutionDetails(
      db.from(metadata(cohort).as('cohort')),
      query,
    );
    const offset = query.offset ?? 0;
    // Only elapsed sorting needs completion events for every matching execution.
    const sortableDetails =
      query.sortBy === 'durationMs'
        ? filterExecutionDetails(db.from(executions.clone().as('cohort')), query)
        : details.clone();
    const pageIds = orderExecutionDetails(sortableDetails.select('id'), query)
      .limit(limit)
      .offset(offset);
    // Search, status, COUNT, LIMIT and OFFSET execute in SQL; only one detail page leaves the DB.
    const summaryRow = await metricsQuery(db, executions)
      .select(db.raw('MIN(created_at) AS oldest_at'))
      .first();
    const templateRows = await metricsQuery(db, executions, 'template').limit(
      this.maxHistoryRows + 1,
    );
    const userRows = await metricsQuery(db, executions, 'user').limit(
      this.maxHistoryRows + 1,
    );
    const matchingCount = await details.clone().count({ total: '*' }).first();
    const rawRows = await orderExecutionDetails(
      db
        .from(
          executionProjection(
            db,
            metadata(base.clone().whereIn('t.id', pageIds)),
            postgres,
          ).as('page'),
        )
        .select('*'),
      query,
    );
    const dailyRows = await db
      .from(metadata(cohort).as('cohort'))
      .where(
        'created_at',
        '>=',
        postgres ? query.from : query.from.slice(0, 19).replace('T', ' '),
      )
      .where(
        'created_at',
        '<',
        postgres ? query.to : query.to.slice(0, 19).replace('T', ' '),
      )
      .select(
        db.raw(
          `${
            postgres
              ? "to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')"
              : 'substr(created_at, 1, 10)'
          } AS date`,
        ),
      )
      .select(db.raw('COUNT(*) AS total'))
      .select(
        db.raw(
          "SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed",
        ),
      )
      .select(
        db.raw("SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed"),
      )
      .groupBy('date');
    if (
      templateRows.length > this.maxHistoryRows ||
      userRows.length > this.maxHistoryRows
    ) {
      throw new InputError(
        'Too many analytics groups. Narrow the template or user filters, or review templatePulse.maxHistoryRows.',
      );
    }
    const rows: Execution[] = rawRows.map(row => {
      const createdAt = isoDate(row.created_at);
      return {
        id: row.id,
        status: row.status,
        templateRef: row.template_ref,
        templateName: row.template_name,
        userRef: row.user_ref ?? undefined,
        createdAt,
        durationMs:
          row.duration_ms === null || row.duration_ms === undefined
            ? undefined
            : Number(row.duration_ms),
      };
    });
    const rollups = (results: typeof templateRows, kind: 'template' | 'user') =>
      results
        .map(row => {
          const userName =
            row.id === 'unknown' ? 'Unknown user' : (row.id as string);
          return {
            id: row.id as string,
            name: kind === 'template' ? (row.name as string) : userName,
            lastRun: isoDate(row.last_run),
            ...mapMetrics(row),
          };
        })
        .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    const daily = new Map(dailyRows.map(row => [row.date, row]));
    const activity: DailyActivity[] = [];
    for (
      let day = Date.parse(query.from);
      day < Date.parse(query.to);
      day += 86_400_000
    ) {
      const date = new Date(day).toISOString().slice(0, 10);
      const row = daily.get(date);
      const total = Number(row?.total ?? 0);
      const completed = Number(row?.completed ?? 0);
      const failed = Number(row?.failed ?? 0);
      activity.push({
        date,
        total,
        completed,
        failed,
        other: total - completed - failed,
      });
    }
    const summary = mapMetrics(summaryRow);
    const total = Number(matchingCount?.total ?? 0);
    return {
      scope: query.scope,
      items: rows,
      summary,
      templates: rollups(templateRows, 'template'),
      users: rollups(userRows, 'user'),
      activity,
      page: { offset, limit, total, hasMore: offset + limit < total },
      facets: {
        templates: [
          ...new Map(
            templateChoices.map(row => [
              row.id,
              { id: row.id as string, name: row.name as string },
            ]),
          ).values(),
        ].sort((a, b) => a.name.localeCompare(b.name)),
        users: userChoices
          .map(row => row.ref as string)
          .filter(Boolean)
          .sort(),
      },
      window: {
        historySource: 'database' as const,
        limit,
        scanned: summary.total,
        sourceTotal: Number(counts?.total ?? 0),
        truncated: false,
        oldestAt: summaryRow.oldest_at
          ? isoDate(summaryRow.oldest_at)
          : undefined,
        generatedAt: new Date().toISOString(),
      },
    };
  }
}
