# Template Pulse Demo

A local Backstage app for template usage, results, and run times.

## Run it

Use Node.js 22 or 24 and Yarn 4.

```sh
yarn install
yarn start
```

Open [Template Pulse](http://localhost:3000/template-pulse) and choose **Enter** to sign in as admin.

- `yarn start:user` signs in as Jordan Lee.
- `yarn seed:analytics` adds sample runs after the first startup.

History is saved in `.data/`. Stop the app with **Ctrl+C** before switching users, then sign out and back in.

## Develop

`yarn build`, `yarn tsc`, `yarn lint` and `yarn test` check the app.

`yarn sync:plugins` syncs `plugins/` with `../template-pulse`. Add `--check` to check whether they match.

The demo uses the new frontend and backend systems. Database history is hosted
by the Template Pulse Scaffolder module, which receives Scaffolder's database
through dependency injection. The Template Pulse backend calls it over HTTP
with the current user's credentials.

See the [Backstage design audit](docs/backstage-design-audit.md) for the package
roles, official references and compatibility limits.

See the [plugin README](../template-pulse/README.md) for installation in another Backstage app.
