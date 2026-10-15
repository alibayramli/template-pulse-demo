import { createBackend } from '@backstage/backend-defaults';
import { demoActions } from './demoActions';
import { demoPolicy } from './demoPolicy';

const backend = createBackend();
backend.add(import('@backstage/plugin-app-backend'));
backend.add(import('@backstage/plugin-auth-backend'));
backend.add(import('@backstage/plugin-auth-backend-module-guest-provider'));
backend.add(import('@backstage/plugin-catalog-backend'));
backend.add(
  import('@backstage/plugin-catalog-backend-module-scaffolder-entity-model'),
);
backend.add(import('@backstage/plugin-catalog-backend-module-logs'));
backend.add(import('@backstage/plugin-scaffolder-backend'));
backend.add(import('@backstage/plugin-permission-backend'));
backend.add(import('@backstage/plugin-user-settings-backend'));
backend.add(import('@backstage/plugin-signals-backend'));
backend.add(import('@abayramli/backstage-plugin-template-pulse-backend'));
backend.add(
  import('@abayramli/backstage-plugin-scaffolder-backend-module-template-pulse'),
);
backend.add(demoActions);
backend.add(demoPolicy);
backend.start();
