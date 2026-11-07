// The $YAP meme page: streak high score, this epoch's attention vs target, supply over time, every mint and
// burn, the fixed parameters, and proof that nobody holds a full-access key to the contract.
import { view, rpc, epochIndex, yap, yapNum, sc, nb, TOKEN, type EpochScores, loadEpochs } from '../lib/data';
import { useAsync, useNow, Loading } from '../ui/kit';
import { LineChart } from '../ui/charts';

type St = { streak: number; best_streak: number; attention_target: string; minted_total: string; burned_total: string; reserve: string; current_epoch: number };

export default function Token() {
  const now = useNow(1000);
  const { data: st } = useAsync(() => view<St>('get_state'), [], 15_000);
  const { data: cfg } = useAsync(() => view<any>('get_config'), []);
  const { data: supply } = useAsync(() => view<string>('ft_total_supply'), [], 15_000);
  const { data: chainEpochs } = useAsync(() => view<any[]>('get_epochs', { from: 0, limit: 200 }).catch(() => []), [], 20_000);
  const { data: idx } = useAsync(() => epochIndex(), [], 20_000);
  const { data: keys } = useAsync(() => rpc<any>('query', { request_type: 'view_access_key_list', finality: 'final', account_id: TOKEN }), []);
  const { data: txs } = useAsync(() => fetch('./transactions.json').then((r) => r.json()).catch(() => []), [], 30_000);
  const { data: epochs } = useAsync(() => loadEpochs('testnet'), [], 30_000);
  if (!st || !cfg) return <div className="page"><Loading /></div>;
  const g = cfg.genesis_ts * 1000;
  const cur = Math.floor((now - g) / (cfg.epoch_secs * 1000));
  const left = Math.max(0, g + (cur + 1) * cfg.epoch_secs * 1000 - now);
  const finalized = (chainEpochs ?? []).filter((e) => e.status === 'Finalized' || e.status === 'Dead');
  const lastScored = (epochs ?? []).at(-1) as EpochScores | undefined;
  const lastAtt = lastScored ? sc(lastScored.result.attention) : 0;
  const target = sc(st.attention_target);
  const loudAt = (target * cfg.loud_bps) / 10_000;
  const scale = Math.max(target * 1.6, lastAtt * 1.1, 1);
  // Supply after each finalized epoch (snapshots the scorer records right after `finalize`): mints and burns.
  const genesis = yapNum(cfg.initial_supply);
  const snaps = Object.entries(idx?.epochs ?? {}).filter(([, r]: any) => r.supply).map(([e, r]: any) => ({ e: Number(e), supply: yapNum(r.supply), reserve: yapNum(r.reserve), burned: yapNum(r.burnedTotal) })).sort((a, b) => a.e - b.e);
  const pts: [number, number][] = [[-1, genesis], ...snaps.map((x) => [x.e, x.supply] as [number, number])];
  const reservePts: [number, number][] = [[-1, yapNum(cfg.initial_supply) * cfg.genesis_split.reserve_bps / 10000], ...snaps.map((x) => [x.e, x.reserve] as [number, number])];
  const fullKeys = (keys?.keys ?? []).filter((k: any) => k.access_key.permission === 'FullAccess');
  const log = (txs ?? []).filter((t: any) => /finalize|claim|burn|challenge|arena|submit_report|init token|delete full-access/.test(t.action)).slice(-60).reverse();
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>$YAP</h1>
          <p>A memecoin whose supply follows the community's attention. Loud epochs mint more and grow the streak; quiet epochs burn 3% of the Reserve; dead epochs burn 10%. Every rule is fixed at launch and nobody can change it.</p>
        </div>
        <a className="btn right" href={`https://testnet.nearblocks.io/address/${TOKEN}`} target="_blank" rel="noreferrer">{TOKEN} ↗</a>
      </div>
      <div className="grid g-main" style={{ marginBottom: 14 }}>
        <div className="card hiscore">
          <div className="row wrap" style={{ alignItems: 'flex-end', gap: 28 }}>
            <div className="arcade"><div className="caps">High score</div><div className="big">{String(st.best_streak).padStart(3, '0')}</div><div className="muted" style={{ fontSize: 12 }}>longest loud streak</div></div>
            <div className="arcade"><div className="caps">Current streak</div><div className="big">{String(st.streak).padStart(3, '0')}</div><div className="muted" style={{ fontSize: 12 }}>+{Math.min(st.streak, cfg.streak_cap) * cfg.streak_step_bps / 100}% emission bonus</div></div>
            <div className="right" style={{ textAlign: 'right' }}><div className="caps">Epoch #{cur} ends in</div><div className="arcade" style={{ fontSize: 28 }}>{Math.floor(left / 60000)}:{String(Math.floor(left / 1000) % 60).padStart(2, '0')}</div></div>
          </div>
          <div className="flames">{Array.from({ length: cfg.streak_cap }, (_, i) => <i key={i} className={i < st.streak ? 'on' : ''} title={`streak ${i + 1}`} />)}</div>
          <div style={{ marginTop: 28 }}>
            <div className="row"><span className="caps">Last scored epoch · attention vs target</span><span className="right mono">{lastAtt.toFixed(1)} / {target.toFixed(1)}</span></div>
            <div className="meter" style={{ marginTop: 26 }}>
              <i style={{ width: `${Math.min(100, (lastAtt / scale) * 100)}%` }} />
              <b style={{ left: `${(loudAt / scale) * 100}%` }} /><span style={{ left: `${(loudAt / scale) * 100}%` }}>loud ≥ {loudAt.toFixed(0)}</span>
            </div>
            <p className="note" style={{ marginTop: 10 }}>{lastAtt >= loudAt ? '🔥 Loud: the streak grows and emission gets the streak bonus.' : '🧊 Quiet: the streak resets and 3% of the Reserve burns.'} The target is an EMA of past attention, so the bar keeps rising with the community.</p>
          </div>
        </div>
        <div className="card">
          <h2 style={{ marginBottom: 10 }}>Supply</h2>
          <dl className="kv">
            <dt>Total supply</dt><dd>{yap(supply ?? '0', 0)}</dd>
            <dt>Reserve (contract)</dt><dd>{yap(st.reserve, 0)}</dd>
            <dt>Minted all time</dt><dd>{yap(st.minted_total, 0)}</dd>
            <dt>Burned all time</dt><dd>{yap(st.burned_total, 0)}</dd>
            <dt>Epochs finalized</dt><dd>{finalized.length}</dd>
            <dt>Scored epochs published</dt><dd>{Object.keys(idx?.epochs ?? {}).length}</dd>
          </dl>
          <div className="callout" style={{ marginTop: 14 }}>
            <b>No admin key.</b> <span className="muted">view_access_key_list({TOKEN}) returns {keys ? `${keys.keys.length} keys, ${fullKeys.length} full-access` : '…'}. Nobody can upgrade the contract or change its parameters.</span>
          </div>
        </div>
      </div>
      <div className="grid g2" style={{ marginBottom: 14 }}>
        <div className="card">
          <div className="card-h"><h2>Supply over time</h2><span className="note">after each finalized epoch · loud epochs mint, quiet ones burn the Reserve</span></div>
          {pts.length > 1 ? <LineChart series={[{ name: 'Total supply', color: 'var(--series-2)', points: pts }, { name: 'Reserve', color: 'var(--series-1)', points: reservePts }]} height={220} xLabel="epoch" yFormat={(v) => `${(v / 1000).toFixed(0)}k`} /> : <div className="empty">Waiting for the first finalized epoch.</div>}
        </div>
        <div className="card">
          <h2 style={{ marginBottom: 10 }}>Epochs on chain</h2>
          <div className="scroll-x">
            <table className="tbl">
              <thead><tr><th>#</th><th>Status</th><th className="r">Attention</th><th className="r">Emission</th><th className="r hide-m">Signers</th></tr></thead>
              <tbody>
                {[...(chainEpochs ?? [])].sort((a, b) => b.number - a.number).slice(0, 12).map((e) => (
                  <tr key={e.number} onClick={() => (location.hash = `#/verify/${e.number}`)}>
                    <td className="rank">{e.number}</td>
                    <td><span className={`pill ${e.status === 'Finalized' ? 'live' : e.status === 'Dead' ? 'sim' : ''}`}>{e.status}</span></td>
                    <td className="r">{e.report ? sc(e.report.attention).toFixed(1) : '—'}</td>
                    <td className="r">{yap(e.emission, 1)}</td>
                    <td className="r hide-m">{e.signers?.length ?? 0}/3</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="grid g2">
        <div className="card pad0">
          <div className="card-h" style={{ padding: '14px 16px 0' }}><h2>Activity log</h2><span className="note">real testnet transactions</span></div>
          <div className="log">
            {log.map((t: any) => (
              <a className="log-row" key={t.hash} href={nb(t.hash)} target="_blank" rel="noreferrer">
                {(() => {
                  const k = /finalize/.test(t.action) ? ['mint', 'mint'] : /claim/.test(t.action) ? ['mint', 'claim'] : /burn|dead/.test(t.action) ? ['burn', 'burn'] : /delete full-access/.test(t.action) ? ['other', 'lock'] : /submit_report/.test(t.action) ? ['other', 'report'] : ['other', 'tx'];
                  return <span className={`ev ${k[0]}`}>{k[1]}</span>;
                })()}
                <span className="ellip">{t.action} {t.account ? <span className="faint">· {t.account}</span> : null}</span>
                <span className="mono faint" style={{ fontSize: 11 }}>{t.hash.slice(0, 8)}…</span>
              </a>
            ))}
            {!log.length && <div className="empty">No transactions yet.</div>}
          </div>
        </div>
        <div className="card">
          <h2 style={{ marginBottom: 10 }}>Fixed parameters</h2>
          <dl className="kv">
            <dt>Epoch length</dt><dd>{cfg.epoch_secs} s (mainnet: 1 day)</dd>
            <dt>Base emission</dt><dd>{yap(cfg.base_emission, 0)} YAP</dd>
            <dt>Loud threshold</dt><dd>{cfg.loud_bps / 100}% of target</dd>
            <dt>Max ratio</dt><dd>{cfg.max_ratio_bps / 10000}×</dd>
            <dt>Streak bonus</dt><dd>+{cfg.streak_step_bps / 100}% per epoch, cap {cfg.streak_cap}</dd>
            <dt>Quiet / dead burn</dt><dd>{cfg.quiet_burn_bps / 100}% / {cfg.dead_burn_bps / 100}% of Reserve</dd>
            <dt>Split</dt><dd>yappers {cfg.yapper_bps / 100}% · stakers {cfg.staker_bps / 100}% · DAO {cfg.dao_bps / 100}%</dd>
            <dt>Claim window</dt><dd>{cfg.claim_epochs} epochs, then unclaimed burns</dd>
            <dt>Scorers</dt><dd>{cfg.scorer_quorum} of {cfg.scorers.length}, bond {yap(cfg.scorer_bond, 0)}</dd>
            <dt>Challenge</dt><dd>{cfg.challenge_secs} s window, bond {yap(cfg.challenge_bond, 0)}</dd>
            <dt>Court of appeal</dt><dd>{cfg.dao}</dd>
          </dl>
        </div>
      </div>
    </div>
  );
}
