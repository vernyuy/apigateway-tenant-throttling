import { GetAccountSettingsCommand, LambdaClient } from '@aws-sdk/client-lambda';

const lambda = new LambdaClient({});
const CACHE_MS = 60 * 1000;

export interface Capacity {
  /** Account-wide limit on Lambda functions running at the same moment, in this Region. */
  lambdaConcurrency: number;
  /** What is left of it after functions that reserve their own share. */
  unreservedConcurrency: number;
}

let cached: { value: Capacity; expiresAt: number } | null = null;

/**
 * Every GET /employees runs a Lambda function, so the account's concurrency limit caps how much
 * traffic the lab can send before Lambda (not the usage plans) starts rejecting requests.
 * New accounts often start at 10. Returns null if the limit can't be read; the console then shows no budget.
 */
export const lambdaCapacity = async (): Promise<Capacity | null> => {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  try {
    const { AccountLimit } = await lambda.send(new GetAccountSettingsCommand({}));
    const value = {
      lambdaConcurrency: AccountLimit?.ConcurrentExecutions ?? 0,
      unreservedConcurrency: AccountLimit?.UnreservedConcurrentExecutions ?? 0,
    };
    cached = { value, expiresAt: Date.now() + CACHE_MS };
    return value;
  } catch (err) {
    console.warn('Could not read Lambda account settings', { error: (err as Error).name });
    return null;
  }
};
