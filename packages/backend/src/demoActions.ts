import { createBackendModule } from '@backstage/backend-plugin-api';
import {
  createTemplateAction,
  scaffolderActionsExtensionPoint,
} from '@backstage/plugin-scaffolder-node';
import { setTimeout as delay } from 'node:timers/promises';

export const demoActions = createBackendModule({
  pluginId: 'scaffolder',
  moduleId: 'execution-demo-actions',
  register(reg) {
    reg.registerInit({
      deps: { actions: scaffolderActionsExtensionPoint },
      async init({ actions }) {
        actions.addActions(
          createTemplateAction({
            id: 'platform:bootstrap',
            description:
              'Creates a local execution with a chosen duration and outcome.',
            supportsDryRun: true,
            schema: {
              input: {
                seconds: z => z.number().int().min(1).max(60).default(3),
                outcome: z => z.enum(['success', 'failure']).default('success'),
              },
            },
            async handler(ctx) {
              ctx.logger.info(`Running for ${ctx.input.seconds} seconds`);
              await delay(ctx.input.seconds * 1000, undefined, {
                signal: ctx.signal,
              });
              if (ctx.input.outcome === 'failure')
                throw new Error('Project initialization failed');
              ctx.logger.info('Project initialization completed');
            },
          }),
        );
      },
    });
  },
});
