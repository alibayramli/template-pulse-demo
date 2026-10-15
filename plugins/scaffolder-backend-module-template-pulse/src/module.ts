import {
  coreServices,
  createBackendModule,
} from '@backstage/backend-plugin-api';
import { DatabaseHistoryStore } from './historyStore';
import { createRouter } from './router';

/** Retained execution analytics hosted inside the Scaffolder plugin. @public */
export const scaffolderModuleTemplatePulse = createBackendModule({
  pluginId: 'scaffolder',
  moduleId: 'template-pulse',
  register(env) {
    env.registerInit({
      deps: {
        database: coreServices.database,
        httpRouter: coreServices.httpRouter,
        httpAuth: coreServices.httpAuth,
        permissions: coreServices.permissions,
        config: coreServices.rootConfig,
        lifecycle: coreServices.lifecycle,
      },
      async init({ database, httpRouter, config, lifecycle, ...services }) {
        if (config.getOptionalBoolean('permission.enabled') !== true)
          throw new Error(
            'Template Pulse history requires permission.enabled: true and an administrator permission policy.',
          );
        // Modules receive their target plugin's database. The database service
        // owns the pool and lifecycle; do not create or destroy a second pool.
        const historyStore = new DatabaseHistoryStore(
          () => database.getClient(),
          config.getOptionalNumber('templatePulse.maxHistoryRows') ?? 10_000,
        );
        if (
          config.getOptionalString('templatePulse.historySource') === 'database'
        ) {
          // Module init runs before the plugin. Validate only after Scaffolder
          // has initialized and migrated its database, never before its tables exist.
          lifecycle.addStartupHook(() => historyStore.initialize());
        }
        httpRouter.use(createRouter({ ...services, historyStore }));
      },
    });
  },
});
