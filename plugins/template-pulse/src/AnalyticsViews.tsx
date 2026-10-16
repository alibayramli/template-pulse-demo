import { useMemo } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { parseEntityRef } from '@backstage/catalog-model';
import {
  Button,
  Cell,
  Link,
  Table,
  Text,
  Tooltip,
  TooltipTrigger,
  useTable,
  type ColumnConfig,
} from '@backstage/ui';
import {
  executionSortFields,
  type ExecutionSortField,
  type ExecutionSortDirection,
  type Execution,
  type ExecutionRollup,
} from '@abayramli/backstage-plugin-template-pulse-common';
import { entityRouteRef, taskRouteRef } from './routes';
import { formatDate, formatDuration, formatRate, sortRows } from './history';
import { statusLabel } from './dashboardState';
import { entityFilterName } from './FilterControls';

function EntityLink({
  entityRef,
  kind,
  label,
}: {
  entityRef?: string;
  kind: 'template' | 'user';
  label?: string;
}) {
  const entityRoute = useRouteRef(entityRouteRef);
  let href: string | undefined;
  if (entityRoute && entityRef && entityRef !== 'unknown') {
    try {
      const ref = parseEntityRef(entityRef, { defaultKind: kind });
      href = entityRoute({
        kind: encodeURIComponent(ref.kind.toLowerCase()),
        namespace: encodeURIComponent(ref.namespace.toLowerCase()),
        name: encodeURIComponent(ref.name),
      });
    } catch {
      // Older retained tasks may have missing or malformed entity references.
    }
  }
  const text = label ?? entityName(entityRef, kind);
  return href ? (
    <Link href={href} title={entityRef}>
      {text}
    </Link>
  ) : (
    <Text>{text}</Text>
  );
}

function entityName(ref: string | undefined, kind: 'template' | 'user') {
  if (!ref || ref === 'unknown') return `Unknown ${kind}`;
  return entityFilterName(ref);
}

// Table renderers must return a Cell directly for the accessible collection.
function entityCell({
  entityRef,
  kind,
  label,
}: {
  entityRef?: string;
  kind: 'template' | 'user';
  label?: string;
}) {
  return (
    <Cell>
      <div className="template-pulse-analytics-entity">
        <div className="template-pulse-analytics-entity-name">
          <EntityLink entityRef={entityRef} kind={kind} label={label} />
        </div>
      </div>
    </Cell>
  );
}

function numberCell({
  value,
  danger = false,
}: {
  value: string | number;
  danger?: boolean;
}) {
  return (
    <Cell className="template-pulse-analytics-number">
      <span
        className={danger ? 'template-pulse-analytics-failed' : undefined}
        title={String(value)}
      >
        {value === 'Unavailable' ? '—' : value}
      </span>
    </Cell>
  );
}

