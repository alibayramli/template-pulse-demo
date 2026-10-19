# Template Pulse Demo

**[Try the live demo](https://alibayramli.github.io/template-pulse-demo/)** · [Install the plugin](https://github.com/alibayramli/template-pulse#add-to-backstage)

A Backstage app for exploring Template Pulse: template usage, success rates, run times, and searchable execution history.

## Preview

Interactive showcase with fictional data; no backend or sign-in required.

![Template health overview in the interactive demo showing usage, success rates, and run times](docs/assets/screenshots/template-health.png)

<details>
<summary>Team adoption and filtered runs</summary>

![Interactive demo user adoption filtered by team](docs/assets/screenshots/team-adoption.png)

![Interactive demo run history filtered by template and failed status](docs/assets/screenshots/executions-by-template.png)

![Interactive demo run history filtered by team and user](docs/assets/screenshots/executions-by-user.png)

</details>

## Run the showcase

Requires Node.js 22 or 24 and Yarn 4.

```sh
yarn install
yarn start:demo
```

Open [localhost:3000](http://localhost:3000) to explore 50 templates, 100 users, and 350 sample runs. The showcase runs entirely in your browser and does not execute templates.

## Run with a backend

```sh
yarn start
```

Open [Template Pulse](http://localhost:3000/template-pulse) and choose **Enter** to sign in as **Admin User** (`user:default/admin`). Use **My analytics** to see this user's executions. Run `yarn seed:analytics` in another terminal after startup to add sample history, or run a template through Scaffolder.

Use `yarn start:user` for a regular user. Stop the app before switching, then sign out and back in. Local history is saved in the ignored `.data/` directory.

The backend uses guest identities and a demo permission policy for local use. Use your own authentication and permission policy for a deployed Backstage app.

## Build and develop

- `yarn build:demo` builds the static showcase in `packages/app/dist/`. Set `DEMO_BASE_URL` to build for another public URL.
- `yarn test:demo` checks the showcase. Before deploying, run `yarn tsc`, `yarn lint`, `yarn test`, `yarn build`, and `yarn build:demo`.
- To copy changes from a sibling `template-pulse` checkout, run `yarn sync:plugins --from-plugin`, then `yarn install` and `yarn sync:plugins --check` to verify all five packages match. Sync includes source, tests, package metadata, licenses, assets, and file removals.
- `yarn sync:plugins` syncs local changes in both directions and checks for conflicts.
- When plugin package names or APIs change, update imports and dependencies in `packages/app` and `packages/backend` too.

The GitHub Actions workflow deploys the showcase on pushes to `main`. Set **Settings → Pages → Source** to **GitHub Actions**. Only the static build is published; local history stays in `.data/`.
