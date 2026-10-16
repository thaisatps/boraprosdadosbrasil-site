#!/usr/bin/env node
/* gen_instagram.js — carrosséis do Instagram a partir dos cards do próprio site.
 *
 * Os slides de conteúdo são os cards do charts.js (BPD.cardPNG, formato 'feed' 1080×1350), desenhados com as
 * MESMAS defs que o site usa (public/assets/js/cards-home.js e cards-balanco.js), dentro das páginas do dist/
 * servidas localmente. Capa e contracapa são HTML no mesmo estilo (fonte Inter do site, paleta do site).
 *
 * Uso (na raiz do repositório):
 *   SITE_URL=https://boraprosdadosbrasil.netlify.app python3 scripts/build.py      # gera dist/
 *   npm i --no-save playwright && npx playwright install chromium                 # 1ª vez
 *   node scripts/gen_instagram.js [AAAA-MM-DD]                                     # padrão: data de hoje
 * Saída: social/instagram/<data>/{governos,promessas}/NN.png + legenda.txt, e social/instagram/<data>/contato.png
 * Variáveis opcionais: PLAYWRIGHT_PATH (caminho do pacote playwright), SITE_HOST (texto do link nas imagens).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
let pw;
try { pw = require(process.env.PLAYWRIGHT_PATH || 'playwright'); } catch (e) {
  console.error('Playwright não encontrado. Rode: npm i --no-save playwright && npx playwright install chromium (ou defina PLAYWRIGHT_PATH).');
  process.exit(1);
}

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const DATA = process.argv[2] || new Date().toISOString().slice(0, 10);
const OUT = path.join(ROOT, 'social', 'instagram', DATA);
const HOST = process.env.SITE_HOST || 'boraprosdadosbrasil.netlify.app';
const ATUALIZADO = DATA.split('-').reverse().join('/');
const LIMITE_KB = 500;

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/ não existe. Rode antes: SITE_URL=https://' + HOST + ' python3 scripts/build.py');
  process.exit(1);
}

/* ---------- carrosséis: ordem fixa (a do placar no site), definida antes de olhar o vencedor ---------- */
const GOVERNOS = {
  pasta: 'governos', pagina: '/', defs: 'CARDS_HOME',
  slides: [
    { capa: 'governos', ancora: 'resumo', sintese: 'resumo' },
    { card: 'q-crescimento', ancora: 'q-crescimento', valores: ['1,4%', '3,0%'] },
    { card: 'q-inflacao', ancora: 'q-inflacao', valores: ['6,1%', '4,6%'] },
    { card: 'q-desemprego', ancora: 'q-emprego', valores: ['12,3%', '6,6%'] },
    { card: 'q-protecao', ancora: 'q-protecao-social', valores: ['188,1', '293,5'] },
    { card: 'q-gasto', ancora: 'q-gasto', valores: ['2,67', '3,02'] },
    { card: 'q-divida', ancora: 'q-divida', valores: ['3,6', '11,2'] },
    { card: 'q-juros', ancora: 'q-juros', valores: ['5,0%', '7,5%'] },
    { card: 'q-selic', ancora: 'q-selic', valores: ['6,5%', '12,9%'] },
    { contracapa: 'governos', ancora: 'apendice' }
  ]
};
const PROMESSAS = {
  pasta: 'promessas', pagina: '/balanco/', defs: 'CARDS_BALANCO',
  slides: [
    { capa: 'promessas', ancora: 'resumo' },
    { card: 'b-tres', ancora: 'resumo', valores: ['15,2%', '35,3%', '22,7%', '38,7%', '27,3%', '50,0%'] },
    { card: 'b-bolso', ancora: 'cap-bolso' },
    { card: 'b-servicos', ancora: 'cap-servicos' },
    { card: 'b-estado', ancora: 'cap-estado' },
    { card: 'b-seguranca', ancora: 'cap-seguranca' },
    { contracapa: 'promessas', ancora: 'metodo' }
  ]
};

