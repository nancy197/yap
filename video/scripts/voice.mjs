// Narration with ElevenLabs (with-timestamps → word-level captions). Reuses files that already exist.
// Usage: node scripts/voice.mjs [sceneId...]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
const env = readFileSync(new URL('../../.env', import.meta.url), 'utf8');
// Several keys may be configured; use the first one with enough character quota left.
const KEYS = ['ELEVENLAB_API_KEY_3', 'ELEVENLAB_API_KEY', 'ELEVENLAB_API_KEY_2'].map((k) => env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.replace(/["'\s]/g, '')).filter(Boolean);
let KEY = KEYS[0];
for (const k of KEYS) {
  const u = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': k } }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (u && u.character_limit - u.character_count > 1500) { KEY = k; break; }
}
const VOICE = 'cjVigY5qzO86Huf0OWal'; // Eric: smooth, trustworthy (premade)
const scenes = JSON.parse(readFileSync(new URL('../narration.json', import.meta.url), 'utf8'));
const only = process.argv.slice(2);
for (const [i, s] of scenes.entries()) {
  if (only.length && !only.includes(s.id)) continue;
  const mp3 = new URL(`../public/voice/${s.id}.mp3`, import.meta.url).pathname;
  if (existsSync(mp3) && !only.length) continue;
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ text: s.text, model_id: 'eleven_multilingual_v2', previous_text: scenes[i - 1]?.text, next_text: scenes[i + 1]?.text, voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true, speed: 1.0 } }),
  });
  if (!r.ok) throw new Error(`${s.id}: ${r.status} ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  writeFileSync(mp3, Buffer.from(j.audio_base64, 'base64'));
  // Collapse character timings into words for captions.
  const a = j.alignment;
  const words = [];
  let cur = null;
  a.characters.forEach((ch, k) => {
    if (/\s/.test(ch)) { if (cur) words.push(cur); cur = null; return; }
    if (!cur) cur = { w: '', start: a.character_start_times_seconds[k] };
    cur.w += ch;
    cur.end = a.character_end_times_seconds[k];
  });
  if (cur) words.push(cur);
  const dur = Number(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${mp3}"`).toString());
  writeFileSync(mp3.replace('.mp3', '.json'), JSON.stringify({ id: s.id, duration: dur, words }));
  console.log(s.id, dur.toFixed(2), 's', words.length, 'words');
}
