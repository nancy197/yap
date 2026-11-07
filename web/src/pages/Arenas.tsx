// Arenas: a sponsor (usually a community's Sputnik DAO) escrows a reward pool for one topic. Each epoch the pool
// is split by score on posts that mention the topic, among yappers at or above a minimum tier.
import { useState } from 'react';
import { view, loadEpochs, yap, TIER, TOKEN, DAO, nb, sc } from '../lib/data';
import { useAsync, Loading, Who, Tier } from '../ui/kit';
import { useWallet, call } from '../lib/wallet';

const Y = 10n ** 18n;
const tokenName = (t: string) => (t === TOKEN ? 'YAP' : t === 'wrap.testnet' ? 'wNEAR' : t);
const fmt = (raw: string, token: string) => (token === 'wrap.testnet' ? `${(Number(BigInt(raw) / 10n ** 21n) / 1000).toLocaleString()} wNEAR` : `${yap(raw, 0)} YAP`);

function Create() {
  const w = useWallet();
  const [topic, setTopic] = useState('#near');
  const [title, setTitle] = useState('NEAR builders arena');
  const [per, setPer] = useState('500');
  const [epochs, setEpochs] = useState('6');
  const [minTier, setMinTier] = useState(1);
  const [msg, setMsg] = useState<{ text: string; hash?: string } | null>(null);
  const amount = (BigInt(per || '0') * BigInt(epochs || '0') * Y).toString();
  const arenaMsg = JSON.stringify({ open_arena: { topic: topic.toLowerCase(), per_epoch: (BigInt(per || '0') * Y).toString(), epochs: Number(epochs), min_tier: minTier, title } });
  const proposal = {
    description: `Fund YAP arena "${title}" for ${topic}: ${per} YAP per epoch for ${epochs} epochs, ${TIER[minTier]}+ yappers.`,
    kind: { FunctionCall: { receiver_id: TOKEN, actions: [{ method_name: 'ft_transfer_call', args: btoa(JSON.stringify({ receiver_id: TOKEN, amount, msg: arenaMsg })), deposit: '1', gas: '150000000000000' }] } },
  };
  const run = async (label: string, f: () => Promise<string>) => {
    setMsg({ text: `${label}…` });
    try {
      setMsg({ text: `${label}: done`, hash: await f() });
    } catch (e) {
      setMsg({ text: String((e as Error).message) });
    }
  };
  return (
    <div className="card">
      <h2 style={{ marginBottom: 6 }}>Open an arena</h2>
      <p className="note">The usual path is a DAO proposal: the council votes, and on approval the DAO itself sends the pool from its treasury to the arena escrow. Nobody can pull the pool back early; unspent epochs refund to the sponsor when the arena closes.</p>
      <div className="grid g2" style={{ gap: 8 }}>
        <label className="f">Topic<input className="in" value={topic} onChange={(e) => setTopic(e.target.value)} /></label>
        <label className="f">Title<input className="in" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="f">YAP per epoch<input className="in" value={per} onChange={(e) => setPer(e.target.value.replace(/\D/g, ''))} /></label>
        <label className="f">Epochs<input className="in" value={epochs} onChange={(e) => setEpochs(e.target.value.replace(/\D/g, ''))} /></label>
        <label className="f">Minimum tier<select className="in" value={minTier} onChange={(e) => setMinTier(Number(e.target.value))}>{TIER.map((t, i) => <option key={t} value={i}>{t}</option>)}</select></label>
      </div>
      <div className="caps" style={{ margin: '12px 0 4px' }}>Sputnik DAO proposal ({DAO})</div>
      <pre className="mono" style={{ fontSize: 11, background: 'var(--surface-2)', padding: 10, borderRadius: 10, overflow: 'auto', maxHeight: 160 }}>{JSON.stringify({ ...proposal, kind: { FunctionCall: { ...proposal.kind.FunctionCall, actions: [{ ...proposal.kind.FunctionCall.actions[0], args: `base64(${JSON.stringify({ receiver_id: TOKEN, amount, msg: JSON.parse(arenaMsg) })})` }] } } }, null, 2)}</pre>
      <div className="row wrap" style={{ marginTop: 8 }}>
        <button className="btn primary" disabled={!w} onClick={() => run('Submit DAO proposal', () => call('add_proposal', { proposal }, 100_000_000_000_000_000_000_000n, 100, DAO))}>Submit proposal (0.1 NEAR bond)</button>
        <button className="btn" disabled={!w} onClick={() => run('Fund directly', () => call('ft_transfer_call', { receiver_id: TOKEN, amount, msg: arenaMsg }, 1n, 150))}>Fund directly from my YAP</button>
        {!w && <span className="note">Connect a testnet account to submit.</span>}
      </div>
      {msg && <p className="note">{msg.text} {msg.hash && <a className="link" href={nb(msg.hash)} target="_blank" rel="noreferrer">tx ↗</a>}</p>}
    </div>
  );
}

