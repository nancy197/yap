// Records real footage of the YAP web app for the video: Chrome screencast frames (JPEG q90, 1920x1080) with a
// visible cursor, smooth scrolling and clicks, assembled into 30 fps MP4 clips in public/clips/.
// Usage: node scripts/record.mjs [clipName...]   (the web app must be running on http://localhost:5180)
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const BASE = process.env.YAP_URL ?? 'http://localhost:5180';
const OUT = path.resolve('public/clips');
const TMP = path.resolve('out/rec');
mkdirSync(OUT, { recursive: true });

// A visible cursor + click ripple, drawn inside the page so the screencast captures it.
const CURSOR = `(() => {
  const add = () => {
    if (document.getElementById('__cur')) return;
    const c = document.createElement('div'); c.id = '__cur';
    c.innerHTML = '<svg width="34" height="34" viewBox="0 0 24 24"><path d="M4 2l15 9-6.5 1.6L9 20z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: 'fixed', left: '0px', top: '0px', zIndex: 2147483647, pointerEvents: 'none', transform: 'translate(-4px,-2px)', filter: 'drop-shadow(0 3px 6px rgba(0,0,0,.5))', transition: 'transform .08s' });
    document.documentElement.appendChild(c);
    addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', (e) => {
      c.style.transform = 'translate(-4px,-2px) scale(.82)';
      const r = document.createElement('div');
      Object.assign(r.style, { position: 'fixed', left: e.clientX - 22 + 'px', top: e.clientY - 22 + 'px', width: '44px', height: '44px', borderRadius: '50%', border: '3px solid #ff8a3d', zIndex: 2147483646, pointerEvents: 'none', transition: 'all .45s ease-out', opacity: '1' });
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = 'scale(2.2)'; r.style.opacity = '0'; });
      setTimeout(() => r.remove(), 500);
    }, true);
    addEventListener('mouseup', () => { c.style.transform = 'translate(-4px,-2px)'; }, true);
  };
  document.readyState === 'loading' ? addEventListener('DOMContentLoaded', add) : add();
})();`;

export async function recordClip(name, fn, { net = 'testnet', wallet = null, warm = null, waitFor = null } = {}) {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--hide-scrollbars', '--window-size=1920,1080'] });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  await ctx.addInitScript(CURSOR);
  await ctx.addInitScript(([n, w]) => {
    try {
      localStorage.setItem('yap-net', n);
      localStorage.setItem('yap-theme', 'dark');
      if (w) localStorage.setItem('yap-wallet-v1', JSON.stringify(w));
    } catch {}
    const z = () => { document.documentElement.style.zoom = '1.3333'; };
    document.readyState === 'loading' ? addEventListener('DOMContentLoaded', z) : z();
  }, [net, wallet]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`[${name}] pageerror`, String(e).slice(0, 160)));
  // Warm up off camera: open the clip's page and wait for its content, so recording starts on a loaded page.
  await page.goto(BASE + '/#/' + (warm ?? ''));
  if (waitFor) await page.waitForSelector(waitFor, { timeout: 60000 }).catch(() => console.log(`[${name}] ${waitFor} not found`));
  await page.waitForTimeout(1500);
  const dir = path.join(TMP, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', async (f) => {
    const file = path.join(dir, `${String(frames.length).padStart(5, '0')}.jpg`);
    writeFileSync(file, Buffer.from(f.data, 'base64'));
    frames.push({ file, t: f.metadata.timestamp });
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  const t0 = Date.now() / 1000;
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  const h = helpers(page);
  await fn(page, h);
  const tEnd = Date.now() / 1000;
  await cdp.send('Page.stopScreencast');
  await browser.close();
  // Variable-rate frames → constant 30 fps clip (each frame shown until the next one arrives).
  const lines = [];
  frames.forEach((fr, i) => {
    const next = frames[i + 1]?.t ?? fr.t + 0.6;
    lines.push(`file '${fr.file}'`, `duration ${Math.max(0.001, next - fr.t).toFixed(4)}`);
  });
  lines.push(`file '${frames.at(-1).file}'`);
  writeFileSync(path.join(dir, 'list.txt'), lines.join('\n'));
  const mp4 = path.join(OUT, `${name}.mp4`);
  execSync(`ffmpeg -y -loglevel error -f concat -safe 0 -i "${path.join(dir, 'list.txt')}" -vf "crop=iw:floor(ih/2)*2:0:0,fps=30,format=yuv420p" -c:v libx264 -crf 16 -preset slow "${mp4}"`);
  const dur = Number(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${mp4}"`).toString());
  console.log(`${name}: ${frames.length} frames over ${(tEnd - t0).toFixed(1)}s → ${mp4} (${dur.toFixed(1)}s)`);
  return dur;
}

function helpers(page) {
  let mx = 960, my = 540;
  const wait = (ms) => page.waitForTimeout(ms);
  const move = async (x, y, ms = 700) => {
    const steps = Math.max(8, Math.round(ms / 16));
    const sx = mx, sy = my;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      await page.mouse.move(sx + (x - sx) * e, sy + (y - sy) * e);
      await wait(ms / steps);
    }
    mx = x; my = y;
  };
  const moveTo = async (selector, ms = 700, dx = 0.5, dy = 0.5) => {
    const el = page.locator(selector).first();
    await el.scrollIntoViewIfNeeded().catch(() => {});
    const b = await el.boundingBox();
    if (!b) throw new Error(`no box for ${selector}`);
    await move(b.x + b.width * dx, b.y + b.height * dy, ms);
  };
  const click = async (selector, ms = 700) => {
    await moveTo(selector, ms);
    await wait(150);
    await page.mouse.down();
    await wait(90);
    await page.mouse.up();
  };
  const scroll = async (dy, ms = 1200) => {
    const steps = Math.max(10, Math.round(ms / 16));
    for (let i = 0; i < steps; i++) {
      await page.mouse.wheel(0, dy / steps);
      await wait(ms / steps);
    }
  };
  const type = async (text, perChar = 45) => {
    for (const ch of text) {
      await page.keyboard.type(ch);
      await wait(perChar);
    }
  };
  const go = async (hash, settle = 2200) => {
    await page.goto(BASE + '/#/' + hash);
    await page.mouse.move(mx, my);
    await wait(settle);
  };
  return { wait, move, moveTo, click, scroll, type, go };
}

