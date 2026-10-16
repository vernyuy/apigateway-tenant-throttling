import { useMemo, useState } from 'react';
import type { TenantView, TierDetails } from '../api';
import { IconPlus, IconSearch } from '../components/Icons';
import { Card, EmptyState, KeyStatus, Modal, TierBadge, formatDate, formatNumber, initials } from '../components/ui';

interface Props {
  tenants: TenantView[];
  tiers: TierDetails[];
  usageToday: Record<string, number | undefined>;
  creating: boolean;
  onCreate: (name: string, tier: string) => Promise<boolean>;
  onOpen: (tenantId: string) => void;
}

export function Companies({ tenants, tiers, usageToday, creating, onCreate, onOpen }: Props) {
  const [query, setQuery] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [tier, setTier] = useState('basic');

  const filtered = useMemo(
    () =>
      tenants.filter(
        (t) =>
          (tierFilter === 'all' || t.tier === tierFilter) &&
          (t.name.toLowerCase().includes(query.toLowerCase()) || t.tenantId.includes(query.toLowerCase())),
      ),
    [tenants, query, tierFilter],
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await onCreate(name.trim(), tier)) {
      setShowCreate(false);
      setName('');
      setTier('basic');
    }
  };

  return (
    <div className="page">
      <div className="toolbar">
        <label className="search">
          <IconSearch size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search companies" aria-label="Search companies" />
        </label>
        <select value={tierFilter} onChange={(e) => setTierFilter(e.target.value)} aria-label="Filter by tier">
          <option value="all">All tiers</option>
          {tiers.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name[0]!.toUpperCase() + t.name.slice(1)}
            </option>
          ))}
        </select>
        <div className="spacer" />
        <button type="button" className="button primary" onClick={() => setShowCreate(true)}>
          <IconPlus size={16} /> New company
        </button>
      </div>

      <Card>
        {tenants.length === 0 ? (
          <EmptyState title="No companies yet">Create two companies on different tiers to compare them in the traffic lab.</EmptyState>
        ) : filtered.length === 0 ? (
          <EmptyState title="No matches">Try a different search or tier.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table interactive">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Tier</th>
                  <th>API key</th>
                  <th className="num">Requests today</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.tenantId} onClick={() => onOpen(t.tenantId)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen(t.tenantId)}>
                    <td>
                      <div className="company-cell">
                        <span className="avatar" aria-hidden="true">
                          {initials(t.name)}
                        </span>
                        <div>
                          <div className="strong">{t.name}</div>
                          <div className="muted mono small">{t.tenantId}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <TierBadge tier={t.tier} />
                    </td>
                    <td>
                      <div className="key-cell">
                        <code>{t.apiKeyPreview}</code>
                        <KeyStatus enabled={t.apiKeyEnabled} />
                      </div>
                    </td>
                    <td className="num">{usageToday[t.tenantId] === undefined ? '…' : formatNumber(usageToday[t.tenantId]!)}</td>
                    <td className="muted">{formatDate(t.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showCreate && (
        <Modal title="New company" onClose={() => setShowCreate(false)}>
          <form onSubmit={submit} className="form">
            <label className="field">
              <span>Company name</span>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Robotics" />
            </label>
            <fieldset className="field">
              <legend>Tier</legend>
              <div className="tier-options">
                {tiers.map((t) => (
                  <label key={t.name} className={`tier-option ${tier === t.name ? 'selected' : ''}`}>
                    <input type="radio" name="tier" value={t.name} checked={tier === t.name} onChange={() => setTier(t.name)} />
                    <TierBadge tier={t.name} />
                    <span className="muted small">
                      {t.rateLimit} req/s · burst {t.burstLimit} · {formatNumber(t.quota.limit)}/day
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="muted small">
              Creates a Cognito user for the company, an API key in the {tier} usage plan, and a sample employee directory.
            </p>
            <div className="actions">
              <button type="button" className="button" onClick={() => setShowCreate(false)}>
                Cancel
              </button>
              <button type="submit" className="button primary" disabled={name.trim().length < 2 || creating}>
                {creating ? 'Creating…' : 'Create company'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
