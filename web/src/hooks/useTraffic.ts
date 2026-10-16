import { useCallback, useEffect, useRef, useState } from 'react';
import { callEmployees, type TenantView } from '../api';
import { credentials } from '../credentials';

/** Slider ceiling until the API reports the stage limit. */
export const MAX_RATE = 100;
export const DURATIONS = [10, 20, 30, 60, 120];

/**
 * Rough requests per second that one concurrent Lambda execution can serve for GET /employees.
 * A warm call takes about 25-40 ms, so 25 would be the theoretical figure; 5 leaves room for cold
 * starts and slow outliers, which is where an account with a low limit runs out first.
 */
export const REQUESTS_PER_EXECUTION = 5;

export type Outcome = 'ok' | 'throttled' | 'forbidden' | 'other';
export type Bucket = Record<Outcome, number>;
export const OUTCOMES: Outcome[] = ['ok', 'throttled', 'forbidden', 'other'];

export const emptyBucket = (): Bucket => ({ ok: 0, throttled: 0, forbidden: 0, other: 0 });

export const totalsOf = (buckets: Bucket[]): Bucket =>
  buckets.reduce(
    (sum, b) => ({ ok: sum.ok + b.ok, throttled: sum.throttled + b.throttled, forbidden: sum.forbidden + b.forbidden, other: sum.other + b.other }),
    emptyBucket(),
  );

const classify = (status: number): Outcome =>
  status === 200 ? 'ok' : status === 429 ? 'throttled' : status === 403 ? 'forbidden' : 'other';

export interface TrafficRun {
  startedAt: number;
  durationSeconds: number;
  lanes: Record<string, Bucket[]>;
}

/**
 * Drives the traffic lab: fires GET /employees for each company at its chosen rate and records
 * the outcome per second. Lives at app level so results survive page navigation.
 */
export function useTraffic() {
  const [rates, setRates] = useState<Record<string, number>>({});
  const [duration, setDuration] = useState(20);
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState<TrafficRun | null>(null);
  const [, setTick] = useState(0);
  const [warming, setWarming] = useState(false);
  const timers = useRef<number[]>([]);
  // Bumped by stop(), so a run that is still warming up knows not to start.
  const generation = useRef(0);

  const stop = useCallback(() => {
    generation.current += 1;
    timers.current.forEach((id) => window.clearInterval(id));
    timers.current = [];
    setWarming(false);
    setRunning(false);
  }, []);

  useEffect(() => stop, [stop]);

  const rateFor = (tenantId: string) => rates[tenantId] ?? 5;

  const start = async (tenants: TenantView[]) => {
    const creds = credentials.all();
    const participants = tenants.filter((t) => creds[t.tenantId] && rateFor(t.tenantId) > 0);
    if (participants.length === 0) return;

    // Warm up before the clock starts: sign each company in and wake a Lambda for it, so the run
    // doesn't open with a burst of cold starts competing for the account's concurrency.
    const gen = ++generation.current;
    setRunning(true);
    setWarming(true);
    await Promise.all(participants.map((t) => callEmployees(creds[t.tenantId])));
    if (gen !== generation.current) return;
    setWarming(false);

    const startedAt = Date.now();
    const durationSeconds = duration;
    const lanes: Record<string, Bucket[]> = Object.fromEntries(
      participants.map((t) => [t.tenantId, Array.from({ length: durationSeconds }, emptyBucket)]),
    );
    setRun({ startedAt, durationSeconds, lanes });
    setRunning(true);

    participants.forEach((tenant, i) => {
      const interval = 1000 / rateFor(tenant.tenantId);
      const fire = async () => {
        const second = Math.floor((Date.now() - startedAt) / 1000);
        if (second >= durationSeconds) return;
        const status = await callEmployees(creds[tenant.tenantId]);
        lanes[tenant.tenantId][second][classify(status)] += 1;
      };
      // Offset each company's first request so the companies' calls interleave instead of
      // arriving together, which keeps the number of functions running at once lower.
      const offset = (interval * i) / participants.length;
      timers.current.push(
        window.setTimeout(() => {
          void fire();
          timers.current.push(window.setInterval(fire, interval));
        }, offset),
      );
    });
    timers.current.push(window.setInterval(() => setTick((n) => n + 1), 250));
    timers.current.push(window.setTimeout(stop, durationSeconds * 1000 + 1500));
  };

  const elapsed = run ? Math.min(run.durationSeconds, (Date.now() - run.startedAt) / 1000) : 0;

  return {
    rates,
    rateFor,
    setRate: (tenantId: string, rps: number) =>
      setRates((r) => ({ ...r, [tenantId]: Number.isFinite(rps) ? Math.max(0, Math.round(rps)) : 0 })),
    setManyRates: (next: Record<string, number>) =>
      setRates((r) => ({ ...r, ...Object.fromEntries(Object.entries(next).map(([id, rps]) => [id, Math.max(0, Math.round(rps))])) })),
    duration,
    setDuration,
    running,
    warming,
    run,
    elapsed,
    start,
    stop,
  };
}

export type Traffic = ReturnType<typeof useTraffic>;
