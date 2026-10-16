import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

// Demo only: lock this down to your front-end's origin in a real system.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

export const json = (statusCode: number, body: unknown): APIGatewayProxyResult => ({
  statusCode,
  headers: CORS_HEADERS,
  body: JSON.stringify(body),
});

export const error = (statusCode: number, message: string): APIGatewayProxyResult => json(statusCode, { message });

export const parseBody = (event: APIGatewayProxyEvent): Record<string, unknown> | null => {
  if (!event.body) return {};
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const env = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
};
