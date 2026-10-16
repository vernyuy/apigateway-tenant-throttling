// Minimal Cognito sign-in (USER_PASSWORD_AUTH) straight against the Cognito API, no SDK needed.
// The ID token carries the custom:tenant_id claim that API Gateway's Cognito authorizer validates.
//
// DEMO ONLY: production apps should use SRP or the hosted UI, and never keep passwords in the browser.

const REGION = import.meta.env.VITE_REGION ?? '';
const CLIENT_ID = import.meta.env.VITE_USER_POOL_CLIENT_ID ?? '';

export const cognitoConfigured = Boolean(REGION && CLIENT_ID);

const tokens = new Map<string, { idToken: string; expiresAt: number }>();
const inFlight = new Map<string, Promise<string>>();

export async function idTokenFor(username: string, password: string): Promise<string> {
  const cached = tokens.get(username);
  if (cached && cached.expiresAt > Date.now()) return cached.idToken;

  // Many simulator requests start at once; share one sign-in instead of one each.
  let pending = inFlight.get(username);
  if (!pending) {
    pending = signIn(username, password).finally(() => inFlight.delete(username));
    inFlight.set(username, pending);
  }
  return pending;
}

async function signIn(username: string, password: string): Promise<string> {
  const res = await fetch(`https://cognito-idp.${REGION}.amazonaws.com/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    body: JSON.stringify({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: CLIENT_ID,
      AuthParameters: { USERNAME: username, PASSWORD: password },
    }),
  });
  const data = await res.json();
  const result = data.AuthenticationResult as { IdToken?: string; ExpiresIn?: number } | undefined;
  if (!res.ok || !result?.IdToken) throw new Error(data.message ?? 'Sign-in failed');

  // Refresh a minute early so an in-flight request never carries an expired token.
  tokens.set(username, { idToken: result.IdToken, expiresAt: Date.now() + ((result.ExpiresIn ?? 3600) - 60) * 1000 });
  return result.IdToken;
}
