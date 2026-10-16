import { randomBytes } from 'crypto';
import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import { env } from './http';

const cognito = new CognitoIdentityProviderClient({});

/**
 * Every tenant user carries an immutable `custom:tenant_id` attribute. Cognito puts it in the
 * ID token as the `custom:tenant_id` claim, which is how the API knows which tenant is calling.
 */
export const createTenantUser = async (tenantId: string): Promise<{ username: string; password: string }> => {
  const username = `${tenantId}-user`;
  const password = `Pw-${randomBytes(18).toString('base64url')}-9a`;

  await cognito.send(
    new AdminCreateUserCommand({
      UserPoolId: env('USER_POOL_ID'),
      Username: username,
      MessageAction: 'SUPPRESS',
      UserAttributes: [{ Name: 'custom:tenant_id', Value: tenantId }],
    }),
  );
  // Skip the "change your temporary password" step so the demo user can sign in straight away.
  await cognito.send(
    new AdminSetUserPasswordCommand({ UserPoolId: env('USER_POOL_ID'), Username: username, Password: password, Permanent: true }),
  );
  return { username, password };
};

export const deleteTenantUser = async (tenantId: string): Promise<void> => {
  await cognito
    .send(new AdminDeleteUserCommand({ UserPoolId: env('USER_POOL_ID'), Username: `${tenantId}-user` }))
    .catch((err) => {
      if ((err as Error).name !== 'UserNotFoundException') throw err;
    });
};
