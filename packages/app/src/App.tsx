import { createApp } from '@backstage/frontend-defaults';
import { createFrontendFeatureLoader } from '@backstage/frontend-plugin-api';
import templatePulse from '@template-pulse/plugin';

export default createApp({
  features: [
    templatePulse,
    createFrontendFeatureLoader({
      async loader({ config }) {
        if (config.getOptionalBoolean('app.staticDemo')) {
          const { staticDemoApi, staticDemoLayout } = await import(
            './staticDemo'
          );
          return [staticDemoApi, staticDemoLayout];
        }
        const [{ default: catalogPlugin }, { demoLanding }] = await Promise.all(
          [import('@backstage/plugin-catalog/alpha'), import('./demoLanding')],
        );
        return [catalogPlugin, demoLanding];
      },
    }),
  ],
});
