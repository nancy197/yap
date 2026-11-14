// Data layer: published epoch files (scores, labels, datasets), on-chain views, near.social profiles.
// Testnet = live, rewarded epochs. Mainnet = read-only sample of real near.social data (unrewarded).
export const RPC = 'https://test.rpc.fastnear.com';
export const TOKEN = 'token4.yap-hq.testnet';
export const DAO = 'dao.yap-hq.testnet';
export const STEWARD = 'steward4.yap-hq.testnet';
/** Published tick files of the live deployment (earlier runs keep ./epochs/testnet and ./epochs/token3). */
export const EPOCHS = './epochs/token4';
export const HQ = 'yap-hq.testnet';
export const KV_TEST = 'https://kv.test.fastnear.com';
export const SOCIAL_MAIN = 'https://api2.near.social';
export const nb = (h: string) => `https://testnet.nearblocks.io/txns/${h}`;
export const nbAcc = (a: string) => `https://testnet.nearblocks.io/address/${a}`;
export type Net = 'testnet' | 'mainnet';

export async function view<T = any>(method: string, args: Record<string, unknown> = {}, contract = TOKEN): Promise<T> {
  const r = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'query', params: { request_type: 'call_function', finality: 'final', account_id: contract, method_name: method, args_base64: btoa(JSON.stringify(args)) } }),
  });
  const j = await r.json();
  if (j.error || !j.result?.result) throw new Error(JSON.stringify(j.error ?? j.result?.error ?? 'rpc error').slice(0, 200));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(j.result.result)));
}
export async function rpc<T = any>(method: string, params: unknown): Promise<T> {
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const j = await r.json();
  if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 200));
  return j.result;
}

// ---------- formatting ----------
export const S = 1_000_000;
export const sc = (x: string | number | bigint) => Number(BigInt(x)) / S; // score units (×1e6 on chain)
export const yap = (raw: string | bigint | undefined | null, dp = 2) => (raw == null ? 0 : Number(BigInt(raw) / 10n ** 12n) / 1e6).toLocaleString(undefined, { maximumFractionDigits: dp });
export const yapNum = (raw: string | bigint | undefined | null) => (raw == null ? 0 : Number(BigInt(raw) / 10n ** 12n) / 1e6);
export const pct = (x: number, dp = 2) => `${(x * 100).toFixed(dp)}%`;
export const short = (a: string) => (a.length > 24 && /^[0-9a-f]{64}$/.test(a) ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
export const TIER = ['None', 'Bronze', 'Silver', 'Gold', 'Inner Circle'];

// ---------- published epochs ----------
export type Yapper = { account: string; score: string; amount: string; tier: number; smartFollowers: number; rankNorm: string; posts: { key: string; score: string; q: number }[]; proof: string[] };
export type EpochScores = {
  epoch: number;
  fromMs: number;
  toMs: number;
  report: any;
  predictedYapperPool?: string;
  arenas?: { id: number; topic: string; minTier: number; amount: string }[];
  result: { attention: string; yappersRoot: string; yappers: Yapper[]; arenas: Record<string, { id: number; topic: string; root: string; yappers: { account: string; score: string; amount: string; proof: string[] }[] }>; mindshare: { topic: string; score: string; share: string }[]; smartAccounts: string[] };
};
const cache = new Map<string, Promise<any>>();
export function getJson<T = any>(url: string, fresh = false): Promise<T> {
  if (fresh || !cache.has(url)) cache.set(url, fetch(url + (fresh ? `?t=${Date.now()}` : ''), { cache: fresh ? 'no-store' : 'default' }).then((r) => { if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); }));
  const p = cache.get(url)!;
  p.catch(() => cache.delete(url));
  return p;
}
export async function epochIndex(): Promise<{ epochs: Record<string, any> }> {
  return getJson(`${EPOCHS}/index.json`, true).catch(() => ({ epochs: {} }));
}
export async function loadEpochs(net: Net): Promise<EpochScores[]> {
  if (net === 'mainnet') {
    const m = await getJson<any>('./mainnet/scores.json').catch(() => null);
    // epoch -1 marks the read-only mainnet window; its files live under ./mainnet/.
    return m ? [{ epoch: -1, fromMs: m.fromMs, toMs: m.toMs, report: null, result: m.result }] : [];
  }
  const idx = await epochIndex();
  const ids = Object.keys(idx.epochs).map(Number).sort((a, b) => a - b);
  const out = await Promise.all(ids.map((e) => getJson<EpochScores>(`${EPOCHS}/${e}/scores.json`).catch(() => null)));
  return out.filter(Boolean) as EpochScores[];
}
export const epochFile = (e: number, f: 'dataset' | 'labels' | 'scores') => getJson(e < 0 ? `./mainnet/${f}.json` : `${EPOCHS}/${e}/${f}.json`);
export const mainnetMeta = () => getJson<any>('./mainnet/scores.json').catch(() => null);

