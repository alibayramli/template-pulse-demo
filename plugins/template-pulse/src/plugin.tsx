import {
  ApiBlueprint,
  PageBlueprint,
  createFrontendPlugin,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/frontend-plugin-api';
import { executionsApiRef, ExecutionsClient } from './api';
import { TemplatePulseIcon } from './TemplatePulseIcon';
import { rootRouteRef, taskRouteRef, entityRouteRef } from './routes';

const executionsApi = ApiBlueprint.make({
  params: defineParams =>
    defineParams({
      api: executionsApiRef,
      deps: { discoveryApi: discoveryApiRef, fetchApi: fetchApiRef },
      factory: options => new ExecutionsClient(options),
    }),
});

const executionsPage = PageBlueprint.make({
  params: {
    path: '/template-pulse',
    routeRef: rootRouteRef,
    title: 'Template Pulse',
    icon: <TemplatePulseIcon />,
    loader: () =>
      import('./TemplatePulsePage').then(m => <m.TemplatePulsePage />),
  },
});

/** A native new-frontend-system plugin, including its page and API factory. @public */
export const templatePulsePlugin = createFrontendPlugin({
  pluginId: 'template-pulse',
  title: 'Template Pulse',
  icon: <TemplatePulseIcon />,
  routes: { root: rootRouteRef },
  externalRoutes: { task: taskRouteRef, entity: entityRouteRef },
  extensions: [executionsApi, executionsPage],
});
