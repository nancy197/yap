// SIMULATED COMMUNITY: 24 bot accounts that write real near.social data on testnet (FastData KV on `social`).
// Honest personas post AI-written text and engage; 4 spam bots flood low-effort posts; a 5-account ring likes and
// follows only itself. The receipt of every `__fastdata_kv` call fails with CodeDoesNotExist by design (no contract
// on `social`); the FastData indexer still stores the data, which we confirm by reading kv.test.fastnear.com.
// Usage: pnpm seed --setup | --loud | --quiet | --burst N
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { actions, type Account } from 'near-api-js';
import { chatJson } from './providers/nearai.ts';
import { HQ, ROOT, loadEnv, subAccount, signer, sleep, explorer } from './common.ts';

export const KV = 'https://kv.test.fastnear.com';
type Kind = 'builder' | 'trader' | 'meme' | 'artist' | 'newbie' | 'spam' | 'ring';
type Persona = { id: string; name: string; kind: Kind; about: string; voice: string; tags: string[] };
const P = (n: number, name: string, kind: Kind, about: string, voice: string, tags: string[]): Persona => ({ id: `y${String(n).padStart(2, '0')}.${HQ}`, name, kind, about, voice, tags });
export const PERSONAS: Persona[] = [
  P(1, 'Mira Builds', 'builder', 'Rust + NEAR contracts. Shipping in public.', 'precise engineer who shares concrete numbers and code-level details', ['#near', '#rust', '#fastdata']),
  P(2, 'Kofi Intents', 'builder', 'Cross-chain swaps with NEAR Intents.', 'practical builder explaining intents flows and solver behaviour', ['#intents', '#near', '#chainabstraction']),
  P(3, 'Lena Agents', 'builder', 'AI agents with TEE-verified inference.', 'thoughtful researcher on verifiable AI and agents', ['#nearai', '#agents', '#tee']),
  P(4, 'Tomas DAO', 'builder', 'Sputnik DAO tooling and treasury ops.', 'governance nerd who writes about DAO proposals and treasuries', ['#sputnik', '#trezu', '#dao']),
  P(5, 'Aiko Data', 'builder', 'Indexers and onchain analytics.', 'data analyst who posts small charts-in-words and stats', ['#fastdata', '#analytics', '#near']),
  P(6, 'Ravi Wallets', 'builder', 'Wallet UX and chain signatures.', 'UX-focused dev complaining and proposing fixes', ['#wallets', '#chainsignatures', '#near']),
  P(7, 'Nina Charts', 'trader', 'Spot only. Mostly $NEAR.', 'calm trader posting levels and reasoning, no hype', ['$NEAR', '#rhea', '$YAP']),
  P(8, 'Diego Degen', 'trader', 'Memecoins and vibes.', 'energetic memecoin trader, funny but informative', ['#memecooking', '$YAP', '#memecoins']),
  P(9, 'Sam LP', 'trader', 'LPing on Rhea.', 'liquidity provider sharing pool yields and IL math', ['#rhea', '$NEAR', '#defi']),
  P(10, 'Yuki Macro', 'trader', 'Macro takes, crypto cycles.', 'macro commentator linking news to crypto', ['$NEAR', '#macro', '#crypto']),
  P(11, 'YAP Frog', 'meme', 'ribbit. yap or burn.', 'meme account writing short witty jokes about yapping and burns', ['$YAP', '#yap', '#memes']),
  P(12, 'Burn Bot Cat', 'meme', 'I eat quiet epochs.', 'cat persona joking about the streak and quiet-epoch burns', ['$YAP', '#yap', '#streak']),
  P(13, 'Hana Pixels', 'artist', 'Pixel art on NEAR.', 'artist describing new pieces and process', ['#nearart', '#pixelart', '#nfts']),
  P(14, 'Omar Sound', 'artist', 'Music on near.fm.', 'musician sharing tracks and production notes', ['#nearfm', '#music', '#near']),
  P(15, 'New Nora', 'newbie', 'Week 1 on NEAR.', 'curious newcomer asking honest questions', ['#near', '#learning', '$YAP']),
  P(16, 'gm bot 1', 'spam', '🚀🚀🚀', 'spam', ['$YAP']),
  P(17, 'gm bot 2', 'spam', '🚀🚀🚀', 'spam', ['$YAP']),
  P(18, 'gm bot 3', 'spam', '🚀🚀🚀', 'spam', ['$YAP']),
  P(19, 'gm bot 4', 'spam', '🚀🚀🚀', 'spam', ['$YAP']),
  P(20, 'Ring A', 'ring', 'Alpha group', 'generic upbeat crypto commentator', ['$YAP', '#near']),
  P(21, 'Ring B', 'ring', 'Alpha group', 'generic upbeat crypto commentator', ['$YAP', '#near']),
  P(22, 'Ring C', 'ring', 'Alpha group', 'generic upbeat crypto commentator', ['$YAP', '#near']),
  P(23, 'Ring D', 'ring', 'Alpha group', 'generic upbeat crypto commentator', ['$YAP', '#near']),
  P(24, 'Ring E', 'ring', 'Alpha group', 'generic upbeat crypto commentator', ['$YAP', '#near']),
];
const organic = PERSONAS.filter((p) => !['spam', 'ring'].includes(p.kind));
const ring = PERSONAS.filter((p) => p.kind === 'ring');
const spam = PERSONAS.filter((p) => p.kind === 'spam');

