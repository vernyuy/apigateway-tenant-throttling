import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { env } from './http';

const secrets = new SecretsManagerClient({});
const CACHE_MS = 5 * 60 * 1000;
let adminToken: { value: string; expiresAt: number } | null = null;

export const getAdminToken = async (): Promise<string> => {
  if (adminToken && adminToken.expiresAt > Date.now()) return adminToken.value;
  const result = await secrets.send(new GetSecretValueCommand({ SecretId: env('ADMIN_TOKEN_SECRET_ARN') }));
  adminToken = { value: result.SecretString ?? '', expiresAt: Date.now() + CACHE_MS };
  return adminToken.value;
};
