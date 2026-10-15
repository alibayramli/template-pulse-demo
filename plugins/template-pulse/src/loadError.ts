import { ResponseError } from '@backstage/errors';

type LoadTarget = 'access' | 'analytics' | 'executions' | 'pagination';

export type LoadError = {
  target: LoadTarget;
  title: string;
  description: string;
  retryable: boolean;
};

const titles: Record<LoadTarget, string> = {
  access: 'Could not check access',
  analytics: 'Could not load this view',
  executions: 'Could not load executions',
  pagination: 'Could not load more executions',
};

export function getLoadError(cause: unknown, target: LoadTarget): LoadError {
  const response = cause instanceof ResponseError ? cause : undefined;
  const error = response?.cause ?? (cause instanceof Error ? cause : undefined);
  const message = error?.message ?? '';
  const status = response?.statusCode;
  const guidance = (title: string, description: string, retryable = false) => ({
    target,
    title,
    description,
    retryable,
  });

  if (
    /Database history requires .*scaffolder-backend-module-template-pulse/i.test(
      message,
    )
  )
    return guidance(
      'Database history module is missing',
      'Ask your administrator to install @abayramli/backstage-plugin-scaffolder-backend-module-template-pulse in the Scaffolder backend and restart it, or use the service history source.',
    );

  if (
    /does not support this task permission condition|Unsupported Scaffolder task permission decision/i.test(
      message,
    )
  )
    return guidance(
      'History permission rules are unsupported',
      'Ask your administrator to use the service history source for custom Scaffolder task rules, or use task permissions supported by database history (IS_TASK_OWNER).',
    );

  if (/Too many history filter choices/i.test(message))
    return guidance(
      'Too many history filter choices',
      'Select a specific user to reduce filter choices. If this still fails, ask your administrator to review templatePulse.maxHistoryRows.',
    );

  if (/Too many analytics groups/i.test(message))
    return guidance(
      'Query covers too many analytics groups',
      'Choose a shorter date range or a specific template or user. If all history is required, ask your administrator to review templatePulse.maxHistoryRows.',
    );

  if (status === 413 || status === 414)
    return guidance(
      'Query is too large',
      'Shorten the execution search and choose a smaller date range or a specific template or user, then reload this view.',
    );

  if (/require the database history source/i.test(message))
    return guidance(
      'This search requires database history',
      'Choose a date range such as the last 30 days. Ask your administrator to enable the database history module for all-history search and additional pages.',
    );

  if (status === 401 || error?.name === 'AuthenticationError')
    return guidance(
      'Sign-in required',
      'Sign in to Backstage again, then refresh this page. Your filters are saved in the URL.',
    );

  if (status === 403 || error?.name === 'NotAllowedError')
    return guidance(
      'History access denied',
      'Ask your administrator to check template-pulse.read (your history), template-pulse.read-all (organization history), and scaffolder.task.read. Changing filters cannot grant access.',
    );

  if (status === 400 || error?.name === 'InputError')
    return guidance(
      'These filters could not be used',
      'Reset the dashboard and execution filters, or choose a date range of 1–366 days and a search of at most 200 characters.',
    );

  if (status === 404)
    return guidance(
      'Template Pulse backend is unavailable',
      'Ask your administrator to check that the Template Pulse backend plugin is installed and its route is reachable.',
    );

  if (status === 429)
    return guidance(
      'Too many requests',
      'Wait a moment, then refresh or reload this view. Your filters are saved in the URL.',
      true,
    );

  return guidance(
    titles[target],
    'The request failed temporarily. Check your connection, wait a moment, then refresh or reload this view. If it keeps failing, ask your administrator to check the Template Pulse and Scaffolder backend logs. Your filters are saved in the URL.',
    true,
  );
}