/* ---------- legendas (≤ 2.200 caracteres; hashtags só de tema e fonte; sem pedir voto) ---------- */
const LEGENDAS = {
  governos: [
    'Governo Bolsonaro (2019–2022) × Governo Lula (2023–2025): onde cada um ficou à frente, com a mesma régua para os dois lados e só dados oficiais (IBGE, Banco Central e Tesouro Nacional).',
    '',
    'Economia e renda: à frente o Governo Lula (crescimento, inflação, emprego e proteção social).',
    'Contas públicas: à frente o Governo Bolsonaro (controle do gasto, dívida pública e conta de juros).',
    'Selic (juro básico): contexto, não conta ponto.',
    '',
    'Em 3 quesitos a diferença é apertada (inflação, proteção social e controle do gasto), e cada imagem diz o que mudaria o resultado. Cada imagem traz os dois números, o período, a regra usada e a fonte.',
    '',
    'Arraste para ver os 8 cards. Números, ressalvas e método completos: ' + HOST + '/#resumo (link na bio). Os arquivos originais, com SHA-256, estão em ' + HOST + '/fontes/',
    '',
    'Dados até ago/set de 2026 · atualizado em ' + ATUALIZADO + '. Conteúdo informativo, com a mesma regra para os dois lados.',
    '',
    '#dadosabertos #economia #IBGE #BancoCentral #TesouroNacional'
  ].join('\n'),
  promessas: [
    'Promessas de governo: quanto do plano cada governo cumpriu. Governo Bolsonaro (plano de 2018, mandato encerrado) × Governo Lula (plano de 2022, mandato em curso, corte em 30/09/2026).',
    '',
    'Três jeitos de contar, com o mesmo peso:',
    '• Cumpridas, sobre o total: 15,2% × 35,3%',
    '• Só as verificáveis (sem "sem evidência oficial"): 22,7% × 38,7%',
    '• Cumpridas + parciais: 27,3% × 50,0%',
    '',
    'Por tema: Impostos e trabalho, Proteção social, saúde e educação, Segurança, ambiente e instituições com o Governo Lula à frente; Estado e infraestrutura com o Governo Bolsonaro à frente.',
    '',
    'Os planos têm tamanhos diferentes (33 × 34 promessas): compare a porcentagem, não a quantidade. "Sem evidência oficial" não é descumprimento, e "não cumprida" fica fora do veredito porque um dos mandatos ainda está em curso.',
    '',
    'Cada promessa, com o trecho do plano registrado no TSE e a prova oficial: ' + HOST + '/balanco/ (link na bio).',
    '',
    'Atualizado em ' + ATUALIZADO + '. Conteúdo informativo, com a mesma regra para os dois lados.',
    '',
    '#dadosabertos #TSE #transparencia #planodegoverno #promessas'
  ].join('\n')
};

