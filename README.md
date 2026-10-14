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

## Public analytics showcase

The GitHub Pages version displays the actual Template Pulse dashboard with
350 fictional, finished executions across 50 templates and 100 users. Visitors
can explore metrics, activity, rankings, search, date filters, and execution
history. It opens immediately without sign-in. Dates are relative to each visit,
so the default 30-day view always includes 250 runs; all-history also includes
100 older runs. The page identifies the data as simulated.

```sh
yarn start:demo
```

This starts only the frontend at http://localhost:3000. The showcase computes
analytics in the browser, with no backend, database, catalog requests, or template
execution features. It never reads or publishes your local `.data/` files.

Build the static files with:

```sh
yarn build:demo
```

The output is `packages/app/dist/`, ready for GitHub Pages. The default public
URL is https://alibayramli.github.io/template-pulse-demo/. To build for a different
repository path or custom domain, set `DEMO_BASE_URL` to its full URL. The Pages
workflow supplies this value automatically from GitHub's Pages configuration.

In the GitHub repository, select **Settings → Pages → Source → GitHub Actions**.
GitHub Pages requires a public repository on GitHub Free, or a plan that supports
Pages for private repositories. Making a repository public exposes its contents
and Git history; a separate public repository containing only the built files
can host the showcase while keeping this source repository private.
The `Deploy analytics showcase to GitHub Pages` workflow checks and builds the
demo, then publishes it on pushes to `master` or `main`. It can also be run
manually from the Actions tab. Filters are kept in the root page's query string,
so shared links and reloads work under GitHub Pages' repository subdirectory.

`yarn test:demo` checks fixture data, metric parity with the backend, filtering,
pagination, and date handling. `node scripts/generate-static-catalog.mjs`
refreshes the bundled fictional catalog after changing `scripts/catalog-fixtures.mjs`.

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