function dateCell({ date }: { date: string }) {
  const time = new Date(date);
  return (
    <Cell>
      <time
        className="template-pulse-analytics-date"
        dateTime={date}
        title={`${formatDate(date)} UTC`}
      >
        <span>
          {time.toLocaleDateString(undefined, {
            timeZone: 'UTC',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
        <span className="template-pulse-analytics-secondary">
          {time.toLocaleTimeString(undefined, {
            timeZone: 'UTC',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          })}{' '}
          UTC
        </span>
      </time>
    </Cell>
  );
}

function successCell({ rate }: { rate?: number }) {
  return (
    <Cell className="template-pulse-analytics-number">
      <div
        className="template-pulse-analytics-success"
        title="Successful runs out of completed and failed runs."
      >
        <span>{formatRate(rate)}</span>
        {rate !== undefined && (
          <span className="template-pulse-analytics-success-track" aria-hidden="true">
            <span style={{ width: `${Math.max(0, Math.min(100, rate))}%` }} />
          </span>
        )}
      </div>
    </Cell>
  );
}

export function RollupTable({
  rows,
  kind,
  onSelect,
  userNames,
  isStale = false,
}: {
  rows: ExecutionRollup[];
  kind: 'template' | 'user';
  onSelect: (id: string) => void;
  userNames?: Record<string, string>;
  isStale?: boolean;
}) {
  const data = useMemo(
    () =>
      kind === 'user'
        ? rows.map(row => ({
            ...row,
            name: userNames?.[row.id] ?? entityName(row.id, kind),
          }))
        : rows,
    [rows, kind, userNames],
  );
  const columns: ColumnConfig<ExecutionRollup>[] = [
    {
      id: 'name',
      label: kind === 'template' ? 'Template' : 'User',
      isRowHeader: true,
      isSortable: true,
      minWidth: 150,
      width: kind === 'user' ? '2fr' : '2.5fr',
      cell: row =>
        entityCell({
          entityRef: row.id,
          kind: kind,
          label: row.name,
        }),
    },
    {
      id: 'total',
      label: 'Runs',
      isSortable: true,
      width: '1fr',
      minWidth: 68,
      cell: row => (
        <Cell className="template-pulse-analytics-number">
          <div className="template-pulse-analytics-run-count">
            <TooltipTrigger delay={200}>
              <Button
                className="template-pulse-analytics-run-button"
                variant="tertiary"
                size="small"
                aria-label={`View ${row.total} runs for ${row.name}`}
                onPress={() => onSelect(row.id)}
                isDisabled={row.id === 'unknown' || isStale}
              >
                <span className="template-pulse-analytics-run-total">{row.total}</span>
              </Button>
              <Tooltip>
                {row.completed} completed · {row.failed} failed · {row.active}{' '}
                active · {row.cancelled} cancelled. View runs.
              </Tooltip>
            </TooltipTrigger>
          </div>
        </Cell>
      ),
    },
    {
      id: kind === 'template' ? 'users' : 'templates',
      label: kind === 'template' ? 'Users' : 'Templates',
      isSortable: true,
      width: '1fr',
      minWidth: 96,
      cell: row =>
        numberCell({ value: kind === 'template' ? row.users : row.templates }),
    },
    {
      id: 'failed',
      label: 'Failed',
      isSortable: true,
      width: '1fr',
      minWidth: 68,
      cell: row => numberCell({ value: row.failed, danger: row.failed > 0 }),
    },
    {
      id: 'successRate',
      label: 'Success',
      isSortable: true,
      width: '1fr',
      minWidth: 84,
      cell: row => successCell({ rate: row.successRate }),
    },
    {
      id: 'averageMs',
      label: 'Avg successful run time',
      isSortable: true,
      width: '1fr',
      minWidth: 84,
      cell: row => numberCell({ value: formatDuration(row.averageMs) }),
    },
    {
      id: 'p95Ms',
      label: 'P95 successful run time',
      isSortable: true,
      width: '1fr',
      minWidth: 84,
      cell: row => (
        <Cell className="template-pulse-analytics-number">
          <div
            className="template-pulse-analytics-duration"
            title={`Timing data from ${row.timedCompleted} successful runs. P95: 95% finished within this time.`}
          >
            <span title={formatDuration(row.p95Ms)}>
              {row.p95Ms === undefined ? '—' : formatDuration(row.p95Ms)}
            </span>
            <span className="template-pulse-analytics-secondary">
              {row.timedCompleted} {row.timedCompleted === 1 ? 'run' : 'runs'}
            </span>
          </div>
        </Cell>
      ),
    },
    {
      id: 'lastRun',
      label: 'Last used',
      isSortable: true,
      width: '1.25fr',
      minWidth: 128,
      cell: row => dateCell({ date: row.lastRun }),
    },
  ];
  const { tableProps } = useTable<ExecutionRollup>({
    mode: 'complete',
    data,
    sortFn: sortRows,
    initialSort: { column: 'total', direction: 'descending' },
    paginationOptions: { pageSize: 10, pageSizeOptions: [10, 20, 50] },
  });
  return (
    <section
      className="template-pulse-analytics-table-surface"
      aria-label={kind === 'template' ? 'Template health' : 'User adoption'}
    >
      <Table
        className="template-pulse-analytics-table template-pulse-analytics-rollup-table"
        columnConfig={columns}
        {...tableProps}
        isStale={isStale}
        emptyState={
          <Text color="secondary">No runs match these filters.</Text>
        }
      />
    </section>
  );
}

export function RunsTable({
  rows,
  userNames,
  isStale = false,
  sortBy,
  sortDirection,
  onSortChange,
}: {
  rows: Execution[];
  userNames?: Record<string, string>;
  isStale?: boolean;
  sortBy: ExecutionSortField;
  sortDirection: ExecutionSortDirection;
  onSortChange: (sort: {
    sortBy: ExecutionSortField;
    sortDirection: ExecutionSortDirection;
  }) => void;
}) {
  const taskLink = useRouteRef(taskRouteRef);
  const data = useMemo(
    () =>
      rows.map(row => ({
        ...row,
        userName:
          (row.userRef && userNames?.[row.userRef]) ||
          entityName(row.userRef, 'user'),
      })),
    [rows, userNames],
  );
  const columns: ColumnConfig<(typeof data)[number]>[] = [
    {
      id: 'templateName',
      label: 'Template',
      isRowHeader: true,
      isSortable: true,
      minWidth: 180,
      width: '1.6fr',
      cell: row =>
        entityCell({
          entityRef: row.templateRef,
          kind: 'template',
          label: row.templateName,
        }),
    },
    {
      id: 'userRef',
      label: 'User',
      isSortable: true,
      minWidth: 140,
      width: '1.4fr',
      cell: row =>
        entityCell({
          entityRef: row.userRef,
          kind: 'user',
          label: row.userName,
        }),
    },
    {
      id: 'status',
      label: 'Status',
      isSortable: true,
      width: '1fr',
      minWidth: 116,
      cell: row => (
        <Cell>
          <span className="template-pulse-analytics-status" data-status={row.status}>
            <span aria-hidden="true" />
            {statusLabel(row.status)}
          </span>
        </Cell>
      ),
    },
    {
      id: 'createdAt',
      label: 'Created',
      isSortable: true,
      width: '0.8fr',
      minWidth: 112,
      cell: row => dateCell({ date: row.createdAt }),
    },
    {
      id: 'durationMs',
      label: 'Elapsed',
      isSortable: true,
      width: '1fr',
      minWidth: 128,
      cell: row => numberCell({ value: formatDuration(row.durationMs) }),
    },
    {
      id: 'id',
      label: 'Task',
      width: '1.4fr',
      minWidth: 128,
      cell: row => (
        <Cell>
          <div className="template-pulse-analytics-task" title={row.id}>
            {taskLink ? (
              <Link
                href={taskLink({ taskId: encodeURIComponent(row.id) })}
                aria-label={`Open task ${row.id}`}
              >
                {row.id.slice(0, 8)} ↗
              </Link>
            ) : (
              <span>{row.id.slice(0, 8)}</span>
            )}
          </div>
        </Cell>
      ),
    },
  ];
  const sort = useMemo(
    () => ({ column: sortBy, direction: sortDirection }),
    [sortBy, sortDirection],
  );
  const { tableProps } = useTable<(typeof data)[number]>({
    mode: 'complete',
    data,
    // The server orders the full matching history; this hook only paginates loaded rows.
    sort,
    onSortChange: descriptor => {
      const field = String(descriptor.column) as ExecutionSortField;
      if (executionSortFields.includes(field) && descriptor.direction)
        onSortChange({ sortBy: field, sortDirection: descriptor.direction });
    },
    paginationOptions: { pageSize: 20, pageSizeOptions: [20, 50, 100] },
  });
  return (
    <section className="template-pulse-analytics-table-surface" aria-label="Runs">
      {sortBy === 'userRef' && (
        <Text variant="body-small" color="secondary">
          Users are sorted by catalog reference.
        </Text>
      )}
      <Table
        className="template-pulse-analytics-table template-pulse-analytics-runs-table"
        columnConfig={columns}
        {...tableProps}
        isStale={isStale}
        emptyState={
          <Text color="secondary">No runs match these filters.</Text>
        }
      />
    </section>
  );
}
