// near.social feed + composer. Every action is a real near.social write (FastData KV on `social`), the same data
// any near.social client reads; YAP only scores it. Testnet is writable; mainnet is shown read-only.
import { useState } from 'react';
import { feed, ago, nb, type FeedPost } from '../lib/data';
import { useAsync, useNet, Avatar, Loading, Text, Icon, useProfile } from '../ui/kit';
import { useWallet, socialWrite } from '../lib/wallet';

function Name({ a, net }: { a: string; net: 'testnet' | 'mainnet' }) {
  const p = useProfile(a, net);
  return <a href={`#/u/${a}`}><b>{p?.name || a.split('.')[0]}</b> <span className="faint mono" style={{ fontSize: 11 }}>{a}</span></a>;
}

export default function Feed() {
  const net = useNet();
  const w = useWallet();
  const [text, setText] = useState('');
  const [reply, setReply] = useState<FeedPost | null>(null);
  const [msg, setMsg] = useState<{ text: string; hash?: string } | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [show, setShow] = useState(30);
  const { data, reload } = useAsync(() => feed(net, 60), [net], 20_000);
  const write = async (label: string, args: Record<string, unknown>) => {
    setMsg({ text: `${label}…` });
    try {
      const hash = await socialWrite(args);
      setMsg({ text: `${label}: written to near.social (testnet). The receipt shows "failed" by design: there is no contract on \`social\`; FastData indexes the data anyway.`, hash });
      setTimeout(reload, 2500);
      return true;
    } catch (e) {
      setMsg({ text: String((e as Error).message) });
      return false;
    }
  };
  const post = async () => {
    const id = Date.now();
    const args: Record<string, unknown> = reply ? { [`post/${id}`]: { text, reply_to: reply.key, root: reply.replyTo ? reply.key : reply.key }, [`reply/${reply.key}/${id}`]: {} } : { [`post/${id}`]: { text } };
    if (await write(reply ? 'Reply' : 'Post', args)) { setText(''); setReply(null); }
  };
  const byKey = new Map((data ?? []).map((p) => [p.key, p]));
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Feed</h1>
          <p>{net === 'testnet' ? 'Live near.social posts on NEAR testnet. Post, reply, like, repost and follow from here: every action is a real transaction and counts toward the next epoch.' : 'Latest posts on near.social mainnet (read-only here).'}</p>
        </div>
      </div>
      <div className="grid g-main">
        <div className="card pad0">
          {net === 'testnet' && (
            <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
              {reply && <div className="note" style={{ marginBottom: 6 }}>Replying to {reply.author} · <button className="link" style={{ background: 'none', border: 0, padding: 0 }} onClick={() => setReply(null)}>cancel</button></div>}
              <textarea className="in" placeholder={w ? 'Yap something specific. #near $YAP @mentions are topics…' : 'Connect a testnet account to post'} value={text} onChange={(e) => setText(e.target.value)} disabled={!w} />
              <div className="row" style={{ marginTop: 8 }}>
                <span className="note">Spam scores 0: an attested AI labels every post for quality.</span>
                <button className="btn primary right" disabled={!w || !text.trim()} onClick={post}>{reply ? 'Reply' : 'Post'}</button>
              </div>
            </div>
          )}
          {!data ? <Loading /> : !data.length ? <div className="empty">No posts yet.</div> : data.slice(0, show).map((p) => (
            <div className="post" key={p.key}>
              <Avatar account={p.author} size={38} net={net} />
              <div style={{ minWidth: 0 }}>
                <div className="row"><Name a={p.author} net={net} /><span className="faint right" style={{ fontSize: 12 }}>{ago(p.ts)}</span></div>
                {p.replyTo && <div className="note">↳ reply to {byKey.get(p.replyTo)?.author ?? p.replyTo.split('/')[0]}</div>}
                <div className="txt"><Text text={p.text} /></div>
                <div className="meta">
                  <button className={done[`l:${p.key}`] ? 'on' : ''} disabled={net !== 'testnet' || !w} onClick={async () => (await write('Like', { [`like/${p.key}`]: {} })) && setDone({ ...done, [`l:${p.key}`]: true })}><Icon.heart />{p.likes + (done[`l:${p.key}`] ? 1 : 0)}</button>
                  <button className={done[`r:${p.key}`] ? 'on' : ''} disabled={net !== 'testnet' || !w} onClick={async () => (await write('Repost', { [`repost/${p.key}`]: {} })) && setDone({ ...done, [`r:${p.key}`]: true })}><Icon.repost />{p.reposts + (done[`r:${p.key}`] ? 1 : 0)}</button>
                  <button disabled={net !== 'testnet' || !w} onClick={() => { setReply(p); scrollTo({ top: 0, behavior: 'smooth' }); }}><Icon.reply />reply</button>
                  {net === 'mainnet' && <a className="link" href={`https://near.social/${p.author}/post/${p.key.split('/')[1]}`} target="_blank" rel="noreferrer">open ↗</a>}
                </div>
              </div>
            </div>
          ))}
          {data && data.length > show && <div style={{ padding: 12, textAlign: 'center' }}><button className="btn" onClick={() => setShow(show + 30)}>Show more</button></div>}
        </div>
        <div className="grid" style={{ alignContent: 'start' }}>
          <div className="card">
            <h2 style={{ marginBottom: 8 }}>How a post earns</h2>
            <ol className="muted" style={{ paddingLeft: 18, margin: 0 }}>
              <li>Your post is a near.social write: public chain data.</li>
              <li>At epoch end, a TEE-attested AI labels it 0–3 for quality.</li>
              <li>Likes, reposts, replies and quotes add weight, more from smart and staked accounts.</li>
              <li>Your best 10 posts form your Yap score; the epoch mint is split by score.</li>
            </ol>
          </div>
          <div className="callout">
            <b>Ask @yapbot.</b> <span className="muted">Mention <span className="mono">@yapbot.yap-hq.testnet</span> in a post ("how am I doing?" or "how is @someone doing?"). An AI agent running in a verified TEE reads the published scores and replies on near.social with your score, why, and one tip.</span>
            {w && <div style={{ marginTop: 8 }}><button className="btn sm" onClick={() => setText('@yapbot.yap-hq.testnet how am I doing?')}>Ask about me</button></div>}
          </div>
          <div className="callout v">
            <b>Simulated community.</b> <span className="muted">Accounts y01–y24.yap-hq.testnet are demo personas: 15 honest ones writing with an AI model, 4 spam bots and a 5-account like-ring, so you can see the defences work. Everything else on testnet is real users.</span>
          </div>
        </div>
      </div>
      {msg && <div className="toast">{msg.text} {msg.hash && <a className="link" href={nb(msg.hash)} target="_blank" rel="noreferrer">tx ↗</a>}</div>}
    </div>
  );
}
