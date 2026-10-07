# Template Pulse backend

Register the default backend feature:

```ts
backend.add(import('@template-pulse/plugin-backend'));
```

The plugin requires `permission.enabled: true` and an appropriate permission
policy. It registers its permissions through `coreServices.permissionsRegistry`.
The default `templatePulse.historySource: service` uses the public Scaffolder
client service with the caller's credentials.

For `templatePulse.historySource: database`, also install
`@template-pulse/plugin-scaffolder-backend-module-template-pulse` in the backend
hosting Scaffolder. Template Pulse discovers and calls that module over HTTP;
it never opens another plugin's database.