// Deterministic PRNG so a run can be reproduced from its seed.
let seed = Number(process.env.SEED ?? Date.now() % 1e9);
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)]!;
const LOG = resolve(ROOT, 'data/seed-log.jsonl');

/** One `__fastdata_kv` write. Returns the tx hash; the receipt failure is expected. */
export async function kvWrite(acc: Account, args: Record<string, unknown>): Promise<string> {
  const r: any = await acc.signAndSendTransaction({ receiverId: 'social', actions: [actions.functionCall('__fastdata_kv', args, 1n, 0n)], throwOnFailure: false } as never);
  const hash = r?.transaction?.hash ?? r?.transaction_outcome?.id ?? '';
  await mkdir(resolve(ROOT, 'data'), { recursive: true });
  await writeFile(LOG, JSON.stringify({ at: new Date().toISOString(), account: acc.accountId, keys: Object.keys(args), hash }) + '\n', { flag: 'a' });
  return hash;
}
let lastId = 0;
const postId = () => (lastId = Math.max(Date.now(), lastId + 1));

/** Recent testnet posts (any author) from the public FastData KV API. */
export async function recentPosts(limit = 60): Promise<{ key: string; author: string; text: string }[]> {
  const r = await fetch(`${KV}/v0/latest/social`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key_prefix: 'post/', limit: 200 }) });
  const j: any = await r.json();
  return (j.entries ?? [])
    .filter((e: any) => e.value?.text && e.predecessor_id?.endsWith(`.${HQ}`))
    .sort((a: any, b: any) => b.block_height - a.block_height)
    .slice(0, limit)
    .map((e: any) => ({ key: `${e.predecessor_id}/${e.key.slice(5)}`, author: e.predecessor_id, text: e.value.text }));
}

