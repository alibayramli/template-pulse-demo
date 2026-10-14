# Template Pulse Scaffolder module

Provides full retained database history for the [Template Pulse backend](../template-pulse-backend/README.md).

```ts
backend.add(import('@backstage/plugin-scaffolder-backend'));
backend.add(
  import('@template-pulse/plugin-scaffolder-backend-module-template-pulse'),
);
```

Set `templatePulse.historySource: database`. The module reads Scaffolder's database without modifying it and checks user credentials, analytics permissions, and task permissions.

Supports standard SQLite and PostgreSQL tables and the built-in `IS_TASK_OWNER` rule. SQLite is tested; PostgreSQL needs live validation. Check schema compatibility after Scaffolder upgrades. Use service history for custom stores or permission rules.
