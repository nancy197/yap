import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { C, mono, body, display, Kinetic, ease, Identicon, Panel, Caps } from '../ui/kit';
import { cue } from '../timeline';
import data from '../data.json';

const HASH = 'c697cd50ffd8b21a4a9afe3cdc811183e4a8a303b9c9268c4fe6a74c3861f1d7';
const KINDS = [
  ['post', C.orange],
  ['like', C.violet],
  ['repost', C.blue],
  ['follow', C.green],
  ['reply', C.amber],
] as const;

export function Data() {
  const f = useCurrentFrame();
  const tLand = cue('data', 'land');
  const tIdx = cue('data', 'indexer');
  const tAny = cue('data', 'anyone');
  const keyX = ease(f, 18, 34);
  const toDoc = ease(f, tIdx, tIdx + 24);
  // Writes stream from users (left) into chain blocks (center).
  const writes = Array.from({ length: 18 }, (_, i) => {
    const born = tLand - 20 + i * 7;
    const p = interpolate(f, [born, born + 34], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const [k, col] = KINDS[i % KINDS.length]!;
    const x = 360 + p * 520;
    const y = 300 + ((i * 53) % 260) * (1 - p) + 160 * p;
    return p > 0 && p < 1 ? (
      <div key={i} style={{ position: 'absolute', left: x, top: y, fontFamily: mono, fontSize: 18, color: col, border: `1.5px solid ${col}`, borderRadius: 8, padding: '4px 10px', background: `${col}18`, opacity: 1 - toDoc }}>
        {k}/
      </div>
    ) : null;
  });
  const blocks = Array.from({ length: 7 }, (_, i) => {
    const x = 860 + i * 150 - ((f * 2.2) % 150);
    return (
      <div key={i} style={{ position: 'absolute', left: x, top: 430, width: 120, height: 120, borderRadius: 18, border: `2px solid ${C.violet}`, background: 'rgba(167,139,250,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: mono, fontSize: 16, color: C.violet, opacity: (1 - toDoc * 0.8) * interpolate(x, [820, 900, 1700, 1800], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
        #{(276650000 + Math.floor(f * 2.2 / 150) * 7 + i).toLocaleString('en-US')}
      </div>
    );
  });
  const hashChars = Math.round(ease(f, tIdx + 20, tIdx + 70) * HASH.length);
  const any = (i: number) => ease(f, tAny + i * 8, tAny + i * 8 + 16);
  return (
    <AbsoluteFill style={{ padding: '150px 110px' }}>
      <div style={{ position: 'absolute', left: 110, top: 150, width: 640 }}>
        <Kinetic text="No API key to revoke." size={64} delay={4} highlight={['no']} />
      </div>
      {/* the crossed-out API key */}
      <div style={{ position: 'absolute', left: 120, top: 300, display: 'flex', alignItems: 'center', gap: 16, opacity: 1 - toDoc, transform: `translateY(${(1 - keyX) * 30}px)` }}>
        <div style={{ position: 'relative', fontFamily: mono, fontSize: 26, color: C.muted, border: `1.5px dashed ${C.faint}`, borderRadius: 12, padding: '12px 18px' }}>
          API_KEY=••••••
          <div style={{ position: 'absolute', left: -6, right: -6, top: '50%', height: 4, background: C.red, transform: `scaleX(${keyX}) rotate(-6deg)`, transformOrigin: 'left' }} />
        </div>
      </div>
      {/* users */}
      <div style={{ position: 'absolute', left: 140, top: 420, display: 'grid', gridTemplateColumns: 'repeat(3, 70px)', gap: 18, opacity: 1 - toDoc }}>
        {data.yappers.slice(0, 9).map((y, i) => (
          <div key={y.account} style={{ transform: `scale(${ease(f, 8 + i * 3, 22 + i * 3)})` }}>
            <Identicon seed={y.account} size={70} />
          </div>
        ))}
      </div>
      {writes}
      {blocks}
      <div style={{ position: 'absolute', left: 870, top: 580, fontFamily: mono, fontSize: 22, color: C.muted, opacity: ease(f, tLand, tLand + 12) * (1 - toDoc) }}>
        FunctionCall <span style={{ color: C.orange }}>__fastdata_kv</span> → <span style={{ color: C.violet }}>social</span> · FastData KV
      </div>
      {/* the epoch dataset */}
      <div style={{ position: 'absolute', left: 560, top: 300, width: 800, opacity: toDoc, transform: `scale(${0.9 + 0.1 * toDoc})` }}>
        <Panel delay={tIdx} from="scale">
          <Caps>indexer · epoch #{data.latestEpoch} · social-kv/1</Caps>
          <div style={{ fontFamily: display, fontSize: 48, fontWeight: 700, margin: '10px 0 18px' }}>dataset.json</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, fontFamily: mono, fontSize: 22, color: C.muted, marginBottom: 20 }}>
            {[['posts', data.epochs.at(-1)?.posts ?? 172], ['likes', 391], ['reposts', 45], ['follows', 246]].map(([k, v]) => (
              <div key={k as string}><div style={{ color: C.text, fontSize: 36, fontWeight: 600 }}>{v}</div>{k}</div>
            ))}
          </div>
          <div style={{ fontFamily: mono, fontSize: 22, color: C.muted }}>data_hash</div>
          <div style={{ fontFamily: mono, fontSize: 26, color: C.amber, wordBreak: 'break-all' }}>{HASH.slice(0, hashChars)}<span style={{ opacity: f % 20 < 10 ? 1 : 0 }}>▌</span></div>
        </Panel>
      </div>
      <div style={{ position: 'absolute', left: 560, top: 760, display: 'flex', gap: 22 }}>
        {['you', 'a judge', 'a skeptic'].map((w, i) => (
          <div key={w} style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: any(i), transform: `translateY(${(1 - any(i)) * 20}px)`, fontFamily: body, fontSize: 24, color: C.text, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14, padding: '10px 16px' }}>
            <span style={{ color: C.green, fontWeight: 700 }}>✓</span> {w}: <span style={{ fontFamily: mono, color: C.amber }}>{HASH.slice(0, 8)}…</span>
          </div>
        ))}
        <div style={{ alignSelf: 'center', fontFamily: mono, fontSize: 24, color: C.green, opacity: any(3) }}>byte for byte</div>
      </div>
    </AbsoluteFill>
  );
}
