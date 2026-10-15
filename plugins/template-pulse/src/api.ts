import { createApiRef } from '@backstage/frontend-plugin-api';
import type { DiscoveryApi, FetchApi } from '@backstage/frontend-plugin-api';
import { ResponseError } from '@backstage/errors';
import { CatalogClient } from '@backstage/catalog-client';
import type { UserEntity } from '@backstage/catalog-model';
import type {
  ExecutionAccess,
  ExecutionAnalytics,
  ExecutionQuery,
} from '@abayramli/backstage-plugin-template-pulse-common';

/** @public */
export interface ExecutionsApi {
  getAccess(signal?: AbortSignal): Promise<ExecutionAccess>;
  getAnalytics(
    query: ExecutionQuery,
    signal?: AbortSignal,
  ): Promise<ExecutionAnalytics>;
  /** Optional catalog labels; retained users without catalog entries keep their references. */
  getUserNames?(
    refs: string[],
    signal?: AbortSignal,
  ): Promise<Record<string, string>>;
}

/** @public */
export const executionsApiRef = createApiRef<ExecutionsApi>().with({
  id: 'plugin.template-pulse.api',
});

/** @public */
export class ExecutionsClient implements ExecutionsApi {
  constructor(
    private readonly options: {
      discoveryApi: DiscoveryApi;
      fetchApi: FetchApi;
    },
  ) {}

  getAccess(signal?: AbortSignal) {
    return this.get<ExecutionAccess>('/permissions', signal);
  }

  getAnalytics(query: ExecutionQuery, signal?: AbortSignal) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query))
      if (value !== undefined && value !== '' && value !== false)
        params.set(key, String(value));
    return this.get<ExecutionAnalytics>(`/analytics?${params}`, signal);
  }

  async getUserNames(refs: string[], signal?: AbortSignal) {
    const catalog = new CatalogClient({
      discoveryApi: this.options.discoveryApi,
      fetchApi: {
        fetch: (input, init) =>
          this.options.fetchApi.fetch(input, { ...init, signal }),
      },
    });
    const { items } = await catalog.getEntitiesByRefs({
      entityRefs: refs,
      fields: ['kind', 'metadata', 'spec.profile.displayName'],
    });
    const names: Record<string, string> = {};
    items.forEach((entity, index) => {
      if (entity?.kind.toLowerCase() !== 'user') return;
      const displayName = (entity as UserEntity).spec?.profile?.displayName;
      const name = displayName?.trim() || entity.metadata.title?.trim();
      if (name) names[refs[index]] = name;
    });
    return names;
  }

  private async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    const baseUrl = await this.options.discoveryApi.getBaseUrl(
      'template-pulse',
    );
    const response = await this.options.fetchApi.fetch(`${baseUrl}${path}`, {
      signal,
    });
    if (!response.ok) throw await ResponseError.fromResponse(response);
    return response.json();
  }
}
