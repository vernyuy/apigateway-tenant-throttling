import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { listEmployees } from './lib/employees';
import { error, json } from './lib/http';
import { getTenant } from './lib/tenants';

/**
 * GET /employees: the calling company's employee directory.
 *
 * By the time this runs, API Gateway has already:
 *  - validated the Cognito JWT (so the custom:tenant_id claim can be trusted), and
 *  - accepted the x-api-key and applied that key's usage plan.
 *
 * Two checks remain, and both belong here:
 *  1. The API key must belong to the token's company. Otherwise an employee of company A could
 *     send company B's key and spend B's rate limit.
 *  2. Every read is scoped to the token's company, so one company can never see another's people.
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const claims = event.requestContext.authorizer?.claims as Record<string, string> | undefined;
  const tenantId = claims?.['custom:tenant_id'];
  const apiKeyId = event.requestContext.identity?.apiKeyId;
  if (!tenantId || !apiKeyId) return error(401, 'Unauthorized');

  // Both reads are scoped to the token's company, so they can run in parallel. That shortens each
  // invocation, which matters when the account can only run a few functions at once.
  // Nothing is returned until the key check below has passed.
  const [company, employees] = await Promise.all([
    getTenant(tenantId),
    listEmployees(tenantId, event.queryStringParameters?.department),
  ]);
  if (!company || company.apiKeyId !== apiKeyId) {
    return error(403, "x-api-key does not belong to the caller's company");
  }

  return json(200, {
    company: { id: company.tenantId, name: company.name, tier: company.tier },
    count: employees.length,
    employees: employees.map(({ tenantId: _, ...employee }) => employee),
  });
};
