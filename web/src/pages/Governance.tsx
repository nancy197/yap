// Governance: the community treasury is a stock Sputnik DAO v2 (also visible in Trezu). It funds arenas by
// proposal and is the court of appeal for scoring challenges: the token contract itself files the proposal.
import { view, yap, DAO, TOKEN, nbAcc } from '../lib/data';
import { useAsync, Loading, Who } from '../ui/kit';

const decode = (b64: string) => { try { return JSON.parse(atob(b64)); } catch { return null; } };
function describe(p: any): string {
  const k = p.kind;
  if (k?.FunctionCall) {
    const a = k.FunctionCall.actions?.[0];
    const args = a ? decode(a.args) : null;
    if (a?.method_name === 'resolve_challenge') return `Settle scoring challenge on epoch ${args?.epoch ?? args?.e} → ${args?.upheld ? 'uphold' : 'reject'}`;
    if (a?.method_name === 'ft_transfer_call' && args?.msg?.includes('open_arena')) { const m = JSON.parse(args.msg).open_arena; return `Fund arena ${m.topic} · ${yap(args.amount, 0)} YAP`; }
    return `${a?.method_name ?? 'call'} on ${k.FunctionCall.receiver_id}`;
  }
  return Object.keys(k ?? {})[0] ?? 'proposal';
}

export default function Governance() {
  const { data: policy } = useAsync(() => view<any>('get_policy', {}, DAO), []);
  const { data: last } = useAsync(() => view<number>('get_last_proposal_id', {}, DAO).catch(() => 0), [], 20_000);
  const { data: props } = useAsync(async () => (last ? view<any[]>('get_proposals', { from_index: Math.max(0, last - 30), limit: 30 }, DAO) : []), [last]);
  const { data: daoBal } = useAsync(() => view<string>('ft_balance_of', { account_id: DAO }), [], 30_000);
  const { data: epochs } = useAsync(() => view<any[]>('get_epochs', { from: 0, limit: 200 }).catch(() => []), [], 30_000);
  const { data: challenges } = useAsync(async () => {
    const out: any[] = [];
    for (const e of epochs ?? []) {
      const c = await view<any>('get_challenge', { e: e.number }).catch(() => null);
      if (c) out.push({ ...c, epoch: e.number });
    }
    return out;
  }, [epochs]);
  const council = policy?.roles?.find((r: any) => r.name === 'council')?.kind?.Group ?? [];
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Governance</h1>
          <p>The community treasury is a standard Sputnik DAO v2 (<span className="mono">{DAO}</span>), so it also works in Trezu and every Sputnik tool. YAP doesn't rebuild the multisig: it gives the community what to do with it. The DAO funds arenas, receives 10% of every epoch's mint, and is the court of appeal when someone challenges an epoch's scores.</p>
        </div>
        <a className="btn right" href={nbAcc(DAO)} target="_blank" rel="noreferrer">DAO on explorer ↗</a>
      </div>
      <div className="grid g4" style={{ marginBottom: 14 }}>
        <div className="card stat"><div className="caps">Treasury</div><div className="v">{yap(daoBal ?? '0', 0)}</div><div className="s">YAP</div></div>
        <div className="card stat"><div className="caps">Council</div><div className="v">{council.length}</div><div className="s">2 of 3 to pass</div></div>
        <div className="card stat"><div className="caps">Proposals</div><div className="v">{last ?? '…'}</div><div className="s">all time</div></div>
        <div className="card stat"><div className="caps">Challenges</div><div className="v">{challenges?.length ?? '…'}</div><div className="s">scoring disputes</div></div>
      </div>
      <div className="grid g-main">
        <div className="card pad0 scroll-x">
          <div className="card-h" style={{ padding: '14px 16px 0' }}><h2>Proposals</h2></div>
          {!props ? <Loading /> : !props.length ? <div className="empty">No proposals yet.</div> : (
            <table className="tbl">
              <thead><tr><th>#</th><th>What</th><th>Proposer</th><th>Status</th><th className="r">Votes</th></tr></thead>
              <tbody>
                {[...props].reverse().map((p) => (
                  <tr key={p.id} style={{ cursor: 'default' }}>
                    <td className="rank">{p.id}</td>
                    <td style={{ maxWidth: 360 }}><div>{describe(p)}</div><div className="note ellip">{p.description}</div></td>
                    <td className="mono" style={{ fontSize: 12 }}>{p.proposer === TOKEN ? '$YAP contract' : p.proposer}</td>
                    <td><span className={`pill ${p.status === 'Approved' ? 'live' : p.status === 'InProgress' ? 'acc' : ''}`}>{p.status}</span></td>
                    <td className="r">{Object.values(p.votes ?? {}).filter((v) => v === 'Approve').length}/{council.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="grid" style={{ alignContent: 'start' }}>
          <div className="card">
            <h2 style={{ marginBottom: 8 }}>Council</h2>
            {council.map((c: string) => <div key={c} style={{ padding: '5px 0' }}><Who account={c} size={26} /></div>)}
            <p className="note">Scorers are not on the council: the people who report scores are not the people who judge challenges to them.</p>
          </div>
          <div className="card">
            <h2 style={{ marginBottom: 8 }}>Scoring challenges</h2>
            {!challenges ? <Loading /> : !challenges.length ? <p className="note">None yet. Anyone can challenge a proposed epoch within the window by bonding YAP; the contract opens a DAO proposal and the council rules.</p> : challenges.map((c) => (
              <div key={c.epoch} className="row" style={{ padding: '6px 0' }}>
                <span>Epoch #{c.epoch}</span><span className="faint mono ellip">{c.challenger}</span>
                <span className={`pill right ${c.status === 'Upheld' ? 'acc' : c.status === 'Rejected' ? '' : 'live'}`}>{c.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
