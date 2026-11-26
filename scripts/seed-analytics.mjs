import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { createDemoRuns } from '../packages/app/src/demoRuns.mjs';
import { templates, users } from './catalog-fixtures.mjs';

// Local SQLite fixtures only: no production connection or credentials accepted.
const seed = 'analytics-demo-v2';
const databasePath = fileURLToPath(
  new URL('../.data/scaffolder.sqlite', import.meta.url),
);
if (!existsSync(databasePath)) {
  throw new Error(
    'Start this demo with yarn start once to initialize .data/scaffolder.sqlite, then run yarn seed:analytics.',
  );
}

const templateByRef = new Map(
  templates.map(template => [
    `template:default/${template.metadata.name}`,
    template,
  ]),
);
const userByRef = new Map(
  users.map(user => [`user:default/${user.metadata.name}`, user]),
);
const templateUrl = new URL('../examples/templates.yaml', import.meta.url).href;
const catalog = JSON.parse(
  readFileSync(
    new URL('../packages/app/src/demoCatalog.json', import.meta.url),
    'utf8',
  ),
);
const tasks = createDemoRuns(catalog);
const sqlDate = iso => iso.replace('T', ' ').replace('Z', '');

const db = new Database(databasePath, { fileMustExist: true, timeout: 10000 });
try {
  db.pragma('foreign_keys = ON');
  const existing = db.prepare('SELECT spec FROM tasks WHERE id = ?');
  const insert =
    db.prepare(`INSERT INTO tasks (id, spec, status, created_at, last_heartbeat_at, created_by)
    VALUES (@id, @spec, @status, @createdAt, @finishedAt, @createdBy)
    ON CONFLICT(id) DO UPDATE SET spec=excluded.spec, status=excluded.status,
      created_at=excluded.created_at, last_heartbeat_at=excluded.last_heartbeat_at,
      created_by=excluded.created_by`);
  const clearEvents = db.prepare('DELETE FROM task_events WHERE task_id = ?');
  const event = db.prepare(
    'INSERT INTO task_events (task_id, body, event_type, created_at) VALUES (?, ?, ?, ?)',
  );
  db.transaction(() => {
    db.prepare(
      `DELETE FROM tasks
      WHERE CASE WHEN json_valid(spec) THEN json_extract(spec, '$.parameters.analyticsSeed') END = ?`,
    ).run('analytics-demo-v1');
    for (const task of tasks) {
      const previous = existing.get(task.id);
      if (
        previous &&
        JSON.parse(previous.spec).parameters?.analyticsSeed !== seed
      ) {
        throw new Error(`Refusing to overwrite non-fixture task ${task.id}`);
      }
      const template = templateByRef.get(task.templateRef);
      const user = userByRef.get(task.userRef);
      const createdAt = sqlDate(task.createdAt);
      const finishedAt = sqlDate(
        new Date(Date.parse(task.createdAt) + task.durationMs).toISOString(),
      );
      const spec = {
        apiVersion: template.apiVersion,
        steps: template.spec.steps,
        output: template.spec.output,
        parameters: {
          seconds: Math.min(60, Math.ceil(task.durationMs / 1000)),
          outcome: task.status === 'failed' ? 'failure' : 'success',
          analyticsSeed: seed,
        },
        user: { ref: task.userRef, entity: user },
        templateInfo: {
          entityRef: task.templateRef,
          baseUrl: templateUrl,
          entity: { metadata: template.metadata },
        },
      };
      insert.run({
        id: task.id,
        spec: JSON.stringify(spec),
        status: task.status,
        createdBy: task.userRef,
        createdAt,
        finishedAt,
      });
      clearEvents.run(task.id);
      event.run(
        task.id,
        JSON.stringify({
          message: task.retryOf
            ? `Retrying project initialization after task ${task.retryOf}`
            : 'Project initialization started',
          stepId: 'run',
          status: 'processing',
        }),
        'log',
        createdAt,
      );
      event.run(
        task.id,
        JSON.stringify({
          message: `Project initialization ${task.status}`,
          stepId: 'run',
          status: task.status,
        }),
        'log',
        finishedAt,
      );
      if (task.status === 'cancelled') {
        event.run(
          task.id,
          JSON.stringify({
            message: 'Execution cancelled by the requester',
            stepId: 'run',
            status: 'cancelled',
          }),
          'cancelled',
          finishedAt,
        );
      }
      event.run(
        task.id,
        JSON.stringify({
          message: `Project setup ${task.status}`,
          status: task.status,
          ...(task.status === 'completed'
            ? {
                output: {
                  text: [
                    {
                      title: 'Project setup',
                      content:
                        'Your execution is available in the Template Pulse dashboard.',
                    },
                  ],
                },
              }
            : {}),
          ...(task.status === 'failed'
            ? {
                error: {
                  name: 'Error',
                  message: task.failureReason,
                },
              }
            : {}),
        }),
        'completion',
        finishedAt,
      );
    }
  })();
  const counts = Object.fromEntries(
    ['completed', 'failed', 'cancelled'].map(status => [
      status,
      tasks.filter(task => task.status === status).length,
    ]),
  );
  console.log(
    JSON.stringify(
      {
        executions: tasks.length,
        templates: templates.length,
        users: users.length,
        statuses: counts,
        dateRange: [
          tasks.at(-1).createdAt.slice(0, 10),
          tasks[0].createdAt.slice(0, 10),
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    'Seeded local Scaffolder history. Existing non-fixture executions are preserved.',
  );
  console.log(
    `Rerunning refreshes the same ${tasks.length} fixtures without duplicating tasks.`,
  );
  console.log(
    'Open http://localhost:3000/template-pulse as Admin User and select Organization analytics.',
  );
} finally {
  db.close();
}
