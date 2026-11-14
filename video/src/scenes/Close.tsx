import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, mono, display, Kinetic, ease, useSpring, Chip, grad, Logo } from '../ui/kit';
import { cue } from '../timeline';

export function Close() {
  const f = useCurrentFrame();
  const logo = useSpring(2, { damping: 11 });
  const tCommunity = cue('close', 'community');
  const tNear = cue('close', 'near');
  const tBuilt = cue('close', 'built');
  const tOn = cue('close', 'on', 9);
  const lines = [
    ['Yap to earn. Pop the jackpot.', 8],
    ['The community runs the treasury.', tCommunity],
    ['Every number lives on NEAR.', tNear - 10],
  ] as const;
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 30, transform: `scale(${logo})` }}>
        <Logo size={150} />
        <div style={{ fontFamily: display, fontSize: 170, fontWeight: 700, letterSpacing: '-0.06em', background: grad, WebkitBackgroundClip: 'text', color: 'transparent', lineHeight: 0.9 }}>YAP</div>
      </div>
      <div style={{ marginTop: 50, display: 'grid', gap: 16, justifyItems: 'center' }}>
        {lines.map(([t, d]) => <Kinetic key={t} text={t} delay={d} size={50} weight={600} style={{ justifyContent: 'center' }} />)}
      </div>
      <div style={{ display: 'flex', gap: 18, marginTop: 50, opacity: ease(f, tBuilt - 6, tBuilt + 8) }}>
        <Chip color={C.orange}>Memecoins With Mechanics</Chip>
        <Chip color={C.violet}>Social Money</Chip>
        <Chip color={C.green}>live on NEAR testnet</Chip>
      </div>
      <div style={{ fontFamily: mono, fontSize: 26, color: C.muted, marginTop: 34, opacity: ease(f, tBuilt, tBuilt + 10) }}>Built at NEAR HACKATHON 2026 · github.com/nancy197/yap</div>
      <div style={{ fontFamily: display, fontWeight: 700, fontSize: 90, marginTop: 30, color: C.text, opacity: ease(f, tOn - 6, tOn + 6), transform: `scale(${0.8 + 0.2 * ease(f, tOn - 6, tOn + 6)})` }}>Yap on. 📣</div>
      <div style={{ position: 'absolute', bottom: 24, right: 40, fontFamily: mono, fontSize: 16, color: C.faint }}>voice: ElevenLabs · made with Remotion</div>
    </AbsoluteFill>
  );
}
