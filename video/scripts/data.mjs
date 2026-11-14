// Pulls real numbers for the video from the published epochs, tx log, sim and mainnet files.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
const R = (p) => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'));
const pub = 'web/public/epochs/testnet';
const idx = R(`${pub}/index.json`);
const ids = Object.keys(idx.epochs).map(Number).sort((a, b) => a - b);
const epochs = ids.map((e) => ({ e, ...idx.epochs[e] }));
// Latest published epoch that actually had yappers (dead epochs publish empty score files).
// Pinned to the v2 epoch the recorded clips show (override with VIDEO_EPOCH); otherwise the latest with yappers.
const latestId = process.env.VIDEO_EPOCH === 'latest' ? ids.filter((e) => existsSync(new URL(`../../${pub}/${e}/scores.json`, import.meta.url)) && R(`${pub}/${e}/scores.json`).result.yappers.length > 0).at(-1) : Number(process.env.VIDEO_EPOCH ?? 12);
const latest = R(`${pub}/${latestId}/scores.json`);
const ds = R(`${pub}/${latestId}/dataset.json`);
const labels = R(`${pub}/${latestId}/labels.json`);
const text = new Map(ds.posts.map((p) => [p.key, p.text]));
const name = (a) => {
  const n = { y01: 'Mira Builds', y02: 'Kofi Intents', y03: 'Lena Agents', y04: 'Tomas DAO', y05: 'Aiko Data', y06: 'Ravi Wallets', y07: 'Nina Charts', y08: 'Diego Degen', y09: 'Sam LP', y10: 'Yuki Macro', y11: 'YAP Frog', y12: 'Burn Bot Cat', y13: 'Hana Pixels', y14: 'Omar Sound', y15: 'New Nora', y16: 'gm bot 1', y17: 'gm bot 2', y18: 'gm bot 3', y19: 'gm bot 4', y20: 'Ring A', y21: 'Ring B', y22: 'Ring C', y23: 'Ring D', y24: 'Ring E', y25: 'Ivy Validators', y26: 'Raj Wallets', y27: 'Sofia Data', y28: 'Ben Shade', y29: 'Nadia Pixels', y30: 'Leo Learns', y31: 'Ama DAO Ops', y32: 'Yuki Intents', y33: 'Omar Memes', y34: 'Grace Agents' };
  return n[a.split('.')[0]] ?? a.split('.')[0];
};
const tot = latest.result.yappers.reduce((n, y) => n + Number(y.score), 0);
const yappers = latest.result.yappers.slice(0, 14).map((y) => ({ account: y.account, name: name(y.account), share: Number(y.score) / tot, score: Number(y.score) / 1e6, tier: y.tier, smart: y.smartFollowers }));
const topics = latest.result.mindshare.slice(0, 12).map((t) => ({ topic: t.topic, share: Number(t.share) / 1e6 }));
const sample = (q, prefer) => labels.details.filter((d) => d.q === q && text.get(d.key)).sort((a, b) => Number(prefer(b.key)) - Number(prefer(a.key))).slice(0, 3).map((d) => ({ who: name(d.key.split('/')[0]), text: text.get(d.key).slice(0, 140), reason: d.reason }));
const txs = R('deploy/transactions.json');
const pick = (re) => txs.filter((t) => re.test(t.action)).map((t) => ({ action: t.action, hash: t.hash }));
const sim = R('web/public/sim.json');
const series = (k, f) => sim.scenarios[k].map((r) => r[f]);
const mean = (k, d) => sim.scenarios[k].reduce((n, r) => n + r.defences[d], 0) / sim.scenarios[k].length;
const main = R('data/mainnet-sample/scores.json');
const mtot = main.result.yappers.reduce((n, y) => n + Number(y.score), 0);
const facts = existsSync(new URL('../../data/video-facts.json', import.meta.url)) ? R('data/video-facts.json') : null;
const yb = existsSync(new URL('../../data/yapbot-replies.json', import.meta.url)) ? R('data/yapbot-replies.json') : [];
// Proof of Yap (token4): the first jackpot, with its real contribution split.
const p4 = 'web/public/epochs/token4';
const p4dir = new URL(`../../${p4}/`, import.meta.url);
const jp = existsSync(p4dir)
  ? readdirSync(p4dir).filter((d) => /^\d+$/.test(d)).map(Number).sort((a, b) => a - b)
      .map((e) => existsSync(new URL(`${e}/scores.json`, p4dir)) ? { e, s: R(`${p4}/${e}/scores.json`) } : null)
      .find((x) => x?.s.result.jackpot)
  : null;
