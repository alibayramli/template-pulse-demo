# Template Pulse Scaffolder module

Register alongside the Scaffolder backend for full retained SQL history:

```ts
backend.add(import('@backstage/plugin-scaffolder-backend'));
backend.add(
  import('@template-pulse/plugin-scaffolder-backend-module-template-pulse'),
);
```

This is a `backend-plugin-module` targeting `scaffolder`, with module ID
`template-pulse`. It receives Scaffolder's database through `coreServices.database`
and hosts `/api/scaffolder/modules/template-pulse/analytics`. It requires user
credentials, analytics permission and Scaffolder task permission, including
when called directly. The database service manages the connection lifecycle.

The read-only SQL adapter supports the standard SQLite and PostgreSQL task
tables and built-in `IS_TASK_OWNER` conditions. Unknown rules fail closed.
Private Scaffolder table schemas can change; verify compatibility on upgrades.
Custom stores and permission rules should use Template Pulse's service source.
