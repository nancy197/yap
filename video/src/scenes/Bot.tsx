import type * as React from 'react';
import { AbsoluteFill, useCurrentFrame, Sequence } from 'remotion';
import { BrowserClip } from '../ui/BrowserClip';
import { C, mono, body, display, Kinetic, ease, Identicon, Chip } from '../ui/kit';
import { cue } from '../timeline';
import data from '../data.json';

export function Bot() {
  const f = useCurrentFrame();
  const tAsk = cue('bot', 'ask');
  const tReplies = cue('bot', 'replies');
  const tTee = cue('bot', 'tee');
  const qa = data.yapbot[0] ?? { asker: 'y15.yap-hq.testnet', question: '@yapbot.yap-hq.testnet how am I doing?', reply: '' };
  const qChars = Math.round(ease(f, tAsk - 4, tAsk + 30) * qa.question.length);
  const rChars = Math.round(ease(f, tReplies, tReplies + 150) * qa.reply.length);
  const card = (who: string, name: string, text: string, accent: string, show: number, extra?: React.ReactNode) => (
    <div style={{ display: 'flex', gap: 22, padding: 30, borderRadius: 26, background: 'rgba(26,25,32,0.9)', border: `1.5px solid ${accent}`, opacity: show, transform: `translateY(${(1 - show) * 40}px)`, width: 1300 }}>
      <Identicon seed={who} size={70} />
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: body, fontWeight: 700, fontSize: 28, color: C.text }}>{name} <span style={{ fontFamily: mono, fontWeight: 400, fontSize: 20, color: C.faint }}>{who}</span></div>
        <div style={{ fontFamily: body, fontSize: 32, color: C.text, marginTop: 8, lineHeight: 1.35 }}>
          {text.split(/(@[a-z0-9._-]+|#[a-z0-9_]+)/i).map((p, i) => <span key={i} style={{ color: /^[@#]/.test(p) ? C.violet : undefined }}>{p}</span>)}
          {show > 0 && <span style={{ opacity: f % 20 < 10 ? 1 : 0, color: accent }}>▌</span>}
        </div>
        {extra}
      </div>
    </div>
  );
  return (
    <AbsoluteFill style={{ padding: '140px 110px' }}>
      <Kinetic text="Ask @yapbot, right on near.social." size={58} delay={4} highlight={['@yapbot']} />
      <Sequence from={tAsk - 15} durationInFrames={tReplies - tAsk + 15} layout="none">
        <BrowserClip src="ask" from={30} width={1500} tilt={false} style={{ position: 'absolute', left: 210, top: 210 }} cams={[{ at: 0, zoom: 1.55, x: 0.42, y: 0.28 }, { at: 100, zoom: 1.5, x: 0.45, y: 0.3 }]} />
      </Sequence>
      <Sequence from={tReplies} layout="none">
        <BrowserClip src="reply" from={10} width={1500} tilt={false} enter={-30} style={{ position: 'absolute', left: 210, top: 210 }} cams={[{ at: 0, zoom: 1.2, x: 0.45, y: 0.45 }, { at: 70, zoom: 1.55, x: 0.42, y: 0.5 }]} />
      </Sequence>
      <div style={{ position: 'absolute', right: 110, top: 150, display: 'flex', gap: 14, opacity: ease(f, tTee, tTee + 12) }}>
        <Chip color={C.violet}>Qwen3.8-27B · verified TEE</Chip>
        <Chip color={C.green}>facts from published epochs</Chip>
        <Chip color={C.orange}>question + reply = NEAR txs</Chip>
      </div>
    </AbsoluteFill>
  );
}
