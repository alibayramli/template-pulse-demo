import {
  createFrontendModule,
  PageBlueprint,
} from '@backstage/frontend-plugin-api';
import { Navigate } from 'react-router-dom';

export const demoLanding = createFrontendModule({
  pluginId: 'app',
  extensions: [
    PageBlueprint.make({
      name: 'demo-landing',
      params: {
        path: '/',
        noHeader: true,
        loader: async () => <Navigate to="/template-pulse" replace />,
      },
    }),
  ],
});
