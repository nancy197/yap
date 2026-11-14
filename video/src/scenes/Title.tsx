import { AbsoluteFill, useCurrentFrame, Sequence } from 'remotion';
import { BrowserClip } from '../ui/BrowserClip';
import { C, display, mono, Kinetic, useSpring, ease, Chip, grad } from '../ui/kit';
import { cue } from '../timeline';

/** The logo builds itself: bubble pops in, sound waves draw, wordmark slides. */
export function Title() {
  const f = useCurrentFrame();
  const pop = useSpring(4, { damping: 10, stiffness: 160 });
  const wave = (i: number) => ease(f, 16 + i * 5, 34 + i * 5);
  const word = useSpring(22);
  const tSwitch = cue('title', 'switch');
  const tSocial = cue('title', 'social');
  const tTx = cue('title', 'transaction');
  const hero = ease(f, tSocial - 10, tSocial + 20);
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', transform: `translateY(${-hero * 250}px) scale(${1 - hero * 0.35})` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 50 }}>
        <svg viewBox="0 0 64 64" width={260} height={260} style={{ transform: `scale(${pop}) rotate(${(1 - pop) * -20}deg)`, filter: 'drop-shadow(0 30px 60px rgba(255,138,61,0.35))' }}>
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffb347" /><stop offset="1" stopColor="#ff6a3d" /></linearGradient>
          </defs>
          <path d="M10 14a8 8 0 0 1 8-8h28a8 8 0 0 1 8 8v22a8 8 0 0 1-8 8H28l-12 10v-10h2a8 8 0 0 1-8-8z" fill="url(#g)" />
          {['M22 25c0-3 2-5 4-5', 'M30 31c0-7 0-11 0-11', 'M36 22c2 2 2 6 0 9', 'M42 19c4 4 4 11 0 15'].map((d, i) => (
            <path key={d} d={d} stroke="#140d07" strokeWidth={3.2} strokeLinecap="round" fill="none" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - wave(i)} />
          ))}
        </svg>
        <div style={{ transform: `translateX(${(1 - word) * 80}px)`, opacity: word }}>
          <div style={{ fontFamily: display, fontSize: 240, fontWeight: 700, letterSpacing: '-0.06em', lineHeight: 0.85, background: grad, WebkitBackgroundClip: 'text', color: 'transparent' }}>YAP</div>
          <div style={{ fontFamily: mono, fontSize: 30, color: C.muted, marginTop: 14 }}>yap-to-earn · near.social</div>
        </div>
      </div>
      <div style={{ marginTop: 70, height: 90 }}>
        <Kinetic text="Proof of Yap: yap-to-earn nobody can switch off." delay={tSwitch - 18} size={64} weight={600} highlight={['nobody', 'switch', 'off']} style={{ justifyContent: 'center' }} />
      </div>
      <div style={{ display: 'flex', gap: 18, marginTop: 34 }}>
        {[
          ['near.social', tSocial, C.violet],
          ['post = NEAR tx', tTx - 6, C.orange],
          ['like = NEAR tx', tTx + 2, C.orange],
          ['follow = NEAR tx', tTx + 10, C.orange],
        ].map(([t, d, c]) => {
          const s = Math.min(1, Math.max(0, (f - (d as number)) / 10));
          return <Chip key={t as string} color={c as string} style={{ opacity: s, transform: `translateY(${(1 - s) * 20}px)`, fontSize: 26 }}>{t as string}</Chip>;
        })}
      </div>
      </div>
      <Sequence from={tSocial - 10}>
        <BrowserClip src="mindshare" from={60} width={1440} style={{ position: 'absolute', left: 240, top: 470 + (1 - hero) * 400 }} cams={[{ at: 0, zoom: 1, x: 0.5, y: 0.3 }, { at: 120, zoom: 1.1, x: 0.5, y: 0.35 }]} />
      </Sequence>
    </AbsoluteFill>
  );
}