const CACHE = resolve(ROOT, 'data/seed-cache');
let aiCalls = 0;
let aiFailed = false;
/** Persona-written posts and replies from a NEAR AI model (cached); falls back to templates if the call fails. */
async function write(p: Persona, n: number, context: { key: string; text: string }[]): Promise<{ posts: string[]; replies: { to: string; text: string }[]; ai: boolean }> {
  const ctx = context.filter((c) => !c.key.startsWith(p.id)).slice(0, 8);
  const sys = `You write posts for a simulated social-network persona on NEAR (a demo community, clearly labelled as simulated). Persona: ${p.name}. Bio: ${p.about}. Voice: ${p.voice}. Return JSON {"posts": string[], "replies": [{"to": string, "text": string}]}. Posts: ${n} distinct posts, 1-3 sentences each, under 280 chars, each including one or two of these tags: ${p.tags.join(' ')}. No links. Replies: up to 2 short replies to the given posts (use their "key" as "to"), only if you have something specific to add.`;
  const user = JSON.stringify({ recent_posts: ctx });
  const key = createHash('sha256').update(sys + user).digest('hex');
  const file = resolve(CACHE, `${key}.json`);
  if (existsSync(file)) return { ...JSON.parse(await readFile(file, 'utf8')), ai: true };
  if (!aiFailed && process.env.NEARAI_API_KEY) {
    try {
      const r = await chatJson('z-ai/glm-5.3-flash', sys, user, 0.9);
      aiCalls++;
      const j = JSON.parse(r.content);
      const out = { posts: (j.posts ?? []).map(String).slice(0, n), replies: (j.replies ?? []).filter((x: any) => ctx.some((c) => c.key === x.to)).slice(0, 2) };
      await mkdir(CACHE, { recursive: true });
      await writeFile(file, JSON.stringify(out));
      return { ...out, ai: true };
    } catch (e) {
      console.warn(`AI generation failed, using templates: ${String(e).slice(0, 120)}`);
    }
  }
  const t = [`Working on something new around ${p.tags[0]} today.`, `Notes from this week in ${p.tags[1] ?? p.tags[0]}: small wins, more tests.`, `Question for the timeline: what is the best resource for ${p.tags[0]}?`];
  return { posts: Array.from({ length: n }, (_, i) => t[i % t.length]!), replies: [], ai: false };
}