// ---------- aggregation (Kaito-style windows) ----------
export type Agg = { account: string; score: number; share: number; prevRank: number | null; rank: number; tier: number; smartFollowers: number; amount: bigint; posts: number; epochs: number };
export function aggregate(epochs: EpochScores[], window: number): { rows: Agg[]; total: number; topics: { topic: string; score: number; share: number; prevShare: number }[] } {
  const cur = epochs.slice(-window);
  const prev = epochs.slice(-2 * window, -window);
  const sum = (list: EpochScores[]) => {
    const m = new Map<string, { score: number; amount: bigint; posts: number; epochs: number }>();
    for (const e of list)
      for (const y of e.result.yappers) {
        const r = m.get(y.account) ?? { score: 0, amount: 0n, posts: 0, epochs: 0 };
        r.score += sc(y.score);
        r.amount += BigInt(y.amount);
        r.posts += y.posts.length;
        r.epochs++;
        m.set(y.account, r);
      }
    return m;
  };
  const now = sum(cur);
  const before = sum(prev);
  const prevRanks = new Map([...before.entries()].sort((a, b) => b[1].score - a[1].score).map(([a], i) => [a, i + 1]));
  const latest = new Map<string, Yapper>();
  for (const e of cur) for (const y of e.result.yappers) latest.set(y.account, y);
  const total = [...now.values()].reduce((n, r) => n + r.score, 0) || 1;
  const rows = [...now.entries()]
    .map(([account, r]) => ({ account, score: r.score, share: r.score / total, prevRank: prevRanks.get(account) ?? null, rank: 0, tier: latest.get(account)?.tier ?? 0, smartFollowers: latest.get(account)?.smartFollowers ?? 0, amount: r.amount, posts: r.posts, epochs: r.epochs }))
    .sort((a, b) => b.score - a.score || (a.account < b.account ? -1 : 1));
  rows.forEach((r, i) => (r.rank = i + 1));
  const topicSum = (list: EpochScores[]) => {
    const m = new Map<string, number>();
    for (const e of list) for (const t of e.result.mindshare) m.set(t.topic, (m.get(t.topic) ?? 0) + sc(t.score));
    const tot = [...m.values()].reduce((a, b) => a + b, 0) || 1;
    return { m, tot };
  };
  const tc = topicSum(cur);
  const tp = topicSum(prev);
  const topics = [...tc.m.entries()].map(([topic, s]) => ({ topic, score: s, share: s / tc.tot, prevShare: (tp.m.get(topic) ?? 0) / tp.tot })).sort((a, b) => b.score - a.score);
  return { rows, total, topics };
}

// ---------- near.social profiles ----------
export type Profile = { account: string; name: string | null; about: string | null; avatar: string | null };
const profiles = new Map<string, Promise<Profile>>();
export function profile(account: string, net: Net = 'testnet'): Promise<Profile> {
  const k = `${net}:${account}`;
  if (!profiles.has(k)) {
    profiles.set(
      k,
      (async () => {
        try {
          if (net === 'mainnet') {
            const p = await fetch(`${SOCIAL_MAIN}/v1/accounts/${account}`).then((r) => r.json());
            return { account, name: p.name ?? null, about: p.about ?? null, avatar: p.avatar_url ?? null };
          }
          const j = await fetch(`${KV_TEST}/v0/latest/social/${account}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key_prefix: 'profile/' }) }).then((r) => r.json());
          const get = (key: string) => (j.entries ?? []).find((e: any) => e.key === key)?.value ?? null;
          const av = get('profile/avatar');
          return { account, name: get('profile/name'), about: get('profile/about'), avatar: typeof av === 'string' && av.startsWith('fastfs://') ? av.replace('fastfs://', 'https://test.fastfs.io/') : null };
        } catch {
          return { account, name: null, about: null, avatar: null };
        }
      })(),
    );
  }
  return profiles.get(k)!;
}

// ---------- posts ----------
export type FeedPost = { key: string; author: string; text: string; ts: number; replyTo?: string; quote?: string; likes: number; reposts: number; q?: number; score?: number };
/** Recent near.social posts. Testnet: FastData KV (all writes to `social`); mainnet: the near.social indexer. */
export async function feed(net: Net, limit = 60): Promise<FeedPost[]> {
  if (net === 'mainnet') {
    const j = await fetch(`${SOCIAL_MAIN}/v1/feed/global?limit=${limit}`).then((r) => r.json());
    return (j.items ?? []).map((it: any) => ({ key: it.post.key, author: it.post.author.account_id, text: it.post.text, ts: it.post.created_at, likes: it.post.counts.likes, reposts: it.post.counts.reposts }));
  }
  // FastData pages are not time-ordered: read every page, then sort.
  const kv = async (body: Record<string, unknown>) => {
    const entries: any[] = [];
    let token: string | undefined;
    for (let i = 0; i < 25; i++) {
      const r = await fetch(`${KV_TEST}/v0/latest/social`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, limit: 200, ...(token ? { page_token: token } : {}) }) });
      const j = JSON.parse((await r.text()).replace(/("block_timestamp"\s*:\s*)(\d+)/g, '$1"$2"'));
      entries.push(...(j.entries ?? []));
      token = j.page_token;
      if (!token) break;
    }
    return { entries };
  };
  const [posts, likes, reposts] = await Promise.all([kv({ key_prefix: 'post/' }), kv({ key_prefix: 'like/' }), kv({ key_prefix: 'repost/' })]);
  const count = (j: any, pre: string) => {
    const m = new Map<string, number>();
    for (const e of j.entries ?? []) if (e.value && typeof e.value === 'object') m.set(e.key.slice(pre.length), (m.get(e.key.slice(pre.length)) ?? 0) + 1);
    return m;
  };
  const lc = count(likes, 'like/');
  const rc = count(reposts, 'repost/');
  return (posts.entries ?? [])
    .filter((e: any) => e.value && typeof e.value.text === 'string')
    .map((e: any) => {
      const key = `${e.predecessor_id}/${e.key.slice(5)}`;
      return { key, author: e.predecessor_id, text: e.value.text, ts: Math.floor(Number(BigInt(e.block_timestamp) / 1_000_000n)), replyTo: e.value.reply_to, quote: e.value.quote, likes: lc.get(key) ?? 0, reposts: rc.get(key) ?? 0 };
    })
    .sort((a: FeedPost, b: FeedPost) => b.ts - a.ts)
    .slice(0, limit);
}

export const ago = (ms: number) => {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return `${Math.floor(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};
