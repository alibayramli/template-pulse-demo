import type { Knex } from 'knex';
import { NotAllowedError } from '@backstage/errors';
import {
  AuthorizeResult,
  type PermissionCondition,
  type PermissionCriteria,
  type QueryPermissionResponse,
} from '@backstage/plugin-permission-common';
import type { Execution, ExecutionQuery } from '@template-pulse/plugin-common';
import { aggregateExecutions } from '@template-pulse/plugin-node';

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
  constructor(private readonly getClient: () => Promise<Knex>) {}

  async search(
    query: ExecutionQuery,
    callerRef: string,
    decision: QueryPermissionResponse,
    limit: number,
  ) {
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
    const db = await this.getClient();
    const client = db.client.config.client;
    const postgres =
      client === 'pg' || client === 'postgres' || client === 'postgresql';
    if (!postgres && client !== 'better-sqlite3' && client !== 'sqlite3') {
      throw new Error(
        'Database history supports PostgreSQL and SQLite Scaffolder task stores.',
      );
    }
    // Validate the adapter contract, without running migrations or modifying Scaffolder tables.
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
        'The Scaffolder task store schema is incompatible with database history.',
      );
    }
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

    // Facets cover authorized retained history, including templates outside the current date range.
    const [counts, templateChoices, userChoices] = await Promise.all([
      base.clone().count({ total: 't.id' }).first(),
      base
        .clone()
        .distinct(
          db.raw(`${templateRef} as id`),
          db.raw(`${templateName} as name`),
        ),
      base.clone().distinct(db.raw(`${userRef} as ref`)),
    ]);
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
    // Completion timestamps only: parameters, secrets, outputs and log bodies never leave SQL.
    const eventStatus = json('e.body', ['status']);
    const finishedAt = db('task_events as e')
      .max('e.created_at')
      .whereRaw('?? = ??', ['e.task_id', 't.id'])
      .whereIn('e.event_type', ['completion', 'cancelled'])
      .andWhere(builder =>
        builder
          .whereRaw(`${eventStatus} IS NULL`)
          .orWhereRaw(`${eventStatus} = t.status`),
      );
    const rawRows = await cohort
      .select(
        't.id',
        't.status',
        't.created_at',
        db.raw(`${templateRef} as template_ref`),
        db.raw(`${templateName} as template_name`),
        db.raw(`${userRef} as user_ref`),
        finishedAt.as('finished_at'),
      )
      .orderBy('t.created_at', 'desc')
      .orderBy('t.id', 'desc');
    const rows: Execution[] = rawRows.map(row => {
      const createdAt = isoDate(row.created_at);
      const duration = row.finished_at
        ? Date.parse(isoDate(row.finished_at)) - Date.parse(createdAt)
        : undefined;
      return {
        id: row.id,
        status: row.status,
        templateRef: row.template_ref,
        templateName: row.template_name,
        userRef: row.user_ref ?? undefined,
        createdAt,
        durationMs:
          ['completed', 'failed', 'cancelled'].includes(row.status) &&
          duration !== undefined &&
          duration >= 0
            ? duration
            : undefined,
      };
    });
    return {
      scope: query.scope,
      ...aggregateExecutions(rows, query, limit),
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
        scanned: rows.length,
        sourceTotal: Number(counts?.total ?? 0),
        truncated: false,
        oldestAt: rows[rows.length - 1]?.createdAt,
        generatedAt: new Date().toISOString(),
      },
    };
  }
}
