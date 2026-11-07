// Trusted circle: reputation becomes DAO membership. The steward contract checks a Gold+ yapper leaf against a
// finalized $YAP epoch and adds the account to the DAO's `trusted` role, no council vote. Trusted members can send
// small, capped grants from the treasury; anything bigger is a normal council proposal.
import { useState } from 'react';
import { view, loadEpochs, yap, nb, STEWARD, DAO, TIER } from '../lib/data';
import { useAsync, Loading, Who, Tier } from '../ui/kit';
import { useWallet, call } from '../lib/wallet';

const Y = 10n ** 18n;

export default function Trusted() {
  const w = useWallet();
  const [msg, setMsg] = useState<{ text: string; hash?: string } | null>(null);
  const [to, setTo] = useState('');
  const [amt, setAmt] = useState('100');
  const [memo, setMemo] = useState('');
  const { data: cfg } = useAsync(() => view<any>('get_config', {}, STEWARD).catch(() => null), []);
  const { data: cur } = useAsync(() => view<number>('current_epoch', {}, STEWARD).catch(() => 0), [], 20_000);
  const { data: members, reload } = useAsync(() => view<[string, any][]>('get_members', {}, STEWARD).catch(() => []), [], 20_000);
  const { data: grants } = useAsync(() => view<any[]>('get_grants', { from: 0, limit: 100 }, STEWARD).catch(() => []), [], 20_000);
  const { data: spent } = useAsync(async () => (cfg && cur != null ? view<string>('get_spent', { period: Math.floor(cur / cfg.season_epochs) }, STEWARD) : '0'), [cfg, cur], 20_000);
  const { data: policy } = useAsync(() => view<any>('get_policy', {}, DAO).catch(() => null), [], 30_000);
  const { data: epochs } = useAsync(() => loadEpochs('testnet'), [], 30_000);
  if (!cfg) return <div className="card"><h2>Trusted circle</h2><p className="note">Steward contract not deployed yet.</p></div>;
  const daoRole: string[] = policy?.roles?.find((r: any) => r.name === cfg.role)?.kind?.Group ?? [];
  const me = w ? members?.find(([a]) => a === w.id)?.[1] : null;
  const active = !!me && me.expires_epoch >= (cur ?? 0);
  // My freshest Gold+ leaf in the published epochs, for a self-serve promotion.
  const myLeaf = w && epochs ? [...epochs].reverse().map((e) => ({ e: e.epoch, y: e.result.yappers.find((y) => y.account === w.id) })).find((x) => x.y && x.y.tier >= cfg.min_tier) : undefined;
  const run = async (label: string, f: () => Promise<string>) => {
    setMsg({ text: `${label}…` });
    try {
      const hash = await f();
      setMsg({ text: `${label}: done`, hash });
      reload();
    } catch (e) {
      setMsg({ text: String((e as Error).message) });
    }
  };
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-h"><h2>Trusted circle</h2><span className="pill acc">reputation → DAO role</span><a className="link right" href={`https://testnet.nearblocks.io/address/${STEWARD}`} target="_blank" rel="noreferrer">{STEWARD} ↗</a></div>
      <p className="note" style={{ marginTop: -4 }}>
        Yappers at <b>{TIER[cfg.min_tier]}</b> or above in a finalized epoch join the DAO's <span className="mono">{cfg.role}</span> role automatically: the
        steward contract checks their Merkle leaf against the on-chain root, files <span className="mono">AddMemberToRole</span> and approves it with its own
        role. No council vote, no admin. Membership lasts {cfg.season_epochs} epochs after the proof; prove again to stay. Trusted members can send grants of up
        to {yap(cfg.grant_cap, 0)} YAP from the treasury ({yap(cfg.period_budget, 0)} per season); bigger spends stay council proposals.
      </p>
      <div className="grid g4" style={{ margin: '12px 0' }}>
        <div className="stat"><div className="caps">Members</div><div className="v">{members?.filter(([, m]) => m.expires_epoch >= (cur ?? 0)).length ?? '…'}</div><div className="s">in DAO role: {daoRole.length}</div></div>
        <div className="stat"><div className="caps">Season budget used</div><div className="v" style={{ fontSize: 18 }}>{yap(spent ?? '0', 0)} / {yap(cfg.period_budget, 0)}</div></div>
        <div className="stat"><div className="caps">Grants</div><div className="v">{grants?.length ?? 0}</div></div>
        <div className="stat"><div className="caps">Per-grant cap</div><div className="v" style={{ fontSize: 18 }}>{yap(cfg.grant_cap, 0)} YAP</div></div>
      </div>
      <div className="grid g2">
        <div>
          <div className="caps" style={{ marginBottom: 6 }}>Members</div>
          {!members ? <Loading /> : !members.length ? <p className="note">No one yet.</p> : members.sort((a, b) => b[1].expires_epoch - a[1].expires_epoch).map(([a, m]) => (
            <div key={a} className="row" style={{ padding: '5px 0' }}>
              <Who account={a} size={26} sub={`proof epoch ${m.proof_epoch} · until epoch ${m.expires_epoch}`} />
              <span className="right"><Tier t={m.tier} /></span>
              {daoRole.includes(a) ? <span className="pill live">in DAO</span> : <span className="pill">pending</span>}
            </div>
          ))}
          {w && !active && (
            <div style={{ marginTop: 10 }}>
              {myLeaf ? (
                <button className="btn primary" onClick={() => run('Promote me', () => call('promote', { account: w.id, e: myLeaf.e, amount: myLeaf.y!.amount, score: Number(myLeaf.y!.score), tier: myLeaf.y!.tier, proof: myLeaf.y!.proof }, 0n, 250, STEWARD))}>
                  Join with my epoch #{myLeaf.e} proof
                </button>
              ) : <p className="note">You need {TIER[cfg.min_tier]}+ in a recent epoch to join.</p>}
            </div>
          )}
        </div>
        <div>
          <div className="caps" style={{ marginBottom: 6 }}>Grants</div>
          {(grants ?? []).slice().reverse().slice(0, 8).map((g) => (
            <div key={g.id} className="log-row" style={{ gridTemplateColumns: '1fr auto', padding: '6px 0' }}>
              <span className="ellip"><b>{yap(g.amount, 0)} YAP</b> <span className="faint">{g.by.split('.')[0]} → {g.receiver.split('.')[0]}</span> · {g.memo}</span>
              <span className={`pill ${g.status === 'Approved' ? 'live' : ''}`}>{g.status}</span>
            </div>
          ))}
          {!grants?.length && <p className="note">No grants yet.</p>}
          {active && (
            <div className="grid" style={{ gap: 6, marginTop: 10 }}>
              <input className="in" placeholder="receiver.testnet" value={to} onChange={(e) => setTo(e.target.value)} />
              <div className="row"><input className="in" value={amt} onChange={(e) => setAmt(e.target.value.replace(/\D/g, ''))} /><span className="note">YAP</span></div>
              <input className="in" placeholder="What is it for?" value={memo} onChange={(e) => setMemo(e.target.value)} />
              <button className="btn primary" disabled={!to || !amt} onClick={() => run('Grant', () => call('grant', { receiver: to.trim(), amount: (BigInt(amt) * Y).toString(), memo: memo || 'community grant' }, 1_250_000_000_000_000_000_000n, 250, STEWARD))}>Send grant from treasury</button>
            </div>
          )}
        </div>
      </div>
      {msg && <p className="note">{msg.text} {msg.hash && <a className="link" href={nb(msg.hash)} target="_blank" rel="noreferrer">tx ↗</a>}</p>}
    </div>
  );
}
