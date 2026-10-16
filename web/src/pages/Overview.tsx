import type { TenantView, Throttle, TierDetails } from '../api';
import { totalsOf, type Traffic } from '../hooks/useTraffic';
import { Card, EmptyState, OutcomeKey, StatTile, TierBadge, formatNumber } from '../components/ui';

interface Props {
  tenants: TenantView[];
  tiers: TierDetails[];
  stage: Throttle | null;
  usageToday: Record<string, number | undefined>;
  traffic: Traffic;
  onNavigate: (page: 'companies' | 'traffic') => void;
}

export function Overview({ tenants, tiers, stage, usageToday, traffic, onNavigate }: Props) {
  const active = tenants.filter((t) => t.apiKeyEnabled).length;
  const usageKnown = tenants.every((t) => usageToday[t.tenantId] !== undefined);
  const requestsToday = tenants.reduce((sum, t) => sum + (usageToday[t.tenantId] ?? 0), 0);
  const byTier = tiers.map((tier) => ({ tier, count: tenants.filter((t) => t.tier === tier.name).length }));
  const maxCount = Math.max(1, ...byTier.map((b) => b.count));
  const lastRun = traffic.run;

  return (
    <div className="page">
      <div className="stats">
        <StatTile label="Companies" value={tenants.length} hint="Each company is a tenant" />
        <StatTile label="Active API keys" value={active} hint="Accepted by API Gateway" />
        <StatTile label="Suspended keys" value={tenants.length - active} hint="Rejected with 403 at the gateway" />
        <StatTile
          label="Requests today"
          value={tenants.length === 0 ? 0 : usageKnown ? formatNumber(requestsToday) : '…'}
          hint="From GetUsage, across all companies"
        />
      </div>

      <div className="grid-2">
        <Card title="Companies by tier" subtitle="Each tier is a usage plan; every company's key gets that plan's limit on its own.">
          {tenants.length === 0 ? (
            <EmptyState title="No companies yet">
              <button type="button" className="link" onClick={() => onNavigate('companies')}>
                Create your first company
              </button>
            </EmptyState>
          ) : (
            <div className="hbars" role="list">
              {byTier.map(({ tier, count }) => (
                <div className="hbar-row" role="listitem" key={tier.name}>
                  <TierBadge tier={tier.name} />
                  <div className="hbar-track">
                    {count > 0 && (
                      <div className={`hbar-fill tier-${tier.name}`} style={{ width: `${(count / maxCount) * 100}%` }} />
                    )}
                  </div>
                  <span className="hbar-value">{count}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Plans" subtitle="Limits apply per company key. The stage limit caps all companies combined.">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Tier</th>
                  <th className="num">Rate</th>
                  <th className="num">Burst</th>
                  <th className="num">Daily quota</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((t) => (
                  <tr key={t.name}>
                    <td>
                      <TierBadge tier={t.name} />
                    </td>
                    <td className="num">{t.rateLimit} req/s</td>
                    <td className="num">{t.burstLimit}</td>
                    <td className="num">{formatNumber(t.quota.limit)}</td>
                  </tr>
                ))}
                {stage && (
                  <tr className="table-total">
                    <td>All companies (stage)</td>
                    <td className="num">{stage.rateLimit} req/s</td>
                    <td className="num">{stage.burstLimit}</td>
                    <td className="num muted">—</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card
        title="Last traffic run"
        subtitle={lastRun ? `Started ${new Date(lastRun.startedAt).toLocaleTimeString()}` : undefined}
        actions={
          <button type="button" className="button" onClick={() => onNavigate('traffic')}>
            Open traffic lab
          </button>
        }
      >
        {!lastRun ? (
          <EmptyState title="No traffic yet">
            Send traffic from several companies at once and watch each one stay inside its own limit.
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Tier</th>
                  <th className="num">
                    <OutcomeKey outcome="ok" />
                  </th>
                  <th className="num">
                    <OutcomeKey outcome="throttled" />
                  </th>
                  <th className="num">
                    <OutcomeKey outcome="forbidden" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(lastRun.lanes).map(([tenantId, buckets]) => {
                  const tenant = tenants.find((t) => t.tenantId === tenantId);
                  const totals = totalsOf(buckets);
                  return (
                    <tr key={tenantId}>
                      <td>{tenant?.name ?? tenantId}</td>
                      <td>{tenant && <TierBadge tier={tenant.tier} />}</td>
                      <td className="num">{totals.ok}</td>
                      <td className="num">{totals.throttled}</td>
                      <td className="num">{totals.forbidden}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
