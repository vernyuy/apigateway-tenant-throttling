/**
 * One usage plan per tier. Every limit here applies to EACH tenant's API key on its own:
 * ten basic tenants get 2 req/s each, not 2 req/s between them.
 *
 * The numbers are deliberately tiny so you can watch throttling happen from a browser.
 * Real values would be closer to 10 / 50 / 100 req/s.
 */
export const TIERS = {
  basic: {
    throttle: { rateLimit: 2, burstLimit: 4 },
    quota: { limit: 5_000, period: 'DAY' },
  },
  premium: {
    throttle: { rateLimit: 10, burstLimit: 20 },
    quota: { limit: 50_000, period: 'DAY' },
  },
  enterprise: {
    throttle: { rateLimit: 50, burstLimit: 100 },
    quota: { limit: 500_000, period: 'DAY' },
  },
} as const;

export type Tier = keyof typeof TIERS;

/**
 * Shared by every caller of the stage. Keep it above the sum of what you sell,
 * or busy tenants start eating into each other's headroom again.
 */
export const STAGE_THROTTLE = { rateLimit: 100, burstLimit: 200 };

/**
 * The admin Lambda finds a tier's usage plan by name, so names must be unique in the account and
 * Region. Prefixing the stack name keeps two deployed stacks from picking each other's plans.
 */
export const usagePlanName = (stackName: string, tier: string) => `${stackName}-${tier}`;
