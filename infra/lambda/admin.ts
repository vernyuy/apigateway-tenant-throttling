import { randomInt } from 'crypto';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { issueApiKey, revokeApiKey, setApiKeyEnabled, stageLimit, syncTier, tierDetails, tiers, usageFor } from './lib/api-keys';
import { lambdaCapacity } from './lib/capacity';
import { deleteEmployees, seedEmployees } from './lib/employees';
import { error, json, parseBody } from './lib/http';
import * as tenants from './lib/tenants';
import { createTenantUser, deleteTenantUser } from './lib/users';

const ID_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const newTenantId = () => `t_${Array.from({ length: 10 }, () => ID_ALPHABET[randomInt(ID_ALPHABET.length)]).join('')}`;

const view = (t: tenants.Tenant) => ({
  tenantId: t.tenantId,
  name: t.name,
  tier: t.tier,
  apiKeyPreview: `••••${t.apiKeyLast4}`,
  apiKeyEnabled: t.apiKeyEnabled,
  createdAt: t.createdAt,
});

/** Onboarding a company: Cognito user (custom:tenant_id), API key in the tier's plan, sample directory, tenant record. Rolls back on failure. */
async function createTenant(body: Record<string, unknown>) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const tier = typeof body.tier === 'string' ? body.tier : 'basic';
  if (name.length < 2 || name.length > 60) return error(400, 'name must be 2-60 characters');
  if (!tiers().includes(tier)) return error(400, `tier must be one of: ${tiers().join(', ')}`);

  const tenantId = newTenantId();
  const user = await createTenantUser(tenantId);
  let apiKeyId: string | undefined;

  try {
    const apiKey = await issueApiKey(tenantId, tier);
    apiKeyId = apiKey.id;
    await seedEmployees(tenantId, name);
    const now = new Date().toISOString();
    const tenant: tenants.Tenant = {
      tenantId,
      name,
      tier,
      apiKeyId: apiKey.id,
      apiKeyLast4: apiKey.value.slice(-4),
      apiKeyEnabled: true,
      createdAt: now,
      updatedAt: now,
    };
    await tenants.createTenant(tenant);

    // The only time the plaintext credentials leave the platform.
    return json(201, { tenant: view(tenant), credentials: { apiKey: apiKey.value, ...user } });
  } catch (err) {
    if (apiKeyId) await revokeApiKey(apiKeyId).catch(() => undefined);
    await deleteEmployees(tenantId).catch(() => undefined);
    await deleteTenantUser(tenantId).catch(() => undefined);
    throw err;
  }
}

/** Upgrade/downgrade: record first, then move the key. Calling again with the same tier finishes a failed move. */
async function changeTier(tenantId: string, body: Record<string, unknown>) {
  const tier = typeof body.tier === 'string' ? body.tier : '';
  if (!tiers().includes(tier)) return error(400, `tier must be one of: ${tiers().join(', ')}`);

  const tenant = await tenants.getTenant(tenantId);
  if (!tenant) return error(404, 'Tenant not found');

  if (tenant.tier !== tier) await tenants.updateTier(tenantId, tier);
  await syncTier(tenant.apiKeyId, tier);

  return json(200, {
    tenant: view({ ...tenant, tier }),
    message: 'Tier updated. API Gateway can take a few minutes to apply the new limits.',
  });
}

/** Rotation: new key first, point the tenant at it, then delete the old one. */
async function rotateKey(tenantId: string) {
  const tenant = await tenants.getTenant(tenantId);
  if (!tenant) return error(404, 'Tenant not found');

  const next = await issueApiKey(tenantId, tenant.tier);
  try {
    await tenants.replaceApiKey(tenantId, tenant.apiKeyId, { id: next.id, last4: next.value.slice(-4) });
  } catch (err) {
    await revokeApiKey(next.id).catch(() => undefined);
    if ((err as Error).name === 'ConditionalCheckFailedException') return error(409, 'Key was rotated concurrently');
    throw err;
  }
  // Even if this fails, the old key no longer matches the tenant record, so GET /employees rejects it.
  await revokeApiKey(tenant.apiKeyId).catch(() => undefined);

  const updated = { ...tenant, apiKeyId: next.id, apiKeyLast4: next.value.slice(-4), apiKeyEnabled: true };
  return json(200, { tenant: view(updated), credentials: { apiKey: next.value } });
}

async function setEnabled(tenantId: string, body: Record<string, unknown>) {
  if (typeof body.enabled !== 'boolean') return error(400, 'enabled must be true or false');
  const tenant = await tenants.getTenant(tenantId);
  if (!tenant) return error(404, 'Tenant not found');

  await setApiKeyEnabled(tenant.apiKeyId, body.enabled);
  await tenants.setApiKeyEnabled(tenantId, body.enabled);
  return json(200, { tenant: view({ ...tenant, apiKeyEnabled: body.enabled }) });
}

async function usage(tenantId: string) {
  const tenant = await tenants.getTenant(tenantId);
  if (!tenant) return error(404, 'Tenant not found');
  return json(200, { tenantId, tier: tenant.tier, days: await usageFor(tenant.apiKeyId, tenant.tier) });
}

/** API keys are created at runtime, so `cdk destroy` won't remove them. Delete tenants first. */
async function removeTenant(tenantId: string) {
  const tenant = await tenants.getTenant(tenantId);
  if (!tenant) return error(404, 'Tenant not found');
  await revokeApiKey(tenant.apiKeyId);
  await deleteTenantUser(tenantId);
  await deleteEmployees(tenantId);
  await tenants.deleteTenant(tenantId);
  return json(200, { deleted: tenantId });
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const body = parseBody(event);
  if (!body) return error(400, 'Body must be a JSON object');
  const tenantId = event.pathParameters?.tenantId ?? '';
  const route = `${event.httpMethod} ${event.resource}`;

  try {
    switch (route) {
      case 'GET /admin/tenants':
        return json(200, { tenants: (await tenants.listTenants()).map(view), tiers: tierDetails(), stage: stageLimit(), capacity: await lambdaCapacity() });
      case 'POST /admin/tenants':
        return await createTenant(body);
      case 'DELETE /admin/tenants/{tenantId}':
        return await removeTenant(tenantId);
      case 'POST /admin/tenants/{tenantId}/tier':
        return await changeTier(tenantId, body);
      case 'POST /admin/tenants/{tenantId}/api-key/rotate':
        return await rotateKey(tenantId);
      case 'POST /admin/tenants/{tenantId}/api-key/enabled':
        return await setEnabled(tenantId, body);
      case 'GET /admin/tenants/{tenantId}/usage':
        return await usage(tenantId);
      default:
        return error(404, `No route for ${route}`);
    }
  } catch (err) {
    console.error('Admin request failed', { route, tenantId, error: (err as Error).name, message: (err as Error).message });
    // CreateApiKey is limited to 5 requests/second per account, and that can't be raised.
    if ((err as Error).name === 'TooManyRequestsException') return error(429, 'Too many onboarding calls, retry shortly');
    return error(500, 'Internal error');
  }
};
