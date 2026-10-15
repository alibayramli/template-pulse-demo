import { createBackendModule } from '@backstage/backend-plugin-api';
import {
  AuthorizeResult,
  isPermission,
  isResourcePermission,
} from '@backstage/plugin-permission-common';
import { policyExtensionPoint } from '@backstage/plugin-permission-node/alpha';
import {
  createScaffolderTaskConditionalDecision,
  scaffolderTaskConditions,
} from '@backstage/plugin-scaffolder-backend/alpha';
import {
  executionsReadAllPermission,
  executionsReadPermission,
} from '@abayramli/backstage-plugin-template-pulse-common';

// Local demo identities only. Production hosts supply their own group/role policy.
export const demoPolicy = createBackendModule({
  pluginId: 'permission',
  moduleId: 'execution-demo-policy',
  register(reg) {
    reg.registerInit({
      deps: { policy: policyExtensionPoint },
      async init({ policy }) {
        policy.setPolicy({
          async handle(request, user) {
            const userRef = user?.info.userEntityRef;
            if (!userRef) return { result: AuthorizeResult.DENY };
            const admin = userRef === 'user:default/admin';
            if (isPermission(request.permission, executionsReadAllPermission)) {
              return {
                result: admin ? AuthorizeResult.ALLOW : AuthorizeResult.DENY,
              };
            }
            if (isPermission(request.permission, executionsReadPermission)) {
              return { result: AuthorizeResult.ALLOW };
            }
            if (
              !admin &&
              isResourcePermission(request.permission, 'scaffolder-task')
            ) {
              return createScaffolderTaskConditionalDecision(
                request.permission,
                scaffolderTaskConditions.isTaskOwner({ createdBy: [userRef] }),
              );
            }
            return { result: AuthorizeResult.ALLOW };
          },
        });
      },
    });
  },
});
