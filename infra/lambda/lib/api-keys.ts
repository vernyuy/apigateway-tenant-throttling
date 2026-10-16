import {
  APIGatewayClient,
  CreateApiKeyCommand,
  CreateUsagePlanKeyCommand,
  DeleteApiKeyCommand,
  DeleteUsagePlanKeyCommand,
  GetUsageCommand,
  GetUsagePlansCommand,
  UpdateApiKeyCommand,
} from '@aws-sdk/client-api-gateway';
import { env } from './http';

const apigw = new APIGatewayClient({});
const planIds = new Map<string, string>();

export const tiers = (): string[] => Object.keys(JSON.parse(env('USAGE_PLAN_NAMES')));

export interface TierDetails {
  name: string;
  rateLimit: number;
  burstLimit: number;
  quota: { limit: number; period: string };
}

export const tierDetails = (): TierDetails[] =>
  Object.entries(
    JSON.parse(env('TIER_LIMITS')) as Record<string, { throttle: { rateLimit: number; burstLimit: number }; quota: TierDetails['quota'] }>,
  ).map(([name, { throttle, quota }]) => ({ name, ...throttle, quota }));

/** The stage-wide throttle: the ceiling for all companies combined. */
export const stageLimit = (): { rateLimit: number; burstLimit: number } => JSON.parse(env('STAGE_LIMIT'));

/**
 * The usage plan IDs can't be passed to this Lambda as environment variables:
 * Lambda -> usage plan -> stage -> deployment -> method -> Lambda is a CloudFormation cycle.
 * So the stack passes plan NAMES, and we resolve the ID once per container.
 */
const planIdFor = async (tier: string): Promise<string> => {
  const cached = planIds.get(tier);
  if (cached) return cached;

  const name = (JSON.parse(env('USAGE_PLAN_NAMES')) as Record<string, string>)[tier];
  if (!name) throw new Error(`No usage plan for tier ${tier}`);

  let position: string | undefined;
  do {
    const page = await apigw.send(new GetUsagePlansCommand({ position, limit: 500 }));
    const plan = page.items?.find((item) => item.name === name);
    if (plan?.id) {
      planIds.set(tier, plan.id);
      return plan.id;
    }
    position = page.position;
  } while (position);

  throw new Error(`Usage plan ${name} not found`);
};

/** API Gateway generates the value. We only ever store its ID (and last 4 characters for display). */
export const issueApiKey = async (tenantId: string, tier: string): Promise<{ id: string; value: string }> => {
  const usagePlanId = await planIdFor(tier);
  const created = await apigw.send(
    new CreateApiKeyCommand({
      name: `tenant-demo-${tenantId}`,
      description: `API key for tenant ${tenantId}`,
      enabled: true,
    }),
  );
  if (!created.id || !created.value) throw new Error('API Gateway returned a key without an id or value');

  try {
    await apigw.send(new CreateUsagePlanKeyCommand({ usagePlanId, keyId: created.id, keyType: 'API_KEY' }));
  } catch (err) {
    await revokeApiKey(created.id).catch(() => undefined);
    throw err;
  }
  return { id: created.id, value: created.value };
};

export const revokeApiKey = async (apiKeyId: string): Promise<void> => {
  try {
    await apigw.send(new DeleteApiKeyCommand({ apiKey: apiKeyId }));
  } catch (err) {
    if ((err as Error).name !== 'NotFoundException') throw err;
  }
};

/** The kill switch: a disabled key is rejected by API Gateway with 403 before any of our code runs. */
export const setApiKeyEnabled = async (apiKeyId: string, enabled: boolean): Promise<void> => {
  await apigw.send(
    new UpdateApiKeyCommand({
      apiKey: apiKeyId,
      patchOperations: [{ op: 'replace', path: '/enabled', value: String(enabled) }],
    }),
  );
};

/**
 * Moves the key onto its tier's plan and off any other. Idempotent, so a failed
 * tier change can simply be retried.
 *
 * A key can only be in one usage plan per stage, so it has to leave the old plan
 * before joining the new one. AWS notes this can take a few minutes to apply.
 */
export const syncTier = async (apiKeyId: string, tier: string): Promise<void> => {
  const targetId = await planIdFor(tier);
  const current = await apigw.send(new GetUsagePlansCommand({ keyId: apiKeyId, limit: 500 }));
  const currentIds = (current.items ?? []).map((plan) => plan.id).filter((id): id is string => Boolean(id));

  for (const usagePlanId of currentIds.filter((id) => id !== targetId)) {
    await apigw.send(new DeleteUsagePlanKeyCommand({ usagePlanId, keyId: apiKeyId }));
  }
  if (!currentIds.includes(targetId)) {
    await apigw.send(new CreateUsagePlanKeyCommand({ usagePlanId: targetId, keyId: apiKeyId, keyType: 'API_KEY' }));
  }
};

export interface DailyUsage {
  date: string;
  used: number;
  remaining: number;
}

/** Per-tenant usage straight from API Gateway: one [used, remaining] pair per day. */
export const usageFor = async (apiKeyId: string, tier: string, days = 7): Promise<DailyUsage[]> => {
  const end = new Date();
  const start = new Date(end.getTime() - (days - 1) * 86_400_000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const result = await apigw.send(
    new GetUsageCommand({ usagePlanId: await planIdFor(tier), keyId: apiKeyId, startDate: iso(start), endDate: iso(end) }),
  );
  const rows = result.items?.[apiKeyId] ?? [];
  return rows.map(([used = 0, remaining = 0], i) => ({
    date: iso(new Date(start.getTime() + i * 86_400_000)),
    used,
    remaining,
  }));
};
