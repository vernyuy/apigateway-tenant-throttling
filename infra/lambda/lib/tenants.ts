import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { env } from './http';

export interface Tenant {
  tenantId: string;
  name: string;
  tier: string;
  apiKeyId: string;
  apiKeyLast4: string;
  apiKeyEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const getTenant = async (tenantId: string): Promise<Tenant | null> => {
  const result = await db.send(new GetCommand({ TableName: env('TABLE_NAME'), Key: { tenantId } }));
  return (result.Item as Tenant | undefined) ?? null;
};

// A scan is fine for a demo. In production, page through results or query a GSI instead.
export const listTenants = async (): Promise<Tenant[]> => {
  const result = await db.send(new ScanCommand({ TableName: env('TABLE_NAME') }));
  return ((result.Items ?? []) as Tenant[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
};

export const createTenant = async (tenant: Tenant): Promise<void> => {
  await db.send(
    new PutCommand({
      TableName: env('TABLE_NAME'),
      Item: tenant,
      ConditionExpression: 'attribute_not_exists(tenantId)',
    }),
  );
};

export const updateTier = async (tenantId: string, tier: string): Promise<void> => {
  await db.send(
    new UpdateCommand({
      TableName: env('TABLE_NAME'),
      Key: { tenantId },
      UpdateExpression: 'SET tier = :tier, updatedAt = :now',
      ConditionExpression: 'attribute_exists(tenantId)',
      ExpressionAttributeValues: { ':tier': tier, ':now': new Date().toISOString() },
    }),
  );
};

// Conditional on the previous key, so two concurrent rotations can't both "win".
export const replaceApiKey = async (tenantId: string, previousId: string, next: { id: string; last4: string }) => {
  await db.send(
    new UpdateCommand({
      TableName: env('TABLE_NAME'),
      Key: { tenantId },
      UpdateExpression: 'SET apiKeyId = :id, apiKeyLast4 = :last4, apiKeyEnabled = :enabled, updatedAt = :now',
      ConditionExpression: 'apiKeyId = :previous',
      ExpressionAttributeValues: {
        ':id': next.id,
        ':last4': next.last4,
        ':enabled': true,
        ':previous': previousId,
        ':now': new Date().toISOString(),
      },
    }),
  );
};

export const setApiKeyEnabled = async (tenantId: string, enabled: boolean): Promise<void> => {
  await db.send(
    new UpdateCommand({
      TableName: env('TABLE_NAME'),
      Key: { tenantId },
      UpdateExpression: 'SET apiKeyEnabled = :enabled, updatedAt = :now',
      ConditionExpression: 'attribute_exists(tenantId)',
      ExpressionAttributeValues: { ':enabled': enabled, ':now': new Date().toISOString() },
    }),
  );
};

export const deleteTenant = async (tenantId: string): Promise<void> => {
  await db.send(new DeleteCommand({ TableName: env('TABLE_NAME'), Key: { tenantId } }));
};
