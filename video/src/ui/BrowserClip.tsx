// Real product footage inside a browser window, with a slow camera: zoom/pan keyframes and a gentle 3D settle.
import { OffthreadVideo, staticFile, useCurrentFrame, interpolate, Easing } from 'remotion';
import type { CSSProperties } from 'react';
import { C, mono } from './kit';

export type Cam = { at: number; zoom: number; x: number; y: number }; // x/y: focus point in 0..1 of the page

export function BrowserClip({ src, from = 0, url = 'yap · near.social', cams = [{ at: 0, zoom: 1, x: 0.5, y: 0.5 }], style, enter = 0, width = 1600, tilt = true }: { src: string; from?: number; url?: string; cams?: Cam[]; style?: CSSProperties; enter?: number; width?: number; tilt?: boolean }) {
  const f = useCurrentFrame();
  const height = (width * 9) / 16;
  const s = interpolate(f, [enter, enter + 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.22, 1, 0.36, 1) });
  // Interpolate the camera between keyframes.
  const at = cams.map((c) => c.at);
  const k = (key: 'zoom' | 'x' | 'y') => (cams.length === 1 ? cams[0]![key] : interpolate(f, at, cams.map((c) => c[key]), { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) }));
  const zoom = k('zoom');
  const fx = k('x');
  const fy = k('y');
  // Keep the focus point centred while zoomed, without showing outside the page.
  const tx = Math.max(Math.min((0.5 - fx) * width * zoom, ((zoom - 1) * width) / 2), (-(zoom - 1) * width) / 2);
  const ty = Math.max(Math.min((0.5 - fy) * height * zoom, ((zoom - 1) * height) / 2), (-(zoom - 1) * height) / 2);
  return (
    <div style={{ perspective: 2400, ...style }}>
      <div
        style={{
          width,
          borderRadius: 18,
          overflow: 'hidden',
          border: `1px solid rgba(255,255,255,0.14)`,
          background: '#0b0a0d',
          boxShadow: '0 50px 120px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,138,61,0.08)',
          opacity: s,
          transform: tilt ? `translateY(${(1 - s) * 80}px) rotateX(${(1 - s) * 14}deg) scale(${0.94 + 0.06 * s})` : `translateY(${(1 - s) * 40}px)`,
        }}
      >
        <div style={{ height: 40, display: 'flex', alignItems: 'center', gap: 9, padding: '0 16px', background: '#17161c', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          {['#ff5f57', '#febc2e', '#28c840'].map((c) => <span key={c} style={{ width: 12, height: 12, borderRadius: 6, background: c }} />)}
          <div style={{ marginLeft: 18, flex: 1, height: 24, borderRadius: 8, background: '#0f0e13', display: 'flex', alignItems: 'center', padding: '0 12px', fontFamily: mono, fontSize: 15, color: C.muted }}>
            <span style={{ color: C.green, marginRight: 8 }}>●</span>{url}
          </div>
          <span style={{ fontFamily: mono, fontSize: 13, color: C.faint }}>REAL APP · NEAR TESTNET</span>
        </div>
        <div style={{ width, height, overflow: 'hidden', position: 'relative' }}>
          <div style={{ width, height, transform: `translate(${tx}px, ${ty}px) scale(${zoom})`, transformOrigin: 'center center' }}>
            <OffthreadVideo src={staticFile(`clips/${src}.mp4`)} startFrom={from} muted style={{ width, height, objectFit: 'cover', display: 'block' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
