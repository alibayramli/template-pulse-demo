export const DEMO_RUN_COUNT = 6000;
export const DEMO_HISTORY_DAYS = 90;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const RELEASE_TEMPLATE = 'template:default/nodejs-api';
const POPULAR_TEMPLATES = new Set([
  RELEASE_TEMPLATE,
  'template:default/typescript-library',
  'template:default/python-fastapi',
  'template:default/java-spring-boot',
  'template:default/react-web-app',
  'template:default/kubernetes-service',
  'template:default/terraform-module',
  'template:default/postgres-database',
  'template:default/github-actions-pipeline',
  'template:default/airflow-dag',
]);
const TEAM_BY_TYPE = {
  infrastructure: 'cloud-infrastructure',
  library: 'developer-experience',
  resource: 'cloud-infrastructure',
  service: 'backend',
  website: 'frontend',
};
const TYPICAL_DURATION_SECONDS = {
  infrastructure: 110,
  library: 25,
  resource: 55,
  service: 75,
  website: 45,
};
const FAILURE_REASONS = [
  'Required configuration was missing',
  'Dependency resolution timed out',
  'A repository with this name already exists',
  'The build did not pass validation',
];

/**
 * @typedef {{ ref: string, name: string, type: string, ownerRef: string }} DemoTemplate
 * @typedef {{ ref: string, teamRef: string }} DemoUser
 * @typedef {{ templates: DemoTemplate[], users: DemoUser[] }} DemoRunCatalog
 * @typedef {{ id: string, templateRef: string, templateName: string, userRef: string,
 *   status: 'completed' | 'failed' | 'cancelled', createdAt: string, durationMs: number,
 *   failureReason?: string, retryOf?: string }} DemoRun
 */

