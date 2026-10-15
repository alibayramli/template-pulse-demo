import { parseDate, today, type CalendarDate } from '@internationalized/date';
import {
  executionStatusLabel,
  executionStatusLabels,
  type ExecutionAccess,
  type ExecutionScope,
} from '@abayramli/backstage-plugin-template-pulse-common';

export const statusOptions = [
  { id: 'any', label: 'All statuses' },
  ...Object.entries(executionStatusLabels).map(([id, label]) => ({
    id,
    label,
  })),
];

export function statusLabel(status: string) {
  return executionStatusLabel(status);
}

export type DashboardSelection = {
  scope: ExecutionScope;
  range: { start: CalendarDate; end: CalendarDate };
  allHistory: boolean;
  template: string;
  user: string;
  /** Execution list filters; preserved across tabs without changing analytics. */
  status: string;
  search: string;
  view: 'templates' | 'users' | 'runs';
};

export function recentRange(days: number, end = today('UTC')) {
  return { start: end.subtract({ days: days - 1 }), end };
}

// The URL is the single source of truth, including browser Back/Forward.
export function readSelection(
  params: URLSearchParams,
  access?: ExecutionAccess,
  currentDate = today('UTC'),
): DashboardSelection {
  const scope =
    access?.canReadAll && (params.get('scope') !== 'mine' || !access.canReadOwn)
      ? 'all'
      : 'mine';
  let range = recentRange(30, currentDate);
  const from = params.get('from');
  const to = params.get('to');
  if (
    from &&
    to &&
    /^\d{4}-\d{2}-\d{2}$/.test(from) &&
    /^\d{4}-\d{2}-\d{2}$/.test(to)
  ) {
    try {
      const start = parseDate(from);
      const end = parseDate(to);
      if (
        start.compare(end) <= 0 &&
        start.add({ days: 365 }).compare(end) >= 0 &&
        end.compare(currentDate) <= 0
      )
        range = { start, end };
    } catch {
      // An old or edited link can always recover to the default date range.
    }
  }
  const value = (key: string, fallback: string, length = 255) => {
    const input = params.get(key);
    return input && input.length <= length ? input : fallback;
  };
  const view = params.get('view');
  const status = params.get('status');
  return {
    scope,
    range,
    allHistory: Boolean(
      access?.canSearchHistory && params.get('allTime') === 'true',
    ),
    template: value('template', 'any'),
    user: scope === 'all' ? value('user', 'any') : 'any',
    status: statusOptions.some(option => option.id === status)
      ? status!
      : 'any',
    search: value('q', '', 200),
    view:
      view === 'runs' || (view === 'users' && scope === 'all')
        ? view
        : 'templates',
  };
}

export function writeSelection(
  params: URLSearchParams,
  selection: DashboardSelection,
) {
  const next = new URLSearchParams(params);
  for (const key of [
    'scope',
    'from',
    'to',
    'allTime',
    'template',
    'user',
    'status',
    'q',
    'view',
  ])
    next.delete(key);
  next.set('scope', selection.scope);
  next.set('from', selection.range.start.toString());
  next.set('to', selection.range.end.toString());
  if (selection.allHistory) next.set('allTime', 'true');
  if (selection.template !== 'any') next.set('template', selection.template);
  if (selection.scope === 'all' && selection.user !== 'any')
    next.set('user', selection.user);
  if (selection.status !== 'any') next.set('status', selection.status);
  if (selection.search) next.set('q', selection.search);
  if (
    selection.view !== 'templates' &&
    (selection.view !== 'users' || selection.scope === 'all')
  )
    next.set('view', selection.view);
  return next;
}
