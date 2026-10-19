import { useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from '@backstage/frontend-plugin-api';
import type { ExecutionAnalytics, ExecutionQuery } from '@abayramli/backstage-plugin-template-pulse-common';
import { executionsApiRef } from './api';
import type { DashboardSelection } from './dashboardState';
import { getLoadError, type LoadError } from './loadError';

const FILTER_DEBOUNCE_MS = 300;
const LOADING_INDICATOR_DELAY_MS = 200;

export function useExecutionAnalytics(
  selection: DashboardSelection,
  revision: number,
) {
  const api = useApi(executionsApiRef);
  const {
    scope,
    range,
    allHistory,
    template,
    user,
    team,
    status,
    search,
    sortBy,
    sortDirection,
  } = selection;
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
  const [error, setError] = useState<LoadError>();
  const [loading, setLoading] = useState(true);
  const [updatingExecutions, setUpdatingExecutions] = useState(false);
  const [showLoadingIndicator, setShowLoadingIndicator] = useState(false);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const resolvedUsers = useRef(new Set<string>());
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [teamsError, setTeamsError] = useState(false);
  const from = `${range.start}T00:00:00.000Z`;
  const to = `${range.end.add({ days: 1 })}T00:00:00.000Z`;
  const analyticsQuery = useMemo<ExecutionQuery>(
    () => ({
      scope,
      from,
      to,
      templateRef: template === 'any' ? undefined : template,
      userRef: user === 'any' ? undefined : user,
      teamRef: team === 'any' ? undefined : team,
      allTime: allHistory,
    }),
    [scope, from, to, template, user, team, allHistory],
  );
  const querySearch = search.trim();
  const query = useMemo<ExecutionQuery>(
    () => ({
      ...analyticsQuery,
      status: status === 'any' ? undefined : status,
      query: querySearch,
      sortBy,
      sortDirection,
    }),
    [analyticsQuery, status, querySearch, sortBy, sortDirection],
  );
  const invalidRange =
    Date.parse(to) - Date.parse(from) > 366 * 86_400_000 ||
    range.start.compare(range.end) > 0;

  const userRefs = useMemo(
    () => [...new Set([...facets.users, ...(user === 'any' ? [] : [user])])],
    [facets.users, user],
  );
  useEffect(() => {
    resolvedUsers.current.clear();
  }, [api, revision]);
  useEffect(() => {
    if (scope !== 'all' || !api.getTeams) return undefined;
    const controller = new AbortController();
    setTeamsError(false);
    api
      .getTeams(controller.signal)
      .then(data => {
        if (!controller.signal.aborted) setTeams(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setTeamsError(true);
      });
    return () => controller.abort();
  }, [api, scope, revision]);
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
        setUserNames(previous => {
          const next = { ...previous };
          missing.forEach(ref => delete next[ref]);
          return { ...next, ...names };
        });
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
    const debounceMs =
      previous?.query.query !== query.query ? 0 : FILTER_DEBOUNCE_MS;
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
          .catch(cause => {
            if (!controller.signal.aborted) {
              // Cohort numbers remain valid when only the detail filters failed.
              if (!executionsOnly) {
                resultQuery.current = undefined;
                setResult(undefined);
              }
              setError(
                getLoadError(cause, executionsOnly ? 'executions' : 'analytics'),
              );
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
      filtersChanged ? debounceMs : 0,
    );
    return () => {
      clearTimeout(timer);
      clearTimeout(indicatorTimer);
      controller.abort();
    };
  }, [api, analyticsQuery, query, revision, invalidRange]);

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
    } catch (cause) {
      if (!controller.signal.aborted) setError(getLoadError(cause, 'pagination'));
    } finally {
      if (!controller.signal.aborted) setLoadingMore(false);
    }
  };

  return {
    result,
    facets,
    userRefs,
    userNames,
    teams,
    teamsError,
    error,
    loading,
    loadingMore,
    updatingExecutions,
    showLoadingIndicator,
    invalidRange,
    loadMore,
  };
}
