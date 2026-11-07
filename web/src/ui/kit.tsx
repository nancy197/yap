// Shared UI pieces: hash router, avatars (near.social or identicon), tier badges, treemap, icons, hooks.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { profile, TIER, type Net, type Profile } from '../lib/data';

// ---------- router ----------
const hashSubs = new Set<() => void>();
window.addEventListener('hashchange', () => hashSubs.forEach((f) => f()));
export function useRoute(): string[] {
  const h = useSyncExternalStore((f) => (hashSubs.add(f), () => hashSubs.delete(f)), () => location.hash);
  return h.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
}
export const go = (path: string) => (location.hash = path);

// ---------- network (testnet live / mainnet read-only) ----------
let net: Net = (localStorage.getItem('yap-net') as Net) || 'testnet';
const netSubs = new Set<() => void>();
export const setNet = (n: Net) => {
  net = n;
  try { localStorage.setItem('yap-net', n); } catch {}
  netSubs.forEach((f) => f());
};
export const useNet = () => useSyncExternalStore((f) => (netSubs.add(f), () => netSubs.delete(f)), () => net);

// ---------- async ----------
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], refreshMs?: number): { data: T | undefined; error: string | null; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    fn().then((d) => live && (setData(d), setError(null))).catch((e) => live && setError(String(e?.message ?? e))).finally(() => live && setLoading(false));
    const t = refreshMs ? setInterval(() => setN((x) => x + 1), refreshMs) : undefined;
    return () => { live = false; if (t) clearInterval(t); };
  }, [...deps, n]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error, loading, reload: () => setN((x) => x + 1) };
}
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

