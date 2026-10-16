import { timingSafeEqual } from 'crypto';
import type { APIGatewayAuthorizerResult, APIGatewayTokenAuthorizerEvent } from 'aws-lambda';
import { getAdminToken } from './lib/secrets';

/**
 * Protects the /admin routes with a bearer token stored in Secrets Manager.
 * Good enough for a demo; use Cognito or IAM for a real admin console.
 */
export const handler = async (event: APIGatewayTokenAuthorizerEvent): Promise<APIGatewayAuthorizerResult> => {
  const supplied = Buffer.from(event.authorizationToken.replace(/^Bearer\s+/i, ''));
  const expected = Buffer.from(await getAdminToken());

  if (expected.length === 0 || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new Error('Unauthorized');
  }

  // The result is cached per token, so allow every admin route, not just the one being called.
  const [apiArn, stage] = event.methodArn.split('/');
  return {
    principalId: 'admin',
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{ Action: 'execute-api:Invoke', Effect: 'Allow', Resource: `${apiArn}/${stage}/*/admin/*` }],
    },
  };
};