// ---------------- clips ----------------
const keys = existsSync('../.keys.json') ? JSON.parse(readFileSync('../.keys.json', 'utf8')) : {};
const asker = 'y15.yap-hq.testnet';
export const CLIPS = {
  mindshare: async (p, h) => {
    await h.go('', 2500);
    await h.move(700, 520, 900);
    await h.move(1149, 420, 900);
    await h.click('.tabs button:has-text("All")');
    await h.wait(1500);
    await h.scroll(820, 1600);
    await h.wait(900);
    await h.move(600, 600, 700);
    await h.scroll(700, 1500);
    await h.wait(1500);
  },
  leaderboard: async (p, h) => {
    await h.go('leaderboard', 2400);
    await h.move(900, 500, 800);
    await h.scroll(300, 900);
    await h.wait(700);
    await h.click('select.in >> nth=0', 600).catch(() => {});
    await p.selectOption('select.in >> nth=0', '#near').catch(() => {});
    await h.wait(2000);
    await h.click('.tbl tbody tr >> nth=0', 900);
    await h.wait(2600);
    await h.moveTo('text=Download Yap card', 800);
    await h.wait(800);
    await h.scroll(650, 1500);
    await h.wait(1500);
  },
  arena: async (p, h) => {
    await h.go('arenas', 2200);
    await h.moveTo('.card >> nth=0', 800);
    await h.wait(700);
    await h.click('a.card >> nth=0', 600);
    await h.wait(2500);
    await h.scroll(400, 1000);
    await h.wait(1200);
  },
  token: async (p, h) => {
    await h.go('token', 3000);
    await h.move(500, 380, 900);
    await h.wait(800);
    await h.moveTo('text=No admin key', 900);
    await h.wait(900);
    await h.scroll(620, 1400);
    await h.move(700, 560, 800);
    await h.wait(1500);
  },
  governance: async (p, h) => {
    await h.go('dao', 3000);
    await h.moveTo('text=Trusted circle', 800);
    await h.wait(900);
    await h.move(1149, 640, 900);
    await h.wait(900);
    await h.scroll(620, 1500);
    await h.move(600, 520, 800);
    await h.wait(1600);
  },
  verify: async (p, h) => {
    await h.go('verify/11', 2400);
    await h.click('text=Recompute & compare', 900);
    await h.wait(3200);
    await h.move(1500, 480, 900);
    await h.wait(1200);
  },
  ask: async (p, h) => {
    await h.wait(600);
    await h.click('textarea', 800);
    await h.type('@yapbot.yap-hq.testnet how am I doing this week?', 38);
    await h.wait(500);
    await h.click('button:has-text("Post")', 700);
    await h.wait(4000);
  },
  reply: async (p, h) => {
    // After yapbot has answered: the feed (already loaded) shows the on-chain reply at the top.
    await h.wait(1000);
    // Newer community posts may sit above it: glide down to yapbot's reply to y15.
    const target = p.locator('.post', { hasText: 'reply to y15.yap-hq.testnet' }).filter({ hasText: 'yapbot' }).first();
    const box = await target.boundingBox().catch(() => null);
    if (box && box.y > 380) await h.scroll(box.y - 330, 1600);
    await h.wait(600);
    await h.move(900, 520, 1200);
    await h.wait(5500);
  },
  mainnet: async (p, h) => {
    await h.go('', 2600);
    await h.click('button:has-text("Mainnet")', 900);
    await h.wait(3500);
    await h.move(800, 560, 900);
    await h.scroll(900, 1800);
    await h.wait(1600);
  },
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const only = process.argv.slice(2);
  for (const [name, fn] of Object.entries(CLIPS)) {
    if (only.length && !only.includes(name)) continue;
    const wallet = ['ask', 'reply'].includes(name) && keys[asker] ? { id: asker, key: keys[asker], kind: 'burner' } : null;
    const warm = { reply: 'feed', ask: 'feed' }[name] ?? null;
    await recordClip(name, fn, { wallet, warm, waitFor: warm ? '.post' : null });
  }
}
