# Template Pulse backend

Analytics for Scaffolder runs, controlled by Backstage permissions.

```ts
backend.add(import('@abayramli/backstage-plugin-template-pulse-backend'));
```

Follow the [installation guide](https://github.com/alibayramli/template-pulse#add-to-backstage) to enable permissions and choose who can view their own runs or runs across the organization. By default, the backend reads recent Scaffolder runs. Add the optional database module to read all runs still stored in Scaffolder's database.
