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
      description={`History is limited to the latest ${window.limit} ${
        window.limit === 1 ? 'run' : 'runs'
      }. Totals and rates may be incomplete. Ask your administrator to enable full history.`}
    />
  );
}
