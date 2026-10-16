import { useLayoutEffect, useRef, useState } from 'react';

/** Rounds up to a clean axis maximum: 1, 2, 5, 10, 20, 50 ... */
export const niceMax = (value: number) => {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((m) => m * magnitude >= value)!;
  return step * magnitude;
};

export const compact = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}K` : String(n));

/** A column with a 4px rounded data end and a square base. */
export const columnPath = (x: number, y: number, w: number, h: number, r = 4) => {
  const radius = Math.min(r, w / 2, h);
  return [
    `M${x},${y + h}`,
    `V${y + radius}`,
    `Q${x},${y} ${x + radius},${y}`,
    `H${x + w - radius}`,
    `Q${x + w},${y} ${x + w},${y + radius}`,
    `V${y + h}`,
    'Z',
  ].join(' ');
};


/** Measures the container so the SVG is drawn at its real pixel width and text stays a readable size. */
export function useWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(Math.max(240, Math.round(el.getBoundingClientRect().width)));
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry!.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}
