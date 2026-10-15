import { Alert } from '@backstage/ui';
import type { ExecutionAnalytics } from '@abayramli/backstage-plugin-template-pulse-common';

export function HistoryCoverage({
  window,
}: {
  window: ExecutionAnalytics['window'];
}) {
  if (!window.truncated) return null;

  return (
    <Alert
      status="warning"
      title="Older runs are excluded"
      description="Totals and rates may be incomplete."
    />
  );
}
