# Template Pulse frontend

Native new frontend system plugin. Its default export registers a lazy page,
API factory and route references. Install it in `createApp({ features })`, or
through app package discovery. The page appears at `/template-pulse` by default.

Task and entity links default to `scaffolder.ongoingTask` and
`catalog.catalogEntity`; unbound links render as text. Import
`@backstage/ui/css/styles.css` in the app entry point.

Run `yarn workspace @template-pulse/plugin start` for the standalone development
app. Analytics require a running, authenticated Template Pulse backend and a
permission policy granting the appropriate analytics permission.
