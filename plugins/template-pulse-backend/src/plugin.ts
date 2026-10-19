import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { scaffolderServiceRef } from '@backstage/plugin-scaffolder-node';
import { executionsPermissions } from '@abayramli/backstage-plugin-template-pulse-common';
import {
  HistoryClient,
  TeamMembersClient,
} from '@abayramli/backstage-plugin-template-pulse-node';
import { createRouter } from './router';

/** Permission-aware template analytics for the new backend system. @public */
export const templatePulsePlugin = createBackendPlugin({
  pluginId: 'template-pulse',
  register(env) {
    env.registerInit({
      deps: {
        httpRouter: coreServices.httpRouter,
        httpAuth: coreServices.httpAuth,
        permissions: coreServices.permissions,
        permissionsRegistry: coreServices.permissionsRegistry,
        config: coreServices.rootConfig,
        cache: coreServices.cache,
        logger: coreServices.logger,
        auth: coreServices.auth,
        discovery: coreServices.discovery,
        scaffolder: scaffolderServiceRef,
      },
      async init({
        httpRouter,
        permissionsRegistry,
        config,
        auth,
        discovery,
        ...services
      }) {
        // A disabled permission backend grants basic permissions automatically.
        // Require it explicitly so the administrator scope cannot become public.
        if (config.getOptionalBoolean('permission.enabled') !== true) {
          throw new Error(
            'Template Pulse requires permission.enabled: true and an administrator permission policy.',
          );
        }
        const maxTasks =
          config.getOptionalNumber('templatePulse.maxTasks') ?? 200;
        if (!Number.isInteger(maxTasks) || maxTasks < 1 || maxTasks > 1000) {
          throw new Error(
            'templatePulse.maxTasks must be an integer between 1 and 1000.',
          );
        }
        permissionsRegistry.addPermissions(executionsPermissions);
        const historySource =
          config.getOptionalString('templatePulse.historySource') ?? 'service';
        if (!['database', 'service'].includes(historySource))
          throw new Error(
            'templatePulse.historySource must be database or service.',
          );
        const history =
          historySource === 'database'
            ? new HistoryClient({ auth, discovery })
            : undefined;
        const teams = new TeamMembersClient({ auth, discovery });
        httpRouter.use(createRouter({ ...services, maxTasks, history, teams }));
      },
    });
  },
});