/* ---------- capa e contracapa (HTML, Inter do site, paleta do site) ---------- */
const CSS = `
@font-face{font-family:'InterVar';src:url('/assets/fonts/inter-latin-var.woff2') format('woff2');font-weight:100 900}
*{box-sizing:border-box;margin:0}
body{width:1080px;height:1350px;background:#f7f7f8;font-family:'InterVar',sans-serif;color:#18181b;-webkit-font-smoothing:antialiased}
.s{position:relative;width:1080px;height:1350px;padding:72px 72px 64px;display:flex;flex-direction:column}
.marca{font-size:24px;font-weight:800;letter-spacing:.14em;color:#52525b}
h1{font-size:64px;line-height:1.08;letter-spacing:-.02em;font-weight:800;margin-top:28px}
h1 .b{color:#1479B0}h1 .l{color:#7250FB}
.sub{font-size:32px;line-height:1.35;color:#3f3f46;margin-top:24px;font-weight:500}
.lados{display:flex;gap:24px;margin-top:44px}
.lado{flex:1;background:#fff;border:2px solid #e4e4e7;border-radius:24px;padding:28px 30px}
.lado .n{display:flex;align-items:center;gap:14px;font-size:32px;font-weight:800}
.lado p{font-size:26px;color:#52525b;margin-top:10px;line-height:1.35}
.mk{display:inline-block;width:22px;height:22px;flex:0 0 auto}.mk.b{border-radius:50%;background:#1479B0}.mk.l{background:#7250FB}
ul{list-style:none;padding:0;margin-top:36px}
li{font-size:29px;line-height:1.38;color:#27272a;padding:0 0 20px 34px;position:relative}
li::before{content:"";position:absolute;left:0;top:15px;width:12px;height:12px;border-radius:3px;background:#a1a1aa}
li b{font-weight:700}
.arraste{margin-top:auto;font-size:30px;font-weight:700;color:#18181b}
.pe{margin-top:28px;padding-top:22px;border-top:2px solid #e4e4e7;font-size:24px;line-height:1.45;color:#52525b}
.pe b{color:#18181b}
.sint{flex:1;display:flex;justify-content:center;align-items:flex-start;margin-top:28px;min-height:0}
.sint img{height:100%;max-height:1010px;border-radius:20px;box-shadow:0 2px 0 #e4e4e7,0 8px 28px rgba(0,0,0,.06)}
`;
function pe(fonte, ancoraUrl) {
  return `<div class="pe">Fonte: ${fonte}<br><b>${HOST}${ancoraUrl}</b> · atualizado em ${ATUALIZADO}</div>`;
}
const PAGINAS_HTML = {
  'capa-governos': (img) => `<div class="s">
    <div class="marca">BORA PROS DADOS BRASIL</div>
    <h1><span class="b">Governo Bolsonaro</span> ×<br><span class="l">Governo Lula</span></h1>
    <p class="sub">7 quesitos, a mesma régua para os dois lados, só dados oficiais. Arraste para ver cada um →</p>
    <div class="sint"><img alt="" src="${img}"></div></div>`,
  'contracapa-governos': () => `<div class="s">
    <div class="marca">BORA PROS DADOS BRASIL</div>
    <h1>Como calculamos</h1>
    <ul>
      <li><b>Mesma régua para os dois governos:</b> a média de cada governo, 2019–2022 × 2023–2025. Dívida: dez/2018–dez/2022 × dez/2022–ago/2026 (parcial).</li>
      <li><b>Sem a inflação:</b> valores em reais corrigidos pelo IPCA (R$ de dez/2025).</li>
      <li><b>"Apertada":</b> vence por pouco ou depende da métrica. Cada card diz o que mudaria o resultado.</li>
      <li><b>Selic:</b> contexto, não conta ponto.</li>
      <li><b>Arquivos originais</b> de cada número, com impressão digital SHA-256, em ${HOST}/fontes/</li>
    </ul>
    <p class="arraste">Números, ressalvas e método completos no site.</p>
    ${pe('IBGE, Banco Central e Tesouro Nacional (SICONFI e RTN) · conteúdo informativo, com a mesma regra para os dois lados', '/#apendice')}</div>`,
  'capa-promessas': () => `<div class="s">
    <div class="marca">BORA PROS DADOS BRASIL</div>
    <h1>Promessas de governo: quanto do plano cada um cumpriu</h1>
    <p class="sub">Item a item, com o trecho do plano registrado no TSE e prova em fonte oficial.</p>
    <div class="lados">
      <div class="lado"><div class="n"><i class="mk b"></i>Governo Bolsonaro</div><p>plano de 2018 · 33 promessas verificáveis · mandato encerrado</p></div>
      <div class="lado"><div class="n"><i class="mk l"></i>Governo Lula</div><p>plano de 2022 · 34 promessas verificáveis · em curso, corte em 30/09/2026</p></div>
    </div>
    <p class="sub" style="margin-top:40px">Três jeitos de contar, com o mesmo peso, e um card por tema.</p>
    <p class="arraste">Arraste →</p>
    ${pe('planos de governo registrados no TSE (2018 e 2022) e vereditos só em fontes oficiais', '/balanco/#resumo')}</div>`,
  'contracapa-promessas': () => `<div class="s">
    <div class="marca">BORA PROS DADOS BRASIL</div>
    <h1>Como classificamos</h1>
    <ul>
      <li><b>As mesmas cinco categorias para os dois planos:</b> cumprida, parcial, em andamento, não cumprida e sem evidência oficial.</li>
      <li><b>Só promessas verificáveis</b> do plano registrado no TSE, com o trecho literal e a página.</li>
      <li><b>Prova só em fonte oficial</b> (Diário Oficial, Planalto, Congresso, órgãos federais).</li>
      <li><b>Compare a porcentagem, não a quantidade:</b> os planos têm tamanhos diferentes (33 × 34).</li>
      <li><b>"Sem evidência oficial" não é descumprimento.</b> "Não cumprida" fica fora do veredito: o mandato de Lula está em curso (corte em 30/09/2026).</li>
    </ul>
    <p class="arraste">Todas as 67 promessas, com detalhes, no site.</p>
    ${pe('planos de governo registrados no TSE (2018 e 2022) · conteúdo informativo, com a mesma regra para os dois lados', '/balanco/#metodo')}</div>`
};

/* ---------- servidor estático do dist/ + páginas de capa ---------- */
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.txt': 'text/plain' };
const VIRTUAIS = {};
function servidor() {
  return new Promise((ok) => {
    const s = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      if (VIRTUAIS[u]) { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(VIRTUAIS[u]); return; }
      let f = path.join(DIST, u.endsWith('/') ? u + 'index.html' : u);
      if (!f.startsWith(DIST)) { r.writeHead(403); r.end(); return; }
      fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': TIPOS[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
    });
    s.listen(0, '127.0.0.1', () => ok(s));
  });
}

