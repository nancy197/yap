// Prints, for each scene, its start frame in the full composition and a few probe frames.
import { readFileSync } from 'node:fs';
const ids = ['hook','title','data','score','meme','trust','kaito','social','bot','verify','proof','close'];
const LEAD = 10, TAIL = 26, TR = 18, FPS = 30;
let start = 0;
for (const id of ids) {
  const d = JSON.parse(readFileSync(`public/voice/${id}.json`, 'utf8')).duration;
  const len = LEAD + Math.ceil(d * FPS) + TAIL;
  console.log(id, start, len, [0.3, 0.6, 0.9].map((p) => start + Math.round(len * p)).join(' '));
  start += len - TR;
}
console.log('total', start + TR);
