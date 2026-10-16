import { useCallback, useEffect, useMemo, useState } from 'react';
import { API_URL, ApiError, adminApi, fetchDirectory, type Capacity, type TenantView, type Throttle, type TierDetails } from './api';
import { cognitoConfigured } from './cognito';
import { CompanyDrawer } from './components/CompanyDrawer';
import { CredentialsModal } from './components/CredentialsModal';
import { IconActivity, IconBuilding, IconOverview, IconRefresh, IconSettings } from './components/Icons';
import { credentials } from './credentials';
import { useTraffic } from './hooks/useTraffic';
import { Companies } from './pages/Companies';
import { Overview } from './pages/Overview';
import { Settings, type Theme } from './pages/Settings';
import { TrafficLab } from './pages/TrafficLab';

type Page = 'overview' | 'companies' | 'traffic' | 'settings';

const PAGES: { id: Page; label: string; title: string; subtitle: string; icon: JSX.Element }[] = [
  { id: 'overview', label: 'Overview', title: 'Overview', subtitle: 'Companies, plans and traffic at a glance', icon: <IconOverview /> },
  { id: 'companies', label: 'Companies', title: 'Companies', subtitle: 'Each company is a tenant with its own API key and usage plan', icon: <IconBuilding /> },
  { id: 'traffic', label: 'Traffic lab', title: 'Traffic lab', subtitle: 'Watch per-company rate limits contain a noisy neighbour', icon: <IconActivity /> },
  { id: 'settings', label: 'Settings', title: 'Settings', subtitle: 'Admin access, environment and appearance', icon: <IconSettings /> },
];

const store = {
  get: (key: string) => {
    try {
      return sessionStorage.getItem(key) ?? localStorage.getItem(key) ?? '';
    } catch {
      return '';
    }
  },
  set: (key: string, value: string, persistent = false) => {
    try {
      (persistent ? localStorage : sessionStorage).setItem(key, value);
    } catch {
      // storage unavailable: keep the value for this page view only
    }
  },
};

const applyTheme = (theme: Theme) => {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
};