/* ---------- no navegador: card do site → PNG + textos (para conferir números e sobreposição) ---------- */
async function cardDoSite(page, defsVar, id, url) {
  return page.evaluate(async ({ defsVar, id, url }) => {
    const L = window[defsVar] || [];
    const orig = L.filter((d) => d.id === id)[0];
    if (!orig) throw new Error('def não encontrada: ' + id);
    const d = {}; for (const k in orig) d[k] = orig[k];
    if (d.id === 'resumo' && d.grafico) {   /* igual à home: blocos na ordem do placar (Economia e renda → Contas públicas) */
      const gr = {}; for (const k in d.grafico) gr[k] = d.grafico[k];
      gr.manterOrdem = true;
      gr.grupos = (gr.grupos || []).slice().sort((a, b) => (a.vencedor === 'l' ? 0 : 1) - (b.vencedor === 'l' ? 0 : 1));
      d.grafico = gr;
    }
    d.url = url;
    /* textos do card no formato feed (mesma função de desenho do PNG) para as conferências */
    const box = document.createElement('div'); box.style.cssText = 'position:absolute;left:0;top:0;width:1080px'; document.body.appendChild(box);
    const svg = BPD.card(box, d, 'feed'); svg.style.width = '1080px'; svg.style.maxWidth = 'none';
    const sr = svg.getBoundingClientRect();
    const ts = [...svg.querySelectorAll('text')].map((t) => ({ t: t.textContent, r: t.getBoundingClientRect() })).filter((o) => o.r.width > 0);
    const prob = [];
    for (let i = 0; i < ts.length; i++) {
      const a = ts[i].r;
      if (a.left < sr.left - 1 || a.right > sr.right + 1 || a.top < sr.top - 1 || a.bottom > sr.bottom + 1) prob.push('FORA: ' + ts[i].t);
      for (let j = i + 1; j < ts.length; j++) {
        const c = ts[j].r, ox = Math.min(a.right, c.right) - Math.max(a.left, c.left), oy = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
        if (ox > 4 && oy > 8) prob.push('"' + ts[i].t + '" × "' + ts[j].t + '"');
      }
    }
    const texto = ts.map((o) => o.t).join(' ');
    document.body.removeChild(box);
    const blob = await BPD.cardPNG(d, 'feed');
    const b64 = await new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
    return { b64, texto, prob };
  }, { defsVar, id, url });
}

function tamanhoPNG(buf) { return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }; }

