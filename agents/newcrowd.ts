// Ten more SIMULATED demo personas (y25..y34.yap-hq.testnet) to speed up block #1 on testnet.
// Their profiles say "(simulated $YAP demo persona)", exactly like the original 24; nothing here pretends to be a
// real user. Usage: tsx newcrowd.ts setup | round
import { createHash } from 'node:crypto';
import { chatJson } from './providers/nearai.ts';
import { HQ, loadEnv, subAccount, signer, explorer } from './common.ts';
import { kvWrite, recentPosts, PERSONAS } from './seed.ts';

type P = { n: number; name: string; about: string; voice: string; tags: string[] };
const NEW: P[] = [
  { n: 25, name: 'Ivy Validators', about: 'Runs a NEAR testnet validator.', voice: 'calm operator sharing uptime numbers and node tips', tags: ['#near', '#validators'] },
  { n: 26, name: 'Raj Wallets', about: 'Wallet UX on NEAR.', voice: 'product person comparing wallet flows with concrete steps', tags: ['#wallets', '#near'] },
  { n: 27, name: 'Sofia Data', about: 'Dashboards on FastData KV.', voice: 'analyst who posts small stats from near.social data', tags: ['#fastdata', '#analytics'] },
  { n: 28, name: 'Ben Shade', about: 'Privacy and TEEs.', voice: 'security engineer explaining attestation in plain words', tags: ['#tee', '#nearai'] },
  { n: 29, name: 'Nadia Pixels', about: 'Pixel art for memecoins.', voice: 'artist describing what she is drawing for the $YAP jackpot', tags: ['$YAP', '#art'] },
  { n: 30, name: 'Leo Learns', about: 'First month on NEAR.', voice: 'curious newcomer asking good questions and sharing what clicked', tags: ['#near', '#newbie'] },
  { n: 31, name: 'Ama DAO Ops', about: 'Treasury ops for small DAOs.', voice: 'practical DAO operator writing about proposals and budgets', tags: ['#sputnik', '#dao'] },
  { n: 32, name: 'Yuki Intents', about: 'Solver experiments.', voice: 'builder sharing intent settlement experiments', tags: ['#intents', '#chainabstraction'] },
  { n: 33, name: 'Omar Memes', about: 'Professional yapper.', voice: 'funny meme poster hyping how close the community is to popping the jackpot', tags: ['$YAP', '#yap', '#jackpot'] },
  { n: 34, name: 'Grace Agents', about: 'Agents that pay their own way.', voice: 'agent builder sharing what her agent did today', tags: ['#agents', '#nearai'] },
];
const id = (p: P) => `y${p.n}.${HQ}`;
const postId = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

async function setup() {
  const builders = PERSONAS.filter((p) => p.kind === 'builder').map((p) => p.id);
  for (const p of NEW) {
    const acc = await subAccount(`y${p.n}`, 150);
    const follows = Object.fromEntries([...builders, ...NEW.filter((x) => x.n !== p.n).map(id)].map((t) => [`graph/follow/${t}`, {}]));
    const h = await kvWrite(acc, { 'profile/name': p.name, 'profile/about': `${p.about} (simulated $YAP demo persona)`, ...follows });
    console.log(`${id(p)} profile + ${Object.keys(follows).length} follows ${explorer(h)}`);
  }
  // Two established builders follow the newcomers back, so they are not stuck with zero smart followers.
  for (const b of builders.slice(0, 2)) {
    const h = await kvWrite(await signer(b), Object.fromEntries(NEW.map((p) => [`graph/follow/${id(p)}`, {}])));
    console.log(`${b} follows the newcomers ${explorer(h)}`);
  }
}

async function text(p: P, context: { key: string; text: string }[]): Promise<string[]> {
  const sys = `You write posts for a simulated social-network persona on NEAR testnet (a demo community, clearly labelled as simulated). Persona: ${p.name}. Bio: ${p.about}. Voice: ${p.voice}. Return JSON {"posts": string[]} with 2 distinct posts, 1-3 sentences each, under 280 chars, each including one of these tags: ${p.tags.join(' ')}. Be specific, no links, no hashtags spam.`;
  try {
    const r = await chatJson('z-ai/glm-5.3-flash', sys, JSON.stringify({ seed: createHash('sha256').update(postId()).digest('hex').slice(0, 8), recent: context.slice(0, 5).map((c) => c.text) }), 0.9);
    return (JSON.parse(r.content).posts ?? []).map(String).slice(0, 2);
  } catch {
    return [`Small update from ${p.name}: working on ${p.tags[0]} today, notes soon.`];
  }
}

async function round() {
  const before = await recentPosts();
  const gens = await Promise.all(NEW.map((p) => text(p, before)));
  for (const [i, p] of NEW.entries()) {
    const args: Record<string, unknown> = {};
    for (const t of gens[i]!) args[`post/${postId()}`] = { text: t };
    for (const b of before.filter((b) => b.author !== id(p)).slice(0, 12)) if (Math.random() < 0.35) args[`like/${b.key}`] = {};
    const h = await kvWrite(await signer(id(p)), args);
    console.log(`${id(p)} ${Object.keys(args).length} writes ${explorer(h)}`);
  }
}

await loadEnv();
const cmd = process.argv[2];
if (cmd === 'setup') await setup();
else if (cmd === 'round') await round();
else console.log('usage: newcrowd.ts setup | round');
