import { Component, useState, type ReactNode } from 'react';
import { Icon, useRoute, useNet, setNet, useAsync, Avatar, go } from './ui/kit';
import { loadEpochs, aggregate } from './lib/data';
import { useWallet, createBurner, importKey, signOut } from './lib/wallet';
import Mindshare from './pages/Mindshare';
import Leaderboard from './pages/Leaderboard';
import Profile from './pages/Profile';
import Arenas from './pages/Arenas';
import Earn from './pages/Earn';
import Token from './pages/Token';
import Feed from './pages/Feed';
import Verify from './pages/Verify';
import Governance from './pages/Governance';
import Sim from './pages/Sim';
import How from './pages/How';

const NAV: [string, string, () => ReactNode][] = [
  ['', 'Mindshare', Icon.mind],
  ['leaderboard', 'Yapper Leaderboard', Icon.board],
  ['arenas', 'Arenas', Icon.arena],
  ['feed', 'Feed', Icon.feed],
  ['earn', 'Earn', Icon.earn],
  ['token', '$YAP', Icon.token],
  ['verify', 'Verify', Icon.verify],
  ['dao', 'Governance', Icon.dao],
  ['sim', 'Simulation', Icon.sim],
  ['how', 'How it works', Icon.how],
];

class Boundary extends Component<{ children: ReactNode }, { err: string | null }> {
  state = { err: null as string | null };
  static getDerivedStateFromError(e: unknown) { return { err: String((e as Error)?.message ?? e) }; }
  render() { return this.state.err ? <div className="page"><div className="empty">Something broke on this page: {this.state.err}</div></div> : this.props.children; }
}

function Search() {
  const net = useNet();
  const [q, setQ] = useState('');
  const { data } = useAsync(() => loadEpochs(net), [net]);
  const agg = data ? aggregate(data, data.length) : null;
  const ql = q.trim().toLowerCase();
  const accts = ql && agg ? agg.rows.filter((r) => r.account.includes(ql)).slice(0, 5) : [];
  const topics = ql && agg ? agg.topics.filter((t) => t.topic.includes(ql)).slice(0, 4) : [];
  const pick = (h: string) => { setQ(''); go(h); };
  return (
    <div className="search">
      <Icon.search />
      <input placeholder="Search yappers or topics (#near, $YAP)…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ql && pick(ql.startsWith('#') || ql.startsWith('$') || ql.startsWith('@') ? `#/leaderboard/${encodeURIComponent(ql)}` : `#/u/${encodeURIComponent(ql)}`)} />
      {ql && (accts.length > 0 || topics.length > 0) && (
        <div className="results">
          {accts.map((r) => <a key={r.account} href={`#/u/${r.account}`} onClick={() => setQ('')}><Avatar account={r.account} size={22} net={net} /><span className="ellip">{r.account}</span></a>)}
          {topics.map((t) => <a key={t.topic} href={`#/leaderboard/${encodeURIComponent(t.topic)}`} onClick={() => setQ('')}><span className="tag">{t.topic}</span><span className="faint right mono">{(t.share * 100).toFixed(1)}%</span></a>)}
        </div>
      )}
    </div>
  );
}

