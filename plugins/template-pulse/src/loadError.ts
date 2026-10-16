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
  executions: 'Could not load runs',
  pagination: 'Could not load more runs',
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
      'Database history is not set up',
      'Ask your administrator to install the database history module and restart Scaffolder, or switch to recent run history.',
    );

  if (
    /does not support this task permission condition|Unsupported Scaffolder task permission decision/i.test(
      message,
    )
  )
    return guidance(
      'These history permissions are not supported',
      'Ask your administrator to check the Scaffolder task permissions or use recent run history for custom task rules.',
    );

  if (/Too many history filter choices/i.test(message))
    return guidance(
      'Too many filter options',
      'Choose a user to narrow the results. If this still fails, ask your administrator to check the history limit.',
    );

  if (/Too many analytics groups/i.test(message))
    return guidance(
      'Too many templates or users to summarize',
      'Choose a shorter date range or filter by template or user. If you need all history, ask your administrator to check the history limit.',
    );

  if (status === 413 || status === 414)
    return guidance(
      'Search is too large',
      'Use fewer search characters, a shorter date range, or a specific template or user. Then try again.',
    );

  if (/require the database history source/i.test(message))
    return guidance(
      'This search needs database history',
      'Choose a date range, such as the last 30 days. Ask your administrator to enable database history to search older runs or load more results.',
    );

  if (status === 401 || error?.name === 'AuthenticationError')
    return guidance(
      'Sign in again',
      'Sign in to Backstage, then refresh the page. Your filters will stay the same.',
    );

  if (status === 403 || error?.name === 'NotAllowedError')
    return guidance(
      'You do not have access to these runs',
      'Ask your administrator for access to your runs or runs across the organization.',
    );

  if (status === 400 || error?.name === 'InputError')
    return guidance(
      'Check your filters',
      'Reset the filters, or choose a date range of 1–366 days and a search of up to 200 characters.',
    );

  if (status === 404)
    return guidance(
      'Template Pulse is unavailable',
      'Ask your administrator to check that the Template Pulse backend is installed and reachable.',
    );

  if (status === 429)
    return guidance(
      'Too many requests',
      'Wait a moment, then try again. Your filters will stay the same.',
      true,
    );

  return guidance(
    titles[target],
    'Check your connection and try again. If it still fails, ask your administrator to check the Template Pulse and Scaffolder logs. Your filters will stay the same.',
    true,
  );
}
