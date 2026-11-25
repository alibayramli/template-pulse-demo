import { useEffect, useState, type ReactNode } from 'react';
import {
  ApiBlueprint,
  appThemeApiRef,
  configApiRef,
  coreExtensionData,
  createExtension,
  createExtensionInput,
  createFrontendModule,
  useApi,
} from '@backstage/frontend-plugin-api';
import { ThemeBlueprint } from '@backstage/plugin-app-react';
import {
  Button,
  ButtonIcon,
  DialogTrigger,
  Link,
  Popover,
  Text,
  Tooltip,
  TooltipTrigger,
} from '@backstage/ui';
import templatePulse, {
  executionsApiRef,
  TemplatePulseIcon,
} from '@abayramli/backstage-plugin-template-pulse';
import { DemoExecutionsApi } from './demoApi';
import './staticDemo.css';

function useDemoTheme() {
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
  return { appThemeApi, isDark };
}

function DemoThemeProvider({ children }: { children: ReactNode }) {
  const { isDark } = useDemoTheme();
  useEffect(() => {
    document.body.setAttribute('data-theme-mode', isDark ? 'dark' : 'light');
    return () => document.body.removeAttribute('data-theme-mode');
  }, [isDark]);
  return <>{children}</>;
}

function ThemeToggle() {
  const { appThemeApi, isDark } = useDemoTheme();
  const nextTheme = isDark ? 'light' : 'dark';
  const label = `Switch to ${nextTheme} theme`;

  return (
    <TooltipTrigger delay={200}>
      <ButtonIcon
        size="small"
        variant="tertiary"
        aria-label={label}
        onPress={() => appThemeApi.setActiveThemeId(nextTheme)}
        icon={
          <svg
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

function WalkthroughLink() {
  const baseUrl = useApi(configApiRef).getString('app.baseUrl');

  return (
    <Link
      className="static-demo-banner-link"
      href={`${baseUrl.replace(/\/$/, '')}/template-pulse-demo.mp4`}
      target="_blank"
      rel="noopener noreferrer"
      variant="body-small"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 5v14l11-7z" fill="currentColor" />
      </svg>
      Watch walkthrough
    </Link>
  );
}

function SampleDataInfo() {
  return (
    <DialogTrigger>
      <Button
        className="static-demo-sample-data"
        size="small"
        variant="tertiary"
        iconEnd={<span aria-hidden="true">ⓘ</span>}
      >
        Sample data
      </Button>
      <Popover
        className="static-demo-data-popover"
        placement="bottom start"
        aria-label="About the sample data"
      >
        <Text variant="body-small">
          Explore 350 simulated runs across 50 templates and 100 fictional
          users. The demo is read only.
        </Text>
      </Popover>
    </DialogTrigger>
  );
}

export const staticDemoLayout = createFrontendModule({
  pluginId: 'app',
  extensions: [
    ...(['light', 'dark'] as const).map(variant =>
      ThemeBlueprint.make({
        name: variant,
        params: {
          theme: {
            id: variant,
            title: variant === 'dark' ? 'Dark Theme' : 'Light Theme',
            variant,
            Provider: DemoThemeProvider,
          },
        },
      }),
    ),
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
              <div className="static-demo-banner-context">
                <span className="static-demo-badge">Interactive demo</span>
                <SampleDataInfo />
              </div>
              <div className="static-demo-banner-actions">
                <WalkthroughLink />
                <Link
                  className="static-demo-banner-link"
                  href="https://github.com/alibayramli/template-pulse"
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="body-small"
                  aria-label="View plugin on GitHub"
                >
                  GitHub
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M13 5h6v6m0-6-8 8m6 0v6H5V7h6" />
                  </svg>
                </Link>
                <ThemeToggle />
              </div>
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