// ---------- avatar ----------
function hash(s: string) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
export function identicon(seed: string) {
  const h = hash(seed);
  const hue = h % 360;
  const cells: string[] = [];
  for (let i = 0; i < 15; i++) if ((h >> i) & 1) { const x = i % 3, y = Math.floor(i / 3); cells.push(`<rect x="${x * 10 + 5}" y="${y * 10 + 5}" width="10" height="10"/>`, x < 2 ? `<rect x="${(4 - x) * 10 + 5}" y="${y * 10 + 5}" width="10" height="10"/>` : ''); }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60"><rect width="60" height="60" fill="hsl(${hue} 45% 22%)"/><g fill="hsl(${(hue + 40) % 360} 85% 65%)">${cells.join('')}</g></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
export function useProfile(account: string, n: Net = 'testnet'): Profile | null {
  const [p, setP] = useState<Profile | null>(null);
  useEffect(() => { let live = true; profile(account, n).then((x) => live && setP(x)); return () => { live = false; }; }, [account, n]);
  return p;
}
export function Avatar({ account, size = 32, net: n }: { account: string; size?: number; net?: Net }) {
  const p = useProfile(account, n);
  const [bad, setBad] = useState(false);
  const src = p?.avatar && !bad ? p.avatar : identicon(account);
  return <img className="av" src={src} width={size} height={size} alt="" onError={() => setBad(true)} style={{ width: size, height: size }} />;
}
export function Who({ account, net: n, size = 32, sub }: { account: string; net?: Net; size?: number; sub?: ReactNode }) {
  const p = useProfile(account, n);
  return (
    <a className="who" href={`#/u/${encodeURIComponent(account)}`} onClick={(e) => e.stopPropagation()}>
      <Avatar account={account} size={size} net={n} />
      <span style={{ minWidth: 0 }}>
        <b>{p?.name || account.split('.')[0]}</b>
        <small>{sub ?? account}</small>
      </span>
    </a>
  );
}
export const Tier = ({ t }: { t: number }) => <span className={`tier t${t}`}>{t === 4 ? '◆ ' : ''}{TIER[t]}</span>;
export const Delta = ({ prev, rank }: { prev: number | null; rank: number }) =>
  prev == null ? <span className="pill acc" style={{ fontSize: 10 }}>NEW</span> : prev === rank ? <span className="faint">–</span> : prev > rank ? <span className="up mono">▲{prev - rank}</span> : <span className="down mono">▼{rank - prev}</span>;
export const Q = ({ q }: { q: number }) => <span className={`q q${q}`} title={['spam / off-topic', 'low effort', 'normal', 'insightful'][q]}>q{q} {['spam', 'low', 'ok', 'insight'][q]}</span>;
export const Loading = ({ what = 'Loading' }: { what?: string }) => <div className="empty">{what}…</div>;
export function Text({ text }: { text: string }) {
  const parts = text.split(/(\s+)/);
  return <>{parts.map((w, i) => (/^[#$][\p{L}\p{N}_]+/u.test(w) ? <a key={i} className="tag" href={`#/leaderboard/${encodeURIComponent(w.toLowerCase().replace(/[.,!?]+$/, ''))}`}>{w}</a> : /^@[a-z0-9._-]+/.test(w) ? <a key={i} className="tag" href={`#/u/${w.slice(1).replace(/[.,!?]+$/, '')}`}>{w}</a> : w))}</>;
}

// ---------- treemap (squarified) ----------
type Item = { id: string; value: number };
type Rect = { x: number; y: number; w: number; h: number };
function worst(row: number[], w: number) { const s = row.reduce((a, b) => a + b, 0); const mx = Math.max(...row), mn = Math.min(...row); return Math.max((w * w * mx) / (s * s), (s * s) / (w * w * mn)); }
export function squarify<T extends Item>(items: T[], box: Rect): (T & Rect)[] {
  const total = items.reduce((a, b) => a + b.value, 0) || 1;
  const scale = (box.w * box.h) / total;
  const queue = items.filter((i) => i.value > 0).map((i) => ({ ...i, area: i.value * scale }));
  const out: (T & Rect)[] = [];
  let r = { ...box };
  while (queue.length) {
    const short = Math.min(r.w, r.h);
    const row: typeof queue = [queue.shift()!];
    while (queue.length && worst([...row, queue[0]!].map((x) => x.area), short) <= worst(row.map((x) => x.area), short)) row.push(queue.shift()!);
    const sum = row.reduce((a, b) => a + b.area, 0);
    const thick = sum / short;
    let off = 0;
    for (const it of row) {
      const len = it.area / thick;
      out.push(r.w >= r.h ? { ...it, x: r.x, y: r.y + off, w: thick, h: len } : { ...it, x: r.x + off, y: r.y, w: len, h: thick });
      off += len;
    }
    r = r.w >= r.h ? { x: r.x + thick, y: r.y, w: r.w - thick, h: r.h } : { x: r.x, y: r.y + thick, w: r.w, h: r.h - thick };
  }
  return out;
}
export function Treemap<T extends Item>({ items, height = 420, render, color, onClick }: { items: T[]; height?: number; render: (it: T, r: Rect) => ReactNode; color: (it: T, i: number) => string; onClick?: (it: T) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(e!.contentRect.width));
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const cells = useMemo(() => squarify(items, { x: 0, y: 0, w, h: height }), [items, w, height]);
  return (
    <div className="tm" ref={ref} style={{ height }}>
      {cells.map((c, i) => {
        const size = Math.min(c.w, c.h);
        return (
          <div key={c.id} className={`tm-cell ${size < 34 ? 'tiny' : size < 70 ? 'small' : ''}`} style={{ left: c.x, top: c.y, width: c.w, height: c.h, background: color(c, i) }} onClick={() => onClick?.(c)} title={c.id}>
            {render(c, c)}
          </div>
        );
      })}
    </div>
  );
}

// ---------- icons ----------
const I = (d: string) => () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />;
export const Icon = {
  mind: I('<rect x="3" y="3" width="10" height="11" rx="2"/><rect x="15" y="3" width="6" height="7" rx="2"/><rect x="15" y="12" width="6" height="9" rx="2"/><rect x="3" y="16" width="10" height="5" rx="2"/>'),
  board: I('<path d="M8 21V11M16 21V7M12 21V3M4 21h16"/>'),
  arena: I('<path d="M6 3h12l-2 7a4 4 0 0 1-8 0z"/><path d="M12 14v4M8 21h8"/>'),
  earn: I('<circle cx="12" cy="12" r="8"/><path d="M12 7v10M9 9.5c0-1 1.3-1.5 3-1.5s3 .7 3 2-1.3 1.7-3 2-3 .8-3 2 1.3 2 3 2 3-.5 3-1.5"/>'),
  token: I('<path d="M12 3c3 4 6 6 6 10a6 6 0 0 1-12 0c0-2 1-4 3-6 0 2 1 3 2 3 0-3 1-5 1-7z"/>'),
  feed: I('<path d="M4 5h16M4 12h16M4 19h10"/>'),
  verify: I('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>'),
  dao: I('<path d="M3 21h18M5 21V10M19 21V10M9 21V10M15 21V10M3 10l9-6 9 6"/>'),
  sim: I('<path d="M3 17l5-6 4 3 6-8 3 4"/><path d="M3 21h18"/>'),
  how: I('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 .5c0 2-2.5 2-2.5 4M12 17h.01"/>'),
  search: I('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
  heart: I('<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>'),
  repost: I('<path d="M4 9V7a2 2 0 0 1 2-2h11l-3-3M20 15v2a2 2 0 0 1-2 2H7l3 3"/>'),
  reply: I('<path d="M4 12a8 8 0 1 1 3.5 6.6L4 20l1.4-3.6A8 8 0 0 1 4 12z"/>'),
  ext: I('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
};
