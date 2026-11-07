// Bundle once, then render many stills: node scripts/stills.mjs 150 454 787 ...
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import path from 'node:path';
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts') });
const composition = await selectComposition({ serveUrl, id: 'YapDemo' });
for (const f of process.argv.slice(2).map(Number)) {
  await renderStill({ serveUrl, composition, frame: f, output: `out/f-${String(f).padStart(4, '0')}.jpg`, imageFormat: 'jpeg', jpegQuality: 70, scale: 0.5 });
  console.log('still', f);
}
