import { writeFileSync } from 'node:fs';
import { templates, users } from './catalog-fixtures.mjs';

// Publish only fictional names and references, never local database contents.
const catalog = {
  templates: templates.map(template => ({
    ref: `template:default/${template.metadata.name}`,
    name: template.metadata.title,
  })),
  users: users.map(user => ({
    ref: `user:default/${user.metadata.name}`,
    name: user.spec.profile.displayName,
  })),
};
writeFileSync(
  new URL('../packages/app/src/demoCatalog.json', import.meta.url),
  `${JSON.stringify(catalog, null, 2)}\n`,
);
