// Pulls real numbers for the video from the published epochs, tx log, sim and mainnet files.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const R = (p) => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'));
const pub = 'web/public/epochs/testnet';
const idx = R(`${pub}/index.json`);
const ids = Object.keys(idx.epochs).map(Number).sort((a, b) => a - b);
const epochs = ids.map((e) => ({ e, ...idx.epochs[e] }));
const latestId = ids.filter((e) => existsSync(new URL(`../../${pub}/${e}/scores.json`, import.meta.url))).at(-1);
const latest = R(`${pub}/${latestId}/scores.json`);
const ds = R(`${pub}/${latestId}/dataset.json`);
const labels = R(`${pub}/${latestId}/labels.json`);
const text = new Map(ds.posts.map((p) => [p.key, p.text]));
const name = (a) => {
  const n = { y01: 'Mira Builds', y02: 'Kofi Intents', y03: 'Lena Agents', y04: 'Tomas DAO', y05: 'Aiko Data', y06: 'Ravi Wallets', y07: 'Nina Charts', y08: 'Diego Degen', y09: 'Sam LP', y10: 'Yuki Macro', y11: 'YAP Frog', y12: 'Burn Bot Cat', y13: 'Hana Pixels', y14: 'Omar Sound', y15: 'New Nora', y16: 'gm bot 1', y17: 'gm bot 2', y18: 'gm bot 3', y19: 'gm bot 4', y20: 'Ring A', y21: 'Ring B', y22: 'Ring C', y23: 'Ring D', y24: 'Ring E' };
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
const yb = existsSync(new URL('../../data/yapbot-replies.json', import.meta.url)) ? R('data/yapbot-replies.json') : [];
const data = {
  token: 'token.yap-hq.testnet', dao: 'dao.yap-hq.testnet', steward: 'steward.yap-hq.testnet',
  latestEpoch: latestId, epochs, yappers, topics,
  labels: { spam: sample(0, (k) => /^y1[6-9]/.test(k)), low: sample(1, (k) => /^y2/.test(k)), insight: sample(3, (k) => /^y0[3-5]/.test(k)) },
  tx: { deploy: pick(/deploy token|init token|delete full-access key \(lock\)$/), finalize: pick(/^finalize/), tampered: pick(/TAMPERED/), challenge: pick(/^challenge e/), vote: pick(/VoteApprove proposal 5/), resubmit: pick(/resubmit/), steward: pick(/steward (promote|grant)|ChangePolicy/), arena: pick(/fund arena|proposal 0/) },
  sim: { steady: series('steady', 'supply'), hype: series('hype-then-fade', 'supply'), dead: series('dead-meme', 'reserve'), deadSupply: series('dead-meme', 'supply'), spam: { none: mean('spam-farm', 'none'), all: mean('spam-farm', 'all') }, ring: { none: mean('like-ring', 'none'), all: mean('like-ring', 'all') } },
  mainnet: { yappers: main.result.yappers.slice(0, 12).map((y) => ({ account: y.account, share: Number(y.score) / mtot })), count: main.result.yappers.length, posts: R('data/mainnet-sample/dataset.json').posts.length },
  yapbot: yb,
};
writeFileSync(new URL('../src/data.json', import.meta.url), JSON.stringify(data, null, 1));
console.log('epochs', epochs.length, 'latest', latestId, 'yappers', yappers.length, 'tx groups', Object.fromEntries(Object.entries(data.tx).map(([k, v]) => [k, v.length])));
