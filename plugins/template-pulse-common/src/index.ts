import { createPermission } from '@backstage/plugin-permission-common';

/** Human-readable labels for Scaffolder task statuses. @public */
export const executionStatusLabels = {
  completed: 'Completed',
  failed: 'Failed',
  processing: 'Running',
  open: 'Queued',
  cancelled: 'Cancelled',
};

/** @public */
export function executionStatusLabel(status: string) {
  return (
    executionStatusLabels[status as keyof typeof executionStatusLabels] ??
    status
  );
}

/** Read the signed-in user's execution history. @public */
export const executionsReadPermission = createPermission({
  name: 'template-pulse.read',
  attributes: { action: 'read' },
});

/** Read execution history across users; grant to administrators only. @public */
export const executionsReadAllPermission = createPermission({
  name: 'template-pulse.read-all',
  attributes: { action: 'read' },
});

/** @public */
export const executionsPermissions = [
  executionsReadPermission,
  executionsReadAllPermission,
];

/** @public */
export type ExecutionScope = 'mine' | 'all';

/** Sortable execution metadata; user ordering uses retained entity references. @public */
export const executionSortFields = [
  'templateName',
  'userRef',
  'status',
  'createdAt',
  'durationMs',
] as const;

/** @public */
export type ExecutionSortField = (typeof executionSortFields)[number];

/** @public */
export type ExecutionSortDirection = 'ascending' | 'descending';

/** @public */
export type Execution = {
  id: string;
  templateRef: string;
  templateName: string;
  userRef?: string;
  status: string;
  createdAt: string;
  /** Elapsed time from task creation to completion, including queue time. */
  durationMs?: number;
};

/** UTC start inclusive and end exclusive; at most 366 days. @public */
export type ExecutionQuery = {
  scope: ExecutionScope;
  from: string;
  to: string;
  templateRef?: string;
  userRef?: string;
  /** Filter execution details only; analytics retain all statuses. */
  status?: string;
  /** Match execution metadata (template, user or task ID), without filtering analytics. */
  query?: string;
  /** Search all retained dates; from/to still define the activity chart window. */
  allTime?: boolean;
  /** Offset into filtered execution details; summaries cover the selected date/template/user cohort. */
  offset?: number;
  /** Sort all matching details before pagination. Defaults to createdAt descending. */
  sortBy?: ExecutionSortField;
  /** Missing values sort last; equal values use task ID descending for stable pagination. */
  sortDirection?: ExecutionSortDirection;
};

/** Metrics for the selected date/template/user cohort, independent of execution search and status. @public */
export type ExecutionMetrics = {
  total: number;
  completed: number;
  failed: number;
  cancelled: number;
  active: number;
  users: number;
  templates: number;
  /** Completed / (completed + failed); excludes active and cancelled tasks. */
  successRate?: number;
  /** Successful runs with retained completion events, including queue time. */
  averageMs?: number;
  p95Ms?: number;
  timedCompleted: number;
};

/** @public */
export type ExecutionRollup = ExecutionMetrics & {
  id: string;
  name: string;
  lastRun: string;
};

/** @public */
export type DailyActivity = {
  date: string;
  completed: number;
  failed: number;
  other: number;
  total: number;
};

/** Permission-aware analytics over retained execution history. @public */
export type ExecutionAnalytics = {
  /** Execution details matching search and status within the analytics cohort. */
  items: Execution[];
  scope: ExecutionScope;
  summary: ExecutionMetrics;
  templates: ExecutionRollup[];
  users: ExecutionRollup[];
  activity: DailyActivity[];
  facets: { templates: { id: string; name: string }[]; users: string[] };
  /** Pagination and total for filtered execution details, independent of summary.total. */
  page: { offset: number; limit: number; total: number; hasMore: boolean };
  window: {
    historySource?: 'database' | 'service';
    limit: number;
    scanned: number;
    sourceTotal?: number;
    truncated: boolean;
    oldestAt?: string;
    generatedAt: string;
  };
};

/** @public */
export type ExecutionAccess = {
  canReadOwn: boolean;
  canReadAll: boolean;
  canSearchHistory?: boolean;
};
