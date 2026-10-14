# Template Pulse backend

[Installation guide](https://github.com/alibayramli/template-pulse#add-to-backstage) for template analytics and execution history.

```ts
backend.add(import('@template-pulse/plugin-backend'));
```

Set `permission.enabled: true`. Grant `template-pulse.read` for personal analytics or `template-pulse.read-all` for organization analytics. Scaffolder task permissions still apply.

`templatePulse.historySource` defaults to `service` for recent runs. For full retained history, use `database` and register the [Scaffolder module](../scaffolder-backend-module-template-pulse/README.md).
