import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { C, mono, body, display, Kinetic, ease, Identicon, Caps } from '../ui/kit';
import { cue } from '../timeline';
import data from '../data.json';

const Q = [
  { q: 0, name: 'SPAM', col: C.red },
  { q: 1, name: 'LOW', col: C.muted },
  { q: 2, name: 'OK', col: C.green },
  { q: 3, name: 'INSIGHT', col: C.amber },
];

function PostThroughTEE({ i, start, post, q }: { i: number; start: number; post: { who: string; text: string; reason: string }; q: number }) {
  const f = useCurrentFrame();
  const p = interpolate(f, [start, start + 70], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const x = interpolate(p, [0, 0.4, 0.6, 1], [-40, 560, 560, 1080]);
  const stamped = p > 0.55;
  const qq = Q[q]!;
  return (
    <div style={{ position: 'absolute', left: 120 + x, top: 360 + i * 150, width: 560, opacity: interpolate(p, [0, 0.08, 0.92, 1], [0, 1, 1, 1]) }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', background: C.panel, border: `1px solid ${stamped ? qq.col : C.border}`, borderRadius: 18, padding: '14px 18px', fontFamily: body, color: C.text, fontSize: 21, boxShadow: stamped ? `0 0 40px ${qq.col}33` : 'none' }}>
        <Identicon seed={post.who} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 19, color: C.muted }}>{post.who}</div>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.text}</div>
          {stamped && <div style={{ fontFamily: mono, fontSize: 15, color: C.faint, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>“{post.reason}”</div>}
        </div>
        {stamped && (
          <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 22, color: qq.col, border: `2px solid ${qq.col}`, borderRadius: 10, padding: '4px 10px', transform: `scale(${interpolate(p, [0.55, 0.62], [1.8, 1], { extrapolateRight: 'clamp' })}) rotate(-6deg)` }}>
            q{qq.q} {qq.name}
          </div>
        )}
      </div>
    </div>
  );
}

// Deterministic follow graph: a few "smart" hubs with many followers.
const N = 22;
const nodes = Array.from({ length: N }, (_, i) => {
  const a = (i / N) * Math.PI * 2 + (i % 3) * 0.2;
  const r = 230 + ((i * 37) % 90);
  return { x: 1400 + Math.cos(a) * r, y: 560 + Math.sin(a) * r * 0.72, smart: [2, 7, 13, 18].includes(i) };
});
const edges: [number, number][] = [];
for (let i = 0; i < N; i++) {
  for (const hub of [2, 7, 13, 18]) if (hub !== i && (i * 7 + hub) % 3 !== 0) edges.push([i, hub]);
  edges.push([i, (i + 5) % N]);
}

