import type {
  AuthService,
  BackstageCredentials,
  DiscoveryService,
} from '@backstage/backend-plugin-api';
import { CatalogClient } from '@backstage/catalog-client';
import { RELATION_HAS_MEMBER } from '@backstage/catalog-model';
import { InputError } from '@backstage/errors';

/** Resolve current direct group members on behalf of the caller. @public */
export class TeamMembersClient {
  constructor(
    private readonly options: {
      auth: AuthService;
      discovery: DiscoveryService;
    },
  ) {}

  async getMembers(teamRef: string, credentials: BackstageCredentials) {
    const catalog = new CatalogClient({
      discoveryApi: this.options.discovery,
      fetchApi: {
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(30_000) }),
      },
    });
    const { token } = await this.options.auth.getPluginRequestToken({
      onBehalfOf: credentials,
      targetPluginId: 'catalog',
    });
    const group = await catalog.getEntityByRef(teamRef, { token });
    if (!group)
      throw new InputError('The selected team no longer exists in the catalog.');
    return [
      ...new Set(
        (group.relations ?? [])
          .filter(relation => relation.type === RELATION_HAS_MEMBER)
          .map(relation => relation.targetRef.toLowerCase())
          .filter(ref => ref.startsWith('user:')),
      ),
    ];
  }
}
