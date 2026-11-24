// Build The PDF Tool:
//   dist/folio.html            — one self-contained file (works offline, double-click to open)
//   dist/artifact/*            — the same app split into files for hosting
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';

const root = path.dirname(new URL(import.meta.url).pathname);
const r = p => path.join(root, p);
const nm = p => r('node_modules/' + p);
const gzb64 = buf => zlib.gzipSync(buf, { level: 9 }).toString('base64');

// 1. vendor bundles (pdf.js, pdf-lib, fflate) and the pdf.js worker
fs.mkdirSync(r('vendor-build'), { recursive: true });
const esb = r('node_modules/.bin/esbuild');
execFileSync(esb, [r('src/vendor-entry.js'), '--bundle', '--minify', '--format=iife', '--target=es2022', '--log-level=error', '--outfile=' + r('vendor-build/vendor.min.js')]);
execFileSync(esb, [nm('pdfjs-dist/build/pdf.worker.mjs'), '--minify', '--format=iife', '--target=es2022', '--log-level=error', '--outfile=' + r('vendor-build/worker.min.js')]);
const vendor = fs.readFileSync(r('vendor-build/vendor.min.js'));
const worker = fs.readFileSync(r('vendor-build/worker.min.js'));

// 2. data: character maps, symbol fonts, jbig2 decoder
const assets = {};
for (const f of fs.readdirSync(nm('pdfjs-dist/cmaps'))) if (f.endsWith('.bcmap')) assets['cmaps/' + f] = fs.readFileSync(nm('pdfjs-dist/cmaps/' + f)).toString('base64');
for (const f of ['FoxitSymbol.pfb', 'FoxitDingbats.pfb']) assets['fonts/' + f] = fs.readFileSync(nm('pdfjs-dist/standard_fonts/' + f)).toString('base64');
assets['wasm/jbig2.wasm'] = fs.readFileSync(nm('pdfjs-dist/wasm/jbig2.wasm')).toString('base64');
const assetsJson = JSON.stringify(assets);

// 3. signature fonts as data URIs
const font = (fam, file) => `@font-face{font-family:'${fam}';src:url(data:font/woff2;base64,${fs.readFileSync(nm(file)).toString('base64')}) format('woff2');font-display:swap}`;
const fonts = [
  font('folio-dancing', '@fontsource/dancing-script/files/dancing-script-latin-500-normal.woff2'),
  font('folio-vibes', '@fontsource/great-vibes/files/great-vibes-latin-400-normal.woff2'),
  font('folio-caveat', '@fontsource/caveat/files/caveat-latin-600-normal.woff2'),
].join('\n');

// 4. app
const css = fs.readFileSync(r('src/style.css'), 'utf8');
const js = fs.readdirSync(r('src/js')).filter(f => f.endsWith('.js')).sort().map(f => `// ==== ${f} ====\n` + fs.readFileSync(r('src/js/' + f), 'utf8')).join('\n');
if (/<\/script/i.test(js)) throw new Error('app code contains </script');
const boot = (vendorLoader) => `(async () => {
${vendorLoader}
(function () {
'use strict';
${js}
})();
})().catch(e => { console.error(e); document.getElementById('view').textContent = 'The PDF Tool could not start: ' + (e && e.message || e); });`;
const standaloneLoader = `  if (!window.pdfjsLib) {
    const b = Uint8Array.from(atob(document.getElementById('folio-vendor').textContent.trim()), c => c.charCodeAt(0));
    const code = await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    const s = document.createElement('script'); s.textContent = code; document.head.append(s);
  }`;
const tpl = fs.readFileSync(r('src/index.html'), 'utf8');
const fill = (vendorTag, dataTags, loader) => tpl.replace('/*FONTS*/', () => fonts).replace('/*CSS*/', () => css)
  .replace('<!--VENDOR-->', () => vendorTag).replace('<!--DATA-->', () => dataTags).replace('/*BOOT*/', () => boot(loader));

fs.mkdirSync(r('dist/artifact'), { recursive: true });
const standalone = fill(
  `<script type="text/plain" id="folio-vendor">${gzb64(vendor)}</script>`,
  `<script type="text/plain" id="folio-worker">${gzb64(worker)}</script>\n<script type="text/plain" id="folio-assets">${gzb64(Buffer.from(assetsJson))}</script>`,
  standaloneLoader);
fs.writeFileSync(r('dist/folio.html'), standalone);

fs.writeFileSync(r('dist/artifact/index.html'), fill('<script src="vendor.js"></script>', '', ''));
fs.writeFileSync(r('dist/artifact/vendor.js'), vendor);
fs.writeFileSync(r('dist/artifact/pdf.worker.js'), worker);
fs.writeFileSync(r('dist/artifact/assets.json'), assetsJson);

// 5. PWA assets for the hosted artifact (manifest, service worker, icons)
fs.copyFileSync(r('src/manifest.webmanifest'), r('dist/artifact/manifest.webmanifest'));
fs.copyFileSync(r('src/sw.js'), r('dist/artifact/sw.js'));
fs.mkdirSync(r('dist/artifact/icons'), { recursive: true });
for (const f of fs.readdirSync(r('src/icons'))) {
  fs.copyFileSync(r('src/icons/' + f), r('dist/artifact/icons/' + f));
}

const kb = n => (n / 1024).toFixed(0) + ' KB';
console.log('dist/folio.html', kb(standalone.length));
const list = (dir, prefix) => {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) list(p, prefix + f.name + '/');
    else console.log(prefix + f.name, kb(fs.statSync(p).size));
  }
};
list(r('dist/artifact'), 'dist/artifact/');
console.log('app code', kb(js.length), 'css', kb(css.length));
