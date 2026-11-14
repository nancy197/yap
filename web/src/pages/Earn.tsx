// Earn: claim epoch rewards and arena payouts with Merkle proofs from the published scores, and stake sYAP.
import { useState } from 'react';
import { loadEpochs, view, yap, nb, TOKEN, type EpochScores } from '../lib/data';
import { useAsync, Loading, Tier } from '../ui/kit';
import { useWallet, call, ensureStorage } from '../lib/wallet';

const Y = 10n ** 18n;
const toRaw = (s: string) => {
  const [a, b = ''] = s.trim().split('.');
  return BigInt(a || '0') * Y + BigInt((b + '0'.repeat(18)).slice(0, 18));
};

export default function Earn() {
  const w = useWallet();
  const [msg, setMsg] = useState<{ text: string; hash?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [amt, setAmt] = useState('');
  const { data: epochs } = useAsync(() => loadEpochs('testnet'), [], 30_000);
  const { data: cfg } = useAsync(() => view<any>('get_config'), []);
  const { data: me, reload } = useAsync(async () => {
    if (!w || !epochs) return null;
    const [bal, stake, chain] = await Promise.all([view<string>('ft_balance_of', { account_id: w.id }), view<any>('get_stake', { account: w.id }), view<any[]>('get_epochs', { from: 0, limit: 200 }).catch(() => [])]);
    const claimable: { e: EpochScores; y: any; claimed: boolean; status: string }[] = [];
    for (const e of epochs) {
      const y = e.result.yappers.find((x) => x.account === w.id);
      if (!y || BigInt(y.amount) === 0n) continue;
      const status = chain.find((c) => c.number === e.epoch)?.status ?? 'pending';
      claimable.push({ e, y, status, claimed: await view<boolean>('is_claimed', { e: e.epoch, account: w.id }) });
    }
    const arenaWins = epochs.flatMap((e) => Object.values(e.result.arenas ?? {}).flatMap((a) => a.yappers.filter((y) => y.account === w.id && BigInt(y.amount) > 0n).map((y) => ({ e, a, y }))));
    return { bal, stake, claimable, arenaWins };
  }, [w?.id, epochs]);
  const run = async (label: string, f: () => Promise<string>) => {
    setBusy(true);
    setMsg({ text: `${label}…` });
    try {
      const hash = await f();
      setMsg({ text: `${label}: done`, hash });
      reload();
    } catch (e) {
      setMsg({ text: String((e as Error).message) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Earn</h1>
          <p>Each finalized epoch mints $YAP to yappers in proportion to Yap score. Claim with the Merkle proof from the published scores: the contract checks it against the root the scorers reported. Jackpot shares arrive in the same claim. Unclaimed rewards return to the jackpot after {cfg?.claim_epochs ?? 14} ticks. Stake to earn the stakers' {cfg ? cfg.staker_bps / 100 : 10}% and to give your likes more weight.</p>
        </div>
      </div>
      {!w ? (
        <div className="callout">Connect a testnet account (top right) to see and claim your rewards. A fresh burner starts with no score: post on the Feed, get engagement, and you'll appear in the next epoch.</div>
      ) : !me ? <Loading /> : (
        <>
          <div className="grid g4" style={{ marginBottom: 14 }}>
            <div className="card stat"><div className="caps">Wallet</div><div className="v">{yap(me.bal)}</div><div className="s">YAP</div></div>
            <div className="card stat"><div className="caps">Staked (sYAP)</div><div className="v">{yap(me.stake.amount)}</div><div className="s">eligible from epoch {me.stake.eligible_from}</div></div>
            <div className="card stat"><div className="caps">Staker rewards</div><div className="v">{yap(me.stake.rewards)}</div><div className="s">claimable now</div></div>
            <div className="card stat"><div className="caps">Unclaimed epochs</div><div className="v">{me.claimable.filter((c) => !c.claimed && c.status === 'Finalized').length}</div><div className="s">of {me.claimable.length} with rewards</div></div>
          </div>
          <div className="grid g-main">
            <div className="card pad0 scroll-x">
              <div className="card-h" style={{ padding: '14px 16px 0' }}><h2>Epoch rewards</h2></div>
              {!me.claimable.length ? <div className="empty">No rewards for {w.id} yet.</div> : (
                <table className="tbl">
                  <thead><tr><th>Epoch</th><th>Tier</th><th className="r">Amount</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {me.claimable.map(({ e, y, claimed, status }) => (
                      <tr key={e.epoch}>
                        <td className="rank">#{e.epoch}</td>
                        <td><Tier t={y.tier} /></td>
                        <td className="r">{yap(y.amount)} YAP</td>
                        <td><span className={`pill ${claimed ? 'live' : status === 'Finalized' ? 'acc' : ''}`}>{claimed ? 'claimed' : status === 'Finalized' ? 'claimable' : status}</span></td>
                        <td>{!claimed && status === 'Finalized' && <button className="btn sm primary" disabled={busy} onClick={() => run(`Claim epoch ${e.epoch}`, async () => { await ensureStorage(w.id); return call('claim', { e: e.epoch, amount: y.amount, score: Number(y.score), tier: y.tier, proof: y.proof }, 0n, 60); })}>Claim</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {me.arenaWins.length > 0 && (
                <>
                  <div className="card-h" style={{ padding: '14px 16px 0' }}><h2>Arena payouts</h2></div>
                  <table className="tbl"><tbody>
                    {me.arenaWins.map(({ e, a, y }) => {
                      const yy = e.result.yappers.find((x) => x.account === w.id)!;
                      return (
                        <tr key={`${a.id}:${e.epoch}`}>
                          <td>Arena #{a.id} <span className="tag">{a.topic}</span></td><td>epoch #{e.epoch}</td><td className="r">{yap(y.amount)}</td>
                          <td><button className="btn sm" disabled={busy} onClick={() => run(`Claim arena ${a.id}`, () => call('claim_arena', { arena_id: a.id, e: e.epoch, amount: y.amount, proof: y.proof, yapper_amount: yy.amount, score: Number(yy.score), tier: yy.tier, yapper_proof: yy.proof }, 0n, 80))}>Claim</button></td>
                        </tr>
                      );
                    })}
                  </tbody></table>
                </>
              )}
            </div>
            <div className="card">
              <h2 style={{ marginBottom: 10 }}>Stake sYAP</h2>
              <p className="note">Stake raises the weight of your likes, reposts and replies in scoring (×(1 + log10(1 + stake))) and earns the stakers' share of every epoch. Unstaking takes {cfg?.unbond_epochs ?? 7} epochs.</p>
              <input className="in" placeholder="Amount in YAP" value={amt} onChange={(e) => setAmt(e.target.value)} />
              <div className="row wrap" style={{ marginTop: 8 }}>
                <button className="btn primary" disabled={busy || !amt} onClick={() => run('Stake', () => call('ft_transfer_call', { receiver_id: TOKEN, amount: toRaw(amt).toString(), msg: JSON.stringify({ stake: {} }) }, 1n, 100))}>Stake</button>
                <button className="btn" disabled={busy || !amt} onClick={() => run('Unstake', () => call('unstake', { amount: toRaw(amt).toString() }, 0n, 50))}>Unstake</button>
                <button className="btn" disabled={busy} onClick={() => run('Withdraw', () => call('withdraw', {}, 0n, 50))}>Withdraw</button>
                <button className="btn" disabled={busy} onClick={() => run('Claim staker rewards', () => call('claim_staker_rewards', {}, 0n, 50))}>Claim rewards</button>
              </div>
              {(me.stake.unbonds ?? []).length > 0 && <p className="note">Unbonding: {me.stake.unbonds.map((u: any) => `${yap(u.amount)} at epoch ${u.withdraw_at ?? u.epoch}`).join(', ')}</p>}
            </div>
          </div>
        </>
      )}
      {msg && <div className="toast">{msg.text} {msg.hash && <a className="link" href={nb(msg.hash)} target="_blank" rel="noreferrer">tx ↗</a>}</div>}
    </div>
  );
}
