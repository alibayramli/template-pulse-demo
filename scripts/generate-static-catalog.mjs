import { writeFileSync } from 'node:fs';
import { templates, users, groups } from './catalog-fixtures.mjs';

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
  teams: groups.map(group => ({
    ref: `group:default/${group.metadata.name}`,
    name: group.metadata.title,
    members: users
      .filter(
        user =>
          user.spec.memberOf.includes(group.metadata.name) ||
          group.spec.members?.includes(user.metadata.name),
      )
      .map(user => `user:default/${user.metadata.name}`),
  })),
};
writeFileSync(
  new URL('../packages/app/src/demoCatalog.json', import.meta.url),
  `${JSON.stringify(catalog, null, 2)}\n`,
);