export function Score() {
  const f = useCurrentFrame();
  const tSpam = cue('score', 'spam');
  const tEng = cue('score', 'engagement');
  const tPR = cue('score', 'pagerank');
  const tStake = cue('score', 'stake');
  const tMath = cue('score', 'everything');
  const toGraph = ease(f, tEng - 4, tEng + 18);
  const toMath = ease(f, tMath - 4, tMath + 16);
  const samples = [data.labels.spam[0], data.labels.low[0], data.labels.insight[0]].filter(Boolean) as { who: string; text: string; reason: string }[];
  const checks = ['Intel TDX quote · DCAP UpToDate', 'NVIDIA GPU · NRAS verdict', 'nonce bound to this request', 'RTMR3 event log replayed'];
  return (
    <AbsoluteFill>
      {/* Part 1: the TEE labeler */}
      <AbsoluteFill style={{ opacity: 1 - toGraph, transform: `translateX(${-toGraph * 200}px)` }}>
        <div style={{ position: 'absolute', left: 110, top: 150, width: 900 }}>
          <Kinetic text="An attested AI labels every post." size={60} delay={4} highlight={['attested', 'ai']} />
        </div>
        <div style={{ position: 'absolute', left: 640, top: 320, width: 520, height: 520, borderRadius: 32, border: `2px solid ${C.violet}`, background: 'radial-gradient(circle at 50% 40%, rgba(167,139,250,0.18), rgba(20,18,28,0.9))', boxShadow: `0 0 ${60 + Math.sin(f / 8) * 20}px rgba(167,139,250,0.35)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 26 }}>
          <div style={{ position: 'absolute', top: 22, fontFamily: mono, fontSize: 20, color: C.violet, letterSpacing: '0.12em' }}>VERIFIED TEE · NEAR AI CLOUD</div>
          <div style={{ position: 'absolute', top: 70, fontFamily: display, fontSize: 40, fontWeight: 700, color: C.text }}>Qwen3.8-27B</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {checks.map((c, i) => (
              <div key={c} style={{ fontFamily: mono, fontSize: 17, color: f > 20 + i * 10 ? C.green : C.faint }}>{f > 20 + i * 10 ? '✓' : '·'} {c}</div>
            ))}
            <div style={{ fontFamily: mono, fontSize: 17, color: C.amber, marginTop: 4 }}>22 / 22 attestation checks</div>
          </div>
        </div>
        {samples.map((p, i) => (
          <PostThroughTEE key={i} i={i} start={30 + i * 30} post={p} q={[0, 1, 3][i]!} />
        ))}
        <div style={{ position: 'absolute', left: 1240, top: 260, display: 'flex', gap: 14, opacity: ease(f, tSpam, tSpam + 12) }}>
          {Q.map((q) => <span key={q.q} style={{ fontFamily: mono, fontSize: 20, color: q.col, border: `1.5px solid ${q.col}`, borderRadius: 8, padding: '4px 10px' }}>q{q.q} {q.name}</span>)}
        </div>
      </AbsoluteFill>

      {/* Part 2: smart followers by PageRank */}
      <AbsoluteFill style={{ opacity: toGraph * (1 - toMath) }}>
        <div style={{ position: 'absolute', left: 110, top: 170, width: 760 }}>
          <Kinetic text="Engagement from smart accounts weighs more." size={58} delay={tEng} highlight={['smart']} />
          <div style={{ marginTop: 40, display: 'grid', gap: 18, fontFamily: body, fontSize: 28, color: C.muted }}>
            {[
              ['like', '×1', tEng + 20],
              ['repost', '×2', tEng + 26],
              ['reply (q ≥ 2)', '×3', tEng + 32],
              ['quote (q ≥ 2)', '×4', tEng + 38],
              ['smart engager', '×1.5', tPR + 10],
              ['staked engager', '× (1 + log₁₀(1+stake))', tStake],
            ].map(([k, v, d]) => (
              <div key={k as string} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${C.border}`, paddingBottom: 10, opacity: ease(f, d as number, (d as number) + 10), transform: `translateX(${(1 - ease(f, d as number, (d as number) + 10)) * -30}px)` }}>
                <span>{k}</span>
                <span style={{ fontFamily: mono, color: C.amber }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
        <svg style={{ position: 'absolute', inset: 0 }} width={1920} height={1080}>
          {edges.map(([a, b], i) => {
            const p = ease(f, tEng + 6 + i * 0.7, tEng + 26 + i * 0.7);
            const A = nodes[a]!, B = nodes[b]!;
            return <line key={i} x1={A.x} y1={A.y} x2={A.x + (B.x - A.x) * p} y2={A.y + (B.y - A.y) * p} stroke={B.smart && f > tPR ? 'rgba(255,179,71,0.28)' : 'rgba(255,255,255,0.10)'} strokeWidth={1.5} />;
          })}
          {nodes.map((n, i) => {
            const grow = ease(f, tPR, tPR + 30);
            const r = n.smart ? 16 + 18 * grow + Math.sin((f + i * 9) / 7) * 2 : 12;
            return (
              <g key={i} opacity={ease(f, tEng + i, tEng + 12 + i)}>
                {n.smart && f > tPR && <circle cx={n.x} cy={n.y} r={r + 10} fill="none" stroke={C.amber} strokeOpacity={0.5} strokeWidth={2} />}
                <circle cx={n.x} cy={n.y} r={r} fill={n.smart && f > tPR ? C.orange : '#3a3744'} />
              </g>
            );
          })}
          {f > tPR + 20 &&
            [2, 13].map((hub, k) => {
              const p = ((f - tPR - 20 + k * 25) % 50) / 50;
              const A = nodes[hub]!, B = nodes[(hub + 9) % N]!;
              return <circle key={hub} cx={A.x + (B.x - A.x) * p} cy={A.y + (B.y - A.y) * p} r={7} fill={C.amber} />;
            })}
        </svg>
        <div style={{ position: 'absolute', left: 1240, top: 900, fontFamily: mono, fontSize: 22, color: C.amber, opacity: ease(f, tPR + 10, tPR + 22) }}>● smart = top 20% PageRank</div>
      </AbsoluteFill>

      {/* Part 3: the formula */}
      <AbsoluteFill style={{ opacity: toMath, alignItems: 'center', justifyContent: 'center' }}>
        <Caps style={{ marginBottom: 26 }}>open · deterministic · integer math</Caps>
        <div style={{ fontFamily: mono, fontSize: 64, color: C.text, transform: `scale(${0.9 + 0.1 * toMath})` }}>
          post = <span style={{ color: C.amber }}>Q[q]</span> × (1 + ln(1 + <span style={{ color: C.violet }}>Σ w</span>))
        </div>
        <div style={{ fontFamily: mono, fontSize: 34, color: C.muted, marginTop: 30, opacity: ease(f, tMath + 20, tMath + 34) }}>
          Yap score = best 10 posts · Q = [0, 0.25, 1, 2]
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
