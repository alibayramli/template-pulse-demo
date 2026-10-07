import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { parseEntityRef } from '@backstage/catalog-model';
import {
  Button,
  Card,
  CardBody,
  Cell,
  Flex,
  Link,
  Table,
  Text,
  Tooltip,
  TooltipTrigger,
  useTable,
  type ColumnConfig,
} from '@backstage/ui';
import type {
  DailyActivity,
  Execution,
  ExecutionRollup,
} from '@template-pulse/plugin-common';
import { entityRouteRef, taskRouteRef } from './routes';
import { formatDate, formatDuration, formatRate, sortRows } from './history';
import { statusLabel } from './dashboardState';
import './analyticsTables.css';

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

export function ActivityChart({
  days,
  allHistory = false,
}: {
  days: DailyActivity[];
  allHistory?: boolean;
}) {
  const chartRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(960);
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return undefined;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(1, entry.contentRect.width)),
    );
    observer.observe(chart);
    return () => observer.disconnect();
  }, []);
  const max = Math.max(1, ...days.map(day => day.total));
  const plotWidth = Math.max(1, width - 40);
  const step = plotWidth / Math.max(1, days.length);
  const ticks = [
    ...new Set([
      0,
      Math.floor(days.length / 4),
      Math.floor(days.length / 2),
      Math.floor((3 * days.length) / 4),
      days.length - 1,
    ]),
  ];
  return (
    <Card className="analytics-activity">
      <CardBody>
        <Flex direction="column" gap="2">
          <Flex justify="between" gap="3" style={{ flexWrap: 'wrap' }}>
            <Text as="h2" variant="title-small">
              Daily activity
            </Text>
            <Flex gap="3" style={{ flexWrap: 'wrap' }}>
              <Text variant="body-small" color="success">
                ● Completed
              </Text>
              <Text variant="body-small" color="danger">
                ● Failed
              </Text>
              <Text variant="body-small" color="secondary">
                ● Active / cancelled
              </Text>
            </Flex>
          </Flex>
          <svg
            ref={chartRef}
            viewBox={`0 0 ${width} 124`}
            role="img"
            aria-label={`Daily executions from ${days[0]?.date} to ${
              days[days.length - 1]?.date
            }, UTC. Peak ${Math.max(
              0,
              ...days.map(day => day.total),
            )} runs in a day.`}
            className="analytics-activity-chart"
          >
            <text x="0" y="15" fontSize="12" fill="var(--bui-fg-secondary)">
              {max}
            </text>
            <line
              x1="28"
              x2={width - 12}
              y1="18"
              y2="18"
              stroke="var(--bui-border-1)"
            />
            <line
              x1="28"
              x2={width - 12}
              y1="94"
              y2="94"
              stroke="var(--bui-border-1)"
            />
            {days.map((day, index) => {
              let y = 94;
              return (
                <g key={day.date}>
                  <title>{`${day.date} UTC: ${day.total} runs, ${day.completed} completed, ${day.failed} failed, ${day.other} active or cancelled`}</title>
                  {(['completed', 'failed', 'other'] as const).map(status => {
                    const height = (day[status] * 76) / max;
                    const color = {
                      completed: 'success',
                      failed: 'danger',
                      other: 'secondary',
                    }[status];
                    y -= height;
                    return (
                      <rect
                        key={status}
                        x={28 + index * step + step * 0.15}
                        y={y}
                        width={step * 0.7}
                        height={height}
                        fill={`var(--bui-fg-${color})`}
                        rx="2"
                      />
                    );
                  })}
                </g>
              );
            })}
            {ticks.map(index => (
              <text
                key={index}
                x={28 + index * step + step / 2}
                y="118"
                fontSize="12"
                textAnchor="middle"
                fill="var(--bui-fg-secondary)"
              >
                {days[index]?.date.slice(5)}
              </text>
            ))}
          </svg>
          <Text variant="body-small" color="secondary">
            {allHistory
              ? 'Last 30 days (UTC). Totals include all history. '
              : 'Dates use UTC. '}
            Hover for details.
          </Text>
        </Flex>
      </CardBody>
    </Card>
  );
}

function entityName(ref: string | undefined, kind: 'template' | 'user') {
  if (!ref || ref === 'unknown') return `Unknown ${kind}`;
  try {
    const entity = parseEntityRef(ref, { defaultKind: kind });
    return entity.namespace === 'default'
      ? entity.name
      : `${entity.namespace}/${entity.name}`;
  } catch {
    return ref;
  }
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
      <div className="analytics-entity">
        <div className="analytics-entity-name">
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
    <Cell className="analytics-number">
      <span
        className={danger ? 'analytics-failed' : undefined}
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
        className="analytics-date"
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
        <span className="analytics-secondary">
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
    <Cell className="analytics-number">
      <div
        className="analytics-success"
        title="Successful runs out of completed and failed runs."
      >
        <span>{formatRate(rate)}</span>
        {rate !== undefined && (
          <span className="analytics-success-track" aria-hidden="true">
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
        <Cell className="analytics-number">
          <div className="analytics-run-count">
            <TooltipTrigger delay={200}>
              <Button
                className="analytics-run-button"
                variant="tertiary"
                size="small"
                aria-label={`View ${row.total} executions for ${row.name}`}
                onPress={() => onSelect(row.id)}
                isDisabled={row.id === 'unknown' || isStale}
              >
                <span className="analytics-run-total">{row.total}</span>
              </Button>
              <Tooltip>
                {row.completed} completed · {row.failed} failed · {row.active}{' '}
                active · {row.cancelled} cancelled. View executions.
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
      label: 'Avg success',
      isSortable: true,
      width: '1fr',
      minWidth: 84,
      cell: row => numberCell({ value: formatDuration(row.averageMs) }),
    },
    {
      id: 'p95Ms',
      label: 'P95 success',
      isSortable: true,
      width: '1fr',
      minWidth: 84,
      cell: row => (
        <Cell className="analytics-number">
          <div
            className="analytics-duration"
            title={`${row.timedCompleted} timed successful runs`}
          >
            <span title={formatDuration(row.p95Ms)}>
              {row.p95Ms === undefined ? '—' : formatDuration(row.p95Ms)}
            </span>
            <span className="analytics-secondary">
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
      className="analytics-table-surface"
      aria-label={kind === 'template' ? 'Template health' : 'User adoption'}
    >
      <Table
        className="analytics-table analytics-rollup-table"
        columnConfig={columns}
        {...tableProps}
        isStale={isStale}
        emptyState={
          <Text color="secondary">No activity in this selection.</Text>
        }
      />
    </section>
  );
}

export function RunsTable({
  rows,
  userNames,
  isStale = false,
}: {
  rows: Execution[];
  userNames?: Record<string, string>;
  isStale?: boolean;
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
      id: 'userName',
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
          <span className="analytics-status" data-status={row.status}>
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
          <div className="analytics-task" title={row.id}>
            {taskLink ? (
              <Link
                href={taskLink({ taskId: row.id })}
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
  const { tableProps } = useTable<(typeof data)[number]>({
    mode: 'complete',
    data,
    sortFn: sortRows,
    initialSort: { column: 'createdAt', direction: 'descending' },
    paginationOptions: { pageSize: 20, pageSizeOptions: [20, 50, 100] },
  });
  return (
    <section className="analytics-table-surface" aria-label="Executions">
      <Table
        className="analytics-table analytics-runs-table"
        columnConfig={columns}
        {...tableProps}
        isStale={isStale}
        emptyState={
          <Text color="secondary">No executions match this selection.</Text>
        }
      />
    </section>
  );
}
