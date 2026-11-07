import { AbsoluteFill, Sequence, staticFile, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { Audio } from '@remotion/media';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { wipe } from '@remotion/transitions/wipe';
import { Backdrop, C, mono, body } from './ui/kit';
import { SCENES, sceneFrames, TRANSITION, LEAD } from './timeline';

type Word = { w: string; start: number; end: number };

/** Word-timed captions: one short line at a time, the spoken word lit. */
function Captions({ words }: { words: Word[] }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = f / fps - LEAD / fps;
  const lines: Word[][] = [];
  let cur: Word[] = [];
  for (const w of words) {
    cur.push(w);
    if (cur.length >= 7 || /[.?!;:]$/.test(w.w)) {
      lines.push(cur);
      cur = [];
    }
  }
  if (cur.length) lines.push(cur);
  // Fold one- or two-word tails into the line before, so captions never flash a lonely word.
  for (let i = lines.length - 1; i > 0; i--) if (lines[i]!.length <= 2 && lines[i - 1]!.length <= 9) lines.splice(i - 1, 2, [...lines[i - 1]!, ...lines[i]!]);
  const line = lines.find((l) => t >= l[0]!.start - 0.15 && t <= l[l.length - 1]!.end + 0.25);
  if (!line) return null;
  return (
    <div style={{ position: 'absolute', bottom: 54, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
      <div style={{ background: 'rgba(8,8,10,0.72)', border: `1px solid ${C.border}`, borderRadius: 14, padding: '12px 26px', fontFamily: body, fontSize: 34, fontWeight: 600, color: C.muted, maxWidth: 1500, textAlign: 'center', backdropFilter: 'blur(8px)' }}>
        {line.map((w, i) => (
          <span key={i} style={{ color: t >= w.start - 0.02 ? C.text : C.faint }}>{w.w} </span>
        ))}
      </div>
    </div>
  );
}

function Chrome() {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  // Which chapter are we in (accounting for transition overlaps)?
  let acc = 0;
  let idx = 0;
  for (const [i, s] of SCENES.entries()) {
    const len = sceneFrames(s.id) - (i < SCENES.length - 1 ? TRANSITION : 0);
    if (f >= acc) idx = i;
    acc += len;
  }
  const s = SCENES[idx]!;
  return (
    <>
      <div style={{ position: 'absolute', top: 40, left: 56, display: 'flex', alignItems: 'center', gap: 14, fontFamily: mono, fontSize: 20, color: C.muted, letterSpacing: '0.12em' }}>
        <span style={{ color: C.orange, fontWeight: 600 }}>{String(idx + 1).padStart(2, '0')}</span>
        <span style={{ width: 28, height: 1.5, background: C.faint }} />
        <span style={{ textTransform: 'uppercase' }}>{s.chapter}</span>
      </div>
      <div style={{ position: 'absolute', top: 40, right: 56, fontFamily: mono, fontSize: 18, color: C.faint, letterSpacing: '0.1em' }}>YAP · NEAR TESTNET</div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, height: 4, width: `${(f / durationInFrames) * 100}%`, background: `linear-gradient(90deg, ${C.violet}, ${C.orange})` }} />
    </>
  );
}

export function Main() {
  const presentations: unknown[] = [fade(), slide({ direction: 'from-right' }), wipe({ direction: 'from-left' }), fade()];
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Backdrop />
      <TransitionSeries>
        {SCENES.flatMap((s, i) => {
          const Comp = s.component;
          const nodes = [
            <TransitionSeries.Sequence key={s.id} durationInFrames={sceneFrames(s.id)}>
              <AbsoluteFill>
                <Comp />
                <Sequence from={LEAD}>
                  <Audio src={staticFile(`voice/${s.id}.mp3`)} />
                </Sequence>
                <Captions words={s.voice.words} />
              </AbsoluteFill>
            </TransitionSeries.Sequence>,
          ];
          if (i < SCENES.length - 1)
            nodes.push(<TransitionSeries.Transition key={`t${i}`} presentation={presentations[i % presentations.length] as never} timing={linearTiming({ durationInFrames: TRANSITION })} />);
          return nodes;
        })}
      </TransitionSeries>
      <Chrome />
      <FadeOut />
    </AbsoluteFill>
  );
}

function FadeOut() {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const o = interpolate(f, [durationInFrames - 20, durationInFrames], [0, 1], { extrapolateLeft: 'clamp' });
  return <AbsoluteFill style={{ background: '#000', opacity: o, pointerEvents: 'none' }} />;
}