export default function App() {
  const [page, setPage] = useState<Page>('overview');
  const [token, setToken] = useState(() => store.get('directory-demo.admin-token'));
  const [theme, setTheme] = useState<Theme>(() => (store.get('directory-demo.theme') as Theme) || 'system');
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tenants, setTenants] = useState<TenantView[]>([]);
  const [tiers, setTiers] = useState<TierDetails[]>([]);
  const [capacity, setCapacity] = useState<Capacity | null>(null);
  const [stage, setStage] = useState<Throttle | null>(null);
  const [usageToday, setUsageToday] = useState<Record<string, number | undefined>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [shown, setShown] = useState<{ title: string; values: Record<string, string> } | null>(null);
  const traffic = useTraffic();

  const api = useMemo(() => adminApi(token), [token]);

  useEffect(() => applyTheme(theme), [theme]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), toast.error ? 7000 : 4000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const fail = (err: unknown) =>
    setToast({ text: err instanceof ApiError ? `${err.status} · ${err.message}` : String(err), error: true });

  const loadUsageToday = useCallback(
    (list: TenantView[]) => {
      for (const t of list) {
        api
          .usage(t.tenantId)
          .then(({ days }) => setUsageToday((u) => ({ ...u, [t.tenantId]: days.at(-1)?.used ?? 0 })))
          .catch(() => setUsageToday((u) => ({ ...u, [t.tenantId]: 0 })));
      }
    },
    [api],
  );

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await api.list();
      setTenants(data.tenants);
      setTiers(data.tiers);
      setCapacity(data.capacity ?? null);
      setStage(data.stage ?? null);
      setConnected(true);
      setUsageToday({});
      loadUsageToday(data.tenants);
    } catch (err) {
      setConnected(false);
      fail(err);
    } finally {
      setLoading(false);
    }
  }, [api, token, loadUsageToday]);

  useEffect(() => {
    void refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = () => {
    store.set('directory-demo.admin-token', token);
    void refresh();
  };

  const replace = (updated: TenantView) => setTenants((list) => list.map((t) => (t.tenantId === updated.tenantId ? updated : t)));

  const withBusy = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const createCompany = async (name: string, tier: string) => {
    setCreating(true);
    try {
      const { tenant, credentials: creds } = await api.create(name, tier);
      credentials.save(tenant.tenantId, creds);
      setTenants((list) => [...list, tenant]);
      setUsageToday((u) => ({ ...u, [tenant.tenantId]: 0 }));
      setShown({
        title: `${tenant.name} is ready`,
        values: {
          'Company (tenant) ID': tenant.tenantId,
          'Employee username': creds.username,
          'Employee password': creds.password,
          'API key (x-api-key)': creds.apiKey,
        },
      });
      return true;
    } catch (err) {
      fail(err);
      return false;
    } finally {
      setCreating(false);
    }
  };

  const current = PAGES.find((p) => p.id === page)!;
  const selectedTenant = tenants.find((t) => t.tenantId === selected);
  const configured = Boolean(API_URL && API_URL !== '/' && cognitoConfigured);

  const content = !configured ? (
    <div className="page narrow">
      <div className="callout warning">
        Missing API or Cognito settings. Run <code>npm run deploy</code>, which writes <code>web/.env.local</code>, then restart{' '}
        <code>npm run web</code>.
      </div>
    </div>
  ) : !connected && page !== 'settings' ? (
    <div className="page narrow">
      <div className="connect">
        <h2>Connect to your deployment</h2>
        <p className="muted">Paste the admin token from the AdminTokenCommand stack output to manage companies.</p>
        <form
          className="inline"
          onSubmit={(e) => {
            e.preventDefault();
            connect();
          }}
        >
          <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Admin token" aria-label="Admin token" />
          <button type="submit" className="button primary" disabled={!token || loading}>
            {loading ? 'Connecting…' : 'Connect'}
          </button>
        </form>
      </div>
    </div>
  ) : page === 'overview' ? (
    <Overview tenants={tenants} tiers={tiers} stage={stage} usageToday={usageToday} traffic={traffic} onNavigate={setPage} />
  ) : page === 'companies' ? (
    <Companies tenants={tenants} tiers={tiers} usageToday={usageToday} creating={creating} onCreate={createCompany} onOpen={setSelected} />
  ) : page === 'traffic' ? (
    <TrafficLab tenants={tenants} tiers={tiers} stage={stage} traffic={traffic} capacity={capacity} />
  ) : (
    <Settings
      token={token}
      onToken={setToken}
      onConnect={connect}
      connected={connected}
      theme={theme}
      onTheme={(t) => {
        setTheme(t);
        store.set('directory-demo.theme', t, true);
      }}
    />
  );

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            CD
          </span>
          <div>
            <div className="brand-name">Company Directory</div>
            <div className="brand-sub">Platform console</div>
          </div>
        </div>
        <nav className="nav" aria-label="Main">
          {PAGES.map((p) => (
            <button
              key={p.id}
              type="button"
              className={page === p.id ? 'active' : ''}
              aria-current={page === p.id ? 'page' : undefined}
              onClick={() => setPage(p.id)}
            >
              {p.icon}
              <span>{p.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className={`conn ${connected ? 'on' : ''}`} aria-hidden="true" />
          <span>{connected ? 'Connected' : 'Not connected'}</span>
          <span className="muted">· stage demo</span>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>{current.title}</h1>
            <p className="muted">{current.subtitle}</p>
          </div>
          {connected && page !== 'settings' && (
            <button type="button" className="button" onClick={() => void refresh()} disabled={loading}>
              <IconRefresh size={16} /> {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          )}
        </header>
        {content}
      </main>

      {selectedTenant && (
        <CompanyDrawer
          key={selectedTenant.tenantId}
          tenant={selectedTenant}
          tiers={tiers}
          busy={busy}
          canBrowse={Boolean(credentials.all()[selectedTenant.tenantId])}
          onClose={() => setSelected(null)}
          onChangeTier={(tier) =>
            withBusy(async () => {
              const res = await api.changeTier(selectedTenant.tenantId, tier);
              replace(res.tenant);
              setToast({ text: `${res.tenant.name} moved to ${tier}. New limits can take a few minutes to apply.` });
            })
          }
          onRotate={() =>
            withBusy(async () => {
              const res = await api.rotate(selectedTenant.tenantId);
              credentials.save(selectedTenant.tenantId, res.credentials);
              replace(res.tenant);
              setShown({ title: `New API key for ${selectedTenant.name}`, values: { 'API key (x-api-key)': res.credentials.apiKey } });
            })
          }
          onToggle={() =>
            withBusy(async () => {
              const res = await api.setEnabled(selectedTenant.tenantId, !selectedTenant.apiKeyEnabled);
              replace(res.tenant);
              setToast({ text: `${res.tenant.name}'s key ${res.tenant.apiKeyEnabled ? 'reactivated' : 'suspended'}.` });
            })
          }
          onDelete={() =>
            withBusy(async () => {
              await api.remove(selectedTenant.tenantId);
              credentials.remove(selectedTenant.tenantId);
              setTenants((list) => list.filter((t) => t.tenantId !== selectedTenant.tenantId));
              setSelected(null);
              setToast({ text: `${selectedTenant.name} deleted.` });
            })
          }
          loadUsage={async () => {
            try {
              return (await api.usage(selectedTenant.tenantId)).days;
            } catch (err) {
              fail(err);
              return [];
            }
          }}
          loadDirectory={async () => {
            try {
              return await fetchDirectory(credentials.all()[selectedTenant.tenantId]);
            } catch (err) {
              fail(err);
              return null;
            }
          }}
        />
      )}

      {shown && <CredentialsModal title={shown.title} values={shown.values} onClose={() => setShown(null)} />}

      {toast && (
        <div className={`toast ${toast.error ? 'error' : ''}`} role={toast.error ? 'alert' : 'status'}>
          {toast.text}
        </div>
      )}
    </div>
  );
}
