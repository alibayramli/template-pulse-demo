# Template Pulse database history

Let Template Pulse read run history directly from Scaffolder's database.

```sh
yarn workspace backend add @abayramli/backstage-plugin-scaffolder-backend-module-template-pulse@next
```

Register it alongside your Scaffolder backend:

```ts
backend.add(import('@abayramli/backstage-plugin-scaffolder-backend-module-template-pulse'));
```

Set `templatePulse.historySource: database` and configure permissions using the [installation guide](https://github.com/alibayramli/template-pulse#add-to-backstage).

- Uses Scaffolder's existing database connection to read its standard SQL tables without changing them. Tested with SQLite and PostgreSQL.
- Checks the database structure after Scaffolder starts and finishes its migrations.
- Supports the built-in `IS_TASK_OWNER` permission rule. For custom task stores or permission rules, set `templatePulse.historySource: service`.
- After upgrading Scaffolder, check that its database structure still works with this module.

