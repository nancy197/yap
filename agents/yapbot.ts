// @yapbot: an AI agent that lives on near.social. Mention it ("@yapbot.yap-hq.testnet how am I doing?") and it
// replies on chain with your Yap score, why (each post's AI label and reason), who engaged, your tier and what it
// takes to reach the Trusted circle. Facts come only from the published epoch files and the contracts; the model
// (TEE-attested on NEAR AI Cloud) only turns them into a short, friendly reply.
// Usage: pnpm yapbot [--since-min 60]
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { chatJson, fetchAttestation } from './providers/nearai.ts';
import { kvWrite } from './seed.ts';
import { ROOT, HQ, TOKEN, view, signer, subAccount, sleep, loadEnv } from './common.ts';

export const BOT = `yapbot.${HQ}`;
const STEWARD = `steward2.${HQ}`;
const MODEL = 'Qwen/Qwen3.8-27B';
const PUBLIC = resolve(ROOT, 'web/public/epochs/testnet');
const STATE = resolve(ROOT, 'data/yapbot-state.json');
const TIER = ['None', 'Bronze', 'Silver', 'Gold', 'Inner Circle'];
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sc = (x: string | number) => Number(x) / 1e6;
const yapAmt = (raw: string | bigint) => Number(BigInt(raw) / 10n ** 15n) / 1000;

type State = { since: string; answered: string[] };
async function loadState(sinceMin: number): Promise<State> {
  if (existsSync(STATE)) return JSON.parse(await readFile(STATE, 'utf8'));
  return { since: String(BigInt(Date.now() - sinceMin * 60_000) * 1_000_000n), answered: [] };
}

async function json(file: string) {
  return existsSync(file) ? JSON.parse(await readFile(file, 'utf8')) : null;
}

/** Everything the bot may say about `account`, computed from published files and on-chain views. */
async function facts(account: string) {
  const idx = await json(resolve(PUBLIC, 'index.json'));
  const ids = Object.keys(idx?.epochs ?? {}).map(Number).sort((a, b) => a - b);
  const recent = ids.slice(-6);
  const history: { epoch: number; score: number; rank: number | null; of: number; tier: number; earnedYap: number }[] = [];
  let latest: any = null;
  let latestEpoch = -1;
  for (const e of recent) {
    const s = await json(resolve(PUBLIC, String(e), 'scores.json'));
    if (!s) continue;
    const ys: any[] = s.result.yappers;
    const i = ys.findIndex((y) => y.account === account);
    history.push({ epoch: e, score: i >= 0 ? +sc(ys[i].score).toFixed(2) : 0, rank: i >= 0 ? i + 1 : null, of: ys.length, tier: i >= 0 ? ys[i].tier : 0, earnedYap: i >= 0 ? yapAmt(ys[i].amount) : 0 });
    latest = s;
    latestEpoch = e;
  }
  if (!latest) return null;
  const me = latest.result.yappers.find((y: any) => y.account === account);
  // Posts from the latest epoch with their labels and the labeler's one-line reasons.
  const labels = await json(resolve(PUBLIC, String(latestEpoch), 'labels.json'));
  const dataset = await json(resolve(PUBLIC, String(latestEpoch), 'dataset.json'));
  const reason = new Map<string, string>((labels?.details ?? []).map((d: any) => [d.key, d.reason]));
  const text = new Map<string, string>((dataset?.posts ?? []).map((p: any) => [p.key, p.text]));
  const posts = (me?.posts ?? []).map((p: any) => ({ q: p.q, score: +sc(p.score).toFixed(2), text: (text.get(p.key) ?? '').slice(0, 120), labelerReason: reason.get(p.key) ?? '' }));
  const engagedBy = (dataset?.likes ?? []).concat(dataset?.reposts ?? []).filter((x: any) => x.to.startsWith(`${account}/`)).map((x: any) => x.from);
  const smart = new Set<string>(latest.result.smartAccounts ?? []);
  // Gold = top 10% by trailing score; the weakest Gold+ total is the bar to beat.
  const trailing = (a: string) => (latest.trailing?.[a] ?? []).slice(-29).reduce((n: number, x: string) => n + sc(x), 0) + sc(latest.result.yappers.find((y: any) => y.account === a)?.score ?? 0);
  const gold = latest.result.yappers.filter((y: any) => y.tier >= 3).map((y: any) => trailing(y.account));
  const bar = gold.length ? Math.min(...gold) : null;
  const member: any = await view(STEWARD, 'get_member', { account }).catch(() => null);
  const cur: number = await view(STEWARD, 'current_epoch').catch(() => latestEpoch);
  const bal: string = await view(TOKEN, 'ft_balance_of', { account_id: account }).catch(() => '0');
  return {
    account,
    latestEpoch,
    history,
    tier: TIER[me?.tier ?? 0],
    smartFollowers: me?.smartFollowers ?? 0,
    postsScored: posts,
    engagedByCount: engagedBy.length,
    engagedBySmart: engagedBy.filter((a: string) => smart.has(a)).length,
    trailingTotal: +trailing(account).toFixed(2),
    goldBar: bar === null ? null : +bar.toFixed(2),
    trustedCircle: member ? { member: true, untilEpoch: member.expires_epoch, active: member.expires_epoch >= cur } : { member: false },
    yapBalance: yapAmt(bal),
    rules: 'Score per post = quality label weight (q0=0, q1=0.25, q2=1, q3=2) x (1 + ln(1 + weighted engagement)). Your best 10 posts count. Engagement from smart (top-20% PageRank) and staked accounts weighs more. No smart followers and no stake halves the score. Gold+ joins the DAO trusted circle and can send small treasury grants.',
  };
}