export default function Arenas({ id }: { id?: string }) {
  const { data: arenas } = useAsync(() => view<any[]>('get_arenas', { from: 0, limit: 50 }).catch(() => []), [], 20_000);
  const { data: state } = useAsync(() => view<any>('get_state'), [], 20_000);
  const { data: epochs } = useAsync(() => loadEpochs('testnet'), [], 30_000);
  if (!arenas) return <div className="page"><Loading /></div>;
  const cur = state?.current_epoch ?? 0;
  if (id != null) {
    const a = arenas.find((x) => String(x.id) === id);
    if (!a) return <div className="page"><div className="empty">Arena not found.</div></div>;
    const rounds = (epochs ?? []).filter((e) => e.result.arenas?.[String(a.id)]).map((e) => ({ epoch: e.epoch, r: e.result.arenas[String(a.id)]! }));
    const totals = new Map<string, { score: number; amount: bigint }>();
    for (const { r } of rounds) for (const y of r.yappers) { const t = totals.get(y.account) ?? { score: 0, amount: 0n }; t.score += sc(y.score); t.amount += BigInt(y.amount); totals.set(y.account, t); }
    const board = [...totals.entries()].sort((x, y) => y[1].score - x[1].score);
    return (
      <div className="page">
        <div className="page-head">
          <div><a className="link" href="#/arenas">← Arenas</a><h1 style={{ marginTop: 6 }}>{a.title} <span className="tag">{a.topic}</span></h1><p>Sponsored by <a className="link" href={`#/u/${a.opener}`}>{a.opener}</a>. {fmt(a.per_epoch, a.token)} per epoch for {a.epochs} epochs (from #{a.start_epoch}), {TIER[a.min_tier]}+ only.</p></div>
        </div>
        <div className="grid g4" style={{ marginBottom: 14 }}>
          <div className="card stat"><div className="caps">Budget left</div><div className="v" style={{ fontSize: 18 }}>{fmt(a.budget_left, a.token)}</div></div>
          <div className="card stat"><div className="caps">Epochs</div><div className="v">{Math.max(0, Math.min(a.epochs, cur - a.start_epoch))}/{a.epochs}</div><div className="s">elapsed</div></div>
          <div className="card stat"><div className="caps">Min tier</div><div className="v" style={{ fontSize: 18 }}><Tier t={a.min_tier} /></div></div>
          <div className="card stat"><div className="caps">Status</div><div className="v" style={{ fontSize: 18 }}>{a.closed ? 'closed' : cur < a.start_epoch ? 'upcoming' : cur >= a.start_epoch + a.epochs ? 'ended' : 'live'}</div></div>
        </div>
        <div className="card pad0 scroll-x">
          <div className="card-h" style={{ padding: '14px 16px 0' }}><h2>Arena leaderboard</h2></div>
          {!board.length ? <div className="empty">No eligible yappers scored for {a.topic} yet.</div> : (
            <table className="tbl">
              <thead><tr><th>#</th><th>Yapper</th><th className="r">Topic score</th><th className="r">Paid</th></tr></thead>
              <tbody>{board.map(([acc, t], i) => <tr key={acc} onClick={() => (location.hash = `#/u/${acc}`)}><td className="rank">{i + 1}</td><td><Who account={acc} size={28} /></td><td className="r">{t.score.toFixed(2)}</td><td className="r">{fmt(t.amount.toString(), a.token)}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Arenas</h1><p>Projects and communities pay yappers to talk about them, on chain and in the open. The pool sits in the $YAP contract and is paid each epoch to the top voices on the topic, weighted by score. Tier gates keep fresh sybils out.</p></div>
      </div>
      <div className="grid g-main">
        <div className="grid" style={{ alignContent: 'start' }}>
          {!arenas.length && <div className="empty">No arenas yet. Open one with a DAO proposal →</div>}
          {arenas.map((a) => {
            const done = Math.max(0, Math.min(a.epochs, cur - a.start_epoch));
            return (
              <a key={a.id} className="card" href={`#/arenas/${a.id}`} style={{ display: 'block' }}>
                <div className="row wrap"><h2>{a.title}</h2><span className="tag">{a.topic}</span><span className={`pill right ${a.closed ? '' : cur < a.start_epoch + a.epochs ? 'live' : ''}`}>{a.closed ? 'closed' : cur < a.start_epoch + a.epochs ? 'live' : 'ended'}</span></div>
                <div className="row wrap" style={{ marginTop: 10, gap: 20 }}>
                  <div><div className="caps">Sponsor</div><div className="mono ellip" style={{ maxWidth: 200 }}>{a.opener}</div></div>
                  <div><div className="caps">Per epoch</div><div className="mono">{fmt(a.per_epoch, a.token)}</div></div>
                  <div><div className="caps">Budget left</div><div className="mono">{fmt(a.budget_left, a.token)}</div></div>
                  <div><div className="caps">Min tier</div><Tier t={a.min_tier} /></div>
                </div>
                <div className="bar" style={{ marginTop: 12 }}><i style={{ width: `${(done / a.epochs) * 100}%` }} /></div>
                <div className="note" style={{ marginTop: 4 }}>{done}/{a.epochs} epochs · token {tokenName(a.token)}</div>
              </a>
            );
          })}
        </div>
        <Create />
      </div>
    </div>
  );
}
