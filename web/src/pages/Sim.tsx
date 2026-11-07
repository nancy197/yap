// 60-epoch simulation (sim/): synthetic near.social activity scored by the real scoring code, then the exact
// token rules. Shows supply under six community scenarios and how much attackers capture under each defence.
import { useState } from 'react';
import { getJson } from '../lib/data';
import { useAsync, Loading } from '../ui/kit';
import { LineChart } from '../ui/charts';

const NAMES: Record<string, string> = { steady: 'Steady', 'hype-then-fade': 'Hype then fade', 'dead-meme': 'Dead meme', 'spam-farm': 'Spam farm (100 bots)', 'like-ring': 'Like ring (10)', 'whale-staker': 'Whale staker' };
const COLORS = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)'];
const DEF: [string, string][] = [['none', 'No defences'], ['pageRank', 'PageRank'], ['aiLabels', 'AI labels'], ['caps', 'Pair cap + max posts'], ['stakeWeighting', 'Stake weighting'], ['all', 'All (real scorer)']];

export default function Sim() {
  const { data } = useAsync(() => getJson<any>('./sim.json'), []);
  const [metric, setMetric] = useState<'supply' | 'reserve'>('supply');
  if (!data) return <div className="page"><Loading /></div>;
  const sc: Record<string, any[]> = data.scenarios;
  const main = ['steady', 'hype-then-fade', 'dead-meme', 'spam-farm', 'whale-staker'];
  const mean = (rows: any[], k: string) => rows.reduce((n, r) => n + (r.defences?.[k] ?? 0), 0) / rows.length;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Simulation</h1>
          <p>{data.epochs} epochs per scenario, seed {data.seed}. Synthetic near.social activity is replayed through the real indexer and scorer, then the exact token rules (loud/quiet/dead, streak, burns, unclaimed burn). Values are simulated YAP, not on-chain balances.</p>
        </div>
        <div className="tabs right"><button className={metric === 'supply' ? 'on' : ''} onClick={() => setMetric('supply')}>Supply</button><button className={metric === 'reserve' ? 'on' : ''} onClick={() => setMetric('reserve')}>Reserve</button></div>
      </div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-h"><h2>{metric === 'supply' ? 'Total supply' : 'Reserve'} by scenario</h2><span className="note">a meme that stops talking eats its Reserve</span></div>
        <LineChart series={main.map((k, i) => ({ name: NAMES[k]!, color: COLORS[i]!, points: sc[k]!.map((r) => [r.epoch, r[metric]] as [number, number]) }))} height={320} width={1100} xLabel="epoch" yFormat={(v) => `${(v / 1000).toFixed(0)}k`} />
      </div>
      <div className="grid g2">
        <div className="card pad0 scroll-x">
          <div className="card-h" style={{ padding: '14px 16px 0' }}><h2>Attacker share of yapper emission</h2></div>
          <table className="tbl">
            <thead><tr><th>Defence</th><th className="r">Spam farm</th><th className="r">Like ring</th></tr></thead>
            <tbody>
              {DEF.map(([k, l]) => (
                <tr key={k} style={{ cursor: 'default' }}>
                  <td>{l}</td>
                  {(['spam-farm', 'like-ring'] as const).map((s) => {
                    const v = mean(sc[s]!, k);
                    return <td key={s} className="r"><div>{(v * 100).toFixed(1)}%</div><div className="bar" style={{ marginTop: 4 }}><i style={{ width: `${v * 100}%`, background: k === 'all' ? 'var(--good)' : undefined }} /></div></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="note" style={{ padding: '0 16px 14px' }}>Mean over 60 epochs. Each single defence helps a little; together they cut the spam farm from 87% to 27% and the ring from 52% to 19%. They don't reach zero: a patient ring of aged accounts writing decent text still earns. That's the stated limit; the DAO challenge is the backstop.</p>
        </div>
        <div className="card">
          <h2 style={{ marginBottom: 10 }}>Streak in the hype-then-fade scenario</h2>
          <LineChart series={[{ name: 'Streak', color: 'var(--series-2)', points: sc['hype-then-fade']!.map((r) => [r.epoch, r.streak] as [number, number]) }, { name: 'Best streak', color: 'var(--series-1)', points: sc['hype-then-fade']!.map((r) => [r.epoch, r.bestStreak] as [number, number]) }]} height={220} xLabel="epoch" />
          <p className="note">The high score survives the fade; the live streak resets on the first quiet epoch.</p>
        </div>
      </div>
    </div>
  );
}
