import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  CardBody,
  DateRangePicker,
  Text,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  TooltipTrigger,
} from '@backstage/ui';
import { parseDate, today } from '@internationalized/date';
import type { ExecutionAnalytics } from '@abayramli/backstage-plugin-template-pulse-common';
import {
  recentRange,
  type DashboardSelection,
  type ChangeSelection,
} from './dashboardState';
import {
  EntityFilterSelect,
  ResetIcon,
  entityFilterName,
} from './FilterControls';

export function DashboardFilters({
  selection,
  onChange,
  canSearchHistory,
  facets,
  userRefs,
  userNames,
  teams,
  teamsError,
  invalidRange,
}: {
  selection: DashboardSelection;
  onChange: ChangeSelection;
  canSearchHistory: boolean;
  facets: ExecutionAnalytics['facets'];
  userRefs: string[];
  userNames: Record<string, string>;
  teams: { id: string; name: string }[];
  teamsError: boolean;
  invalidRange: boolean;
}) {
  const { scope, range, allHistory, template, user, team } = selection;
  const [rangeWarning, setRangeWarning] = useState<string>();
  const [draftRange, setDraftRange] = useState(range);
  const rangeStart = range.start.toString();
  const rangeEnd = range.end.toString();
  useEffect(() => {
    setDraftRange({ start: parseDate(rangeStart), end: parseDate(rangeEnd) });
    setRangeWarning(undefined);
  }, [rangeStart, rangeEnd, allHistory]);
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
  const teamOptions = teams.map(item => ({
    id: item.id,
    label: item.name,
    description: entityFilterName(item.id),
  }));
  if (team !== 'any' && !teamOptions.some(item => item.id === team))
    teamOptions.push({
      id: team,
      label: entityFilterName(team),
      description: team,
    });
  const canResetDashboard = Boolean(
    allHistory ||
      selectedPreset !== 30 ||
      template !== 'any' ||
      user !== 'any' ||
      team !== 'any' ||
      rangeWarning,
  );
  const datePresetKeys: string[] = [];
  if (allHistory) datePresetKeys.push('all');
  else if (selectedPreset && !rangeWarning)
    datePresetKeys.push(String(selectedPreset));

  return (
    <Card className="template-pulse-analytics-filters">
      <CardBody>
        <section
          className="template-pulse-analytics-dashboard-filter-group"
          aria-label="Dashboard filters"
        >
          <div className="template-pulse-analytics-filter-toolbar">
            <ToggleButtonGroup
              className="template-pulse-analytics-date-presets"
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
            <div className="template-pulse-analytics-filter-reset">
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
                      team: 'any',
                      allHistory: false,
                      range: recentRange(30),
                    });
                  }}
                >
                  Reset
                </Button>
                <Tooltip>
                  Last 30 days, all templates
                  {scope === 'all' ? ', all teams and users' : ''}.
                </Tooltip>
              </TooltipTrigger>
            </div>
          </div>
          <div
            className={`template-pulse-analytics-filter-fields ${
              scope === 'mine' ? 'template-pulse-analytics-personal-filters' : ''
            }`}
          >
            <div className="template-pulse-analytics-date-field">
              {allHistory ? (
                <div className="template-pulse-analytics-all-dates-field">
                  <span className="template-pulse-analytics-all-dates-label">
                    Date range (UTC)
                  </span>
                  <div className="template-pulse-analytics-all-dates-value">
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
                      className="template-pulse-analytics-all-dates-symbol"
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
                        ? 'template-pulse-analytics-date-error'
                        : undefined
                    }
                    onChange={value => {
                      if (!value) return;
                      const start = parseDate(value.start.toString());
                      const end = parseDate(value.end.toString());
                      setDraftRange({ start, end });
                      let warning: string | undefined;
                      if (start.compare(end) > 0)
                        warning = 'The end date cannot be before the start date.';
                      else if (start.add({ days: 365 }).compare(end) < 0)
                        warning = 'Choose a range of up to 366 days.';
                      else if (end.compare(today('UTC')) > 0)
                        warning = 'Choose today or an earlier end date.';
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
                      id="template-pulse-analytics-date-error"
                      className="template-pulse-analytics-date-error"
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
                label="Team"
                value={team}
                onChange={value => onChange({ team: value, user: 'any' })}
                options={[{ id: 'any', label: 'All teams' }, ...teamOptions]}
              />
            )}
            {scope === 'all' && (
              <EntityFilterSelect
                label="User"
                value={user}
                onChange={value => onChange({ user: value })}
                options={[{ id: 'any', label: 'All users' }, ...userOptions]}
              />
            )}
          </div>
          {scope === 'all' && teamsError && (
            <Text variant="body-small" color="secondary" role="status">
              Teams could not be loaded. Refresh to try again.
            </Text>
          )}
          {team !== 'any' && (
            <Text variant="body-small" color="secondary">
              Runs by current direct members of the selected catalog group.
            </Text>
          )}
        </section>
      </CardBody>
    </Card>
  );
}
