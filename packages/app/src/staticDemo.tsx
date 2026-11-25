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

function BannerLink({
  href,
  label,
  accessibleLabel = label,
  children,
}: {
  href: string;
  label: string;
  accessibleLabel?: string;
  children: ReactNode;
}) {
  return (
    <TooltipTrigger delay={200}>
      <Link
        className="static-demo-banner-link"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        variant="body-small"
        aria-label={accessibleLabel}
      >
        {children}
        <span className="static-demo-banner-label">{label}</span>
      </Link>
      <Tooltip placement="bottom">{accessibleLabel}</Tooltip>
    </TooltipTrigger>
  );
}

function WalkthroughLink() {
  const baseUrl = useApi(configApiRef).getString('app.baseUrl');

  return (
    <BannerLink
      href={`${baseUrl.replace(/\/$/, '')}/template-pulse-demo.mp4`}
      label="Watch walkthrough"
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
        <path d="M10 8v8l6-4z" fill="currentColor" />
      </svg>
    </BannerLink>
  );
}

function SampleDataInfo() {
  return (
    <DialogTrigger>
      <Button
        className="static-demo-sample-data"
        size="small"
        variant="tertiary"
        aria-label="Sample data"
      >
        <span className="static-demo-banner-label">Sample data</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 11v5m0-8h.01" />
        </svg>
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
                <BannerLink
                  href="https://github.com/alibayramli/template-pulse"
                  label="GitHub"
                  accessibleLabel="View plugin on GitHub"
                >
                  <svg
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
                  </svg>
                </BannerLink>
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
