import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApi } from '@backstage/frontend-plugin-api';
import {
  Alert,
  Button,
  ButtonIcon,
  Card,
  CardBody,
  Container,
  DateRangePicker,
  Flex,
  SearchField,
  Skeleton,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Text,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  TooltipTrigger,
} from '@backstage/ui';
import { parseDate, today } from '@internationalized/date';
import type {
  ExecutionAccess,
  ExecutionAnalytics,
  ExecutionQuery,
} from '@template-pulse/plugin-common';
import { executionsApiRef } from './api';
import { ActivityChart, RollupTable, RunsTable } from './AnalyticsViews';
import { formatDuration, formatRate } from './history';
import {
  readSelection,
  recentRange,
  statusOptions,
  writeSelection,
  type DashboardSelection,
} from './dashboardState';
import {
  EntityFilterSelect,
  ResetIcon,
  entityFilterName,
} from './FilterControls';
import './analyticsTables.css';

type ChangeSelection = (
  changes: Partial<DashboardSelection>,
  replace?: boolean,
) => void;

const FILTER_DEBOUNCE_MS = 300;
const LOADING_INDICATOR_DELAY_MS = 200;
const LOAD_ERROR_TITLES = {
  analytics: 'Could not load this view',
  executions: 'Could not search executions',
  pagination: 'Could not load older executions',
};

function AnalyticsSkeleton() {
  return (
    <Flex
      className="analytics-skeleton"
      direction="column"
      gap="3"
      aria-hidden="true"
    >
      <div className="analytics-metrics">
        {Array.from({ length: 4 }, (_, index) => (
          <Card className="analytics-metric" key={index}>
            <CardBody>
              <Skeleton width="55%" height={24} />
              <Skeleton width="40%" height={36} />
              <Skeleton width="85%" height={20} />
            </CardBody>
          </Card>
        ))}
      </div>
      <Card>
        <CardBody>
          <Flex direction="column" gap="3">
            <Skeleton width="45%" height={24} />
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} width="100%" height={32} />
            ))}
          </Flex>
        </CardBody>
      </Card>
      <Card className="analytics-activity">
        <CardBody>
          <Flex direction="column" gap="2">
            <Skeleton width="25%" height={24} />
            <Skeleton width="100%" height={124} />
            <Skeleton width="60%" height={20} />
          </Flex>
        </CardBody>
      </Card>
    </Flex>
  );
}

function Metric({
  label,
  value,
  hint,
  explanation,
}: {
  label: string;
  value: string;
  hint: string;
  explanation: string;
}) {
  return (
    <Card className="analytics-metric">
      <CardBody>
        <TooltipTrigger delay={200}>
          <Button
            className="analytics-metric-label"
            size="small"
            variant="tertiary"
            aria-label={`About ${label}`}
          >
            {label} <span aria-hidden="true">ⓘ</span>
          </Button>
          <Tooltip>{explanation}</Tooltip>
        </TooltipTrigger>
        <Text className="analytics-metric-value" weight="bold">
          {value}
        </Text>
        <Text variant="body-small" color="secondary">
          {hint}
        </Text>
      </CardBody>
    </Card>
  );
}

