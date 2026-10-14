# Template Pulse Demo

**[Try the live demo](https://alibayramli.github.io/template-pulse-demo/)** · [Install the plugin](https://github.com/alibayramli/template-pulse#add-to-backstage)

A Backstage app for exploring Template Pulse: template usage, success rates, run times, and searchable execution history.

## Preview

Template Pulse in Backstage, using fictional demo data.

![Template health overview showing usage, success rates, and run times in Backstage](docs/assets/screenshots/template-health.png)

More views: [Executions by template](docs/assets/screenshots/executions-by-template.png) · [Executions by user](docs/assets/screenshots/executions-by-user.png).

## Run the showcase

Requires Node.js 22 or 24 and Yarn 4.

```sh
yarn install
yarn start:demo
```

Open [localhost:3000](http://localhost:3000). The showcase uses fictional data for 50 templates, 100 users, and 350 runs. It runs entirely in the browser, with no sign-in, backend, or template execution.

## Run with a backend

```sh
yarn start
```

Open [Template Pulse](http://localhost:3000/template-pulse) and choose **Enter** to sign in as admin. Run `yarn seed:analytics` in another terminal after startup to add sample history, or run a template through Scaffolder.

Use `yarn start:user` for a regular user. Stop the app before switching, then sign out and back in. Local history is saved in the ignored `.data/` directory.

The backend uses guest identities and a demo permission policy for local use. Use your own authentication and permission policy for a deployed Backstage app.

## Build and develop

- `yarn build:demo` builds the static showcase in `packages/app/dist/`. Set `DEMO_BASE_URL` to build for another public URL.
- `yarn test:demo` checks the showcase; `yarn build`, `yarn tsc`, `yarn lint`, and `yarn test` check the full app.
- `yarn sync:plugins --check` checks that `plugins/` matches a sibling plugin checkout; `yarn sync:plugins` syncs changes.

The GitHub Actions workflow deploys the showcase on pushes to `master` or `main`. Set **Settings → Pages → Source** to **GitHub Actions**. Only the static build is published; local history stays in `.data/`.