/** @param {DemoRunCatalog} catalog @returns {DemoRun[]} */
export function createDemoRuns(catalog, now = Date.now()) {
  let state = 20261126;
  function random() {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 2 ** 32;
  }

  const today = Math.floor(now / DAY_MS) * DAY_MS;
  // Completed UTC days keep the browser and SQLite in sync throughout the day.
  const days = Array.from({ length: DEMO_HISTORY_DAYS }, (_, index) => {
    const dayOffset = index + 1;
    const start = today - dayOffset * DAY_MS;
    const weekday = new Date(start).getUTCDay();
    const releaseWeek = dayOffset >= 8 && dayOffset <= 14;
    const workday = weekday !== 0 && weekday !== 6;
    const weight =
      (workday ? 1 : 0.28) * (releaseWeek ? 1.65 : 1) * (0.8 + random() * 0.4);
    return { start, releaseWeek, weight };
  });

  const activeUsers = catalog.users
    .filter((_, index) => index % 8 !== 7)
    .map((user, index) => {
      const frequentUser = index < 2 || index % 12 === 0;
      const regularWeight = index % 4 === 0 ? 2 : 1;
      return { ...user, weight: frequentUser ? 5 : regularWeight };
    });
  const activeTemplates = catalog.templates
    .slice(0, 112)
    .map((template, index) => {
      const preferredTeam =
        /airflow|spark|dbt|analytics|^template:default\/ml-/.test(template.ref)
          ? 'group:default/data-engineering'
          : `group:default/${TEAM_BY_TYPE[template.type] ?? 'developers'}`;
      const teamRef =
        template.ownerRef === 'group:default/developers' ||
        template.ownerRef === 'group:default/platform-admins'
          ? preferredTeam
          : template.ownerRef;
      const teamUsers = activeUsers.filter(user => user.teamRef === teamRef);
      const regularWeight = index < 50 ? 2 : 1;
      return {
        ...template,
        weight: POPULAR_TEMPLATES.has(template.ref) ? 14 : regularWeight,
        successRate:
          index > 10 && index % 19 === 0 ? 0.89 : 0.95 + (index % 5) * 0.01,
        pickUser: sampler(teamUsers.length ? teamUsers : activeUsers, random),
      };
    });
  const pickUser = sampler(activeUsers, random);
  const pickTemplate = sampler(activeTemplates, random);
  const pickReleaseTemplate = sampler(
    activeTemplates.map(template => ({
      ...template,
      weight:
        template.ref === RELEASE_TEMPLATE
          ? template.weight * 3
          : template.weight,
    })),
    random,
  );

  const totalWeight = days.reduce((sum, day) => sum + day.weight, 0);
  let allocatedWeight = 0;
  /** @type {DemoRun[]} */
  const runs = [];
  for (const day of days) {
    allocatedWeight += day.weight;
    const endIndex = Math.round(
      (DEMO_RUN_COUNT * allocatedWeight) / totalWeight,
    );
    const earliestStart = day.start + 7 * HOUR_MS;
    const latestFinish = day.start + 19 * HOUR_MS;
    const span = latestFinish - earliestStart;

    while (runs.length < endIndex) {
      const template = day.releaseWeek ? pickReleaseTemplate() : pickTemplate();
      const user = random() < 0.7 ? template.pickUser() : pickUser();
      const regression = day.releaseWeek && template.ref === RELEASE_TEMPLATE;
      const durationMs = durationFor(template.type, regression);
      const successRate = regression ? 0.8 : template.successRate;
      const status = random() < 0.015 ? 'cancelled' : outcome(successRate);
      const createdAt =
        earliestStart + Math.floor(random() * (span - durationMs));
      const run = addRun(
        template,
        user,
        status,
        createdAt,
        durationMs,
        regression,
      );

      if (status === 'failed' && runs.length < endIndex && random() < 0.25) {
        const retryAt =
          createdAt + durationMs + (1 + Math.floor(random() * 5)) * MINUTE_MS;
        const retryDurationMs = durationFor(template.type, false);
        if (retryAt + retryDurationMs <= latestFinish) {
          addRun(
            template,
            user,
            outcome(successRate),
            retryAt,
            retryDurationMs,
            regression,
            run.id,
          );
        }
      }
    }
  }
  return runs.sort(
    (a, b) =>
      b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
  );

  /** @param {number} successRate */
  function outcome(successRate) {
    return random() < successRate ? 'completed' : 'failed';
  }

  /** @param {DemoTemplate['type']} type @param {boolean} regression */
  function durationFor(type, regression) {
    const typical = TYPICAL_DURATION_SECONDS[type] ?? 60;
    const tail = random() < (regression ? 0.2 : 0.04) ? 3 + random() * 3 : 1;
    return Math.round(typical * (0.45 + random() * 1.1) * tail * 1000);
  }

  /**
   * @param {DemoTemplate} template @param {DemoUser} user @param {DemoRun['status']} status
   * @param {number} createdAt @param {number} durationMs @param {boolean} regression
   * @param {string} [retryOf]
   */
  function addRun(
    template,
    user,
    status,
    createdAt,
    durationMs,
    regression,
    retryOf,
  ) {
    const run = {
      id: `7f184bae-c72f-4e35-82f2-${String(runs.length + 1).padStart(
        12,
        '0',
      )}`,
      templateRef: template.ref,
      templateName: template.name,
      userRef: user.ref,
      status,
      createdAt: new Date(createdAt).toISOString(),
      durationMs,
      ...(status === 'failed' && {
        failureReason: regression
          ? 'The released base image failed compatibility checks'
          : FAILURE_REASONS[Math.floor(random() * FAILURE_REASONS.length)],
      }),
      ...(retryOf && { retryOf }),
    };
    runs.push(run);
    return run;
  }
}

/**
 * @template {{ weight: number }} T
 * @param {T[]} choices @param {() => number} random
 */
function sampler(choices, random) {
  const total = choices.reduce((sum, choice) => sum + choice.weight, 0);
  return () => {
    let remaining = random() * total;
    return (
      choices.find(choice => (remaining -= choice.weight) < 0) ??
      choices[choices.length - 1]
    );
  };
}
