import type { SortDescriptor } from '@backstage/ui';

export function sortRows<T extends { id: string }>(
  rows: T[],
  sort: SortDescriptor,
): T[] {
  const direction = sort.direction === 'ascending' ? 1 : -1;
  const field = String(sort.column) as keyof T;
  return [...rows].sort((a, b) => {
    const left = a[field];
    const right = b[field];
    if (left === undefined) return right === undefined ? 0 : 1;
    if (right === undefined) return -1;
    const comparison =
      typeof left === 'number' && typeof right === 'number'
        ? left - right
        : String(left).localeCompare(String(right));
    return comparison * direction || a.id.localeCompare(b.id);
  });
}

export function formatDuration(ms?: number) {
  if (ms === undefined) return '—';
  const seconds = Math.round(ms / 1000);
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function formatRate(rate?: number) {
  return rate === undefined ? '—' : `${Math.round(rate)}%`;
}

export function formatDate(date: string) {
  return new Date(date).toLocaleString(undefined, {
    timeZone: 'UTC',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
