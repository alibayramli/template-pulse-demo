import { useEffect, useState } from 'react';
import {
  ApiBlueprint,
  appThemeApiRef,
  coreExtensionData,
  createExtension,
  createExtensionInput,
  createFrontendModule,
  useApi,
} from '@backstage/frontend-plugin-api';
import { ButtonIcon, Tooltip, TooltipTrigger } from '@backstage/ui';
import templatePulse, {
  executionsApiRef,
  TemplatePulseIcon,
} from '@abayramli/backstage-plugin-template-pulse';
import { DemoExecutionsApi } from './demoApi';
import './staticDemo.css';

function ThemeToggle() {
  const appThemeApi = useApi(appThemeApiRef);
  const [themeId, setThemeId] = useState(appThemeApi.getActiveThemeId());
  const [prefersDark, setPrefersDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const subscription = appThemeApi.activeThemeId$().subscribe(setThemeId);
    return () => subscription.unsubscribe();
  }, [appThemeApi]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) =>
      setPrefersDark(event.matches);
    mediaQuery.addEventListener('change', onChange);
    return () => mediaQuery.removeEventListener('change', onChange);
  }, []);

  const isDark =
    appThemeApi.getInstalledThemes().find(theme => theme.id === themeId)
      ?.variant === 'dark' ||
    (themeId === undefined && prefersDark);
  const nextTheme = isDark ? 'light' : 'dark';
  const label = `Switch to ${nextTheme} theme`;

  return (
    <TooltipTrigger delay={200}>
      <ButtonIcon
        className="static-demo-theme-toggle"
        size="small"
        variant="tertiary"
        aria-label={label}
        onPress={() => appThemeApi.setActiveThemeId(nextTheme)}
        icon={
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            {isDark ? (
              <>
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
              </>
            ) : (
              <path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z" />
            )}
          </svg>
        }
      />
      <Tooltip>{label}</Tooltip>
    </TooltipTrigger>
  );
}

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
            <div className="static-demo-banner">
              <div className="static-demo-banner-copy" role="note">
                <span className="static-demo-badge">Interactive demo</span>
                <span>
                  Explore 350 sample executions across 50 templates and 100
                  fictional users. Runs are simulated and read only.
                </span>
              </div>
              <ThemeToggle />
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
