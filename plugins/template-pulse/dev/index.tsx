import { createDevApp } from '@backstage/frontend-dev-utils';
import templatePulsePlugin from '../src';

createDevApp({ features: [templatePulsePlugin] });
