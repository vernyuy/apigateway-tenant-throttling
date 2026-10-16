import { useEffect, useState } from 'react';
import type { DailyUsage, Directory, TenantView, TierDetails } from '../api';
import { UsageChart } from './charts/UsageChart';
import { IconClose, IconKey, IconUsers } from './Icons';
import { EmptyState, KeyStatus, TierBadge, formatDate, formatNumber, initials } from './ui';

type Tab = 'overview' | 'directory' | 'usage';

interface Props {
  tenant: TenantView;
  tiers: TierDetails[];
  busy: boolean;
  canBrowse: boolean;
  onClose: () => void;
  onChangeTier: (tier: string) => void;
  onRotate: () => void;
  onToggle: () => void;
  onDelete: () => void;
  loadUsage: () => Promise<DailyUsage[]>;
  loadDirectory: () => Promise<Directory | null>;
}

export function CompanyDrawer(props: Props) {
  const { tenant, tiers, busy, canBrowse, onClose, onChangeTier, onRotate, onToggle, onDelete, loadUsage, loadDirectory } = props;
  const [tab, setTab] = useState<Tab>('overview');
  const [tier, setTier] = useState(tenant.tier);
  const [usage, setUsage] = useState<DailyUsage[] | null>(null);
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [department, setDepartment] = useState('All');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => setTier(tenant.tier), [tenant.tier]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (tab === 'usage' && !usage) void loadUsage().then(setUsage);
    if (tab === 'directory' && !directory && canBrowse) void loadDirectory().then(setDirectory);
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const departments = directory ? ['All', ...new Set(directory.employees.map((e) => e.department))] : [];
  const employees = directory?.employees.filter((e) => department === 'All' || e.department === department) ?? [];
  const plan = tiers.find((t) => t.name === tenant.tier);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={tenant.name} onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <span className="avatar large" aria-hidden="true">
            {initials(tenant.name)}
          </span>
          <div className="drawer-title">
            <h2>{tenant.name}</h2>
            <div className="muted mono small">{tenant.tenantId}</div>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <IconClose />
          </button>
        </header>

        <nav className="tabs" role="tablist">
          {(['overview', 'directory', 'usage'] as Tab[]).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
              {t[0]!.toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>

        <div className="drawer-body">
          {tab === 'overview' && (
            <>
              <dl className="details">
                <div>
                  <dt>Tier</dt>
                  <dd>
                    <TierBadge tier={tenant.tier} />
                    {plan && (
                      <span className="muted small">
                        {' '}
                        · {plan.rateLimit} req/s, burst {plan.burstLimit}, {formatNumber(plan.quota.limit)}/day
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>API key</dt>
                  <dd className="key-cell">
                    <code>{tenant.apiKeyPreview}</code>
                    <KeyStatus enabled={tenant.apiKeyEnabled} />
                  </dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{formatDate(tenant.createdAt)}</dd>
                </div>
              </dl>

              <section className="panel">
                <h3>Change tier</h3>
                <p className="muted small">
                  Moves this company's existing key to another usage plan. The key does not change, but API Gateway can take a
                  few minutes to apply the new limits.
                </p>
                <div className="inline">
                  <select value={tier} onChange={(e) => setTier(e.target.value)} aria-label="New tier" disabled={busy}>
                    {tiers.map((t) => (
                      <option key={t.name} value={t.name}>
                        {t.name[0]!.toUpperCase() + t.name.slice(1)} · {t.rateLimit} req/s
                      </option>
                    ))}
                  </select>
                  <button type="button" className="button primary" disabled={busy || tier === tenant.tier} onClick={() => onChangeTier(tier)}>
                    Apply
                  </button>
                </div>
              </section>

              <section className="panel">
                <h3>
                  <IconKey size={16} /> API key
                </h3>
                <p className="muted small">
                  Rotating issues a new key and deletes the old one. Suspending makes API Gateway reject this company's calls
                  with 403, without affecting anyone else.
                </p>
                <div className="inline">
                  <button type="button" className="button" disabled={busy} onClick={onRotate}>
                    Rotate key
                  </button>
                  <button type="button" className="button" disabled={busy} onClick={onToggle}>
                    {tenant.apiKeyEnabled ? 'Suspend key' : 'Reactivate key'}
                  </button>
                </div>
              </section>

              <section className="panel danger">
                <h3>Delete company</h3>
                <p className="muted small">Removes the API key, the Cognito user and the directory. This cannot be undone.</p>
                {confirmDelete ? (
                  <div className="inline">
                    <button type="button" className="button danger" disabled={busy} onClick={onDelete}>
                      Delete {tenant.name}
                    </button>
                    <button type="button" className="button" onClick={() => setConfirmDelete(false)}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button type="button" className="button danger-outline" onClick={() => setConfirmDelete(true)}>
                    Delete company
                  </button>
                )}
              </section>
            </>
          )}

          {tab === 'directory' &&
            (!canBrowse ? (
              <EmptyState title="Credentials not in this session">
                The directory is fetched as one of this company's employees. Create the company in this browser session to
                browse it.
              </EmptyState>
            ) : !directory ? (
              <p className="muted">Loading directory…</p>
            ) : (
              <>
                <p className="callout">
                  <IconUsers size={16} /> Fetched as this company's employee. The API reads only the company named in the
                  token, so another company's people can never appear here.
                </p>
                <div className="chips" role="group" aria-label="Filter by department">
                  {departments.map((d) => (
                    <button key={d} type="button" className={`chip ${department === d ? 'active' : ''}`} onClick={() => setDepartment(d)}>
                      {d}
                    </button>
                  ))}
                </div>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Title</th>
                        <th>Department</th>
                        <th>Location</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employees.map((e) => (
                        <tr key={e.employeeId}>
                          <td>
                            <div className="strong">{e.name}</div>
                            <div className="muted small">{e.email}</div>
                          </td>
                          <td>{e.title}</td>
                          <td>{e.department}</td>
                          <td className="muted">{e.location}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ))}

          {tab === 'usage' &&
            (!usage ? (
              <p className="muted">Loading usage…</p>
            ) : (
              <>
                <h3 className="chart-title">Requests per day</h3>
                <p className="muted small">From API Gateway's GetUsage for this company's key, against the {tenant.tier} plan's daily quota.</p>
                <UsageChart days={usage} />
                <div className="table-wrap">
                  <table className="table compact">
                    <thead>
                      <tr>
                        <th>Day (UTC)</th>
                        <th className="num">Requests</th>
                        <th className="num">Quota left</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usage.map((d) => (
                        <tr key={d.date}>
                          <td>{d.date}</td>
                          <td className="num">{d.used.toLocaleString()}</td>
                          <td className="num">{d.remaining.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ))}
        </div>
      </aside>
    </div>
  );
}