function AnalyticsDashboard({
  selection,
  onChange,
  revision,
  canSearchHistory,
}: {
  selection: DashboardSelection;
  onChange: ChangeSelection;
  revision: number;
  canSearchHistory: boolean;
}) {
  const api = useApi(executionsApiRef);
  const { scope, range, allHistory, template, user, status, search, view } =
    selection;
  const [loadingMore, setLoadingMore] = useState(false);
  const requestController = useRef<AbortController>();
  const resultQuery = useRef<ExecutionQuery>();
  const previousRequest = useRef<{
    query: ExecutionQuery;
    revision: number;
  }>();
  const [result, setResult] = useState<ExecutionAnalytics>();
  const [facets, setFacets] = useState<ExecutionAnalytics['facets']>({
    templates: [],
    users: [],
  });
  const [error, setError] = useState<keyof typeof LOAD_ERROR_TITLES>();
  const [loading, setLoading] = useState(true);
  const [updatingExecutions, setUpdatingExecutions] = useState(false);
  const [showLoadingIndicator, setShowLoadingIndicator] = useState(false);
  const [rangeWarning, setRangeWarning] = useState<string>();
  const [draftRange, setDraftRange] = useState(range);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const resolvedUsers = useRef(new Set<string>());
  const rangeStart = range.start.toString();
  const rangeEnd = range.end.toString();
  const from = `${range.start}T00:00:00.000Z`;
  const to = `${range.end.add({ days: 1 })}T00:00:00.000Z`;
  const analyticsQuery = useMemo<ExecutionQuery>(
    () => ({
      scope,
      from,
      to,
      templateRef: template === 'any' ? undefined : template,
      userRef: user === 'any' ? undefined : user,
      allTime: allHistory,
    }),
    [scope, from, to, template, user, allHistory],
  );
  const querySearch = search.trim();
  const query = useMemo<ExecutionQuery>(
    () => ({
      ...analyticsQuery,
      status: status === 'any' ? undefined : status,
      query: querySearch,
    }),
    [analyticsQuery, status, querySearch],
  );
  const invalidRange =
    Date.parse(to) - Date.parse(from) > 366 * 86_400_000 ||
    range.start.compare(range.end) > 0;

  useEffect(() => {
    setDraftRange({ start: parseDate(rangeStart), end: parseDate(rangeEnd) });
    setRangeWarning(undefined);
  }, [rangeStart, rangeEnd, allHistory]);

  const userRefs = useMemo(
    () => [...new Set([...facets.users, ...(user === 'any' ? [] : [user])])],
    [facets.users, user],
  );
  useEffect(() => {
    if (!api.getUserNames) return undefined;
    const refs = new Set([
      ...userRefs,
      ...(result?.users.map(row => row.id) ?? []),
      ...(result?.items.flatMap(row => (row.userRef ? [row.userRef] : [])) ??
        []),
    ]);
    const missing = [...refs].filter(
      ref => ref !== 'unknown' && !resolvedUsers.current.has(ref),
    );
    if (!missing.length) return undefined;
    const controller = new AbortController();
    api
      .getUserNames(missing, controller.signal)
      .then(names => {
        if (controller.signal.aborted) return;
        missing.forEach(ref => resolvedUsers.current.add(ref));
        setUserNames(previous => ({ ...previous, ...names }));
      })
      .catch(() => {
        // Catalog labels are optional; retained references remain selectable.
      });
    return () => controller.abort();
  }, [api, userRefs, result, revision]);

  useEffect(() => {
    const controller = new AbortController();
    requestController.current = controller;
    const previous = previousRequest.current;
    const filtersChanged =
      previous && previous.revision === revision && previous.query !== query;
    const executionsOnly = Boolean(
      filtersChanged && resultQuery.current === analyticsQuery,
    );
    setUpdatingExecutions(executionsOnly);
    previousRequest.current = { query, revision };
    setError(undefined);
    setLoading(!invalidRange);
    setShowLoadingIndicator(false);
    setLoadingMore(false);
    if (invalidRange) return () => controller.abort();
    let indicatorTimer: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(
      () => {
        // Start feedback only once input settles and the backend is still busy.
        indicatorTimer = setTimeout(
          () => setShowLoadingIndicator(true),
          LOADING_INDICATOR_DELAY_MS,
        );
        api
          .getAnalytics(query, controller.signal)
          .then(data => {
            if (controller.signal.aborted) return;
            resultQuery.current = analyticsQuery;
            setResult(data);
            setFacets(previousFacets => ({
              templates: [
                ...new Map(
                  [...previousFacets.templates, ...data.facets.templates].map(
                    item => [item.id, item],
                  ),
                ).values(),
              ].sort((a, b) => a.name.localeCompare(b.name)),
              users: [
                ...new Set([...previousFacets.users, ...data.facets.users]),
              ].sort(),
            }));
          })
          .catch(() => {
            if (!controller.signal.aborted) {
              // Cohort numbers remain valid when only the detail filters failed.
              if (!executionsOnly) {
                resultQuery.current = undefined;
                setResult(undefined);
              }
              setError(executionsOnly ? 'executions' : 'analytics');
            }
          })
          .finally(() => {
            clearTimeout(indicatorTimer);
            if (!controller.signal.aborted) {
              setLoading(false);
              setShowLoadingIndicator(false);
            }
          });
      },
      filtersChanged ? FILTER_DEBOUNCE_MS : 0,
    );
    return () => {
      clearTimeout(timer);
      clearTimeout(indicatorTimer);
      controller.abort();
    };
  }, [api, analyticsQuery, query, revision, invalidRange]);

  const metrics = result?.summary;
  const updateMessage = showLoadingIndicator
    ? `Updating ${
        updatingExecutions ? 'executions' : 'analytics'
      }… Previous results shown.`
    : 'Previous results shown.';
  const selectedPreset = allHistory
    ? undefined
    : [7, 30, 90].find(days => {
        const preset = recentRange(days);
        return (
          range.start.compare(preset.start) === 0 &&
          range.end.compare(preset.end) === 0
        );
      });
  const templateOptions = [...facets.templates];
  if (
    template !== 'any' &&
    !templateOptions.some(item => item.id === template)
  ) {
    templateOptions.push({ id: template, name: template });
  }
  const templateNameCounts = new Map<string, number>();
  templateOptions.forEach(item =>
    templateNameCounts.set(
      item.name,
      (templateNameCounts.get(item.name) ?? 0) + 1,
    ),
  );
  const userOptions = userRefs
    .map(id => ({
      id,
      label: userNames[id] ?? entityFilterName(id),
      description: userNames[id] ? entityFilterName(id) : undefined,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const hasExecutionFilters = Boolean(search || status !== 'any');
  const canResetDashboard = Boolean(
    allHistory ||
      selectedPreset !== 30 ||
      template !== 'any' ||
      user !== 'any' ||
      rangeWarning,
  );
  const datePresetKeys: string[] = [];
  if (allHistory) datePresetKeys.push('all');
  else if (selectedPreset && !rangeWarning)
    datePresetKeys.push(String(selectedPreset));

  const loadMore = async () => {
    if (
      !result?.page.hasMore ||
      !requestController.current ||
      requestController.current.signal.aborted ||
      loading ||
      invalidRange ||
      loadingMore
    )
      return;
    const controller = requestController.current;
    setLoadingMore(true);
    setError(undefined);
    try {
      const data = await api.getAnalytics(
        { ...query, offset: result.items.length },
        controller.signal,
      );
      if (!controller.signal.aborted)
        setResult(previous =>
          previous
            ? {
                ...data,
                items: [
                  ...new Map(
                    [...previous.items, ...data.items].map(item => [
                      item.id,
                      item,
                    ]),
                  ).values(),
                ],
              }
            : previous,
        );
    } catch {
      if (!controller.signal.aborted) setError('pagination');
    } finally {
      if (!controller.signal.aborted) setLoadingMore(false);
    }
  };

  return (
    <Flex direction="column" gap="3">
      <Card className="analytics-filters">
        <CardBody>
          <section
            className="analytics-dashboard-filter-group"
            aria-label="Dashboard filters"
          >
            <div className="analytics-filter-toolbar">
              <ToggleButtonGroup
                className="analytics-date-presets"
                aria-label="Date shortcuts"
                selectionMode="single"
                disallowEmptySelection
                selectedKeys={datePresetKeys}
                onSelectionChange={keys => {
                  const preset = [...keys][0];
                  if (preset === undefined) return;
                  const days = preset === 'all' ? 30 : Number(preset);
                  setDraftRange(recentRange(days));
                  setRangeWarning(undefined);
                  onChange({
                    allHistory: preset === 'all',
                    range: recentRange(days),
                  });
                }}
              >
                {[7, 30, 90].map(days => (
                  <ToggleButton
                    id={String(days)}
                    key={days}
                    size="small"
                    aria-label={`Last ${days} days`}
                  >
                    {days} days
                  </ToggleButton>
                ))}
                {canSearchHistory && (
                  <ToggleButton id="all" size="small">
                    All history
                  </ToggleButton>
                )}
              </ToggleButtonGroup>
              <div className="analytics-filter-reset">
                <TooltipTrigger delay={200} isDisabled={!canResetDashboard}>
                  <Button
                    size="small"
                    variant="tertiary"
                    iconStart={<ResetIcon />}
                    aria-label="Reset dashboard filters"
                    isDisabled={!canResetDashboard}
                    onPress={() => {
                      setDraftRange(recentRange(30));
                      setRangeWarning(undefined);
                      onChange({
                        template: 'any',
                        user: 'any',
                        allHistory: false,
                        range: recentRange(30),
                      });
                    }}
                  >
                    Reset
                  </Button>
                  <Tooltip>
                    Last 30 days, all templates
                    {scope === 'all' ? ', all users' : ''}.
                  </Tooltip>
                </TooltipTrigger>
              </div>
            </div>
            <div
              className={`analytics-filter-fields ${
                scope === 'mine' ? 'analytics-personal-filters' : ''
              }`}
            >
              <div className="analytics-date-field">
                {allHistory ? (
                  <div className="analytics-all-dates-field">
                    <span className="analytics-all-dates-label">
                      Date range (UTC)
                    </span>
                    <div className="analytics-all-dates-value">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <rect x="4" y="5" width="16" height="16" rx="2" />
                        <path d="M8 3v4m8-4v4M4 11h16" />
                      </svg>
                      <span>All saved dates</span>
                      <span
                        className="analytics-all-dates-symbol"
                        aria-hidden="true"
                      >
                        ∞
                      </span>
                    </div>
                  </div>
                ) : (
                  <>
                    <DateRangePicker
                      label="Date range (UTC)"
                      size="small"
                      value={draftRange}
                      maxValue={today('UTC')}
                      isInvalid={Boolean(rangeWarning || invalidRange)}
                      aria-describedby={
                        rangeWarning || invalidRange
                          ? 'analytics-date-error'
                          : undefined
                      }
                      onChange={value => {
                        if (!value) return;
                        const start = parseDate(value.start.toString());
                        const end = parseDate(value.end.toString());
                        setDraftRange({ start, end });
                        let warning: string | undefined;
                        if (start.compare(end) > 0)
                          warning = 'End date must follow the start date.';
                        else if (start.add({ days: 365 }).compare(end) < 0)
                          warning = 'Choose a range of up to 366 days.';
                        else if (end.compare(today('UTC')) > 0)
                          warning = 'Choose an end date up to today.';
                        setRangeWarning(warning);
                        if (!warning)
                          onChange({
                            allHistory: false,
                            range: { start, end },
                          });
                      }}
                    />
                    {(rangeWarning || invalidRange) && (
                      <Text
                        id="analytics-date-error"
                        className="analytics-date-error"
                        variant="body-small"
                        color="danger"
                        role="alert"
                      >
                        {rangeWarning ?? 'Choose a range of up to 366 days.'}
                      </Text>
                    )}
                  </>
                )}
              </div>
              <EntityFilterSelect
                label="Template"
                value={template}
                onChange={value => onChange({ template: value })}
                options={[
                  { id: 'any', label: 'All templates' },
                  ...templateOptions.map(item => ({
                    id: item.id,
                    label: item.name,
                    description:
                      (templateNameCounts.get(item.name) ?? 0) > 1
                        ? item.id
                        : undefined,
                  })),
                ]}
              />
              {scope === 'all' && (
                <EntityFilterSelect
                  label="User"
                  value={user}
                  onChange={value => onChange({ user: value })}
                  options={[{ id: 'any', label: 'All users' }, ...userOptions]}
                />
              )}
            </div>
          </section>
        </CardBody>
      </Card>
      {error && (
        <Alert
          status="danger"
          title={LOAD_ERROR_TITLES[error]}
          description="Try again. Your filters are saved."
        />
      )}
      {loading && (
        <div
          className="analytics-loading-status"
          role="status"
          aria-atomic="true"
        >
          {showLoadingIndicator && result && (
            <span className="analytics-spinner" aria-hidden="true" />
          )}
          <Text variant="body-small" color="secondary">
            {result ? updateMessage : 'Loading Template Pulse…'}
          </Text>
        </div>
      )}
      {loading && !result && <AnalyticsSkeleton />}
      {result && metrics && !invalidRange && (
        <Flex
          className="analytics-results"
          direction="column"
          gap="3"
          aria-busy={loading && !updatingExecutions}
          data-updating={
            (showLoadingIndicator && !updatingExecutions) || undefined
          }
        >
          {result.window.truncated && (
            <Alert
              status="warning"
              title="Some history is missing"
              description={`Only the latest ${result.window.scanned} runs are included. Totals and rates may be incomplete.`}
            />
          )}
          <div className="analytics-metrics">
            <Metric
              label="Executions"
              value={String(metrics.total)}
              hint={`${metrics.templates} templates · ${metrics.active} active · ${metrics.cancelled} cancelled`}
              explanation="All runs for the selected dates, templates and users."
            />
            <Metric
              label="Template users"
              value={String(metrics.users)}
              hint="Users who ran a template"
              explanation="Number of users who ran these templates."
            />
            <Metric
              label="Success rate"
              value={formatRate(metrics.successRate)}
              hint={`${metrics.completed} completed · ${metrics.failed} failed`}
              explanation="Successful runs out of completed and failed runs."
            />
            <Metric
              label="Avg successful time"
              value={formatDuration(metrics.averageMs)}
              hint={`P95 ${formatDuration(metrics.p95Ms)} · ${
                metrics.timedCompleted
              } timed runs`}
              explanation="Successful run times, including waiting. P95: 95% finished within this time. — means no timing data."
            />
          </div>
          {metrics.total === 0 && (
            <Alert
              status="info"
              title="No runs match this selection"
              description="Choose more dates or reset filters."
            />
          )}
          <Tabs
            selectedKey={view}
            onSelectionChange={key =>
              onChange({ view: String(key) as DashboardSelection['view'] })
            }
          >
            <TabList aria-label="Analytics breakdown">
              <Tab id="templates">Template health</Tab>
              {scope === 'all' && <Tab id="users">User adoption</Tab>}
              <Tab id="runs">Executions</Tab>
            </TabList>
            <TabPanel id="templates">
              <Flex direction="column" gap="2" pt="2">
                <RollupTable
                  rows={result.templates}
                  isStale={loading && !updatingExecutions}
                  kind="template"
                  onSelect={id =>
                    onChange({
                      template: id,
                      view: 'runs',
                      search: '',
                      status: 'any',
                    })
                  }
                />
              </Flex>
            </TabPanel>
            {scope === 'all' && (
              <TabPanel id="users">
                <Flex direction="column" gap="2" pt="2">
                  <RollupTable
                    rows={result.users}
                    isStale={loading && !updatingExecutions}
                    kind="user"
                    userNames={userNames}
                    onSelect={id =>
                      onChange({
                        user: id,
                        view: 'runs',
                        search: '',
                        status: 'any',
                      })
                    }
                  />
                </Flex>
              </TabPanel>
            )}
            <TabPanel id="runs">
              <Flex direction="column" gap="2" pt="2">
                <section
                  className="analytics-execution-panel"
                  aria-label="Execution filters"
                >
                  <div className="analytics-execution-filters">
                    <SearchField
                      label="Search executions"
                      placeholder="Template, user or task ID"
                      size="small"
                      maxLength={200}
                      value={search}
                      onChange={value => onChange({ search: value }, true)}
                    />
                    <EntityFilterSelect
                      label="Status"
                      value={status}
                      options={statusOptions}
                      onChange={value => onChange({ status: value })}
                    />
                    <TooltipTrigger
                      delay={200}
                      isDisabled={!hasExecutionFilters}
                    >
                      <Button
                        size="small"
                        variant="tertiary"
                        iconStart={<ResetIcon />}
                        aria-label="Clear execution filters"
                        isDisabled={!hasExecutionFilters}
                        onPress={() => onChange({ search: '', status: 'any' })}
                      >
                        Reset
                      </Button>
                      <Tooltip>Clear search and status for this list.</Tooltip>
                    </TooltipTrigger>
                  </div>
                  <Text
                    className="analytics-matching-count"
                    variant="body-small"
                    color="secondary"
                    role="status"
                    aria-atomic="true"
                    aria-busy={loading}
                    data-updating={loading || undefined}
                  >
                    {hasExecutionFilters ? (
                      <>
                        <strong>{result.page.total}</strong> matching executions
                        <span> · {metrics.total} total</span>
                      </>
                    ) : (
                      <>{metrics.total} executions</>
                    )}
                  </Text>
                </section>
                {metrics.total > 0 &&
                  result.page.total === 0 &&
                  !loading &&
                  error !== 'executions' && (
                    <Alert
                      status="info"
                      title="No executions match these filters"
                      description="Clear filters or choose more dates."
                    />
                  )}
                {error !== 'executions' && (
                  <>
                    <RunsTable
                      rows={result.items}
                      userNames={userNames}
                      isStale={loading}
                    />
                    {result.page.hasMore && (
                      <Flex
                        align="center"
                        justify="between"
                        gap="3"
                        style={{ flexWrap: 'wrap' }}
                      >
                        <Text variant="body-small" color="secondary">
                          {result.items.length} of {result.page.total}{' '}
                          executions loaded
                        </Text>
                        <Button
                          variant="secondary"
                          isDisabled={loadingMore || loading}
                          onPress={loadMore}
                        >
                          {loadingMore
                            ? 'Loading older executions…'
                            : 'Load older executions'}
                        </Button>
                      </Flex>
                    )}
                  </>
                )}
              </Flex>
            </TabPanel>
          </Tabs>
          <ActivityChart days={result.activity} allHistory={allHistory} />
        </Flex>
      )}
    </Flex>
  );
}

export function TemplatePulsePage() {
  const api = useApi(executionsApiRef);
  const [params, setParams] = useSearchParams();
  const [access, setAccess] = useState<ExecutionAccess>();
  const [error, setError] = useState<Error>();
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
          setError(
            cause instanceof Error
              ? cause
              : new Error('Unable to check access'),
          );
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
    <Container className="analytics-page" py="3">
      <Flex direction="column" gap="3">
        <Flex
          className="analytics-toolbar"
          justify="between"
          align="center"
          gap="3"
        >
          <ToggleButtonGroup
            className="analytics-scope-controls"
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
            title="Could not check access"
            description="Refresh to try again."
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
            description="Ask your admin for access."
          />
        )}
        {allowed && (
          <AnalyticsDashboard
            key={selection.scope}
            selection={selection}
            onChange={onChange}
            revision={revision}
            canSearchHistory={Boolean(access?.canSearchHistory)}
          />
        )}
      </Flex>
    </Container>
  );
}