async function setup() {
  for (const p of PERSONAS) {
    const acc = await subAccount(p.id.split('.')[0]!, 50);
    const st = await fetch(`${KV}/v0/latest/social/${p.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key_prefix: 'profile/' }) }).then((r) => r.json() as any);
    if (!(st.entries ?? []).length) {
      const h = await kvWrite(acc, { 'profile/name': p.name, 'profile/about': `${p.about} (simulated $YAP demo persona)` });
      console.log(`profile ${p.id} ${explorer(h)}`);
    }
  }
  // Follow graph: organic accounts follow builders and some peers; spam follows everyone; the ring follows itself.
  for (const p of PERSONAS) {
    const acc = await signer(p.id);
    let targets: Persona[] = [];
    if (p.kind === 'spam') targets = PERSONAS.filter((x) => x.id !== p.id);
    else if (p.kind === 'ring') targets = ring.filter((x) => x.id !== p.id);
    else targets = organic.filter((x) => x.id !== p.id && (x.kind === 'builder' || rnd() < 0.45));
    const args = Object.fromEntries(targets.map((t) => [`graph/follow/${t.id}`, {}]));
    const h = await kvWrite(acc, args);
    console.log(`follows ${p.id} -> ${targets.length} ${explorer(h)}`);
  }
}

/** One round of activity. loud: everyone active; quiet: a couple of organic posts only. */
async function round(mode: 'loud' | 'quiet') {
  const before = await recentPosts();
  let wrote = 0;
  const active = mode === 'loud' ? organic : organic.filter(() => rnd() < 0.15).slice(0, 2);
  // Generate every persona's text in parallel first (AI calls are the slow part), then write.
  const gens = await Promise.all(active.map((p) => write(p, 1, before)));
  const ringGens = mode === 'loud' ? await Promise.all(ring.map((p) => write(p, 1, []))) : [];
  for (const [i, p] of active.entries()) {
    const acc = await signer(p.id);
    const g = gens[i]!;
    const args: Record<string, unknown> = {};
    for (const text of g.posts) args[`post/${postId()}`] = { text };
    for (const r of g.replies) {
      const target = before.find((b) => b.key === r.to);
      if (!target) continue;
      const id = postId();
      args[`post/${id}`] = { text: r.text, reply_to: r.to, root: r.to };
      args[`reply/${r.to}/${id}`] = {};
    }
    // Organic engagement: like a few posts from others, prefer builders/artists; repost one now and then.
    if (mode === 'loud') {
      for (const b of before.filter((b) => b.author !== p.id && !spam.some((s) => s.id === b.author) && !ring.some((x) => x.id === b.author))) if (rnd() < 0.3) args[`like/${b.key}`] = {};
      const rp = before.filter((b) => b.author !== p.id && organic.some((o) => o.id === b.author));
      if (rp.length && rnd() < 0.25) args[`repost/${pick(rp).key}`] = {};
    }
    const h = await kvWrite(acc, args);
    wrote += Object.keys(args).length;
    console.log(`${p.id} ${Object.keys(args).length} writes (${g.ai ? 'AI' : 'template'}) ${explorer(h)}`);
  }
  if (mode === 'loud' && rnd() < 0.35) {
    // Now and then a persona asks @yapbot how they (or a friend) are doing; the bot replies on near.social.
    const p = pick(organic);
    const friend = pick(organic.filter((o) => o.id !== p.id));
    const text = rnd() < 0.6 ? `@yapbot.${HQ} how am I doing? Anything I should change?` : `@yapbot.${HQ} how is @${friend.id} doing this week?`;
    const h = await kvWrite(await signer(p.id), { [`post/${postId()}`]: { text } });
    console.log(`${p.id} asked yapbot ${explorer(h)}`);
  }
  if (mode === 'loud') {
    // Spam bots: low-effort repetitive posts and blind likes on each other.
    for (const p of spam) {
      const acc = await signer(p.id);
      const args: Record<string, unknown> = {};
      for (let i = 0; i < 3; i++) args[`post/${postId()}`] = { text: pick(['gm $YAP 🚀🚀', '$YAP to the moon!!!', 'yap yap yap $YAP 🚀', 'LFG $YAP 100x', 'gm gm $YAP']) };
      for (const b of before.filter((b) => spam.some((s) => s.id === b.author) && b.author !== p.id).slice(0, 12)) args[`like/${b.key}`] = {};
      const h = await kvWrite(acc, args);
      wrote += Object.keys(args).length;
      console.log(`${p.id} spam ${Object.keys(args).length} writes ${explorer(h)}`);
    }
    // Ring: decent-looking posts, then every ring member likes and reposts every other member's posts.
    for (const [i, p] of ring.entries()) {
      const acc = await signer(p.id);
      const g = ringGens[i]!;
      const args: Record<string, unknown> = {};
      for (const text of g.posts) args[`post/${postId()}`] = { text };
      for (const b of before.filter((b) => ring.some((r) => r.id === b.author) && b.author !== p.id)) {
        args[`like/${b.key}`] = {};
        args[`repost/${b.key}`] = {};
      }
      const h = await kvWrite(acc, args);
      wrote += Object.keys(args).length;
      console.log(`${p.id} ring ${Object.keys(args).length} writes ${explorer(h)}`);
    }
  }
  return wrote;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await loadEnv();
  const a = process.argv;
  if (a.includes('--setup')) await setup();
  if (a.includes('--loud')) console.log(`loud round: ${await round('loud')} writes`);
  if (a.includes('--quiet')) console.log(`quiet round: ${await round('quiet')} writes`);
  const bi = a.indexOf('--burst');
  if (bi > 0) {
    const n = Number(a[bi + 1] ?? 2);
    for (let i = 0; i < n; i++) {
      console.log(`burst ${i + 1}/${n}: ${await round('loud')} writes`);
      if (i < n - 1) await sleep(60_000);
    }
  }
  console.log(`AI calls: ${aiCalls}${aiFailed ? ' (fell back to templates)' : ''}`);
}
