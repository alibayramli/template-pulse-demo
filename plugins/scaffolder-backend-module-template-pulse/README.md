# Template Pulse database history

Optional retained execution history for the Template Pulse backend.

```sh
yarn workspace backend add @abayramli/backstage-plugin-scaffolder-backend-module-template-pulse@next
```

Register it alongside your Scaffolder backend:

```ts
backend.add(import('@abayramli/backstage-plugin-scaffolder-backend-module-template-pulse'));
```

Set `templatePulse.historySource: database` and configure permissions using the [installation guide](https://github.com/alibayramli/template-pulse#add-to-backstage).

Uses Scaffolder's existing database connection and reads its standard SQL tables without modifying them. SQLite and PostgreSQL are tested. The module validates the schema after Scaffolder initialization, when its migrations have completed. Supports the built-in `IS_TASK_OWNER` rule; use `service` history for custom stores or rules. Recheck schema compatibility after Scaffolder upgrades.

