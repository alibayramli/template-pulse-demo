import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApi } from '@backstage/frontend-plugin-api';
import {
  Alert,
  ButtonIcon,
  Container,
  Flex,
  Text,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  TooltipTrigger,
} from '@backstage/ui';
import type { ExecutionAccess } from '@abayramli/backstage-plugin-template-pulse-common';
import { executionsApiRef } from './api';
import { AnalyticsDashboard } from './AnalyticsDashboard';
import {
  readSelection,
  writeSelection,
  type ChangeSelection,
} from './dashboardState';
import { getLoadError, type LoadError } from './loadError';
import './dashboard.css';
import './analyticsTables.css';

export function TemplatePulsePage() {
  const api = useApi(executionsApiRef);
  const [params, setParams] = useSearchParams();
  const [access, setAccess] = useState<ExecutionAccess>();
  const [error, setError] = useState<LoadError>();
  const [revision, setRevision] = useState(0);
  const [shareMessage, setShareMessage] = useState('');
  const selection = useMemo(
    () => readSelection(params, access),
    [params, access],
  );
  const onChange: ChangeSelection = (changes, replace = false) => {
    setShareMessage('');
    setParams(
      current =>
        writeSelection(current, {
          ...readSelection(current, access),
          ...changes,
        }),
      { replace },
    );
  };
  useEffect(() => {
    const controller = new AbortController();
    setError(undefined);
    api
      .getAccess(controller.signal)
      .then(data => {
        if (!controller.signal.aborted) setAccess(data);
      })
      .catch(cause => {
        if (!controller.signal.aborted) {
          setAccess(undefined);
          setError(getLoadError(cause, 'access'));
        }
      });
    return () => controller.abort();
  }, [api, revision]);
  const allowed =
    access &&
    (selection.scope === 'all' ? access.canReadAll : access.canReadOwn);
  const copyLink = async () => {
    const next = writeSelection(params, selection);
    const url = new URL(window.location.href);
    url.search = next.toString();
    setParams(next, { replace: true });
    try {
      await navigator.clipboard.writeText(url.href);
      setShareMessage('Link copied.');
    } catch {
      setShareMessage('Copy the browser address to share.');
    }
  };
  return (
    <Container className="template-pulse-analytics-page" py="3">
      <Flex direction="column" gap="3">
        <Flex
          className="template-pulse-analytics-toolbar"
          justify="between"
          align="center"
          gap="3"
        >
          <ToggleButtonGroup
            className="template-pulse-analytics-scope-controls"
            aria-label="Analytics scope"
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[selection.scope]}
            onSelectionChange={keys => {
              const scope = [...keys][0];
              if (scope === 'all') onChange({ scope: 'all' });
              else if (scope === 'mine')
                onChange({
                  scope: 'mine',
                  user: 'any',
                  view:
                    selection.view === 'users' ? 'templates' : selection.view,
                });
            }}
          >
            {access?.canReadAll && (
              <ToggleButton
                id="all"
                size="small"
                aria-label="Organization analytics"
              >
                Organization
              </ToggleButton>
            )}
            {access?.canReadOwn && (
              <ToggleButton id="mine" size="small">
                My analytics
              </ToggleButton>
            )}
          </ToggleButtonGroup>
          <Flex gap="2">
            {allowed && (
              <TooltipTrigger delay={200}>
                <ButtonIcon
                  size="small"
                  variant="secondary"
                  aria-label="Copy link"
                  onPress={copyLink}
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
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                  }
                />
                <Tooltip>Copy link</Tooltip>
              </TooltipTrigger>
            )}
            <TooltipTrigger delay={200}>
              <ButtonIcon
                size="small"
                variant="secondary"
                aria-label="Refresh"
                onPress={() => {
                  setShareMessage('');
                  setRevision(current => current + 1);
                }}
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
                    <path d="M20 7v5h-5" />
                    <path d="M20 12a8 8 0 1 0-2.34 5.66" />
                  </svg>
                }
              />
              <Tooltip>Refresh</Tooltip>
            </TooltipTrigger>
          </Flex>
        </Flex>
        {shareMessage && (
          <Text role="status" variant="body-small" color="secondary">
            {shareMessage}
          </Text>
        )}
        {error && (
          <Alert
            status="danger"
            title={error.title}
            description={error.description}
          />
        )}
        {!access && !error && (
          <Text role="status" color="secondary">
            Checking access…
          </Text>
        )}
        {access && !allowed && (
          <Alert
            status="warning"
            title="Access required"
            description="Ask your administrator to grant template-pulse.read for your own history or template-pulse.read-all for organization analytics."
          />
        )}
        {allowed && (
          <AnalyticsDashboard
            key={selection.scope}
            selection={selection}
            onChange={onChange}
            revision={revision}
            onRetry={() => setRevision(current => current + 1)}
            canSearchHistory={Boolean(access?.canSearchHistory)}
          />
        )}
      </Flex>
    </Container>
  );
}
