import {
  createExternalRouteRef,
  createRouteRef,
} from '@backstage/frontend-plugin-api';

export const rootRouteRef = createRouteRef();

export const taskRouteRef = createExternalRouteRef({
  params: ['taskId'],
  defaultTarget: 'scaffolder.ongoingTask',
});

export const entityRouteRef = createExternalRouteRef({
  params: ['namespace', 'kind', 'name'],
  defaultTarget: 'catalog.catalogEntity',
});
