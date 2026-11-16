// Gera a versão publicada do site em dist/ (é o que a Vercel serve).
// public/ continua sendo o código legível, usado no dia a dia e no preview local.
//  - junta e minifica todo o JS (esbuild), sem source maps
//  - embaralha o código do app (javascript-obfuscator); a biblioteca 3D (three.js) só é minificada
//  - minifica o CSS e tira os comentários do HTML
// Lembrete: isso dificulta a leitura no F12, mas nenhum código que roda no navegador fica 100% escondido.
// Segredos (chaves service_role etc.) ficam só na API Python, nunca em public/.
import { build } from 'esbuild';
import JavaScriptObfuscator from 'javascript-obfuscator';
import { cpSync, rmSync, readdirSync, readFileSync, writeFileSync, statSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const SRC = 'public', OUT = 'dist';
const t0 = Date.now();

// Desempenho: todo JS/CSS publicado leva um hash no nome (ex.: main-AB12CD.js). Assim a Vercel
// manda o navegador guardar esses arquivos por 1 ano (vercel.json) e só o index.html é baixado
// de novo a cada visita; quando o código muda, o nome muda e o navegador pega o novo.
const hash = s => createHash('sha256').update(s).digest('base64url').replace(/[-_]/g, '').slice(0, 8).toUpperCase();

rmSync(OUT, { recursive: true, force: true });
// copia tudo (assets, html...) menos js/ e css/, que são gerados abaixo
cpSync(SRC, OUT, { recursive: true, filter: p => !/^public[\\/](js|css)([\\/]|$)/.test(p) });

// bibliotecas de terceiros (three.js, código aberto): vão separadas e só minificadas.
// three.module.min.js primeiro, porque os outros importam ele.
const vendorNames = {};   // 'three.module.min.js' -> 'three.module.min-HASH.js'
mkdirSync(`${OUT}/js/vendor`, { recursive: true });
const vendors = readdirSync(`${SRC}/js/vendor`).filter(f => f.endsWith('.js')).sort((a, b) => (b === 'three.module.min.js') - (a === 'three.module.min.js'));
for (const f of vendors) {
  const r = await build({ entryPoints: [`${SRC}/js/vendor/${f}`], minify: true, sourcemap: false, legalComments: 'none', format: 'esm', write: false, outdir: 'x', logLevel: 'warning' });
  let code = r.outputFiles[0].text;
  for (const [orig, hashed] of Object.entries(vendorNames)) code = code.split(`"./${orig}"`).join(`"./${hashed}"`);
  vendorNames[f] = f.replace(/\.js$/, `-${hash(code)}.js`);
  writeFileSync(`${OUT}/js/vendor/${vendorNames[f]}`, code);
}
cpSync(`${SRC}/js/vendor`, `${OUT}/js/vendor`, { recursive: true, filter: p => !p.endsWith('.js') });
// o app importa './vendor/three.module.min.js'; no build isso vira o nome com hash
const vendorPlugin = { name: 'vendor', setup(b) {
  b.onResolve({ filter: /^\.\/vendor\/[^/]+\.js$/ }, a => {
    const f = a.path.slice('./vendor/'.length);
    if (!vendorNames[f]) throw new Error(`vendor desconhecido: ${f}`);
    return { path: `./vendor/${vendorNames[f]}`, external: true };
  });
} };

// 1) JS: um arquivo de entrada + pedaços carregados sob demanda (o Galpão 3D), tudo minificado
const js = await build({
  entryPoints: { main: `${SRC}/js/main.js` },
  bundle: true, splitting: true, format: 'esm', minify: true,
  sourcemap: false, legalComments: 'none', target: 'es2020',
  outdir: `${OUT}/js`, entryNames: '[name]-[hash]', chunkNames: '[hash]', logLevel: 'warning',
  plugins: [vendorPlugin], metafile: true,
});
const outs = js.metafile.outputs;
const mainOut = Object.keys(outs).find(k => outs[k].entryPoint);
const mainFile = mainOut.split('/').pop();
// pedaços que o main importa logo de cara: o navegador já baixa junto (modulepreload), sem esperar o main
const preload = outs[mainOut].imports.filter(i => i.kind === 'import-statement' && !i.external).map(i => i.path.split('/').pop());

// 2) embaralha os arquivos do app (o vendor/ fica de fora).
// Medido com CPU 4x mais lenta (celular): a codificação base64 das strings, splitStrings e
// numbersToExpressions dobravam o tempo de JS (~330 ms -> ~190 ms sem elas) e o tamanho
// (main 101 KB -> 54 KB com gzip). Continua ilegível: nomes trocados e textos num vetor embaralhado.
for (const f of readdirSync(`${OUT}/js`).filter(f => f.endsWith('.js'))) {
  const fp = join(OUT, 'js', f), code = readFileSync(fp, 'utf8');
  const out = JavaScriptObfuscator.obfuscate(code, {
    target: 'browser', sourceMap: false, seed: 'happy-machine',
    compact: true, simplify: true,
    identifierNamesGenerator: 'mangled-shuffled', renameGlobals: false,
    stringArray: true, stringArrayEncoding: [], stringArrayThreshold: 0.75,
    stringArrayRotate: true, stringArrayShuffle: true, splitStrings: false,
    transformObjectKeys: false, numbersToExpressions: false,
    controlFlowFlattening: false, deadCodeInjection: false,
    // estas opções usam eval/new Function ou travam o DevTools; a CSP do site proíbe eval, então ficam desligadas
    selfDefending: false, debugProtection: false, disableConsoleOutput: false,
  }).getObfuscatedCode();
  writeFileSync(fp, out);
  console.log(`  ${f}: ofuscado (${kb(code)} -> ${kb(out)})`);
}

// 3) CSS minificado, também com hash no nome (as fontes e imagens continuam em /assets)
const css = await build({
  entryPoints: [`${SRC}/css/app.css`], bundle: false, minify: true, sourcemap: false,
  write: false, outdir: `${OUT}/css`, logLevel: 'warning',
});
const cssFile = `app-${hash(css.outputFiles[0].text)}.css`;
mkdirSync(`${OUT}/css`, { recursive: true });
writeFileSync(`${OUT}/css/${cssFile}`, css.outputFiles[0].text);

// 4) HTML sem comentários, com menos espaços e apontando para os arquivos com hash
for (const f of walk(OUT).filter(f => f.endsWith('.html'))) {
  let h = readFileSync(f, 'utf8').replace(/<!--(?!\[if)[\s\S]*?-->/g, '').replace(/\n\s+/g, '\n').replace(/\n{2,}/g, '\n');
  const n = h.length;
  h = h.replace('href="/css/app.css"', `href="/css/${cssFile}"`)
       .replace('<script type="module" src="/js/main.js"></script>',
         preload.map(p => `<link rel="modulepreload" href="/js/${p}">`).join('\n') + (preload.length ? '\n' : '') + `<script type="module" src="/js/${mainFile}"></script>`);
  if (h.includes('/js/main.js') || h.includes('/css/app.css')) throw new Error(`${f}: referência sem hash ficou para trás`);
  if (n === h.length && f.endsWith('index.html')) throw new Error('index.html: não achei o CSS/JS para trocar pelo nome com hash');
  writeFileSync(f, h);
}

console.log(`dist/ pronto em ${((Date.now() - t0) / 1000).toFixed(1)}s`);

function kb(s) { return (s.length / 1024).toFixed(0) + ' KB'; }
function walk(d) { return readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; }); }
