import type {
  AuthService,
  BackstageCredentials,
  DiscoveryService,
} from '@backstage/backend-plugin-api';
import {
  NotAllowedError,
  NotFoundError,
  ResponseError,
} from '@backstage/errors';
import type {
  ExecutionAnalytics,
  ExecutionQuery,
} from '@template-pulse/plugin-common';

/** The authenticated HTTP interface to the Scaffolder history module. @public */
export interface ExecutionHistory {
  search(
    query: ExecutionQuery,
    credentials: BackstageCredentials,
    limit: number,
  ): Promise<ExecutionAnalytics>;
}

/** Calls the Scaffolder module on behalf of the current user. @public */
export class HistoryClient implements ExecutionHistory {
  constructor(
    private readonly options: {
      auth: AuthService;
      discovery: DiscoveryService;
    },
  ) {}

  async search(
    query: ExecutionQuery,
    credentials: BackstageCredentials,
    limit: number,
  ): Promise<ExecutionAnalytics> {
    const baseUrl = await this.options.discovery.getBaseUrl('scaffolder');
    const params = new URLSearchParams({ limit: String(limit) });
    for (const [key, value] of Object.entries(query))
      if (value !== undefined) params.set(key, String(value));
    const { token } = await this.options.auth.getPluginRequestToken({
      onBehalfOf: credentials,
      targetPluginId: 'scaffolder',
    });
    const response = await fetch(
      `${baseUrl}/modules/template-pulse/analytics?${params}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (response.status === 404)
      throw new NotFoundError(
        'Database history requires @template-pulse/plugin-scaffolder-backend-module-template-pulse in the Scaffolder backend.',
      );
    if (response.status === 403)
      throw new NotAllowedError('Scaffolder history access denied');
    if (!response.ok) throw await ResponseError.fromResponse(response);
    return response.json();
  }
}
