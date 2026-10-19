import type {
  AuthService,
  BackstageCredentials,
  DiscoveryService,
} from '@backstage/backend-plugin-api';
import { ResponseError } from '@backstage/errors';
import type {
  LogEvent,
  ScaffolderTask,
} from '@backstage/plugin-scaffolder-common';

// Use the public task endpoints without pulling in Scaffolder's action utilities.
export class ScaffolderTasksClient {
  constructor(
    private readonly options: {
      auth: AuthService;
      discovery: DiscoveryService;
    },
  ) {}

  async listTasks(
    request: { createdBy?: string; limit?: number; offset?: number },
    options: { credentials: BackstageCredentials },
  ): Promise<{ items: ScaffolderTask[]; totalItems?: number }> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(request)) {
      if (value !== undefined) params.set(key, String(value));
    }
    const response = await this.get(`/v2/tasks?${params}`, options.credentials);
    const body = await response.json();
    return { items: body.tasks, totalItems: body.totalTasks };
  }

  async getLogs(
    request: { taskId: string },
    options: { credentials: BackstageCredentials },
  ): Promise<LogEvent[]> {
    const response = await this.get(
      `/v2/tasks/${encodeURIComponent(request.taskId)}/events`,
      options.credentials,
    );
    return response.json();
  }

  private async get(endpoint: string, credentials: BackstageCredentials) {
    const baseUrl = await this.options.discovery.getBaseUrl('scaffolder');
    const { token } = await this.options.auth.getPluginRequestToken({
      onBehalfOf: credentials,
      targetPluginId: 'scaffolder',
    });
    const response = await fetch(`${baseUrl}${endpoint}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw await ResponseError.fromResponse(response);
    return response;
  }
}