function WalletButton() {
  const w = useWallet();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [id, setId] = useState('');
  const [key, setKey] = useState('');
  if (w)
    return (
      <div className="row" style={{ position: 'relative' }}>
        <a className="btn sm" href={`#/u/${w.id}`}><Avatar account={w.id} size={18} /> <span className="ellip hide-m" style={{ maxWidth: 140 }}>{w.id}</span></a>
        <button className="btn sm ghost" onClick={signOut} title="Forget this burner in this browser">✕</button>
      </div>
    );
  return (
    <div style={{ position: 'relative' }}>
      <button className="btn primary sm" onClick={() => setOpen(!open)}>Connect</button>
      {open && (
        <div className="card" style={{ position: 'absolute', right: 0, top: 42, width: 320, zIndex: 30, boxShadow: '0 16px 40px rgba(0,0,0,.4)' }}>
          <h3>Testnet account</h3>
          <p className="note">A burner account lives only in this browser. It signs real testnet transactions: near.social posts and $YAP calls.</p>
          <button className="btn primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy} onClick={async () => { setBusy(true); setErr(''); try { await createBurner(); setOpen(false); } catch (e) { setErr(String((e as Error).message)); } finally { setBusy(false); } }}>
            {busy ? 'Creating…' : 'Create burner (free, faucet)'}
          </button>
          <div className="caps" style={{ margin: '14px 0 6px' }}>or import a testnet key</div>
          <div className="grid" style={{ gap: 6 }}>
            <input className="in" placeholder="you.testnet" value={id} onChange={(e) => setId(e.target.value)} />
            <input className="in" placeholder="ed25519:… private key" value={key} onChange={(e) => setKey(e.target.value)} type="password" />
            <button className="btn" disabled={!id || !key} onClick={async () => { setErr(''); try { await importKey(id, key); setOpen(false); } catch (e) { setErr(String((e as Error).message)); } }}>Import</button>
          </div>
          {err && <p className="err">{err}</p>}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const route = useRoute();
  const net = useNet();
  const [theme, setTheme] = useState<string | null>(() => { try { return localStorage.getItem('yap-theme'); } catch { return null; } });
  const flip = () => {
    const dark = theme ? theme === 'dark' : !matchMedia('(prefers-color-scheme: light)').matches;
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('yap-theme', next); } catch {}
    setTheme(next);
  };
  if (theme) document.documentElement.dataset.theme = theme;
  const page = route[0] ?? '';
  const view = (() => {
    switch (page) {
      case '': return <Mindshare />;
      case 'leaderboard': return <Leaderboard topic={route[1]} />;
      case 'u': return <Profile account={route[1] ?? ''} />;
      case 'arenas': return <Arenas id={route[1]} />;
      case 'earn': return <Earn />;
      case 'token': return <Token />;
      case 'feed': return <Feed />;
      case 'verify': return <Verify epoch={route[1]} />;
      case 'dao': return <Governance />;
      case 'sim': return <Sim />;
      case 'how': return <How />;
      default: return <div className="page"><div className="empty">Not found</div></div>;
    }
  })();
  return (
    <div className="shell">
      <aside className="side">
        <a className="brand" href="#/"><img src="./logo.svg" alt="" /><span>YAP<small>yap-to-earn · near.social</small></span></a>
        <nav className="nav">
          {NAV.map(([p, label, I]) => <a key={p} href={`#/${p}`} className={page === p ? 'on' : ''}><I />{label}</a>)}
        </nav>
        <div className="side-foot">
          <div className="caps">Why YAP</div>
          <p style={{ margin: '4px 0 0' }} className="muted">X banned reward-for-posting apps in Jan 2026. On NEAR, posts are chain data: no API to revoke.</p>
        </div>
      </aside>
      <main className="main">
        <header className="top">
          <a className="brand-m row" href="#/" style={{ display: 'none' }}><img src="./logo.svg" alt="" width={26} /></a>
          <Search />
          <div className="netswitch right">
            <button className={net === 'testnet' ? 'on' : ''} onClick={() => setNet('testnet')}><span className="dot" /> Testnet<span className="hide-m"> · live</span></button>
            <button className={net === 'mainnet' ? 'on' : ''} onClick={() => setNet('mainnet')}><span className="dot ro" /> Mainnet<span className="hide-m"> · read-only</span></button>
          </div>
          <button className="btn sm ghost hide-m" onClick={flip} title="Toggle theme">◐</button>
          <WalletButton />
        </header>
        <nav className="mobile-nav">{NAV.map(([p, label]) => <a key={p} href={`#/${p}`} className={page === p ? 'on' : ''}>{label}</a>)}</nav>
        <Boundary key={page}>{view}</Boundary>
      </main>
    </div>
  );
}
