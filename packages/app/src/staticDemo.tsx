import {
  ApiBlueprint,
  coreExtensionData,
  createExtension,
  createExtensionInput,
  createFrontendModule,
} from '@backstage/frontend-plugin-api';
import templatePulse, {
  executionsApiRef,
  TemplatePulseIcon,
} from '@abayramli/backstage-plugin-template-pulse';
import { DemoExecutionsApi } from './demoApi';
import './staticDemo.css';

export const staticDemoApi = createFrontendModule({
  pluginId: 'template-pulse',
  extensions: [
    ApiBlueprint.make({
      params: define =>
        define({
          api: executionsApiRef,
          deps: {},
          factory: () => new DemoExecutionsApi(),
        }),
    }),
    templatePulse.getExtension('page:template-pulse').override({
      params: { noHeader: true },
    }),
  ],
});

export const staticDemoLayout = createFrontendModule({
  pluginId: 'app',
  extensions: [
    createExtension({
      name: 'layout',
      attachTo: { id: 'app/root', input: 'children' },
      inputs: {
        // Keep app/nav attached so the default app tree remains valid.
        nav: createExtensionInput([coreExtensionData.reactElement], {
          singleton: true,
        }),
        content: createExtensionInput([coreExtensionData.reactElement], {
          singleton: true,
        }),
      },
      output: [coreExtensionData.reactElement],
      factory: ({ inputs }) => [
        coreExtensionData.reactElement(
          <div className="static-demo">
            <div className="static-demo-banner" role="note">
              <span className="static-demo-badge">Interactive demo</span>
              <span>
                Explore 350 sample executions across 50 templates and 100
                fictional users. Runs are simulated and read only.
              </span>
            </div>
            <header className="static-demo-header">
              <span className="static-demo-logo">
                <TemplatePulseIcon />
              </span>
              <div>
                <h1>Template Pulse</h1>
                <p>
                  Template health, adoption, and execution analytics for
                  Backstage.
                </p>
              </div>
            </header>
            <main>{inputs.content.get(coreExtensionData.reactElement)}</main>
          </div>,
        ),
      ],
    }),
  ],
});
