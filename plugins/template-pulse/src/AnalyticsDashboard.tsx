import {
  Alert,
  Button,
  Flex,
  SearchField,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Text,
  Tooltip,
  TooltipTrigger,
} from '@backstage/ui';
import { ActivityChart } from './ActivityChart';
import { RollupTable, RunsTable } from './AnalyticsViews';
import { AnalyticsSkeleton, AnalyticsSummary } from './AnalyticsSummary';
import { DashboardFilters } from './DashboardFilters';
import { HistoryCoverage } from './HistoryCoverage';
import {
  statusOptions,
  type DashboardSelection,
  type ChangeSelection,
} from './dashboardState';
import { EntityFilterSelect, ResetIcon } from './FilterControls';
import { useExecutionAnalytics } from './useExecutionAnalytics';

export function AnalyticsDashboard({
  selection,
  onChange,
  revision,
  canSearchHistory,
  onRetry,
}: {
  selection: DashboardSelection;
  onChange: ChangeSelection;
  revision: number;
  canSearchHistory: boolean;
  onRetry: () => void;
}) {
  const { scope, allHistory, status, search, view, sortBy, sortDirection } =
    selection;
  const {
    result,
    facets,
    userRefs,
    userNames,
    error,
    loading,
    loadingMore,
    updatingExecutions,
    showLoadingIndicator,
    invalidRange,
    loadMore,
  } = useExecutionAnalytics(selection, revision);
  const hasExecutionFilters = Boolean(search || status !== 'any');
  const metrics = result?.summary;
  const updateMessage = showLoadingIndicator
    ? `Updating ${
        updatingExecutions ? 'runs' : 'analytics'
      }… Previous results shown.`
    : 'Previous results shown.';
  return (
    <Flex direction="column" gap="3">
      <DashboardFilters
        selection={selection}
        onChange={onChange}
        canSearchHistory={canSearchHistory}
        facets={facets}
        userRefs={userRefs}
        userNames={userNames}
        invalidRange={invalidRange}
      />
      {error && (
        <Flex direction="column" gap="2">
          <Alert
            status="danger"
            title={error.title}
            description={error.description}
          />
          {error.retryable && (
            <Button
              variant="secondary"
              isDisabled={loading || loadingMore}
              onPress={error.target === 'pagination' ? loadMore : onRetry}
            >
              {error.target === 'pagination'
                ? 'Retry loading more runs'
                : 'Reload this view'}
            </Button>
          )}
        </Flex>
      )}
      {loading && (
        <div
          className="template-pulse-analytics-loading-status"
          role="status"
          aria-atomic="true"
        >
          {showLoadingIndicator && result && (
            <span className="template-pulse-analytics-spinner" aria-hidden="true" />
          )}
          <Text variant="body-small" color="secondary">
            {result ? updateMessage : 'Loading Template Pulse…'}
          </Text>
        </div>
      )}
      {loading && !result && <AnalyticsSkeleton />}
      {result && metrics && !invalidRange && (
        <Flex
          className="template-pulse-analytics-results"
          direction="column"
          gap="3"
          aria-busy={loading && !updatingExecutions}
          data-updating={
            (showLoadingIndicator && !updatingExecutions) || undefined
          }
        >
          <HistoryCoverage window={result.window} />
          <AnalyticsSummary metrics={metrics} />
          {metrics.total === 0 && (
            <Alert
              status="info"
              title="No runs match this selection"
              description="Choose a wider date range or reset filters."
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
              <Tab id="runs">Runs</Tab>
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
                  className="template-pulse-analytics-execution-panel"
                  aria-label="Run filters"
                >
                  <div className="template-pulse-analytics-execution-filters">
                    <SearchField
                      label="Search runs"
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
                        aria-label="Clear run filters"
                        isDisabled={!hasExecutionFilters}
                        onPress={() => onChange({ search: '', status: 'any' })}
                      >
                        Reset
                      </Button>
                      <Tooltip>Clear search and status for this list.</Tooltip>
                    </TooltipTrigger>
                  </div>
                  <Text
                    className="template-pulse-analytics-matching-count"
                    variant="body-small"
                    color="secondary"
                    role="status"
                    aria-atomic="true"
                    aria-busy={loading}
                    data-updating={loading || undefined}
                  >
                    {hasExecutionFilters ? (
                      <>
                        <strong>{result.page.total}</strong> matching runs
                        <span> · {metrics.total} total</span>
                      </>
                    ) : (
                      <>{metrics.total} runs</>
                    )}
                  </Text>
                </section>
                {metrics.total > 0 &&
                  result.page.total === 0 &&
                  !loading &&
                  error?.target !== 'executions' && (
                    <Alert
                      status="info"
                      title="No runs match these filters"
                      description="Choose a wider date range or reset filters."
                    />
                  )}
                {error?.target !== 'executions' && (
                  <>
                    <RunsTable
                      rows={result.items}
                      userNames={userNames}
                      isStale={loading}
                      sortBy={sortBy}
                      sortDirection={sortDirection}
                      onSortChange={onChange}
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
                          runs loaded
                        </Text>
                        <Button
                          variant="secondary"
                          isDisabled={loadingMore || loading}
                          onPress={loadMore}
                        >
                          {loadingMore
                            ? 'Loading more runs…'
                            : 'Load more runs'}
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