const SYSTEM = `You are yapbot, the YAP assistant on near.social (NEAR testnet). Someone asked how they (or another account) are doing.
Write ONE reply of at most 480 characters, plain text, friendly and specific. Use ONLY the JSON facts given: never invent numbers.
Cover: latest Yap score and rank, the tier, the main reason (quote the labeler's reason briefly if useful), and ONE concrete tip
(e.g. more specific posts, engage with smart accounts, stake YAP, distance to the Gold bar for the Trusted circle).
No hashtags. No links. Return JSON {"reply": string}.`;

async function answer(question: { key: string; author: string; text: string }) {
  const mentioned = [...question.text.matchAll(/@([a-z0-9._-]+\.(?:testnet|near))/g)].map((m) => m[1]!).filter((a) => a !== BOT);
  const target = mentioned[0] ?? question.author;
  const f = await facts(target);
  let reply: string;
  if (!f || (!f.history.some((h) => h.score > 0) && !f.trustedCircle.member)) {
    reply = `${target === question.author ? 'You have' : `${target} has`} no Yap score yet. Post something specific on near.social (testnet), reply to builders, and get likes from accounts with followers: the next 10-minute epoch will score it. Spam and generic hype score zero.`;
  } else {
    const r = await chatJson(MODEL, SYSTEM, JSON.stringify({ question: question.text.slice(0, 300), asker: question.author, facts: f }), 0.2);
    reply = String(JSON.parse(r.content.slice(r.content.indexOf('{'), r.content.lastIndexOf('}') + 1)).reply ?? '').slice(0, 520);
    if (!reply) throw new Error('empty reply');
  }
  const footer = `\n\n(yapbot · ${MODEL.split('/')[1]} in a verified TEE · data: epoch #${f?.latestEpoch ?? '-'})`;
  const id = Date.now();
  const bot = await signer(BOT);
  const h = await kvWrite(bot, { [`post/${id}`]: { text: reply + footer, reply_to: question.key, root: question.key }, [`reply/${question.key}/${id}`]: {} });
  log(`replied to ${question.key} about ${target}: ${h}`);
}

await loadEnv();
const sinceMin = Number(process.argv[process.argv.indexOf('--since-min') + 1]) || 60;
const st = await loadState(sinceMin);
// The bot's own account and profile.
await subAccount('yapbot', 200);
if (!st.answered.length) {
  await kvWrite(await signer(BOT), { 'profile/name': 'yapbot', 'profile/about': 'Ask me how you are doing on YAP: mention @yapbot.yap-hq.testnet. I read your scores from the published epochs and reply with an AI model running in a verified TEE (NEAR AI Cloud).' });
}
let att = await fetchAttestation(MODEL);
let attAt = Date.now();
log(`yapbot ${BOT} up · TEE attestation ${att.verified ? 'verified' : 'FAILED'} (${att.checks.length} checks)`);
for (;;) {
  try {
    if (Date.now() - attAt > 3_600_000) {
      att = await fetchAttestation(MODEL);
      attAt = Date.now();
      log(`re-attested: ${att.verified}`);
    }
    if (!att.verified) throw new Error('model attestation failed; not answering');
    // Only look back 30 minutes (answered keys stop duplicates), so each scan stays small.
    const floor = BigInt(Date.now() - 30 * 60_000) * 1_000_000n;
    if (BigInt(st.since) < floor) st.since = String(floor);
    const found: { key: string; author: string; text: string; ts: string }[] = [];
    // FastData history is not time-ordered, so scan the latest value of every post key (a few pages) and filter.
    let token: string | undefined;
    do {
      const r = await fetch('https://kv.test.fastnear.com/v0/latest/social', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key_prefix: 'post/', limit: 200, ...(token ? { page_token: token } : {}) }) });
      const text = (await r.text()).replace(/("block_timestamp"\s*:\s*)(\d+)/g, '$1"$2"');
      const page = JSON.parse(text) as { entries: any[]; page_token?: string };
      for (const e of page.entries ?? []) {
        if (BigInt(e.block_timestamp) < BigInt(st.since) || e.predecessor_id === BOT) continue;
        const v = e.value;
        if (typeof v?.text !== 'string' || !v.text.includes(`@${BOT}`)) continue;
        const key = `${e.predecessor_id}/${e.key.slice(5)}`;
        if (!st.answered.includes(key)) found.push({ key, author: e.predecessor_id, text: v.text, ts: e.block_timestamp });
      }
      token = page.page_token;
    } while (token);
    found.sort((a, b) => (BigInt(a.ts) < BigInt(b.ts) ? 1 : -1));
    for (const q of found.reverse()) {
      try {
        await answer(q);
      } catch (err) {
        log(`answer ${q.key} failed: ${String(err).slice(0, 200)}`);
      }
      st.answered.push(q.key);
      st.answered = st.answered.slice(-500);
      await writeFile(STATE, JSON.stringify(st));
    }
  } catch (err) {
    log(`error: ${String(err).slice(0, 200)}`);
  }
  await sleep(15_000);
}
