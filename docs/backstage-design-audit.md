# Backstage plugin design audit

## Frontend system

`@template-pulse/plugin` uses `createFrontendPlugin`, exports its instance as the
package default and declares its feature for package discovery. Its API is
provided with `ApiBlueprint`, using injected discovery and fetch APIs. The
page uses `PageBlueprint` with a route reference, path, title, icon and lazy
loader. Route references live in `routes.ts`, outside plugin wiring, avoiding
circular imports from page components. External routes have defaults for
Catalog entities and Scaffolder tasks; missing targets leave text labels.

The plugin intentionally supports the new frontend system. The `/alpha`
migration entry point is for packages that also maintain legacy frontend
support; it is not required for this new-system-only package. A standalone
`dev/index.tsx` uses the new `createDevApp` helper.

References: [building frontend plugins](https://backstage.io/docs/frontend-system/building-plugins/index/),
[frontend routes](https://backstage.io/docs/frontend-system/architecture/routes/),
[migration guidance](https://backstage.io/docs/frontend-system/building-plugins/migrating/).

## Backend system

`@template-pulse/plugin-backend` uses `createBackendPlugin` with plugin ID
`template-pulse`, a default package export and an initialization function with
injected core services. Its router accepts authenticated users and authorizes
analytics requests. Its permission definitions are registered with the
permissions registry. Configuration is declared in `config.d.ts` and is
included in the package.

The service history source uses `scaffolderServiceRef`, an HTTP client service
from `@backstage/plugin-scaffolder-node`, with the caller's credentials.

Database history previously constructed `DatabaseManager` inside Template
Pulse and opened the database for plugin ID `scaffolder`. That bypassed plugin
isolation and the host's injected database implementation. It now runs in
`@template-pulse/plugin-scaffolder-backend-module-template-pulse`, a module
targeting `scaffolder`. The module receives the target plugin's database and
router through core services. Its endpoint lives under `/modules/template-pulse`.
The database service owns the pool and shutdown lifecycle.

Template Pulse calls the module through `HistoryClient` in the Node library.
Discovery supports separate backend deployments, while each HTTP request gets
a fresh Scaffolder token on behalf of the original user. The module separately
checks analytics permissions and task conditions so direct calls cannot bypass
the Template Pulse router's authorization.

References: [backend plugin isolation](https://backstage.io/docs/backend-system/architecture/plugins/),
[building plugins and modules](https://backstage.io/docs/backend-system/building-plugins-and-modules/index/),
[database service](https://backstage.io/docs/backend-system/core-services/database/),
[delegated authentication](https://backstage.io/docs/backend-system/core-services/auth/),
[permissions registry](https://backstage.io/docs/backend-system/core-services/permissions-registry/).
The older [new backend system guide](https://backstage.io/docs/plugins/new-backend-system/)
now points to the canonical backend system documentation above.

## Common, Node and package metadata

`@template-pulse/plugin-common` is a `common-library`, not a registered plugin.
It contains platform independent DTOs, labels and permission definitions, with
no React or backend dependencies. Backend-only validation, authorization,
aggregation and the HTTP history client live in `@template-pulse/plugin-node`,
with the `node-library` role.

The four Template Pulse plugin/library packages declare their shared plugin ID
and complete `pluginPackages` list. The Scaffolder module declares
`pluginPackage: @backstage/plugin-scaffolder-backend` and is excluded from that
list. It does not depend on the Scaffolder backend package. Source exports,
`typesVersions`, repository metadata and prepack/postpack scripts support local
development and distribution through the Backstage CLI.

The frontend marks both source CSS and generated `*.css.esm.js` modules as
side effects. The original metadata only covered source CSS; a production
consumer bundle removed the published style injection. A packed-package
bundling check confirms the corrected metadata retains those styles.

References: [package metadata](https://backstage.io/docs/tooling/package-metadata/),
[package roles and publishing](https://backstage.io/docs/tooling/cli/build-system/),
[configuration schemas](https://backstage.io/docs/conf/defining/).

## Compatibility limits

Database history still reads private Scaffolder SQL tables inside the owning
plugin. Module placement fixes the isolation and dependency injection problem;
it does not make those table schemas public APIs. The adapter checks its schema
contract and rejects unsupported task rules. SQLite is covered by tests;
PostgreSQL needs validation against a live deployment. Use service history for
custom task stores or permission rules. Selected database cohorts are
aggregated in memory, so validate performance against your history volume.

Legacy frontend compatibility is not provided. The repositories target the
Backstage 1.55 dependency set and React 18.

## Verification

- Type checking, package/app builds, lint and all 17 tests pass in both repositories.
- The standalone frontend development app compiles successfully.
- `backstage-cli repo fix --check --publish` passes in both repositories.
- The demo configuration validates with `backstage-cli config:check`.
- All five packages complete prepack and postpack. Packed entry points,
  dependency versions, feature metadata and the backend configuration schema
  resolve correctly. Production bundling retains the published frontend CSS.
- Live SQLite smoke tests use a separate test database and admin/regular-user
  guest sessions. Both the Template Pulse and module endpoints enforce personal
  scope, deny unauthorized organization scope and reject another user's
  personal-history query. Anonymous module requests fail. Analytics return
  retained history and timings without secrets or raw logs.
- `yarn sync:plugins --check` verifies identical package sources in both repositories.