(async () => {
  const srv = await servidor();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  const relatorio = []; let falhas = 0;
  const todas = [];

  for (const car of [GOVERNOS, PROMESSAS]) {
    const dir = path.join(OUT, car.pasta); fs.mkdirSync(dir, { recursive: true });
    for (const f of fs.readdirSync(dir)) if (/^\d\d\.png$/.test(f)) fs.unlinkSync(path.join(dir, f));
    const page = await ctx.newPage();
    const erros = []; page.on('pageerror', (e) => erros.push(e.message));
    await page.goto(base + car.pagina, { waitUntil: 'networkidle' });
    await page.waitForFunction((v) => window.BPD && window.BPD.cardPNG && window[v] && window[v].length, car.defs);
    await page.evaluate(() => BPD.carregarFonte());
    const textoPagina = await page.evaluate(() => document.body.innerText);

    for (let i = 0; i < car.slides.length; i++) {
      const sl = car.slides[i], nome = String(i + 1).padStart(2, '0') + '.png', destino = path.join(dir, nome);
      const url = HOST + car.pagina + '#' + sl.ancora;
      let buf, obs = [];
      if (sl.card) {
        const r = await cardDoSite(page, car.defs, sl.card, url);
        buf = Buffer.from(r.b64, 'base64');
        if (r.prob.length) { falhas++; obs.push('SOBREPOSIÇÃO: ' + r.prob.join(' | ')); }
        for (const v of sl.valores || []) {
          if (r.texto.indexOf(v) < 0) { falhas++; obs.push('valor ausente no card: ' + v); }
          if (textoPagina.indexOf(v) < 0) { falhas++; obs.push('valor ausente na página: ' + v); }
        }
        if (r.texto.indexOf(url) < 0) { falhas++; obs.push('URL da seção ausente no card'); }
        if (!/Fonte/.test(r.texto) || r.texto.indexOf('atualizado em') < 0) { falhas++; obs.push('fonte/data ausente'); }
      } else {
        const chave = sl.capa ? 'capa-' + sl.capa : 'contracapa-' + sl.contracapa;
        let img = '';
        if (sl.sintese) { const r = await cardDoSite(page, car.defs, sl.sintese, url); img = 'data:image/png;base64,' + r.b64; if (r.prob.length) { falhas++; obs.push('SOBREPOSIÇÃO (síntese): ' + r.prob.join(' | ')); } }
        VIRTUAIS['/__ig/' + chave] = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>' + CSS + '</style></head><body>' + PAGINAS_HTML[chave](img) + '</body></html>';
        const p2 = await ctx.newPage();
        await p2.goto(base + '/__ig/' + chave, { waitUntil: 'networkidle' });
        await p2.evaluate(() => document.fonts.ready);
        const prob = await p2.evaluate(() => {          /* blocos de texto que se sobrepõem ou saem do slide */
          const els = [...document.querySelectorAll('.marca,h1,.sub,.lado,li,.arraste,.pe,.sint img')].map((e) => ({ t: (e.textContent || 'img').slice(0, 30), r: e.getBoundingClientRect() }));
          const out = [];
          for (let i = 0; i < els.length; i++) {
            const a = els[i].r; if (a.bottom > 1350 || a.right > 1080) out.push('FORA: ' + els[i].t);
            for (let j = i + 1; j < els.length; j++) { const c = els[j].r; const ox = Math.min(a.right, c.right) - Math.max(a.left, c.left), oy = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top); if (ox > 2 && oy > 2) out.push('"' + els[i].t + '" × "' + els[j].t + '"'); }
          }
          return out;
        });
        if (prob.length) { falhas++; obs.push('SOBREPOSIÇÃO: ' + prob.join(' | ')); }
        buf = await p2.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1080, height: 1350 } });
        await p2.close();
      }
      fs.writeFileSync(destino, buf);
      const t = tamanhoPNG(buf), kb = Math.round(buf.length / 1024);
      if (t.w !== 1080 || t.h !== 1350) { falhas++; obs.push('tamanho ' + t.w + '×' + t.h); }
      if (kb > LIMITE_KB) obs.push('aviso: ' + kb + ' KB (> ' + LIMITE_KB + ')');
      relatorio.push(car.pasta + '/' + nome + '  ' + t.w + '×' + t.h + '  ' + kb + ' KB  ' + (sl.card || (sl.capa ? 'capa' : 'contracapa')) + '  ' + url + (obs.length ? '\n    ' + obs.join('\n    ') : ''));
      todas.push({ car: car.pasta, nome, b64: buf.toString('base64') });
    }
    if (erros.length) { falhas++; relatorio.push('ERROS de JS em ' + car.pagina + ': ' + erros.join(' ; ')); }
    await page.close();

    const leg = LEGENDAS[car.pasta];
    if (leg.length > 2200) { falhas++; relatorio.push('legenda ' + car.pasta + ' com ' + leg.length + ' caracteres'); }
    if (/\bvot(e|a|o|ar|em)\b/i.test(leg)) { falhas++; relatorio.push('legenda ' + car.pasta + ' com palavra proibida'); }
    fs.writeFileSync(path.join(dir, 'legenda.txt'), leg + '\n');
    relatorio.push(car.pasta + '/legenda.txt  ' + leg.length + ' caracteres');
  }

  /* folha de contato: todos os slides em miniatura, na ordem */
  const linhas = ['governos', 'promessas'].map((c) => '<h2>' + c + '</h2><div class="g">' +
    todas.filter((x) => x.car === c).map((x) => '<figure><img src="data:image/png;base64,' + x.b64 + '"><figcaption>' + x.nome + '</figcaption></figure>').join('') + '</div>').join('');
  VIRTUAIS['/__ig/contato'] = '<!doctype html><html><head><meta charset="utf-8"><style>@font-face{font-family:InterVar;src:url(/assets/fonts/inter-latin-var.woff2)}' +
    'body{margin:0;padding:24px;background:#f4f4f5;font-family:InterVar,sans-serif;width:1240px}h2{font-size:22px;margin:8px 0 12px;text-transform:uppercase;letter-spacing:.08em;color:#3f3f46}' +
    '.g{display:grid;grid-template-columns:repeat(5,232px);gap:12px;margin-bottom:24px}figure{margin:0}img{width:232px;height:290px;display:block;border:1px solid #d4d4d8;background:#fff}' +
    'figcaption{font-size:14px;color:#52525b;margin-top:4px}</style></head><body>' + linhas + '</body></html>';
  const pc = await ctx.newPage();
  await pc.goto(base + '/__ig/contato', { waitUntil: 'networkidle' });
  await pc.screenshot({ path: path.join(OUT, 'contato.png'), fullPage: true });
  await pc.close();

  await browser.close(); srv.close();
  console.log(relatorio.join('\n'));
  console.log(falhas ? '\n' + falhas + ' problema(s) encontrado(s)' : '\nok: todos os slides 1080×1350, sem sobreposição, números conferidos com a página');
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
