// Home: who and what holds the community's attention. Yapper treemap sized by mindshare (share of all Yap score
// in the window), topic treemap coloured by change, gainers/losers, and the top-scoring posts.
import { useState } from 'react';
import { aggregate, loadEpochs, epochFile, view, sc, pct, yap, type EpochScores, type Net } from '../lib/data';
import { Treemap, useAsync, useNet, Avatar, Who, Delta, Loading, Q, Text, go, useProfile } from '../ui/kit';

export const WINDOWS: Record<Net, [string, number][]> = {
  testnet: [['Epoch', 1], ['1H', 6], ['6H', 36], ['All', 100000]],
  mainnet: [['30D', 1]],
};

function TileName({ account, net }: { account: string; net: Net }) {
  const p = useProfile(account, net);
  return <>{p?.name || account.split('.')[0]}</>;
}

function TopPosts({ epochs, net }: { epochs: EpochScores[]; net: Net }) {
  const last = epochs[epochs.length - 1];
  const { data } = useAsync(async () => {
    if (!last) return [];
    const d: any = await epochFile(last.epoch, 'dataset');
    const text = new Map<string, any>(d.posts.map((p: any) => [p.key, p]));
    return last.result.yappers.flatMap((y) => y.posts.map((p) => ({ ...p, author: y.account, text: text.get(p.key)?.text ?? '' }))).sort((a, b) => Number(BigInt(b.score) - BigInt(a.score))).slice(0, 6);
  }, [last?.epoch, net]);
  if (!data) return <Loading />;
  return (
    <div>
      {data.map((p) => (
        <div className="post" key={p.key}>
          <Avatar account={p.author} size={36} net={net} />
          <div style={{ minWidth: 0 }}>
            <div className="row"><a href={`#/u/${p.author}`} style={{ minWidth: 0 }} className="ellip"><b><TileName account={p.author} net={net} /></b> <span className="faint mono" style={{ fontSize: 11 }}>{p.author}</span></a><span className="right"><Q q={p.q} /></span></div>
            <div className="txt clamp"><Text text={p.text} /></div>
            <div className="meta"><span className="mono">post score {sc(p.score).toFixed(2)}</span></div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Mindshare() {
  const net = useNet();
  const wins = WINDOWS[net];
  const [win, setWin] = useState(wins[0]![1]);
  const w = wins.some((x) => x[1] === win) ? win : wins[0]![1];
  const { data: epochs, error } = useAsync(() => loadEpochs(net), [net], 30_000);
  const { data: chainState } = useAsync(() => view('get_state').catch(() => null), [], 30_000);
  const state = net === 'testnet' ? chainState : null;
  if (error) return <div className="page"><div className="empty">{error}</div></div>;
  if (!epochs) return <div className="page"><Loading /></div>;
  if (!epochs.length)
    return (
      <div className="page">
        <div className="empty">No scored epochs yet. The first testnet epoch is scored a few seconds after it ends (epochs are 10 minutes).</div>
      </div>
    );
  const { rows, topics } = aggregate(epochs, w);
  const hasPrev = epochs.length > w;
  const gainers = rows.filter((r) => r.prevRank != null && r.prevRank > r.rank).sort((a, b) => b.prevRank! - b.rank - (a.prevRank! - a.rank)).slice(0, 5);
  const losers = rows.filter((r) => r.prevRank != null && r.prevRank < r.rank).sort((a, b) => b.rank - b.prevRank! - (a.rank - a.prevRank!)).slice(0, 5);
  const last = epochs[epochs.length - 1]!;
  const top = rows.slice(0, 40);
  const maxShare = top[0]?.share ?? 1;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Mindshare</h1>
          <p>Share of all Yap score earned on near.social in the window. Score = AI quality label × engagement weighted by smart followers and stake. {net === 'mainnet' ? 'Real near.social mainnet data from the last 30 days, labelled by the same TEE-attested model. Read-only and unrewarded.' : 'Live on NEAR testnet; every epoch is reported on chain and paid in $YAP.'}</p>
        </div>
        <div className="tabs right">{wins.map(([l, n]) => <button key={l} className={w === n ? 'on' : ''} onClick={() => setWin(n)}>{l}</button>)}</div>
      </div>

      <div className="grid g4" style={{ marginBottom: 14 }}>
        <div className="card stat"><div className="caps">Yappers ({wins.find((x) => x[1] === w)?.[0]})</div><div className="v">{rows.length}</div><div className="s">accounts with score &gt; 0</div></div>
        <div className="card stat"><div className="caps">{net === 'mainnet' ? 'Attention · window' : 'Attention · last epoch'}</div><div className="v">{sc(last.result.attention).toFixed(1)}</div><div className="s">{state ? `target ${sc(state.attention_target).toFixed(1)}` : net === 'mainnet' ? 'last 30 days' : `epoch #${last.epoch}`}</div></div>
        <div className="card stat"><div className="caps">Block</div><div className="v">{state ? `⛏ #${state.block_number}` : '—'}</div><div className="s">{state ? `${Math.min(100, (sc(state.block_progress) / Math.max(1e-9, sc(state.block_threshold))) * 100).toFixed(0)}% to the jackpot` : 'testnet only'}</div></div>
        <div className="card stat"><div className="caps">💰 Jackpot pot</div><div className="v" style={{ fontSize: 18 }}>{state ? yap(state.jackpot_pot, 0) : '—'}</div><div className="s">{state ? `+ vault ${yap(state.vault, 0)} $YAP` : 'testnet only'}</div></div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-h"><h2>Yapper mindshare</h2><span className={`pill ${net === 'mainnet' ? 'ro' : 'live'}`}>{net === 'mainnet' ? 'mainnet · read-only' : `testnet · epoch #${last.epoch}`}</span><a className="link right" href="#/leaderboard">Full leaderboard →</a></div>
        <Treemap
          items={top.map((r) => ({ ...r, id: r.account, value: r.share }))}
          height={460}
          color={(it) => `color-mix(in srgb, var(--accent) ${Math.round(25 + 65 * (it.share / maxShare))}%, var(--violet) ${Math.round(50 - 40 * (it.share / maxShare))}%)`}
          onClick={(it) => go(`#/u/${it.account}`)}
          render={(it, r) => (
            <>
              {Math.min(r.w, r.h) > 70 && <Avatar account={it.account} size={Math.min(56, Math.max(24, Math.min(r.w, r.h) / 3))} net={net} />}
              <div>
                <div className="nm"><TileName account={it.account} net={net} /></div>
                <div className="pc">{pct(it.share)}</div>
              </div>
            </>
          )}
        />
      </div>

      <div className="grid g-main" style={{ marginBottom: 14 }}>
        <div className="card">
          <div className="card-h"><h2>Topic mindshare</h2><span className="note">#hashtags, $cashtags and @mentions · {hasPrev ? 'colour = change vs previous window (blue up, orange down)' : 'size = share'}</span></div>
          {topics.length ? (
            <Treemap
              items={topics.slice(0, 24).map((t) => ({ ...t, id: t.topic, value: t.share }))}
              height={300}
              color={(t) => {
                if (!hasPrev) return `color-mix(in srgb, var(--violet) ${Math.round(35 + 55 * (t.share / (topics[0]?.share || 1)))}%, var(--surface-3))`;
                const d = t.share - t.prevShare;
                const k = Math.min(1, Math.abs(d) / 0.05);
                return `color-mix(in srgb, ${d >= 0 ? 'var(--up)' : 'var(--down)'} ${Math.round(30 + 60 * k)}%, var(--neutral))`;
              }}
              onClick={(t) => go(`#/leaderboard/${encodeURIComponent(t.topic)}`)}
              render={(t) => {
                const d = t.share - t.prevShare;
                return (
                  <>
                    <div className="nm">{t.topic}</div>
                    <div className="pc">{pct(t.share, 1)} {hasPrev && <span style={{ fontSize: 11 }}>{d >= 0 ? '▲' : '▼'}{Math.abs(d * 100).toFixed(1)}</span>}</div>
                  </>
                );
              }}
            />
          ) : <div className="empty">No topics yet.</div>}
        </div>
        <div className="card">
          <h2 style={{ marginBottom: 10 }}>Movers</h2>
          <div className="caps">Top gainers</div>
          {gainers.length ? gainers.map((r) => <div key={r.account} className="row" style={{ padding: '6px 0' }}><Who account={r.account} net={net} size={26} sub={pct(r.share)} /><span className="right"><Delta prev={r.prevRank} rank={r.rank} /></span></div>) : <p className="note">Needs two windows of data.</p>}
          <div className="caps" style={{ marginTop: 12 }}>Top losers</div>
          {losers.length ? losers.map((r) => <div key={r.account} className="row" style={{ padding: '6px 0' }}><Who account={r.account} net={net} size={26} sub={pct(r.share)} /><span className="right"><Delta prev={r.prevRank} rank={r.rank} /></span></div>) : <p className="note">Needs two windows of data.</p>}
        </div>
      </div>

      <div className="card pad0">
        <div className="card-h" style={{ padding: '14px 16px 0' }}><h2>Top posts · {net === 'mainnet' ? 'last 30 days' : 'last epoch'}</h2><span className="note">AI quality label from a TEE-attested model, times weighted engagement</span></div>
        <TopPosts epochs={epochs} net={net} />
      </div>
    </div>
  );
}
