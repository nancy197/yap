import type * as React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, Sequence } from 'remotion';
import { BrowserClip } from '../ui/BrowserClip';
import { C, mono, display, body, Kinetic, ease, Identicon, TierBadge, Caps } from '../ui/kit';
import { cue } from '../timeline';
import data from '../data.json';

export function Social() {
  const f = useCurrentFrame();
  const tTreasury = cue('social', 'treasury');
  const tGold = cue('social', 'gold');
  const tProof = cue('social', 'proof');
  const tTrusted = cue('social', 'trusted');
  const tVote = cue('social', 'vote');
  const tGrant = cue('social', 'grants');
  const tExpire = cue('social', 'expires');
  const daoIn = ease(f, tTreasury - 4, tTreasury + 14);
  // The Gold yapper travels: start → steward (proof) → trusted role.
  const travel = interpolate(f, [tGold, tProof + 10, tTrusted, tTrusted + 20], [0, 0.5, 0.5, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const ax = interpolate(travel, [0, 0.5, 1], [180, 860, 1390]);
  const ay = interpolate(travel, [0, 0.5, 1], [760, 560, 455]);
  const proofLit = ease(f, tProof, tProof + 24);
  const grant = interpolate(f, [tGrant + 10, tGrant + 46], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const expire = ease(f, tExpire, tExpire + 50);
  const member = data.yappers.find((y) => y.tier >= 3) ?? data.yappers[0]!;
  const role = (name: string, color: string, body2: React.ReactNode, x: number, d: number) => (
    <div style={{ position: 'absolute', left: x, top: 330, width: 330, minHeight: 300, borderRadius: 24, padding: 24, border: `2px solid ${color}`, background: `${color}10`, opacity: ease(f, d, d + 12), transform: `translateY(${(1 - ease(f, d, d + 12)) * 30}px)` }}>
      <div style={{ fontFamily: mono, fontSize: 22, color, letterSpacing: '0.1em' }}>ROLE</div>
      <div style={{ fontFamily: display, fontSize: 42, fontWeight: 700, color: C.text }}>{name}</div>
      <div style={{ marginTop: 16, fontFamily: body, fontSize: 22, color: C.muted }}>{body2}</div>
    </div>
  );
  return (
    <AbsoluteFill style={{ padding: '140px 110px' }}>
      <Kinetic text="The community runs the treasury." size={58} delay={4} highlight={['community']} />
      {/* DAO frame */}
      <div style={{ position: 'absolute', left: 90, top: 260, right: 90, bottom: 170, borderRadius: 36, border: `1px solid ${C.border}`, background: 'rgba(20,19,26,0.6)', opacity: daoIn }}>
        <div style={{ position: 'absolute', left: 30, top: 20, fontFamily: mono, fontSize: 22, color: C.muted }}>Sputnik DAO v2 · {data.dao} · works in Trezu</div>
        <div style={{ position: 'absolute', right: 30, top: 14, fontFamily: mono, fontSize: 30, color: C.amber }}>treasury 247,020 YAP</div>
      </div>
      {role('council', C.blue, <>3 humans · 2 of 3 · everything else</>, 160, tTreasury + 6)}
      {role('steward', C.violet, <>an immutable contract · no keys<div style={{ marginTop: 12, fontFamily: mono, fontSize: 20, color: proofLit > 0.5 ? C.green : C.faint }}>{proofLit > 0.5 ? '✓ Merkle proof · finalized epoch' : 'waiting for a proof…'}</div></>, 700, tTreasury + 12)}
      {role('trusted', C.amber, <>
        {['y02.yap-hq.testnet', ...(travel >= 1 ? [member.account] : [])].map((a) => <div key={a} style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, color: C.text }}><Identicon seed={a} size={34} />{a.split('.')[0]}</div>)}
        <div style={{ marginTop: 10 }}>grants ≤ 300 YAP · 1,500 / season</div>
      </>, 1240, tTreasury + 18)}
      {/* Merkle proof mini tree lighting up inside the steward */}
      <svg style={{ position: 'absolute', left: 760, top: 520 }} width={220} height={120}>
        {[[110, 10, 50, 60], [110, 10, 170, 60], [50, 60, 20, 110], [50, 60, 80, 110]].map(([x1, y1, x2, y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={i === 0 || i === 3 ? (proofLit > i / 4 ? C.green : C.faint) : C.faint} strokeWidth={3} opacity={ease(f, tProof - 10, tProof)} />
        ))}
      </svg>
      {/* the traveller */}
      {f >= tGold && travel < 1 && (
        <div style={{ position: 'absolute', left: ax, top: ay, display: 'flex', alignItems: 'center', gap: 10, transform: 'translate(-50%,-50%)' }}>
          <Identicon seed={member.account} size={64} />
          <TierBadge t={3} />
        </div>
      )}
      <div style={{ position: 'absolute', left: 700, top: 690, fontFamily: mono, fontSize: 22, color: C.violet, opacity: ease(f, tTrusted, tTrusted + 10) }}>AddMemberToRole(trusted) · filed + approved by steward</div>
      <div style={{ position: 'absolute', left: 160, top: 690, opacity: ease(f, tVote, tVote + 10), fontFamily: display, fontWeight: 700, fontSize: 52, color: C.text }}>No vote needed.</div>
      {/* grant coin */}
      {grant > 0 && grant < 1 && <div style={{ position: 'absolute', left: 1500 - grant * 900, top: 230 + Math.sin(grant * Math.PI) * -60 + grant * 560, width: 44, height: 44, borderRadius: 22, background: C.amber, boxShadow: `0 0 26px ${C.amber}` }} />}
      <div style={{ position: 'absolute', left: 520, top: 780, display: 'flex', alignItems: 'center', gap: 14, opacity: ease(f, tGrant + 40, tGrant + 50), fontFamily: body, fontSize: 30, color: C.text }}>
        <Identicon seed="y15.yap-hq.testnet" size={50} /> New Nora <span style={{ fontFamily: mono, color: C.green }}>+120 YAP grant · proposal #4 · Approved</span>
      </div>
      {/* season ring */}
      <svg style={{ position: 'absolute', left: 1620, top: 790, opacity: ease(f, tExpire - 4, tExpire + 8) }} width={130} height={130}>
        <circle cx={65} cy={65} r={52} stroke="rgba(255,255,255,0.1)" strokeWidth={10} fill="none" />
        <circle cx={65} cy={65} r={52} stroke={C.amber} strokeWidth={10} fill="none" strokeDasharray={2 * Math.PI * 52} strokeDashoffset={2 * Math.PI * 52 * expire} transform="rotate(-90 65 65)" />
        <text x={65} y={72} textAnchor="middle" fill={C.text} fontFamily={mono} fontSize={20}>season</text>
      </svg>
      <Caps style={{ position: 'absolute', left: 1450, top: 930, opacity: ease(f, tExpire, tExpire + 10) }}>seat expires · earn it again</Caps>
      {/* the real Governance page: trusted circle, grants, steward proposals */}
      <AbsoluteFill style={{ background: `rgba(11,10,13,${0.75 * ease(f, tGrant + 6, tGrant + 20)})`, opacity: ease(f, tGrant + 6, tGrant + 20) }}>
        <Sequence from={tGrant + 6} layout="none">
          <BrowserClip src="governance" from={70} width={1500} style={{ position: 'absolute', left: 210, top: 130 }} cams={[{ at: 0, zoom: 1.3, x: 0.5, y: 0.42 }, { at: 120, zoom: 1.4, x: 0.52, y: 0.5 }]} />
        </Sequence>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
