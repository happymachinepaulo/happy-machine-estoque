// Gera a versão publicada do site em dist/ (é o que a Vercel serve).
// public/ continua sendo o código legível, usado no dia a dia e no preview local.
//  - junta e minifica todo o JS (esbuild), sem source maps
//  - embaralha o código do app (javascript-obfuscator); a biblioteca 3D (three.js) só é minificada
//  - minifica o CSS e tira os comentários do HTML
// Lembrete: isso dificulta a leitura no F12, mas nenhum código que roda no navegador fica 100% escondido.
// Segredos (chaves service_role etc.) ficam só na API Python, nunca em public/.
import { build } from 'esbuild';
import JavaScriptObfuscator from 'javascript-obfuscator';
import { cpSync, rmSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'public', OUT = 'dist';
const t0 = Date.now();

rmSync(OUT, { recursive: true, force: true });
// copia tudo (assets, html...) menos js/ e css/, que são gerados abaixo
cpSync(SRC, OUT, { recursive: true, filter: p => !/^public[\\/](js|css)([\\/]|$)/.test(p) });
// bibliotecas de terceiros (three.js, código aberto): vão separadas e só minificadas
for (const f of readdirSync(`${SRC}/js/vendor`).filter(f => f.endsWith('.js')))
  await build({ entryPoints: [`${SRC}/js/vendor/${f}`], minify: true, sourcemap: false, legalComments: 'none', format: 'esm', outfile: `${OUT}/js/vendor/${f}`, logLevel: 'warning' });
cpSync(`${SRC}/js/vendor`, `${OUT}/js/vendor`, { recursive: true, filter: p => !p.endsWith('.js') });

// 1) JS: um arquivo de entrada + pedaços carregados sob demanda (o Galpão 3D), tudo minificado
await build({
  entryPoints: { main: `${SRC}/js/main.js` },
  bundle: true, splitting: true, format: 'esm', minify: true,
  sourcemap: false, legalComments: 'none', target: 'es2020',
  outdir: `${OUT}/js`, chunkNames: '[hash]', logLevel: 'warning',
  external: ['./vendor/*'],
});

// 2) embaralha os arquivos do app (o vendor/ fica de fora)
for (const f of readdirSync(`${OUT}/js`).filter(f => f.endsWith('.js'))) {
  const fp = join(OUT, 'js', f), code = readFileSync(fp, 'utf8');
  const out = JavaScriptObfuscator.obfuscate(code, {
    target: 'browser', sourceMap: false,
    compact: true, simplify: true,
    identifierNamesGenerator: 'hexadecimal', renameGlobals: false,
    stringArray: true, stringArrayEncoding: ['base64'], stringArrayThreshold: 0.75,
    stringArrayRotate: true, stringArrayShuffle: true, splitStrings: true, splitStringsChunkLength: 8,
    transformObjectKeys: false, numbersToExpressions: true,
    controlFlowFlattening: false, deadCodeInjection: false,
    // estas opções usam eval/new Function ou travam o DevTools; a CSP do site proíbe eval, então ficam desligadas
    selfDefending: false, debugProtection: false, disableConsoleOutput: false,
  }).getObfuscatedCode();
  writeFileSync(fp, out);
  console.log(`  ${f}: ofuscado (${kb(code)} -> ${kb(out)})`);
}

// 3) CSS minificado (as fontes e imagens continuam em /assets)
await build({
  entryPoints: [`${SRC}/css/app.css`], bundle: false, minify: true, sourcemap: false,
  outdir: `${OUT}/css`, logLevel: 'warning',
});

// 4) HTML sem comentários e com menos espaços
for (const f of walk(OUT).filter(f => f.endsWith('.html'))) {
  const h = readFileSync(f, 'utf8').replace(/<!--(?!\[if)[\s\S]*?-->/g, '').replace(/\n\s+/g, '\n').replace(/\n{2,}/g, '\n');
  writeFileSync(f, h);
}

console.log(`dist/ pronto em ${((Date.now() - t0) / 1000).toFixed(1)}s`);

function kb(s) { return (s.length / 1024).toFixed(0) + ' KB'; }
function walk(d) { return readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; }); }
