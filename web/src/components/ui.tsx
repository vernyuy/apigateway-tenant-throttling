import type { ReactNode } from 'react';
import type { Outcome } from '../hooks/useTraffic';
import { IconAlert, IconBan, IconCheck, IconClose } from './Icons';

export const formatNumber = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 10_000 ? `${(n / 1_000).toFixed(1)}K` : n.toLocaleString();

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

export function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export function Card({ title, subtitle, actions, children }: { title?: string; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      {(title || actions) && (
        <header className="card-head">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p className="muted small">{subtitle}</p>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/** Tier colour comes from an ordinal blue ramp; the text stays in ink so it is always legible. */
export function TierBadge({ tier }: { tier: string }) {
  return (
    <span className="tier-badge">
      <span className={`tier-dot tier-${tier}`} aria-hidden="true" />
      {tier[0]!.toUpperCase() + tier.slice(1)}
    </span>
  );
}

export function KeyStatus({ enabled }: { enabled: boolean }) {
  return enabled ? (
    <span className="status status-good">
      <IconCheck size={14} /> Active
    </span>
  ) : (
    <span className="status status-critical">
      <IconBan size={14} /> Suspended
    </span>
  );
}

export const OUTCOME_LABEL: Record<Outcome, string> = {
  ok: '200 OK',
  throttled: '429 Throttled',
  forbidden: '403 Forbidden',
  other: '5xx or network error',
};

export function OutcomeKey({ outcome }: { outcome: Outcome }) {
  const icon = outcome === 'ok' ? <IconCheck size={13} /> : outcome === 'throttled' ? <IconAlert size={13} /> : outcome === 'forbidden' ? <IconBan size={13} /> : null;
  return (
    <span className="outcome-key">
      <span className={`swatch outcome-${outcome}`} aria-hidden="true" />
      {icon}
      {OUTCOME_LABEL[outcome]}
    </span>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className={`modal ${wide ? 'wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h3>{title}</h3>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <IconClose />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children && <p className="muted">{children}</p>}
    </div>
  );
}
