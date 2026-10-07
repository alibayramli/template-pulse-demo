import { createApp } from '@backstage/frontend-defaults';
import catalogPlugin from '@backstage/plugin-catalog/alpha';
import templatePulse from '@template-pulse/plugin';
import { demoLanding } from './demoLanding';

export default createApp({
  features: [catalogPlugin, templatePulse, demoLanding],
});
