// Motion primitives for the YAP video: theme, fonts, drifting background, kinetic text, counters, panels.
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Easing, Img, staticFile } from 'remotion';
import { loadFont as loadGrotesk } from '@remotion/google-fonts/SpaceGrotesk';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';
import type { CSSProperties, ReactNode } from 'react';

export const display = loadGrotesk('normal', { weights: ['500', '700'], subsets: ['latin'] }).fontFamily;
export const body = loadInter('normal', { weights: ['400', '500', '600'], subsets: ['latin'] }).fontFamily;
export const mono = loadMono('normal', { weights: ['400', '600'], subsets: ['latin'] }).fontFamily;

export const C = {
  bg: '#0b0a0d',
  panel: 'rgba(26,25,32,0.78)',
  border: 'rgba(255,255,255,0.09)',
  text: '#f4f1ea',
  muted: '#a39fa9',
  faint: '#6f6b77',
  amber: '#ffb347',
  orange: '#ff8a3d',
  violet: '#a78bfa',
  blue: '#5aa2ff',
  green: '#3fcf8e',
  red: '#ff6b6b',
  gold: '#f2c14e',
};
export const grad = `linear-gradient(135deg, ${C.amber}, ${C.orange})`;

/** Spring from 0 to 1 starting at `delay` frames. */
export function useSpring(delay = 0, config: { damping?: number; stiffness?: number; mass?: number } = {}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping: 14, stiffness: 120, mass: 0.8, ...config } });
}
export const ease = (frame: number, a: number, b: number, from = 0, to = 1) =>
  interpolate(frame, [a, b], [from, to], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.22, 1, 0.36, 1) });

/** Slow drifting glow blobs + moving grid: keeps every frame alive. */
export function Backdrop({ hue = 0 }: { hue?: number }) {
  const f = useCurrentFrame();
  const blob = (x: number, y: number, r: number, color: string, sp: number) => (
    <div
      style={{
        position: 'absolute',
        left: `${x + Math.sin(f / sp) * 6}%`,
        top: `${y + Math.cos(f / (sp * 1.3)) * 6}%`,
        width: r,
        height: r,
        borderRadius: '50%',
        background: color,
        filter: 'blur(120px)',
        opacity: 0.32,
        transform: 'translate(-50%,-50%)',
      }}
    />
  );
  return (
    <AbsoluteFill style={{ background: C.bg, overflow: 'hidden', filter: `hue-rotate(${hue}deg)` }}>
      {blob(18, 20, 900, C.orange, 90)}
      {blob(85, 75, 1000, C.violet, 110)}
      {blob(60, 10, 600, '#3b2a7a', 70)}
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)`,
          backgroundSize: '64px 64px',
          backgroundPosition: `${(f * 0.6) % 64}px ${(f * 0.3) % 64}px`,
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
        }}
      />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)' }} />
    </AbsoluteFill>
  );
}

/** Words rise in one by one with a little blur. */
export function Kinetic({ text, delay = 0, size = 72, color = C.text, weight = 700, stagger = 3, font = display, style, highlight }: { text: string; delay?: number; size?: number; color?: string; weight?: number; stagger?: number; font?: string; style?: CSSProperties; highlight?: string[] }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: `0 ${size * 0.26}px`, fontFamily: font, fontSize: size, fontWeight: weight, lineHeight: 1.08, letterSpacing: '-0.03em', color, ...style }}>
      {text.split(' ').map((w, i) => {
        const s = spring({ frame: f - delay - i * stagger, fps, config: { damping: 16, stiffness: 140 } });
        const hl = highlight?.some((h) => w.toLowerCase().includes(h.toLowerCase()));
        return (
          <span key={i} style={{ display: 'inline-block', opacity: s, transform: `translateY(${(1 - s) * 40}px)`, filter: `blur(${(1 - s) * 8}px)`, ...(hl ? { background: grad, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' } : {}) }}>
            {w}
          </span>
        );
      })}
    </div>
  );
}

export function Count({ to, from = 0, start = 0, dur = 40, dp = 0, prefix = '', suffix = '', style }: { to: number; from?: number; start?: number; dur?: number; dp?: number; prefix?: string; suffix?: string; style?: CSSProperties }) {
  const f = useCurrentFrame();
  const v = ease(f, start, start + dur, from, to);
  return <span style={{ fontFamily: mono, fontVariantNumeric: 'tabular-nums', ...style }}>{prefix}{v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}{suffix}</span>;
}

export function Panel({ children, style, delay = 0, from = 'up' }: { children: ReactNode; style?: CSSProperties; delay?: number; from?: 'up' | 'left' | 'right' | 'scale' }) {
  const s = useSpring(delay);
  const t = from === 'up' ? `translateY(${(1 - s) * 60}px)` : from === 'left' ? `translateX(${(s - 1) * 120}px)` : from === 'right' ? `translateX(${(1 - s) * 120}px)` : `scale(${0.85 + 0.15 * s})`;
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 24, padding: 28, backdropFilter: 'blur(14px)', boxShadow: '0 30px 80px rgba(0,0,0,0.45)', opacity: s, transform: t, color: C.text, fontFamily: body, ...style }}>
      {children}
    </div>
  );
}

export const Chip = ({ children, color = C.orange, style }: { children: ReactNode; color?: string; style?: CSSProperties }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 999, border: `1.5px solid ${color}`, color, fontFamily: mono, fontSize: 22, fontWeight: 600, background: `${color}14`, whiteSpace: 'nowrap', ...style }}>{children}</span>
);

export const Caps = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <div style={{ fontFamily: mono, fontSize: 18, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, fontWeight: 600, ...style }}>{children}</div>
);

export function Logo({ size = 120 }: { size?: number }) {
  return <Img src={staticFile('logo.svg')} style={{ width: size, height: size }} />;
}

/** Deterministic identicon (same idea as the app's). */
export function Identicon({ seed, size = 48 }: { seed: string; size?: number }) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h >>>= 0;
  const hue = h % 360;
  const cells: ReactNode[] = [];
  for (let i = 0; i < 15; i++)
    if ((h >> i) & 1) {
      const x = i % 3, y = Math.floor(i / 3);
      cells.push(<rect key={`a${i}`} x={x * 10 + 5} y={y * 10 + 5} width={10} height={10} />);
      if (x < 2) cells.push(<rect key={`b${i}`} x={(4 - x) * 10 + 5} y={y * 10 + 5} width={10} height={10} />);
    }
  return (
    <svg viewBox="0 0 60 60" width={size} height={size} style={{ borderRadius: '50%', flex: 'none' }}>
      <rect width="60" height="60" fill={`hsl(${hue} 45% 22%)`} />
      <g fill={`hsl(${(hue + 40) % 360} 85% 65%)`}>{cells}</g>
    </svg>
  );
}

export const TierBadge = ({ t }: { t: number }) => {
  const names = ['NONE', 'BRONZE', 'SILVER', 'GOLD', 'INNER CIRCLE'];
  const col = [C.faint, '#c48a5c', '#c8ccd6', C.gold, C.amber][t]!;
  return <span style={{ fontFamily: mono, fontSize: 16, fontWeight: 600, color: col, border: `1.5px solid ${col}`, borderRadius: 8, padding: '3px 10px' }}>{names[t]}</span>;
};

export const short = (h: string, n = 6) => `${h.slice(0, n)}…${h.slice(-4)}`;