const jackpot = jp ? (() => {
  const j = jp.s.result.jackpot;
  const payout = Number(BigInt(j.payout) / 10n ** 15n) / 1000;
  const shares = Object.entries(j.shares).map(([a, v]) => ({ name: name(a), amount: Number(BigInt(v) / 10n ** 15n) / 1000 })).sort((a, b) => b.amount - a.amount);
  return { block: j.block, tick: jp.e, ticks: (jp.s.scoreParams?.jackpot?.earlier?.length ?? 0) + 1, payout, contributors: shares.length, top: shares.slice(0, 6) };
})() : null;
const data = {
  token: 'token4.yap-hq.testnet', dao: 'dao.yap-hq.testnet', steward: 'steward4.yap-hq.testnet',
  latestEpoch: latestId, epochs, yappers, topics,
  labels: { spam: sample(0, (k) => /^y1[6-9]/.test(k)), low: sample(1, (k) => /^y2/.test(k)), insight: sample(3, (k) => /^y0[3-5]/.test(k)) },
  tx: { deploy: pick(/deploy token|init token|delete full-access key \(lock\)$/), finalize: pick(/^finalize/), tampered: pick(/TAMPERED/), challenge: pick(/^challenge e/), vote: pick(/VoteApprove proposal 5/), resubmit: pick(/resubmit/), steward: pick(/steward (promote|grant)|ChangePolicy/), arena: pick(/fund arena|proposal 0/) },
  sim: { steady: series('steady', 'supply'), hype: series('hype-then-fade', 'supply'), dead: series('dead-meme', 'vault'), deadSupply: series('dead-meme', 'supply'), spam: { none: mean('spam-farm', 'none'), all: mean('spam-farm', 'all') }, ring: { none: mean('like-ring', 'none'), all: mean('like-ring', 'all') } },
  mainnet: { yappers: main.result.yappers.slice(0, 12).map((y) => ({ account: y.account, share: Number(y.score) / mtot })), count: main.result.yappers.length, posts: R('data/mainnet-sample/dataset.json').posts.length },
  yapbot: yb,
  jackpot,
  trust: facts ? { epoch: facts.challenge.epoch, proposal: facts.challenge.proposal_id, bad: Number(R(`${pub}/${facts.challenge.epoch}/tampered.json`).report.attention) / 1e6, good: Number(facts.ep11.report.attention) / 1e6, badRoot: R(`${pub}/${facts.challenge.epoch}/tampered.json`).report.yappers_root, goodRoot: facts.ep11.report.yappers_root } : null,
  dao_balance: facts ? Number(BigInt(facts.dao) / 10n ** 18n) : 247020,
  members: facts ? facts.members.map((m) => m[0]) : [],
  grantProposal: facts?.grants?.[0]?.proposal ?? 4,
  streak: facts ? { now: facts.state.streak, best: facts.state.best_streak } : null,
  dataset: { posts: ds.posts.length, likes: ds.likes.length, reposts: ds.reposts.length, follows: ds.follows.length, hash: ds.dataHash },
};
writeFileSync(new URL('../src/data.json', import.meta.url), JSON.stringify(data, null, 1));
console.log('epochs', epochs.length, 'latest', latestId, 'yappers', yappers.length, 'tx groups', Object.fromEntries(Object.entries(data.tx).map(([k, v]) => [k, v.length])));
