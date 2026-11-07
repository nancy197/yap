// Drives the SIMULATED community on a schedule: two loud rounds per epoch, except planned quiet epochs
// (one tiny round) so the demo shows both the streak and a quiet-epoch burn. Usage: pnpm crowd [--quiet-every N]
import { spawnSync } from 'node:child_process';
import { view, TOKEN, sleep } from './common.ts';
const cfg: any = await view(TOKEN, 'get_config');
const quietEvery = Number(process.argv[process.argv.indexOf('--quiet-every') + 1]) || 6;
const QUIET = new Set([2]);
const isQuiet = (e: number) => QUIET.has(e) || (e > 2 && e % quietEvery === 2);
const done = new Set<string>();
for (;;) {
  const t = Date.now() / 1000 - cfg.genesis_ts;
  const e = Math.floor(t / cfg.epoch_secs);
  const into = t - e * cfg.epoch_secs;
  if (e >= 0) {
    const slots = isQuiet(e) ? [120] : [60, 300];
    for (const s of slots) {
      const k = `${e}:${s}`;
      if (into >= s && into < cfg.epoch_secs - 45 && !done.has(k)) {
        done.add(k);
        const mode = isQuiet(e) ? '--quiet' : '--loud';
        console.log(new Date().toISOString(), `epoch ${e} ${mode}`);
        spawnSync('npx', ['tsx', 'seed.ts', mode], { stdio: 'inherit' });
      }
    }
  }
  await sleep(15_000);
}
