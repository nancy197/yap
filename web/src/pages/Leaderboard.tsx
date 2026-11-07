// Yapper leaderboard: global, or for one topic (#hashtag / $cashtag / @account), over a time window.
// A topic board ranks accounts by the score of their posts that mention the topic (the same rule arenas pay on).
import { useState } from 'react';
import { aggregate, loadEpochs, epochFile, sc, pct, yap, type EpochScores, type Net, type Agg } from '../lib/data';
import { useAsync, useNet, Who, Delta, Tier, Loading, go } from '../ui/kit';
import { WINDOWS } from './Mindshare';

async function topicRows(epochs: EpochScores[], topic: string): Promise<Agg[]> {
  const m = new Map<string, Agg>();
  for (const e of epochs) {
    const d: any = await epochFile(e.epoch, 'dataset').catch(() => null);
    if (!d) continue;
    const topics = new Map<string, string[]>(d.posts.map((p: any) => [p.key, p.topics]));
    for (const y of e.result.yappers) {
      const s = y.posts.filter((p) => topics.get(p.key)?.includes(topic)).reduce((n, p) => n + sc(p.score), 0);
      if (!s) continue;
      const r = m.get(y.account) ?? { account: y.account, score: 0, share: 0, prevRank: null, rank: 0, tier: y.tier, smartFollowers: y.smartFollowers, amount: 0n, posts: 0, epochs: 0 };
      r.score += s;
      r.posts += y.posts.filter((p) => topics.get(p.key)?.includes(topic)).length;
      r.epochs++;
      r.tier = y.tier;
      r.smartFollowers = y.smartFollowers;
      m.set(y.account, r);
    }
  }
  const rows = [...m.values()].sort((a, b) => b.score - a.score);
  const tot = rows.reduce((n, r) => n + r.score, 0) || 1;
  rows.forEach((r, i) => ((r.rank = i + 1), (r.share = r.score / tot)));
  return rows;
}

export default function Leaderboard({ topic }: { topic?: string }) {
  const net = useNet();
  const wins = WINDOWS[net];
  const [win, setWin] = useState(wins[wins.length - 1]![1]);
  const w = wins.some((x) => x[1] === win) ? win : wins[0]![1];
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const { data: epochs } = useAsync(() => loadEpochs(net), [net], 30_000);
  const { data: rows } = useAsync(async () => {
    if (!epochs) return null;
    const cur = epochs.slice(-w);
    if (topic && net === 'testnet') return topicRows(cur, topic);
    return aggregate(epochs, w).rows;
  }, [epochs, w, topic, net]);
  const agg = epochs ? aggregate(epochs, epochs.length) : null;
  const shown = (rows ?? []).filter((r) => !q || r.account.includes(q.toLowerCase()));
  const per = 25;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{topic ? <>Leaderboard · <span className="tag">{topic}</span></> : 'Yapper Leaderboard'}</h1>
          <p>{topic ? `Accounts ranked by the score of their posts that mention ${topic}. Arenas pay on exactly this ranking.` : 'Accounts ranked by Yap score. Mindshare is the share of all Yap score in the window. Smart followers are followers in the top 20% by PageRank of the follow graph.'}</p>
        </div>
        <div className="tabs right">{wins.map(([l, n]) => <button key={l} className={w === n ? 'on' : ''} onClick={() => setWin(n)}>{l}</button>)}</div>
      </div>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <input className="in" style={{ maxWidth: 260 }} placeholder="Filter accounts" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        <select className="in" style={{ maxWidth: 220 }} value={topic ?? ''} onChange={(e) => go(e.target.value ? `#/leaderboard/${encodeURIComponent(e.target.value)}` : '#/leaderboard')}>
          <option value="">All topics</option>
          {(agg?.topics ?? []).slice(0, 30).map((t) => <option key={t.topic} value={t.topic}>{t.topic}</option>)}
        </select>
        {net === 'mainnet' && <span className="pill ro">mainnet · read-only · unrewarded · SIMULATED labels</span>}
      </div>
      <div className="card pad0 scroll-x">
        {!rows ? <Loading /> : !shown.length ? <div className="empty">No yappers in this window{topic ? ` for ${topic}` : ''} yet.</div> : (
          <table className="tbl">
            <thead>
              <tr><th>#</th><th>Yapper</th><th className="r">Yap score</th><th className="r">Mindshare</th><th className="r hide-m">Δ rank</th><th className="r hide-m">Smart followers</th><th>Tier</th>{!topic && net === 'testnet' && <th className="r hide-m">Earned</th>}</tr>
            </thead>
            <tbody>
              {shown.slice(page * per, page * per + per).map((r) => (
                <tr key={r.account} onClick={() => go(`#/u/${r.account}`)}>
                  <td className={`rank ${r.rank <= 3 ? 'top' : ''}`}>{r.rank}</td>
                  <td style={{ maxWidth: 260 }}><Who account={r.account} net={net} size={30} /></td>
                  <td className="r">{r.score.toFixed(2)}</td>
                  <td className="r">
                    <div style={{ minWidth: 90 }}>{pct(r.share)}</div>
                    <div className="bar" style={{ marginTop: 4 }}><i style={{ width: `${(r.share / (shown[0]?.share || 1)) * 100}%` }} /></div>
                  </td>
                  <td className="r hide-m"><Delta prev={r.prevRank} rank={r.rank} /></td>
                  <td className="r hide-m">{r.smartFollowers}</td>
                  <td><Tier t={r.tier} /></td>
                  {!topic && net === 'testnet' && <td className="r hide-m">{yap(r.amount, 1)} YAP</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {shown.length > per && (
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn sm" disabled={!page} onClick={() => setPage(page - 1)}>← Prev</button>
          <span className="note">{page * per + 1}–{Math.min(shown.length, page * per + per)} of {shown.length}</span>
          <button className="btn sm" disabled={(page + 1) * per >= shown.length} onClick={() => setPage(page + 1)}>Next →</button>
        </div>
      )}
    </div>
  );
}
