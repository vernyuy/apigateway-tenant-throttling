import { API_URL } from '../api';
import { Card } from '../components/ui';

export type Theme = 'system' | 'light' | 'dark';

interface Props {
  token: string;
  onToken: (token: string) => void;
  onConnect: () => void;
  connected: boolean;
  theme: Theme;
  onTheme: (theme: Theme) => void;
}

export function Settings({ token, onToken, onConnect, connected, theme, onTheme }: Props) {
  return (
    <div className="page narrow">
      <Card title="Admin access" subtitle="The admin API is protected by a bearer token stored in Secrets Manager. Get it from the AdminTokenCommand stack output.">
        <form
          className="inline"
          onSubmit={(e) => {
            e.preventDefault();
            onConnect();
          }}
        >
          <input type="password" value={token} onChange={(e) => onToken(e.target.value)} placeholder="Admin token" aria-label="Admin token" />
          <button type="submit" className="button primary" disabled={!token}>
            {connected ? 'Reconnect' : 'Connect'}
          </button>
        </form>
      </Card>

      <Card title="Environment">
        <dl className="details">
          <div>
            <dt>API endpoint</dt>
            <dd className="mono small">{API_URL}</dd>
          </div>
          <div>
            <dt>Region</dt>
            <dd className="mono small">{import.meta.env.VITE_REGION}</dd>
          </div>
          <div>
            <dt>Cognito app client</dt>
            <dd className="mono small">{import.meta.env.VITE_USER_POOL_CLIENT_ID}</dd>
          </div>
        </dl>
      </Card>

      <Card title="Appearance">
        <div className="segmented" role="radiogroup" aria-label="Theme">
          {(['system', 'light', 'dark'] as Theme[]).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={theme === t} className={theme === t ? 'active' : ''} onClick={() => onTheme(t)}>
              {t[0]!.toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
