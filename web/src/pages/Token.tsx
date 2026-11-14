// The $YAP page, Proof of Yap edition: the block the community is mining, its progress bar and jackpot, every
// jackpot paid so far, supply over time, ticks on chain, the fixed parameters, and proof that nobody holds a key.
import { view, rpc, epochIndex, yap, yapNum, sc, nb, TOKEN, type EpochScores, loadEpochs } from '../lib/data';
import { useAsync, useNow, Loading } from '../ui/kit';
import { LineChart } from '../ui/charts';

type St = {
  block_number: number; block_start_epoch: number; block_progress: string; block_threshold: string;
  jackpot_pot: string; vault: string; attention_target: string; minted_total: string; burned_total: string; current_epoch: number;
};
type Block = { number: number; start_epoch: number; end_epoch: number; threshold: string; progress: string; payout: string };

export default function Token() {
  const now = useNow(1000);
  const { data: st } = useAsync(() => view<St>('get_state'), [], 15_000);
  const { data: cfg } = useAsync(() => view<any>('get_config'), []);
  const { data: supply } = useAsync(() => view<string>('ft_total_supply'), [], 15_000);
  const { data: chainEpochs } = useAsync(() => view<any[]>('get_epochs', { from: Math.max(0, (st?.current_epoch ?? 0) - 99), limit: 100 }).catch(() => []), [st?.current_epoch], 20_000);
  const { data: blocks } = useAsync(() => view<Block[]>('get_blocks', { from: Math.max(1, (st?.block_number ?? 1) - 50), limit: 50 }).catch(() => []), [st?.block_number], 20_000);
  const { data: idx } = useAsync(() => epochIndex(), [], 20_000);
  const { data: keys } = useAsync(() => rpc<any>('query', { request_type: 'view_access_key_list', finality: 'final', account_id: TOKEN }), []);
  const { data: txs } = useAsync(() => fetch('./transactions.json').then((r) => r.json()).catch(() => []), [], 30_000);
  const { data: epochs } = useAsync(() => loadEpochs('testnet'), [], 30_000);
  if (!st || !cfg) return <div className="page"><Loading /></div>;
  const g = cfg.genesis_ts * 1000;
  const cur = Math.max(0, Math.floor((now - g) / (cfg.epoch_secs * 1000)));
  const left = now < g ? g - now : Math.max(0, g + (cur + 1) * cfg.epoch_secs * 1000 - now);
  const progress = sc(st.block_progress);
  const threshold = sc(st.block_threshold);
  const pct = threshold > 0 ? Math.min(100, (progress / threshold) * 100) : 0;
  const release = (BigInt(st.vault) * BigInt(cfg.vault_release_bps)) / 10_000n;
  const nextPayout = (BigInt(st.jackpot_pot) + release).toString();
  const lastScored = (epochs ?? []).at(-1) as EpochScores | undefined;
  const lastAtt = lastScored ? sc(lastScored.result.attention) : 0;
  const ticksLeft = lastAtt > 0 ? Math.ceil(Math.max(0, threshold - progress) / lastAtt) : null;
  const finalized = (chainEpochs ?? []).filter((e) => e.status === 'Finalized' || e.status === 'Dead');
  const genesis = yapNum(cfg.initial_supply);
  const snaps = Object.entries(idx?.epochs ?? {}).filter(([, r]: any) => r.supply).map(([e, r]: any) => ({ e: Number(e), supply: yapNum(r.supply), vault: r.vault ? yapNum(r.vault) : null })).sort((a, b) => a.e - b.e);
  const pts: [number, number][] = [[-1, genesis], ...snaps.map((x) => [x.e, x.supply] as [number, number])];
  const vaultPts: [number, number][] = [[-1, genesis * cfg.genesis_split.vault_bps / 10000], ...snaps.filter((x) => x.vault !== null).map((x) => [x.e, x.vault!] as [number, number])];
  const fullKeys = (keys?.keys ?? []).filter((k: any) => k.access_key.permission === 'FullAccess');
  const log = (txs ?? []).filter((t: any) => /finalize|claim|challenge|arena|submit_report|init token|delete full-access/.test(t.action)).slice(-60).reverse();
  const paid = [...(blocks ?? [])].sort((a, b) => b.number - a.number);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>$YAP · Proof of Yap</h1>
          <p>The community mines $YAP by talking. Every tick pays yappers by Yap score and feeds the jackpot. When the community's attention fills the block, the jackpot explodes and is split by contribution over the whole block. Every block needs 25% more yap than the last. Nothing burns, and nobody can change the rules.</p>
        </div>
        <a className="btn right" href={`https://testnet.nearblocks.io/address/${TOKEN}`} target="_blank" rel="noreferrer">{TOKEN} ↗</a>
      </div>
      <div className="grid g-main" style={{ marginBottom: 14 }}>
        <div className="card hiscore">
          <div className="row wrap" style={{ alignItems: 'flex-end', gap: 28 }}>
            <div className="arcade"><div className="caps">Mining block</div><div className="big">#{String(st.block_number).padStart(3, '0')}</div><div className="muted" style={{ fontSize: 12 }}>{st.block_number - 1} jackpots paid so far</div></div>
            <div className="arcade"><div className="caps">💰 Jackpot</div><div className="big">{yap(nextPayout, 0)}</div><div className="muted" style={{ fontSize: 12 }}>pot {yap(st.jackpot_pot, 0)} + vault release {yap(release.toString(), 0)} YAP</div></div>
            <div className="right" style={{ textAlign: 'right' }}><div className="caps">{now < g ? 'Mining starts in' : `Tick #${cur} ends in`}</div><div className="arcade" style={{ fontSize: 28 }}>{Math.floor(left / 60000)}:{String(Math.floor(left / 1000) % 60).padStart(2, '0')}</div></div>
          </div>
          <div style={{ marginTop: 28 }}>
            <div className="row"><span className="caps">Block #{st.block_number} · community attention</span><span className="right mono">{progress.toFixed(1)} / {threshold.toFixed(1)} · {pct.toFixed(0)}%</span></div>
            <div className="meter" style={{ marginTop: 14 }}>
              <i style={{ width: `${pct}%` }} />
            </div>
            <p className="note" style={{ marginTop: 10 }}>
              {pct >= 85 ? '🔥 Almost there: the tick that fills the bar pays the jackpot. ' : '🗣 Every post, like and reply on near.social fills the bar. '}
              {ticksLeft !== null ? `At the last tick's pace (${lastAtt.toFixed(1)}), about ${ticksLeft} more tick${ticksLeft === 1 ? '' : 's'} to the jackpot. ` : ''}
              Next block needs {(cfg.difficulty_bps / 100 - 100).toFixed(0)}% more.
            </p>
          </div>
        </div>
        <div className="card">
          <h2 style={{ marginBottom: 10 }}>Supply</h2>
          <dl className="kv">
            <dt>Total supply</dt><dd>{yap(supply ?? '0', 0)}</dd>
            <dt>Vault (releases into jackpots)</dt><dd>{yap(st.vault, 0)}</dd>
            <dt>Jackpot pot</dt><dd>{yap(st.jackpot_pot, 0)}</dd>
            <dt>Minted all time</dt><dd>{yap(st.minted_total, 0)}</dd>
            <dt>Blocks mined</dt><dd>{st.block_number - 1}</dd>
            <dt>Ticks finalized</dt><dd>{finalized.length}</dd>
          </dl>
          <div className="callout" style={{ marginTop: 14 }}>
            <b>No admin key.</b> <span className="muted">view_access_key_list({TOKEN}) returns {keys ? `${keys.keys.length} keys, ${fullKeys.length} full-access` : '…'}. Nobody can upgrade the contract or change its parameters.</span>
          </div>
        </div>
      </div>
      <div className="grid g2" style={{ marginBottom: 14 }}>
        <div className="card">
          <div className="card-h"><h2>💥 Jackpots</h2><span className="note">split by contribution over every tick of the block</span></div>
          <div className="scroll-x">
            <table className="tbl">
              <thead><tr><th>Block</th><th>Ticks</th><th className="r">Attention needed</th><th className="r">Payout</th></tr></thead>
              <tbody>
                {paid.map((b) => (
                  <tr key={b.number} onClick={() => (location.hash = `#/verify/${b.end_epoch}`)}>
                    <td className="rank">#{b.number}</td>
                    <td className="mono">{b.start_epoch}–{b.end_epoch}</td>
                    <td className="r">{sc(b.threshold).toFixed(0)}</td>
                    <td className="r"><b>{yap(b.payout, 0)}</b> YAP</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!paid.length && <div className="empty">No jackpot yet. Block #1 pays when the bar fills.</div>}
          </div>
        </div>
        <div className="card">
          <div className="card-h"><h2>Supply over time</h2><span className="note">after each finalized tick · nothing burns</span></div>
          {pts.length > 1 ? <LineChart series={[{ name: 'Total supply', color: 'var(--series-2)', points: pts }, { name: 'Vault', color: 'var(--series-1)', points: vaultPts }]} height={220} xLabel="tick" yFormat={(v) => `${(v / 1000).toFixed(0)}k`} /> : <div className="empty">Waiting for the first finalized tick.</div>}
        </div>
      </div>
      <div className="grid g2" style={{ marginBottom: 14 }}>
        <div className="card">
          <h2 style={{ marginBottom: 10 }}>Ticks on chain</h2>
          <div className="scroll-x">
            <table className="tbl">
              <thead><tr><th>#</th><th>Status</th><th className="r">Attention</th><th className="r">Emission</th><th className="r">Jackpot</th><th className="r hide-m">Signers</th></tr></thead>
              <tbody>
                {[...(chainEpochs ?? [])].sort((a, b) => b.number - a.number).slice(0, 12).map((e) => (
                  <tr key={e.number} onClick={() => (location.hash = `#/verify/${e.number}`)}>
                    <td className="rank">{e.number}</td>
                    <td><span className={`pill ${e.status === 'Finalized' ? 'live' : e.status === 'Dead' ? 'sim' : ''}`}>{e.status === 'Dead' ? 'Silent' : e.status}</span></td>
                    <td className="r">{e.report ? sc(e.report.attention).toFixed(1) : '—'}</td>
                    <td className="r">{yap(e.emission, 1)}</td>
                    <td className="r">{BigInt(e.jackpot ?? '0') > 0n ? <b>💥 {yap(e.jackpot, 0)}</b> : '—'}</td>
                    <td className="r hide-m">{e.signers?.length ?? 0}/3</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card pad0">
          <div className="card-h" style={{ padding: '14px 16px 0' }}><h2>Activity log</h2><span className="note">real testnet transactions</span></div>
          <div className="log">
            {log.map((t: any) => (
              <a className="log-row" key={t.hash} href={nb(t.hash)} target="_blank" rel="noreferrer">
                {(() => {
                  const k = /finalize/.test(t.action) ? ['mint', 'mint'] : /claim/.test(t.action) ? ['mint', 'claim'] : /delete full-access/.test(t.action) ? ['other', 'lock'] : /submit_report/.test(t.action) ? ['other', 'report'] : ['other', 'tx'];
                  return <span className={`ev ${k[0]}`}>{k[1]}</span>;
                })()}
                <span className="ellip">{t.action} {t.account ? <span className="faint">· {t.account}</span> : null}</span>
                <span className="mono faint" style={{ fontSize: 11 }}>{t.hash.slice(0, 8)}…</span>
              </a>
            ))}
            {!log.length && <div className="empty">No transactions yet.</div>}
          </div>
        </div>
      </div>
      <div className="card">
        <h2 style={{ marginBottom: 10 }}>Fixed parameters</h2>
        <dl className="kv">
          <dt>Tick length</dt><dd>{cfg.epoch_secs} s (mainnet: 1 day)</dd>
          <dt>Base emission</dt><dd>{yap(cfg.base_emission, 0)} YAP × attention / target, max {cfg.max_ratio_bps / 10000}×</dd>
          <dt>Jackpot share</dt><dd>{cfg.jackpot_bps / 100}% of every mint</dd>
          <dt>Vault release</dt><dd>{cfg.vault_release_bps / 100}% of the vault per block</dd>
          <dt>Block #1 needs</dt><dd>{sc(cfg.initial_block_threshold).toFixed(0)} attention, then +{(cfg.difficulty_bps / 100 - 100).toFixed(0)}% per block</dd>
          <dt>Split of the rest</dt><dd>yappers {cfg.yapper_bps / 100}% · stakers {cfg.staker_bps / 100}% · DAO {cfg.dao_bps / 100}%</dd>
          <dt>Claim window</dt><dd>{cfg.claim_epochs} ticks, then unclaimed rewards return to the jackpot</dd>
          <dt>Scorers</dt><dd>{cfg.scorer_quorum} of {cfg.scorers.length}, bond {yap(cfg.scorer_bond, 0)}</dd>
          <dt>Challenge</dt><dd>{cfg.challenge_secs} s window, bond {yap(cfg.challenge_bond, 0)}</dd>
          <dt>Court of appeal</dt><dd>{cfg.dao}</dd>
        </dl>
      </div>
    </div>
  );
}
