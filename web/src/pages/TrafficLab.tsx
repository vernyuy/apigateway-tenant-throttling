import type { Capacity, TenantView, Throttle, TierDetails } from '../api';
import { TrafficChart } from '../components/charts/TrafficChart';
import { IconPlay, IconStop } from '../components/Icons';
import { Card, EmptyState, OutcomeKey, TierBadge } from '../components/ui';
import { credentials } from '../credentials';
import { DURATIONS, MAX_RATE, OUTCOMES, REQUESTS_PER_EXECUTION, totalsOf, type Traffic } from '../hooks/useTraffic';

interface Props {
  tenants: TenantView[];
  tiers: TierDetails[];
  stage: Throttle | null;
  traffic: Traffic;
  capacity: Capacity | null;
}

// Presets are multiples of each company's own limit, so one click puts every company in the same
// position relative to its plan: under it, at it, or a noisy neighbour well above it.
const PRESETS = [
  { label: '½× limit', factor: 0.5 },
  { label: 'At limit', factor: 1 },
  { label: '2× limit', factor: 2 },
  { label: '5× limit', factor: 5 },
];

export function TrafficLab({ tenants, tiers, stage, traffic, capacity }: Props) {
  const creds = credentials.all();
  const available = tenants.filter((t) => creds[t.tenantId]);
  const { run, running, elapsed } = traffic;
  const runLength = run && running ? run.durationSeconds : traffic.duration;
  const ids = available.map((t) => t.tenantId);
  // One company can send up to the stage limit; beyond that the stage throttles it regardless of plan.
  const maxRate = stage?.rateLimit ?? MAX_RATE;
  const limitOf = (t: TenantView) => tiers.find((tier) => tier.name === t.tier)?.rateLimit;
  const setRate = (id: string, rps: number) => traffic.setRate(id, Math.min(maxRate, rps));
  const applyPreset = (factor: number) =>
    traffic.setManyRates(
      Object.fromEntries(
        available.map((t) => [t.tenantId, Math.min(maxRate, Math.max(1, Math.round((limitOf(t) ?? traffic.rateFor(t.tenantId)) * factor)))]),
      ),
    );

  // Two ceilings apply to all companies together. The stage limit throttles the excess with 429s.
  // The account's Lambda concurrency limit rejects it, which shows up as 5xx instead.
  const total = ids.reduce((sum, id) => sum + traffic.rateFor(id), 0);
  const lambdaBudget = capacity && capacity.unreservedConcurrency > 0 ? capacity.unreservedConcurrency * REQUESTS_PER_EXECUTION : null;
  const ceilings = [stage?.rateLimit, lambdaBudget ?? undefined].filter((n): n is number => n !== undefined);
  const budget = ceilings.length > 0 ? Math.min(...ceilings) : null;
  const overBudget = budget !== null && total > budget;
  const fitToBudget = () => {
    if (!budget) return;
    const scale = budget / total;
    // Keep every active company sending at least 1 req/s so it still appears in the run.
    traffic.setManyRates(
      Object.fromEntries(ids.map((id) => [id, traffic.rateFor(id) > 0 ? Math.max(1, Math.floor(traffic.rateFor(id) * scale)) : 0])),
    );
  };

  const lanes = run ? Object.entries(run.lanes) : [];
  // One y-scale for every company, so a taller column always means more requests.
  const yMax = Math.max(1, ...lanes.flatMap(([, buckets]) => buckets.map((b) => OUTCOMES.reduce((s, o) => s + b[o], 0))));

  return (
    <div className="page">
      <Card
        title="Send traffic"
        subtitle="Each company's directory app signs in as its employee and calls GET /employees with the company's own API key."
      >
        {available.length === 0 ? (
          <EmptyState title="No companies with credentials in this session">
            Create companies in this browser session first. Their credentials are shown once and kept only for this session.
          </EmptyState>
        ) : (
          <>
            <div className="rate-grid">
              {available.map((t) => (
                <label key={t.tenantId} className="rate-row">
                  <span className="rate-name">
                    <span className="strong">{t.name}</span>
                    <TierBadge tier={t.tier} />
                    {limitOf(t) !== undefined && (
                      <span className={`muted small ${traffic.rateFor(t.tenantId) > limitOf(t)! ? 'over-limit' : ''}`}>limit {limitOf(t)} req/s</span>
                    )}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={maxRate}
                    value={traffic.rateFor(t.tenantId)}
                    disabled={running}
                    onChange={(e) => setRate(t.tenantId, Number(e.target.value))}
                    aria-label={`Requests per second for ${t.name}`}
                  />
                  <span className="rate-value">
                    <input
                      type="number"
                      min={0}
                      max={maxRate}
                      value={traffic.rateFor(t.tenantId)}
                      disabled={running}
                      onChange={(e) => setRate(t.tenantId, e.target.valueAsNumber)}
                      aria-label={`Requests per second for ${t.name}, exact value`}
                    />
                    req/s
                  </span>
                </label>
              ))}
            </div>
            <div className="rate-presets">
              <span className="muted small">Every company at</span>
              {PRESETS.map((p) => (
                <button key={p.label} type="button" className="button small" disabled={running || tiers.length === 0} onClick={() => applyPreset(p.factor)}>
                  {p.label}
                </button>
              ))}
              <label className="duration">
                <span className="muted small">Duration</span>
                <select value={traffic.duration} disabled={running} onChange={(e) => traffic.setDuration(Number(e.target.value))}>
                  {DURATIONS.map((d) => (
                    <option key={d} value={d}>
                      {d < 60 ? `${d}s` : `${d / 60} min`}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className={`budget ${overBudget ? 'over' : ''}`} role="status">
              <span>
                Total <strong>{total} req/s</strong>
                {stage && (
                  <>
                    {' '}
                    · stage limit <strong>{stage.rateLimit} req/s</strong> for all companies
                  </>
                )}
                {lambdaBudget !== null && (
                  <>
                    {' '}
                    · Lambda about <strong>{lambdaBudget} req/s</strong> ({capacity!.unreservedConcurrency} functions at once)
                  </>
                )}
              </span>
              {overBudget && (
                <>
                  <span>
                    {budget === lambdaBudget
                      ? 'Above this, extra requests fail with 5xx instead of being throttled by the usage plans.'
                      : 'Above this, the stage throttles every company, not just the noisy ones.'}
                  </span>
                  <button type="button" className="button small" disabled={running} onClick={fitToBudget}>
                    Fit to {budget} req/s
                  </button>
                </>
              )}
            </div>
            <div className="run-bar">
              <button type="button" className="button primary" onClick={() => (running ? traffic.stop() : traffic.start(available))}>
                {running ? (
                  <>
                    <IconStop size={16} /> Stop
                  </>
                ) : (
                  <>
                    <IconPlay size={16} /> Run for {runLength}s
                  </>
                )}
              </button>
              <div className="progress" aria-label="Run progress">
                <div style={{ width: `${(elapsed / runLength) * 100}%` }} />
              </div>
              <span className="muted small">
                {traffic.warming ? 'Warming up…' : running ? `${Math.floor(elapsed)}s / ${runLength}s` : run ? 'Finished' : 'Ready'}
              </span>
            </div>
          </>
        )}
      </Card>

      {run && (
        <>
          <div className="legend" aria-label="Legend">
            {OUTCOMES.map((o) => (
              <OutcomeKey key={o} outcome={o} />
            ))}
          </div>

          {lanes.map(([tenantId, buckets]) => {
            const tenant = tenants.find((t) => t.tenantId === tenantId);
            const totals = totalsOf(buckets);
            return (
              <Card
                key={tenantId}
                title={tenant?.name ?? tenantId}
                subtitle={tenant ? <TierBadge tier={tenant.tier} /> : undefined}
                actions={
                  <div className="lane-totals">
                    <span>
                      <strong>{totals.ok}</strong> OK
                    </span>
                    <span>
                      <strong>{totals.throttled}</strong> throttled
                    </span>
                    <span>
                      <strong>{totals.forbidden}</strong> forbidden
                    </span>
                    {totals.other > 0 && (
                      <span>
                        <strong>{totals.other}</strong> other
                      </span>
                    )}
                  </div>
                }
              >
                <TrafficChart buckets={buckets} yMax={yMax} label={`Requests per second for ${tenant?.name ?? tenantId}, by outcome`} />
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}
