// Scene order, chapter labels and lengths. Each scene lasts LEAD + its narration + TAIL frames; consecutive scenes
// overlap by TRANSITION frames, so TAIL > TRANSITION keeps voices from overlapping.
import type { FC } from 'react';
import hook from '../public/voice/hook.json';
import title from '../public/voice/title.json';
import data from '../public/voice/data.json';
import score from '../public/voice/score.json';
import meme from '../public/voice/meme.json';
import trust from '../public/voice/trust.json';
import kaito from '../public/voice/kaito.json';
import social from '../public/voice/social.json';
import bot from '../public/voice/bot.json';
import verify from '../public/voice/verify.json';
import proof from '../public/voice/proof.json';
import close from '../public/voice/close.json';
import { Hook } from './scenes/Hook';
import { Title } from './scenes/Title';
import { Data } from './scenes/Data';
import { Score } from './scenes/Score';
import { Meme } from './scenes/Meme';
import { Trust } from './scenes/Trust';
import { Kaito } from './scenes/Kaito';
import { Social } from './scenes/Social';
import { Bot } from './scenes/Bot';
import { Verify } from './scenes/Verify';
import { Proof } from './scenes/Proof';
import { Close } from './scenes/Close';

export const FPS = 30;
export const LEAD = 10;
export const TAIL = 26;
export const TRANSITION = 18;
type Voice = { id: string; duration: number; words: { w: string; start: number; end: number }[] };
export const SCENES: { id: string; chapter: string; voice: Voice; component: FC }[] = [
  { id: 'hook', chapter: 'The problem', voice: hook, component: Hook },
  { id: 'title', chapter: 'YAP', voice: title, component: Title },
  { id: 'data', chapter: 'On-chain data', voice: data, component: Data },
  { id: 'score', chapter: 'Scoring', voice: score, component: Score },
  { id: 'meme', chapter: 'The mechanic', voice: meme, component: Meme },
  { id: 'trust', chapter: 'Trust, tested', voice: trust, component: Trust },
  { id: 'kaito', chapter: 'Kaito features', voice: kaito, component: Kaito },
  { id: 'social', chapter: 'Social money', voice: social, component: Social },
  { id: 'bot', chapter: '@yapbot', voice: bot, component: Bot },
  { id: 'verify', chapter: 'Verify', voice: verify, component: Verify },
  { id: 'proof', chapter: 'Proof', voice: proof, component: Proof },
  { id: 'close', chapter: 'Yap on', voice: close, component: Close },
];
export const sceneFrames = (id: string) => {
  const s = SCENES.find((x) => x.id === id)!;
  return LEAD + Math.ceil(s.voice.duration * FPS) + TAIL;
};
export const totalFrames = () => SCENES.reduce((n, s) => n + sceneFrames(s.id), 0) - TRANSITION * (SCENES.length - 1);
/** Frame (within a scene) at which the narration says `word` (first match at/after `after` seconds). */
export function cue(id: string, word: string, after = 0): number {
  const s = SCENES.find((x) => x.id === id)!;
  const w = s.voice.words.find((x) => x.start >= after && x.w.toLowerCase().replace(/[^a-z0-9]/g, '').startsWith(word.toLowerCase()));
  return LEAD + Math.round((w?.start ?? after) * FPS);
}
