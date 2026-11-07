// Profile: shareable Yap card, score history, tier, rewards, best posts with label and score, topics, followers.
import { useState } from 'react';
import { aggregate, loadEpochs, epochFile, view, sc, pct, yap, TIER, KV_TEST } from '../lib/data';
import { useAsync, useNet, useProfile, Avatar, Tier, Loading, Q, Text, Who } from '../ui/kit';
import { LineChart } from '../ui/charts';
import { useWallet, socialWrite } from '../lib/wallet';

async function followers(account: string): Promise<string[]> {
  const r = await fetch(`${KV_TEST}/v0/latest/social`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: `graph/follow/${account}` }) }).then((x) => x.json());
  return (r.entries ?? []).filter((e: any) => e.value && typeof e.value === 'object').map((e: any) => e.predecessor_id as string);
}

function drawCard(c: { account: string; name: string; score: number; share: number; rank: number; tier: number; smart: number; earned: string }) {
  const cv = document.createElement('canvas');
  cv.width = 1200;
  cv.height = 630;
  const g = cv.getContext('2d')!;
  const bg = g.createLinearGradient(0, 0, 1200, 630);
  bg.addColorStop(0, '#1b1020');
  bg.addColorStop(1, '#2a1408');
  g.fillStyle = bg;
  g.fillRect(0, 0, 1200, 630);
  const glow = g.createRadialGradient(1050, 80, 10, 1050, 80, 500);
  glow.addColorStop(0, 'rgba(255,138,61,.45)');
  glow.addColorStop(1, 'rgba(255,138,61,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, 1200, 630);
  g.fillStyle = '#ff8a3d';
  g.font = '700 40px "Space Grotesk", sans-serif';
  g.fillText('YAP', 70, 100);
  g.fillStyle = '#a39fa9';
  g.font = '500 22px "JetBrains Mono", monospace';
  g.fillText('yap-to-earn on near.social', 170, 98);
  g.fillStyle = '#f1eee8';
  g.font = '700 64px "Space Grotesk", sans-serif';
  g.fillText(c.name, 70, 230);
  g.fillStyle = '#a39fa9';
  g.font = '400 26px "JetBrains Mono", monospace';
  g.fillText(c.account, 70, 275);
  const stat = (x: number, label: string, v: string) => {
    g.fillStyle = '#a39fa9';
    g.font = '600 20px Inter, sans-serif';
    g.fillText(label.toUpperCase(), x, 400);
    g.fillStyle = '#f1eee8';
    g.font = '600 52px "JetBrains Mono", monospace';
    g.fillText(v, x, 462);
  };
  stat(70, 'Yap score', c.score.toFixed(1));
  stat(370, 'Mindshare', pct(c.share, 1));
  stat(670, 'Rank', `#${c.rank}`);
  stat(920, 'Smart flw', String(c.smart));
  g.fillStyle = '#ffb347';
  g.font = '600 28px "JetBrains Mono", monospace';
  g.fillText(`${TIER[c.tier]} · ${c.earned} $YAP earned`, 70, 560);
  const a = document.createElement('a');
  a.href = cv.toDataURL('image/png');
  a.download = `yap-card-${c.account}.png`;
  a.click();
}

export default function Profile({ account }: { account: string }) {
  const net = useNet();
  const p = useProfile(account, net);
  const wallet = useWallet();
  const [msg, setMsg] = useState('');
  const { data: epochs } = useAsync(() => loadEpochs(net), [net], 30_000);
  const { data: posts } = useAsync(async () => {
    if (!epochs || net === 'mainnet') return [];
    const mine = epochs.filter((e) => e.result.yappers.some((y) => y.account === account)).slice(-12);
    const out: { key: string; text: string; q: number; score: number; epoch: number; topics: string[] }[] = [];
    for (const e of mine) {
      const d: any = await epochFile(e.epoch, 'dataset').catch(() => null);
      const y = e.result.yappers.find((y) => y.account === account)!;
      for (const pp of y.posts) {
        const dp = d?.posts.find((x: any) => x.key === pp.key);
        out.push({ key: pp.key, text: dp?.text ?? '', q: pp.q, score: sc(pp.score), epoch: e.epoch, topics: dp?.topics ?? [] });
      }
    }
    return out.sort((a, b) => b.score - a.score);
  }, [epochs, account, net]);
  const { data: claims } = useAsync(async () => {
    if (!epochs || net === 'mainnet') return [];
    const rows = epochs.filter((e) => e.result.yappers.some((y) => y.account === account && BigInt(y.amount) > 0n));
    return Promise.all(rows.map(async (e) => ({ e: e.epoch, amount: e.result.yappers.find((y) => y.account === account)!.amount, claimed: await view<boolean>('is_claimed', { e: e.epoch, account }).catch(() => false) })));
  }, [epochs, account, net]);
  const { data: flw } = useAsync(() => (net === 'testnet' ? followers(account) : Promise.resolve([])), [account, net]);
  const { data: bal } = useAsync(() => (net === 'testnet' ? view<string>('ft_balance_of', { account_id: account }).catch(() => '0') : Promise.resolve('0')), [account, net]);
  if (!epochs) return <div className="page"><Loading /></div>;
  const all = aggregate(epochs, epochs.length);
  const me = all.rows.find((r) => r.account === account);
  const history = epochs.map((e) => [e.epoch, sc(e.result.yappers.find((y) => y.account === account)?.score ?? '0')] as [number, number]);
  const smartSet = new Set(epochs[epochs.length - 1]?.result.smartAccounts ?? []);
  const topicScore = new Map<string, number>();
  for (const pp of posts ?? []) for (const t of pp.topics) topicScore.set(t, (topicScore.get(t) ?? 0) + pp.score);
  const topics = [...topicScore.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const tmax = topics[0]?.[1] ?? 1;
  const name = p?.name || account.split('.')[0]!;
  const follow = async () => {
    try {
      setMsg('Signing…');
      const h = await socialWrite({ [`graph/follow/${account}`]: {} });
      setMsg(`Followed on near.social testnet · tx ${h.slice(0, 8)}…`);
    } catch (e) {
      setMsg(String((e as Error).message));
    }
  };
  return (
    <div className="page">
      <div className="grid g-main">
        <div className="grid" style={{ alignContent: 'start' }}>
          <div className="yapcard">
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <Avatar account={account} size={72} net={net} />
              <div className="grow">
                <h1 className="ellip">{name}</h1>
                <div className="mono muted ellip">{account}</div>
                {p?.about && <p style={{ margin: '6px 0 0' }} className="muted">{p.about}</p>}
              </div>
              {me && <Tier t={me.tier} />}
            </div>
            <div className="grid g4" style={{ marginTop: 18 }}>
              <div><div className="caps">Yap score</div><div className="score">{me ? me.score.toFixed(1) : '0'}</div></div>
              <div><div className="caps">Mindshare</div><div className="score" style={{ fontSize: 30 }}>{me ? pct(me.share, 1) : '0%'}</div></div>
              <div><div className="caps">Rank</div><div className="score" style={{ fontSize: 30 }}>{me ? `#${me.rank}` : '—'}</div></div>
              <div><div className="caps">Smart followers</div><div className="score" style={{ fontSize: 30 }}>{me?.smartFollowers ?? 0}</div></div>
            </div>
            <div className="row wrap" style={{ marginTop: 16 }}>
              <button className="btn" onClick={() => drawCard({ account, name, score: me?.score ?? 0, share: me?.share ?? 0, rank: me?.rank ?? 0, tier: me?.tier ?? 0, smart: me?.smartFollowers ?? 0, earned: yap(me?.amount ?? 0n, 0) })}>Download Yap card (PNG)</button>
              {net === 'testnet' && wallet && wallet.id !== account && <button className="btn primary" onClick={follow}>Follow on near.social</button>}
              <a className="btn ghost" href={net === 'mainnet' ? `https://near.social/${account}` : `https://testnet.nearblocks.io/address/${account}`} target="_blank" rel="noreferrer">{net === 'mainnet' ? 'near.social ↗' : 'Explorer ↗'}</a>
            </div>
            {msg && <p className="note">{msg}</p>}
          </div>
          <div className="card">
            <div className="card-h"><h2>Score history</h2><span className="note">Yap score per epoch</span></div>
            {history.length > 1 ? <LineChart series={[{ name, color: 'var(--series-2)', points: history }]} height={200} xLabel="epoch" yFormat={(v) => v.toFixed(0)} /> : <p className="note">One epoch so far.</p>}
          </div>
          <div className="card pad0">
            <div className="card-h" style={{ padding: '14px 16px 0' }}><h2>Best posts</h2><span className="note">label q × (1 + ln(1 + weighted engagement))</span></div>
            {!posts ? <Loading /> : !posts.length ? <div className="empty">{net === 'mainnet' ? 'Post scores are shown for testnet epochs.' : 'No scored posts yet.'}</div> : posts.slice(0, 10).map((pp) => (
              <div className="post" key={pp.key}>
                <Avatar account={account} size={36} net={net} />
                <div style={{ minWidth: 0 }}>
                  <div className="row"><b>{name}</b><span className="faint mono" style={{ fontSize: 11 }}>epoch #{pp.epoch}</span><span className="right"><Q q={pp.q} /></span></div>
                  <div className="txt"><Text text={pp.text} /></div>
                  <div className="meta"><span className="mono">score {pp.score.toFixed(2)}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="grid" style={{ alignContent: 'start' }}>
          {net === 'testnet' && (
            <div className="card">
              <div className="card-h"><h2>Rewards</h2><a className="link right" href="#/earn">Earn →</a></div>
              <dl className="kv">
                <dt>Balance</dt><dd>{yap(bal ?? '0')} YAP</dd>
                <dt>Earned (all epochs)</dt><dd>{yap(me?.amount ?? 0n)} YAP</dd>
                <dt>Claimed epochs</dt><dd>{claims ? `${claims.filter((c) => c.claimed).length}/${claims.length}` : '…'}</dd>
              </dl>
            </div>
          )}
          <div className="card">
            <h2 style={{ marginBottom: 10 }}>Topics</h2>
            {topics.length ? topics.map(([t, v]) => (
              <a key={t} href={`#/leaderboard/${encodeURIComponent(t)}`} style={{ display: 'block', margin: '6px 0' }}>
                <div className="row"><span className="tag">{t}</span><span className="right mono faint">{v.toFixed(1)}</span></div>
                <div className="bar" style={{ marginTop: 3 }}><i style={{ width: `${(v / tmax) * 100}%` }} /></div>
              </a>
            )) : <p className="note">No topics yet.</p>}
          </div>
          <div className="card">
            <div className="card-h"><h2>Followers</h2><span className="note">{flw?.length ?? 0} · smart ones first</span></div>
            {(flw ?? []).sort((a, b) => Number(smartSet.has(b)) - Number(smartSet.has(a))).slice(0, 14).map((f) => (
              <div key={f} className="row" style={{ padding: '5px 0' }}>
                <Who account={f} size={26} />
                {smartSet.has(f) && <span className="pill acc right">smart</span>}
              </div>
            ))}
            {net === 'mainnet' && <p className="note">Follower lists are shown for testnet accounts.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
