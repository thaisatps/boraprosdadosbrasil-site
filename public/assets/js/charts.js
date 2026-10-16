/*!
 * charts.js · "Bora pros dados Brasil" · linguagem visual "quem ganha"
 * Biblioteca mínima, sem dependências (ES5), que desenha SVG nítido e acessível.
 *
 *   BPD.placar(el, opts)        quantas comparações cada lado vence (1 bloco = 1 vitória, mesmo tamanho)
 *   BPD.duelo(el, opts)         um indicador, dois valores, vencedor marcado no próprio gráfico
 *   BPD.trajetoria(el, opts)    série temporal com faixas de governo e anotações diretas
 *   BPD.distribuicao(el, opts)  ganho real por faixa de renda (P10…P99)
 *   BPD.promessas(el, opts)     barra 100% empilhada por categoria (cumprida/parcial/…)
 *   BPD.resumo(el, opts)        "Resumo em 1 minuto": placar + duelos compactos numa só imagem
 *   BPD.card(el, def, formato)  card "a seção é o card" (web inline | feed | story | og)  — v0.3
 *   BPD.montarCard(el, def)     card web + [Compartilhar imagem] [WhatsApp] (sem segundo gráfico)
 *   BPD.cardPNG(def, formato)   Promise<Blob> PNG do card
 *   BPD.cardSelecao(el, opts)   imagem única de uma seleção /c/1-3-5 (título neutro, contexto no rodapé)
 *   BPD.carrossel(el, opts)     seção com vários cards vira carrossel no celular (≤ 760 px)
 *   BPD.paraPNG(svg, escala)    Promise<Blob> PNG da imagem (para compartilhar)
 *
 * Cada função devolve o <svg>. O SVG traz <title>/<desc> (leitor de tela) e, se
 * opts.tabela !== false, um <details> "Ver os números em tabela" logo abaixo.
 * Re-desenha sozinho ao mudar a largura do contêiner ou o tema (html[data-theme]).
 * Todo texto entra via textContent (nunca innerHTML).
 */
(function (root) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var FONTE = "InterVar, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  /* endereço impresso na imagem: o do build (SITE_CONFIG.siteUrl), senão o de produção */
  var SITE = (function () {
    var u = root.SITE_CONFIG && root.SITE_CONFIG.siteUrl;
    return (typeof u === 'string' && /^https?:\/\//.test(u)) ? u.replace(/^https?:\/\//, '').replace(/\/$/, '') : 'boraprosdadosbrasil.netlify.app';
  })();

  /* ---------- tokens (validados com validate_palette.js; ver 40-dataviz-spec.md) ---------- */
  var TEMAS = {
    light: {
      surface: '#ffffff', ink: '#18181b', ink2: '#52525b', muted: '#71717a',
      grid: '#ececef', axis: '#d4d4d8', ring: '#ffffff',
      b: '#1479B0', l: '#7250FB',            // azul Bolsonaro/Flávio · roxo Lula  (mesma luminosidade OKLCH ~0.56)
      bClaro: '#73acd4', lClaro: '#9c92ff',  // degrau "parcial" (ordinal, >= 2:1 sobre o fundo)
      bLavado: 'rgba(20,121,176,.09)', lLavado: 'rgba(114,80,251,.09)', // faixas de governo
      neutro: '#52525b', vazio: '#d4d4d8', ctx: '#8a8a93', sobreCor: '#ffffff'
    },
    dark: {
      surface: '#18181b', ink: '#fafafa', ink2: '#d4d4d8', muted: '#a1a1aa',
      grid: '#2a2a2e', axis: '#3f3f46', ring: '#18181b',
      b: '#1479B0', l: '#7250FB',
      bClaro: '#85bfe8', lClaro: '#aea5ff',
      bLavado: 'rgba(56,150,210,.16)', lLavado: 'rgba(140,110,255,.16)',
      neutro: '#71717a', vazio: '#3f3f46', ctx: '#a1a1aa', sobreCor: '#ffffff'
    }
  };

  var LADOS_PADRAO = {
    b: { nome: 'Governo Bolsonaro', curto: 'Bolsonaro', periodo: '2019–2022' },
    l: { nome: 'Governo Lula', curto: 'Lula', periodo: '2023–2025' }
  };
  var ORDEM = ['b', 'l']; // ordem fixa (cronológica), nunca pela vitória

  /* ---------- utilidades ---------- */
  function temaAtual() {
    var h = document.documentElement, t = h.getAttribute('data-theme');
    if (t === 'dark' || t === 'light') return TEMAS[t];
    return (root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches) ? TEMAS.dark : TEMAS.light;
  }
  function lados(opts) {
    var o = {}, k;
    for (k in LADOS_PADRAO) o[k] = LADOS_PADRAO[k];
    if (opts && opts.lados) for (k in opts.lados) {
      var src = opts.lados[k], dst = {}, p;
      for (p in LADOS_PADRAO[k]) dst[p] = LADOS_PADRAO[k][p];
      for (p in src) dst[p] = src[p];
      o[k] = dst;
    }
    return o;
  }
  function num(v, casas, sinal) {
    if (v == null || isNaN(v)) return '–';
    casas = casas == null ? 1 : casas;
    var s = Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
    if (v < 0) return '−' + s;
    if (sinal && v > 0) return '+' + s;
    return s;
  }
  function fmtFn(f) {
    if (typeof f === 'function') return f;
    f = f || {};
    return function (v) { return (f.prefixo || '') + num(v, f.casas, f.sinal) + (f.sufixo || ''); };
  }
  var _cv;
  function largura(txt, size, weight) {
    _cv = _cv || document.createElement('canvas');
    var c = _cv.getContext('2d');
    c.font = (weight || 400) + ' ' + size + 'px ' + FONTE;
    return c.measureText(String(txt)).width;
  }
  function quebra(txt, size, weight, max) {
    var palavras = String(txt).split(/\s+/), linhas = [], atual = '';
    for (var i = 0; i < palavras.length; i++) {
      var tenta = atual ? atual + ' ' + palavras[i] : palavras[i];
      if (largura(tenta, size, weight) > max && atual) { linhas.push(atual); atual = palavras[i]; }
      else atual = tenta;
    }
    if (atual) linhas.push(atual);
    return linhas;
  }
  function el(tag, attrs, pai) {
    var n = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (pai) pai.appendChild(n);
    return n;
  }
  function texto(pai, x, y, s, o) {
    o = o || {};
    var t = el('text', {
      x: x, y: y, 'font-size': o.size || 13, 'font-weight': o.weight || 400,
      fill: o.fill, 'text-anchor': o.anchor || 'start', 'font-family': FONTE,
      'dominant-baseline': o.baseline || 'alphabetic'
    }, pai);
    t.textContent = s;
    return t;
  }
  function luminancia(hex) {
    var h = hex.replace('#', ''), c = [0, 2, 4].map(function (i) {
      var v = parseInt(h.substr(i, 2), 16) / 255;
      return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function textoSobre(fill) { // branco ou tinta, o que der mais contraste
    var L = luminancia(fill), cBranco = 1.05 / (L + 0.05), cTinta = (L + 0.05) / 0.0592;
    return cBranco >= cTinta ? '#ffffff' : '#18181b';
  }
  // barra com ponta arredondada (4px) só no lado do dado; reta na base
  function barra(pai, x0, x1, y, h, fill, extra) {
    var r = Math.min(4, Math.abs(x1 - x0) / 2, h / 2), d;
    if (x1 >= x0) {
      d = 'M' + x0 + ',' + y + 'H' + (x1 - r) + 'Q' + x1 + ',' + y + ' ' + x1 + ',' + (y + r) +
        'V' + (y + h - r) + 'Q' + x1 + ',' + (y + h) + ' ' + (x1 - r) + ',' + (y + h) + 'H' + x0 + 'Z';
    } else {
      d = 'M' + x0 + ',' + y + 'H' + (x1 + r) + 'Q' + x1 + ',' + y + ' ' + x1 + ',' + (y + r) +
        'V' + (y + h - r) + 'Q' + x1 + ',' + (y + h) + ' ' + (x1 + r) + ',' + (y + h) + 'H' + x0 + 'Z';
    }
    var a = { d: d, fill: fill };
    if (extra) for (var k in extra) a[k] = extra[k];
    return el('path', a, pai);
  }
  // forma do lado: círculo (b) e quadrado arredondado (l): 2º canal além da cor
  function marca(pai, lado, cx, cy, tam, T) {
    var r = tam / 2;
    if (lado === 'b') return el('circle', { cx: cx, cy: cy, r: r, fill: T.b, stroke: T.ring, 'stroke-width': 1.5 }, pai);
    if (lado === 'l') return el('rect', { x: cx - r, y: cy - r, width: tam, height: tam, rx: 2, fill: T.l, stroke: T.ring, 'stroke-width': 1.5 }, pai);
    return el('circle', { cx: cx, cy: cy, r: r, fill: T.ctx }, pai);
  }
  // selo de vencedor: mesmo desenho para os dois lados (só muda a cor)
  function selo(pai, xDir, yTopo, rotulo, lado, T) {
    var s = '✓ ' + rotulo, w = largura(s, 12, 700) + 18, h = 22;
    var g = el('g', null, pai);
    el('rect', { x: xDir - w, y: yTopo, width: w, height: h, rx: 11, fill: T[lado] }, g);
    texto(g, xDir - w / 2, yTopo + 15, s, { size: 12, weight: 700, fill: T.sobreCor, anchor: 'middle' });
    return w;
  }
  function seloNeutro(pai, xDir, yTopo, rotulo, T) {
    var w = largura(rotulo, 12, 600) + 18;
    el('rect', { x: xDir - w + 0.5, y: yTopo + 0.5, width: w - 1, height: 21, rx: 10.5, fill: 'none', stroke: T.axis }, pai);
    texto(pai, xDir - w / 2, yTopo + 15, rotulo, { size: 12, weight: 600, fill: T.ink2, anchor: 'middle' });
    return w;
  }
  function padroes(defs, T) { // listrado 45°: "em andamento" e "estimativa"
    var ids = {};
    [['bClaro', T.bClaro], ['lClaro', T.lClaro], ['vazio', T.vazio], ['bEst', T.b], ['lEst', T.l]].forEach(function (p) {
      var id = 'bpd-hatch-' + p[0] + '-' + Math.random().toString(36).slice(2, 7);
      var pat = el('pattern', { id: id, patternUnits: 'userSpaceOnUse', width: 6, height: 6, patternTransform: 'rotate(45)' }, defs);
      el('rect', { width: 6, height: 6, fill: T.surface }, pat);
      el('rect', { width: 3, height: 6, fill: p[1] }, pat);
      ids[p[0]] = 'url(#' + id + ')';
    });
    return ids;
  }

  /* ---------- moldura comum: título, critério, corpo, nota, fonte, endereço ---------- */
  var _uid = 0;
  function moldura(cont, opts, corpo) {
    var T = temaAtual();
    var W = Math.max(300, Math.round(opts.largura || cont.clientWidth || 358));
    var P = W < 420 ? 14 : 20;                      // respiro interno
    var id = 'bpd' + (++_uid);
    var svg = el('svg', opts.titulo ? { xmlns: NS, width: W, role: 'img', 'aria-labelledby': id + 't', 'aria-describedby': id + 'd', 'font-family': FONTE }
      : { xmlns: NS, width: W, role: 'img', 'aria-label': 'Gráfico' + (opts.chapeu ? ': ' + opts.chapeu : ''), 'aria-describedby': id + 'd', 'font-family': FONTE });
    svg.style.display = 'block'; svg.style.maxWidth = '100%'; svg.style.height = 'auto';
    var tt = el('title', { id: id + 't' }, svg); tt.textContent = opts.titulo || '';
    var dd = el('desc', { id: id + 'd' }, svg); dd.textContent = opts.descricao || '';
    var defs = el('defs', null, svg);
    var fundo = el('rect', { x: 0, y: 0, width: W, rx: 14, fill: T.surface }, svg);
    var g = el('g', null, svg);
    var y = P;
    if (opts.chapeu) { texto(g, P, y + 12, opts.chapeu.toUpperCase(), { size: 12, weight: 700, fill: T.muted }); y += 20; }
    if (opts.titulo) {
      var tam = opts.tamTitulo || (W < 420 ? 17 : 19);
      quebra(opts.titulo, tam, 700, W - 2 * P).forEach(function (ln) { y += tam + 4; texto(g, P, y - 4, ln, { size: tam, weight: 700, fill: T.ink }); });
      y += 6;
    }
    var ctx = { svg: svg, g: g, defs: defs, T: T, W: W, P: P, x0: P, x1: W - P, y: y, L: lados(opts) };
    y = corpo(ctx) || ctx.y;
    // nota (apoio) e fonte (credibilidade) dentro da imagem: sobrevivem ao print/recorte
    if (opts.nota) {
      y += 6;
      quebra(opts.nota, 12.5, 400, W - 2 * P).forEach(function (ln) { y += 17; texto(g, P, y - 4, ln, { size: 12.5, fill: T.ink2 }); });
    }
    y += 10;
    el('line', { x1: P, x2: W - P, y1: y, y2: y, stroke: T.grid, 'stroke-width': 1 }, g);
    y += 4;
    var linhaFonte = 'Fonte: ' + (opts.fonte || '—');
    quebra(linhaFonte, 12, 400, W - 2 * P).forEach(function (ln) { y += 16; texto(g, P, y - 3, ln, { size: 12, fill: T.muted }); });
    quebra(SITE + (opts.metodo ? ' · ' + opts.metodo : '') + (opts.atualizado ? ' · atualizado em ' + opts.atualizado : ''), 12, 600, W - 2 * P).forEach(function (ln) { y += 16; texto(g, P, y - 3, ln, { size: 12, weight: 600, fill: T.muted }); });
    y += P - 2;
    svg.setAttribute('height', y);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + y);
    fundo.setAttribute('height', y);
    return svg;
  }

  function tabelaGemea(cont, cab, linhas, legenda) {
    var det = document.createElement('details'); det.className = 'bpd-tabela';
    var sum = document.createElement('summary'); sum.textContent = 'Ver os números em tabela'; det.appendChild(sum);
    var tb = document.createElement('table');
    if (legenda) { var cap = document.createElement('caption'); cap.textContent = legenda; tb.appendChild(cap); }
    var th = document.createElement('thead'), tr = document.createElement('tr');
    cab.forEach(function (c) { var x = document.createElement('th'); x.scope = 'col'; x.textContent = c; tr.appendChild(x); });
    th.appendChild(tr); tb.appendChild(th);
    var tbody = document.createElement('tbody');
    linhas.forEach(function (l) {
      var r = document.createElement('tr');
      l.forEach(function (c, i) { var x = document.createElement(i === 0 ? 'th' : 'td'); if (i === 0) x.scope = 'row'; x.textContent = c; r.appendChild(x); });
      tbody.appendChild(r);
    });
    tb.appendChild(tbody); det.appendChild(tb); cont.appendChild(det);
  }

  /* ---------- registro: redesenha em resize e troca de tema ---------- */
  var REG = [];
  function montar(cont, opts, desenhar, tabela) {
    if (typeof cont === 'string') cont = document.querySelector(cont);
    var item = null;
    for (var i = 0; i < REG.length; i++) if (REG[i].cont === cont) item = REG[i];
    if (!item) { item = { cont: cont }; REG.push(item); }
    item.opts = opts; item.desenhar = desenhar; item.tabela = tabela; item.w = cont.clientWidth;
    while (cont.firstChild) cont.removeChild(cont.firstChild);
    var svg = desenhar(cont, opts);
    cont.appendChild(svg);
    if (tabela && opts.tabela !== false) { var t = tabela(opts); tabelaGemea(cont, t.cab, t.linhas, opts.titulo); }
    return svg;
  }
  function redesenhar(forcar) {
    REG.forEach(function (it) {
      if (!it.cont.isConnected) return;
      if (forcar || Math.abs(it.cont.clientWidth - it.w) > 4) montar(it.cont, it.opts, it.desenhar, it.tabela);
    });
  }
  if (typeof root.addEventListener === 'function') {
    var _t; root.addEventListener('resize', function () { clearTimeout(_t); _t = setTimeout(function () { redesenhar(false); }, 150); });
    if (root.MutationObserver) new MutationObserver(function () { redesenhar(true); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    if (root.matchMedia) { var mq = root.matchMedia('(prefers-color-scheme: dark)'); if (mq.addEventListener) mq.addEventListener('change', function () { redesenhar(true); }); }
  }

  /* ---------- vencedor pelo critério declarado ---------- */
  function vencedor(d) {
    if (d.vencedor !== undefined && d.criterio == null) return d.vencedor; // só quando não há critério numérico
    var vb = d.valores.b, vl = d.valores.l;
    if (!d.criterio || vb === vl) return null;
    var v = d.criterio === 'menor' ? (vb < vl ? 'b' : 'l') : (vb > vl ? 'b' : 'l');
    if (d.vencedor !== undefined && d.vencedor !== v && root.console) console.warn('[BPD] vencedor informado difere do critério:', d.titulo || d.tema);
    return v;
  }
  function textoCriterio(d) {
    if (d.criterioTexto) return d.criterioTexto;
    if (d.criterio === 'menor') return '↓ menor é melhor';
    if (d.criterio === 'maior') return '↑ maior é melhor';
    return 'contexto · não conta ponto';
  }

  /* =====================================================================
   * DUELO: um indicador, dois valores, vencedor marcado no gráfico
   * opts: titulo, criterio ('menor'|'maior'|null), valores{b,l}, formato,
   *       vencedorRotulo ('menor inflação'), sub{b,l}, lados, nota, fonte
   * ===================================================================== */
  function desenharDuelo(cont, o) {
    var f = fmtFn(o.formato);
    var v = vencedor(o);
    o.descricao = o.descricao || (o.titulo + '. ' + ORDEM.map(function (k) { return lados(o)[k].nome + ': ' + f(o.valores[k]); }).join('; ') +
      '. ' + (v ? 'Melhor neste critério (' + textoCriterio(o).replace(/[↓↑] /, '') + '): ' + lados(o)[v].nome + '.' : 'Sem vencedor: contexto.'));
    return moldura(cont, o, function (c) {
      var T = c.T, g = c.g, y = c.y;
      // critério embutido
      var crit = textoCriterio(o);
      var wc = largura(crit, 12, 600) + 18;
      el('rect', { x: c.x0 + 0.5, y: y + 0.5, width: wc - 1, height: 21, rx: 10.5, fill: 'none', stroke: T.axis }, g);
      texto(g, c.x0 + wc / 2, y + 15, crit, { size: 12, weight: 600, fill: T.ink2, anchor: 'middle' });
      if (o.periodo) texto(g, c.x1, y + 15, o.periodo, { size: 12, fill: T.muted, anchor: 'end' });
      y += 36;
      // escala comum, começando em zero
      var vals = ORDEM.map(function (k) { return o.valores[k]; });
      var lo = Math.min(0, Math.min.apply(null, vals)), hi = Math.max(0, Math.max.apply(null, vals));
      var labW = Math.max.apply(null, vals.map(function (x) { return largura(f(x), 20, 700); })) + 10;
      var plotL = c.x0 + (lo < 0 ? labW : 0), plotR = c.x1 - (hi > 0 ? labW : 0);
      var X = function (x) { return plotL + (x - lo) / (hi - lo || 1) * (plotR - plotL); };
      // mesma forma de nome para os dois lados (se um precisa encurtar, os dois encurtam)
      var wSeloMax = v ? largura('✓ ' + (o.vencedorRotulo || 'melhor'), 12, 700) + 18 : 0;
      var cabe = function (fn) { return ORDEM.every(function (k) { return largura(fn(c.L[k]), 13, 600) + 20 + wSeloMax + 8 <= c.x1 - c.x0; }); };
      var formas = [function (L) { return L.nome + (L.periodo ? ' · ' + L.periodo : ''); }, function (L) { return L.curto + (L.periodo ? ' · ' + L.periodo : ''); }, function (L) { return L.curto; }];
      var formaNome = formas.filter(cabe)[0] || formas[2];
      ORDEM.forEach(function (k) {
        var L = c.L[k], val = o.valores[k];
        // linha do rótulo: forma + nome · período  ...  selo do vencedor
        marca(g, k, c.x0 + 6, y + 8, 11, T);
        var nome = formaNome(L);
        texto(g, c.x0 + 18, y + 13, nome, { size: 13, weight: 600, fill: T.ink });
        if (v === k) selo(g, c.x1, y - 3, o.vencedorRotulo || 'melhor', k, T);
        y += 26;
        var xa = X(0), xb = X(val);
        if (Math.abs(xb - xa) < 2) xb = xa + (val < 0 ? -2 : 2);
        var bar = barra(g, xa, xb, y, 24, T[k]);
        var tb = el('title', null, bar); tb.textContent = L.nome + ': ' + f(val);
        texto(g, val < 0 ? xb - 6 : xb + 6, y + 19, f(val), { size: 20, weight: 700, fill: T.ink, anchor: val < 0 ? 'end' : 'start' });
        if (lo < 0) el('line', { x1: X(0), x2: X(0), y1: y - 4, y2: y + 28, stroke: T.ink2, 'stroke-width': 1 }, g);
        y += 24;
        if (o.sub && o.sub[k]) quebra(o.sub[k], 12, 400, c.x1 - c.x0).forEach(function (ln) { texto(g, c.x0, y + 16, ln, { size: 12, fill: T.ink2 }); y += 16; });
        y += 16;
      });
      if (o.legendaZero && lo < 0) { texto(g, X(0), y + 2, o.legendaZero, { size: 12, fill: T.muted, anchor: 'middle' }); y += 10; }
      return y;
    });
  }
  function duelo(cont, o) {
    return montar(cont, o, desenharDuelo, function (o) {
      var f = fmtFn(o.formato), v = vencedor(o), L = lados(o);
      return { cab: ['Lado', 'Valor', 'Melhor neste critério?'],
        linhas: ORDEM.map(function (k) { return [L[k].nome + (L[k].periodo ? ' (' + L[k].periodo + ')' : ''), f(o.valores[k]) + (o.sub && o.sub[k] ? ' · ' + o.sub[k] : ''), v === k ? 'sim (' + textoCriterio(o) + ')' : (v ? 'não' : 'sem placar')]; }) };
    });
  }

  /* =====================================================================
   * PLACAR: 1 bloco por vitória, blocos idênticos para os dois lados
   * opts: titulo, quesitos:[{nome, vencedor:'b'|'l'|null, nota}], lados, fonte
   * ===================================================================== */
  function blocoPlacar(c, y, o) {
    var T = c.T, g = c.g, gap = 10, colW = (c.x1 - c.x0 - gap) / 2;
    var cont = { b: [], l: [] }, ctx = [];
    o.quesitos.forEach(function (q) { if (q.vencedor === 'b' || q.vencedor === 'l') cont[q.vencedor].push(q); else ctx.push(q); });
    var maxN = Math.max(cont.b.length, cont.l.length);
    // todos os blocos com a MESMA altura (1 ou 2 linhas), para cada vitória pesar igual
    var linhasDe = function (q) { return quebra('✓ ' + q.nome, 13, 600, colW - 20); };
    var maxL = 1; o.quesitos.forEach(function (q) { if (q.vencedor) maxL = Math.max(maxL, Math.min(2, linhasDe(q).length)); });
    var tileH = maxL === 1 ? 34 : 52;
    var yTiles = y;
    ORDEM.forEach(function (k, i) {
      var x = c.x0 + i * (colW + gap), L = c.L[k], yy = y;
      marca(g, k, x + 6, yy + 9, 11, T);
      var nm = largura(L.nome, 14, 700) + 18 > colW ? L.curto : L.nome;
      texto(g, x + 18, yy + 14, nm, { size: 14, weight: 700, fill: T.ink });
      yy += 20;
      if (L.periodo) texto(g, x + 18, yy + 12, L.periodo, { size: 12, fill: T.muted });
      yy += 18;
      var n = String(cont[k].length);
      texto(g, x, yy + 44, n, { size: 48, weight: 800, fill: T.ink });
      var wn = largura(n, 48, 800);
      texto(g, x + wn + 6, yy + 42, cont[k].length === 1 ? 'vitória' : 'vitórias', { size: 13, weight: 600, fill: T.ink2 });
      yy += 56;
      cont[k].forEach(function (q) {
        el('rect', { x: x, y: yy, width: colW, height: tileH, rx: 8, fill: T[k] }, g);
        var ls = linhasDe(q);
        if (ls.length > 2) { ls = ls.slice(0, 2); ls[1] = ls[1].replace(/\s*\S*$/, '') + '…'; }
        var y0 = yy + tileH / 2 - (ls.length - 1) * 8 + 4.5;
        ls.forEach(function (ln, j) { texto(g, x + 10, y0 + j * 16, ln, { size: 13, weight: 600, fill: T.sobreCor }); });
        yy += tileH + 4;
      });
      yTiles = Math.max(yTiles, yy);
    });
    y = Math.max(yTiles, y + 94 + maxN * (tileH + 4));
    ctx.forEach(function (q) {
      y += 4;
      el('rect', { x: c.x0 + 0.5, y: y + 0.5, width: c.x1 - c.x0 - 1, height: 33, rx: 8, fill: 'none', stroke: T.axis, 'stroke-dasharray': '4 3' }, g);
      texto(g, c.x0 + 10, y + 22, q.nome + ': ' + (q.nota || 'contexto, não conta ponto'), { size: 12.5, fill: T.ink2 });
      y += 38;
    });
    return y;
  }
  function desenharPlacar(cont, o) {
    var L = lados(o), n = { b: 0, l: 0 };
    o.quesitos.forEach(function (q) { if (n[q.vencedor] != null) n[q.vencedor]++; });
    o.descricao = o.descricao || ('Placar: ' + L.b.nome + ' ' + n.b + ', ' + L.l.nome + ' ' + n.l + '. ' +
      o.quesitos.map(function (q) { return q.nome + ': ' + (q.vencedor ? L[q.vencedor].nome : 'contexto'); }).join('; ') + '.');
    return moldura(cont, o, function (c) {
      var y = c.y;
      if (o.regra) { quebra(o.regra, 12.5, 400, c.x1 - c.x0).forEach(function (ln) { texto(c.g, c.x0, y + 12, ln, { size: 12.5, fill: c.T.ink2 }); y += 17; }); y += 6; }
      return blocoPlacar(c, y, o);
    });
  }
  function placar(cont, o) {
    return montar(cont, o, desenharPlacar, function (o) {
      var L = lados(o);
      return { cab: ['Quesito', 'Melhor'], linhas: o.quesitos.map(function (q) { return [q.nome, q.vencedor ? L[q.vencedor].nome : 'contexto (não conta ponto)']; }) };
    });
  }

  /* =====================================================================
   * RESUMO EM 1 MINUTO: placar + 1 linha por tema (duelo compacto)
   * opts: titulo, quesitos (placar), duelos:[{tema, criterio, valores, formato, nota}]
   * ===================================================================== */
  function linhaDuelo(c, y, d) {
    var T = c.T, g = c.g, f = fmtFn(d.formato), v = vencedor(d);
    var nomeW = Math.max(72, Math.max.apply(null, ORDEM.map(function (k) { return largura(c.L[k].curto, 12, 700); })) + 8);
    texto(g, c.x0, y + 15, d.tema, { size: 14, weight: 700, fill: T.ink });
    var wt = largura(d.tema, 14, 700);
    var crit = textoCriterio(d);
    var wSelo = v ? largura('✓ ' + c.L[v].curto, 12, 700) + 18 : largura('sem placar', 12, 600) + 18;
    if (wt + 8 + largura(crit, 12, 400) < c.x1 - c.x0 - wSelo - 6) texto(g, c.x0 + wt + 8, y + 15, crit, { size: 12, fill: T.muted });
    else { y += 16; texto(g, c.x0, y + 15, crit, { size: 12, fill: T.muted }); y -= 16; }
    if (v) selo(g, c.x1, y, c.L[v].curto, v, T); else seloNeutro(g, c.x1, y, 'sem placar', T);
    y += (wt + 8 + largura(crit, 12, 400) < c.x1 - c.x0 - wSelo - 6) ? 28 : 44;
    var vals = ORDEM.map(function (k) { return d.valores[k]; });
    var lo = Math.min(0, Math.min.apply(null, vals)), hi = Math.max(0, Math.max.apply(null, vals));
    var labW = Math.max.apply(null, vals.map(function (x) { return largura(f(x), 13, 700); })) + 8;
    var plotL = c.x0 + nomeW + (lo < 0 ? labW : 0), plotR = c.x1 - (hi > 0 ? labW : 0);
    var X = function (x) { return plotL + (x - lo) / (hi - lo || 1) * (plotR - plotL); };
    var y0 = y;
    ORDEM.forEach(function (k) {
      var val = d.valores[k];
      texto(g, c.x0, y + 11, c.L[k].curto, { size: 12, weight: v === k ? 700 : 400, fill: v === k ? T.ink : T.ink2 });
      var xa = X(0), xb = X(val); if (Math.abs(xb - xa) < 2) xb = xa + (val < 0 ? -2 : 2);
      barra(g, xa, xb, y, 14, T[k]);
      texto(g, val < 0 ? xb - 5 : xb + 5, y + 12, f(val), { size: 13, weight: 700, fill: T.ink, anchor: val < 0 ? 'end' : 'start' });
      y += 20;
    });
    if (lo < 0) el('line', { x1: X(0), x2: X(0), y1: y0 - 3, y2: y - 3, stroke: T.ink2, 'stroke-width': 1 }, g);
    if (d.nota) { texto(g, c.x0 + nomeW, y + 11, d.nota, { size: 12, fill: T.muted }); y += 16; }
    y += 10;
    el('line', { x1: c.x0, x2: c.x1, y1: y, y2: y, stroke: T.grid }, g);
    return y + 10;
  }
  function desenharResumo(cont, o) {
    var L = lados(o);
    o.descricao = o.descricao || (o.titulo + '. ' + o.duelos.map(function (d) {
      var f = fmtFn(d.formato), v = vencedor(d);
      return d.tema + ': ' + L.b.curto + ' ' + f(d.valores.b) + ', ' + L.l.curto + ' ' + f(d.valores.l) + (v ? ' (melhor: ' + L[v].curto + ')' : ' (contexto)');
    }).join('; ') + '.');
    return moldura(cont, o, function (c) {
      var y = c.y;
      if (o.quesitos) { y = blocoPlacar(c, y, o); y += 8; }
      if (o.subtitulo) {
        quebra(o.subtitulo, 13, 600, c.x1 - c.x0).forEach(function (ln) { y += 18; texto(c.g, c.x0, y - 4, ln, { size: 13, weight: 600, fill: c.T.ink2 }); });
        y += 8;
      }
      el('line', { x1: c.x0, x2: c.x1, y1: y, y2: y, stroke: c.T.grid }, c.g); y += 10;
      o.duelos.forEach(function (d) { y = linhaDuelo(c, y, d); });
      return y;
    });
  }
  function resumo(cont, o) {
    return montar(cont, o, desenharResumo, function (o) {
      var L = lados(o);
      return { cab: ['Tema', L.b.nome, L.l.nome, 'Critério', 'Melhor'],
        linhas: o.duelos.map(function (d) { var f = fmtFn(d.formato), v = vencedor(d); return [d.tema, f(d.valores.b), f(d.valores.l), textoCriterio(d), v ? L[v].nome : 'contexto']; }) };
    });
  }

  /* =====================================================================
   * TRAJETÓRIA: série no tempo, faixas de governo, anotações diretas
   * opts: titulo, x:[rótulos], series:[{lado:'b'|'l'|'ctx', nome, valores, tracejado}],
   *       faixas:[{lado, de, ate}] (índices), anotacoes:[{i, texto}], rotular:[{s, i}],
   *       y:{min, max, passo, formato}, formato (valores), fonte, nota
   * ===================================================================== */
  function desenharTrajetoria(cont, o) {
    var f = fmtFn(o.formato), fy = fmtFn(o.y && o.y.formato || o.formato);
    o.descricao = o.descricao || (o.titulo + '. ' + o.series.map(function (s) {
      var pts = []; s.valores.forEach(function (v, i) { if (v != null) pts.push(o.x[i] + ' ' + f(v)); });
      return s.nome + ': ' + (pts.length > 14 ? pts[0] + ' … ' + pts[pts.length - 1] : pts.join(', '));
    }).join('. ') + '.');
    return moldura(cont, o, function (c) {
      var T = c.T, g = c.g, y = c.y, n = o.x.length;
      var ymin = o.y.min, ymax = o.y.max, passo = o.y.passo;
      if (ymin !== 0) {
        var aviso = 'Atenção: o eixo vertical começa em ' + fy(ymin) + ', não em zero';
        texto(g, c.x0, y + 12, aviso, { size: 12, weight: 600, fill: T.ink2 }); y += 22;
      }
      // legenda (sempre, para >= 2 séries) com forma + nome
      var lx = c.x0;
      if (o.legenda !== false) o.series.forEach(function (s) {
        if (s.legenda === false) return;
        var nm = s.legenda || s.nome, w = largura(nm, 12, 600) + 26;
        if (lx + w > c.x1) { lx = c.x0; y += 18; }
        if (s.lado === 'ctx' || s.lado === 'ink') el('line', { x1: lx, x2: lx + 14, y1: y + 8, y2: y + 8, stroke: s.lado === 'ink' ? T.ink : T.ctx, 'stroke-width': 2, 'stroke-dasharray': s.tracejado ? '4 3' : null }, g);
        else marca(g, s.lado, lx + 6, y + 8, 10, T);
        texto(g, lx + 18, y + 12, nm, { size: 12, weight: 600, fill: T.ink2 });
        lx += w + 6;
      });
      if (o.legenda !== false) y += 26;
      var ticks = []; for (var t = ymin; t <= ymax + 1e-9; t += passo) ticks.push(t);
      var axW = Math.max.apply(null, ticks.map(function (t) { return largura(fy(t), 12, 400); })) + 6;
      var top = y + 22, H = o.altura || 210, bot = top + H;
      var pl = c.x0 + axW, pr = c.x1 - (o.margemDireita || 30);
      var X = function (i) { return pl + (n === 1 ? 0.5 : i / (n - 1)) * (pr - pl); };
      var Y = function (v) { return bot - (v - ymin) / (ymax - ymin) * H; };
      // faixas de governo + rótulo dentro
      var usaCurto = (o.faixas || []).some(function (fx) { return largura(c.L[fx.lado].nome, 12, 700) + 22 > X(fx.ate) - X(fx.de); });
      (o.faixas || []).forEach(function (fx) {
        var xa = X(fx.de), xb = X(fx.ate);
        el('rect', { x: xa, y: top - 22, width: Math.max(0, xb - xa), height: H + 22, fill: T[fx.lado + 'Lavado'] }, g);
        var nm = usaCurto ? c.L[fx.lado].curto : c.L[fx.lado].nome;
        if (largura(nm, 12, 700) + 22 <= xb - xa + 2) {
          marca(g, fx.lado, xa + 9, top - 11, 9, T);
          texto(g, xa + 18, top - 7, nm, { size: 12, weight: 700, fill: T.ink2 });
        }
      });
      ticks.forEach(function (t) {
        el('line', { x1: pl, x2: pr, y1: Y(t), y2: Y(t), stroke: T.grid }, g);
        texto(g, pl - 6, Y(t) + 4, fy(t), { size: 12, fill: T.muted, anchor: 'end' });
      });
      el('line', { x1: pl, x2: pr, y1: bot, y2: bot, stroke: T.axis }, g);
      // eixo x: rótulos que cabem
      var maxLab = Math.max.apply(null, o.x.map(function (s) { return largura(o.rotuloX ? o.rotuloX(s, 0) : s, 12, 400); })) + 8;
      var cada = Math.max(1, Math.ceil(maxLab / ((pr - pl) / Math.max(1, n - 1))));
      var ultimoX = -1e9;
      o.x.forEach(function (s, i) {
        var lab = o.rotuloX ? o.rotuloX(s, i) : s; if (!lab) return;
        if (!o.rotuloX && i % cada !== 0 && i !== n - 1) return;
        if (i === n - 1 && X(i) - ultimoX < maxLab) return;
        ultimoX = X(i);
        texto(g, X(i), bot + 17, lab, { size: 12, fill: T.muted, anchor: i === 0 ? 'start' : (i === n - 1 ? 'end' : 'middle') });
      });
      // anotações diretas nos eventos
      (o.anotacoes || []).forEach(function (a, j) {
        var xa = X(a.i), ty = a.y != null ? Y(a.y) : top + 14 + (j % 2) * 16;
        el('line', { x1: xa, x2: xa, y1: a.y != null ? top : top + 4 + (j % 2) * 16, y2: bot, stroke: T.muted, 'stroke-width': 1 }, g);
        var w = largura(a.texto, 12, 600);
        var anc = xa + w + 4 > pr ? 'end' : 'start';
        el('rect', { x: anc === 'end' ? xa - w - 6 : xa + 2, y: ty - 12, width: w + 4, height: 16, fill: T.surface, opacity: 0.85 }, g);
        texto(g, anc === 'end' ? xa - 4 : xa + 4, ty, a.texto, { size: 12, weight: 600, fill: T.ink2, anchor: anc });
      });
      // linhas
      o.series.forEach(function (s) {
        var d = '', on = false, cor = s.lado === 'ctx' ? T.ctx : (s.lado === 'ink' ? T.ink : T[s.lado]);
        s.valores.forEach(function (v, i) {
          if (v == null) { on = false; return; }
          d += (on ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(v).toFixed(1); on = true;
        });
        el('path', { d: d, fill: 'none', stroke: cor, 'stroke-width': s.lado === 'ctx' ? 2 : 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-dasharray': s.tracejado ? '5 4' : null }, g);
        if (s.marcadores !== false && n <= 14) s.valores.forEach(function (v, i) { if (v != null && !(s.semMarca && s.semMarca.indexOf(i) >= 0)) marca(g, s.lado, X(i), Y(v), 9, T); });
      });
      // rótulos seletivos (ponta, extremos), com desvio simples de colisão
      var caixas = [];
      (o.rotular || []).forEach(function (r) {
        var s = o.series[r.s], v = s.valores[r.i]; if (v == null) return;
        var lab = (r.prefixo || '') + f(v), w = largura(lab, 13, 700), xa = X(r.i), ya = Y(v) - 10;
        var anc = r.i === 0 ? 'start' : (r.i === n - 1 ? 'end' : 'middle');
        var bx = anc === 'start' ? xa - 4 : anc === 'end' ? xa - w + 4 : xa - w / 2;
        if (r.abaixo) ya = Y(v) + 22;
        for (var k = 0; k < caixas.length; k++) { var b = caixas[k]; if (bx < b.x + b.w && bx + w > b.x && ya - 13 < b.y && ya > b.y - 13) ya = Y(v) + 22; }
        caixas.push({ x: bx, y: ya, w: w });
        texto(g, anc === 'start' ? xa - 4 : anc === 'end' ? xa + 4 : xa, ya, lab, { size: 13, weight: 700, fill: T.ink, anchor: anc });
      });
      // camada de toque/hover: linha-guia + leitura de todas as séries no X
      var guia = el('g', { 'pointer-events': 'none', visibility: 'hidden' }, g);
      var gl = el('line', { y1: top, y2: bot, stroke: T.ink2, 'stroke-width': 1 }, guia);
      var caixa = el('rect', { rx: 6, fill: T.surface, stroke: T.axis }, guia);
      var tx = el('text', { 'font-size': 12, 'font-family': FONTE, fill: T.ink }, guia);
      // camada só de ponteiro (toque/mouse): sem foco de teclado — o leitor de tela usa <title>/<desc> e a tabela gêmea
      var alvo = el('rect', { x: pl, y: top, width: pr - pl, height: H, fill: 'transparent', 'aria-hidden': 'true' }, g);
      function mostrar(i) {
        guia.setAttribute('visibility', 'visible');
        gl.setAttribute('x1', X(i)); gl.setAttribute('x2', X(i));
        while (tx.firstChild) tx.removeChild(tx.firstChild);
        var linhas = [o.x[i]]; o.series.forEach(function (s) { if (s.valores[i] != null) linhas.push(s.nome + ': ' + f(s.valores[i])); });
        var w = 0; linhas.forEach(function (l, j) { var ts = el('tspan', { x: 0, dy: j ? 16 : 0, 'font-weight': j ? 400 : 700 }, tx); ts.textContent = l; w = Math.max(w, largura(l, 12, j ? 400 : 700)); });
        var bx = X(i) + 8; if (bx + w + 16 > c.x1) bx = X(i) - w - 24;
        caixa.setAttribute('x', bx); caixa.setAttribute('y', top + 4); caixa.setAttribute('width', w + 16); caixa.setAttribute('height', linhas.length * 16 + 10);
        tx.setAttribute('transform', 'translate(' + (bx + 8) + ',' + (top + 20) + ')');
        [].forEach.call(tx.childNodes, function (ts) { ts.setAttribute('x', 0); });
      }
      function idx(ev) { var r = c.svg.getBoundingClientRect(), sx = c.W / r.width; var px = (ev.clientX - r.left) * sx; return Math.max(0, Math.min(n - 1, Math.round((px - pl) / (pr - pl) * (n - 1)))); }
      alvo.addEventListener('pointermove', function (e) { mostrar(idx(e)); });
      alvo.addEventListener('pointerdown', function (e) { mostrar(idx(e)); });
      alvo.addEventListener('pointerleave', function () { guia.setAttribute('visibility', 'hidden'); });
      return bot + 30;
    });
  }
  function trajetoria(cont, o) {
    return montar(cont, o, desenharTrajetoria, function (o) {
      var f = fmtFn(o.formato);
      return { cab: ['Período'].concat(o.series.map(function (s) { return s.nome; })),
        linhas: o.x.map(function (x, i) { return [x].concat(o.series.map(function (s) { return s.valores[i] == null ? '–' : f(s.valores[i]); })); }) };
    });
  }

  /* =====================================================================
   * DISTRIBUIÇÃO: ganho real por faixa de renda
   * opts: titulo, faixas:[{rotulo:'P10', desc:'base', a, b, var, estimado}], fonte, nota
   * cor da barra = lado em que a faixa teve renda MAIOR (regra única, vale para os dois)
   * ===================================================================== */
  function desenharDistribuicao(cont, o) {
    var brl = function (v) { return 'R$ ' + Math.round(v).toLocaleString('pt-BR'); };
    o.descricao = o.descricao || (o.titulo + '. ' + o.faixas.map(function (fx) { return fx.rotulo + ': ' + num(fx['var'], 1, true) + '% (' + brl(fx.a) + ' → ' + brl(fx.b) + ')'; }).join('; ') + '.');
    return moldura(cont, o, function (c) {
      var T = c.T, g = c.g, y = c.y, hatch = padroes(c.defs, T);
      // chave de leitura em uma linha, com forma
      var lado = o.faixas.every(function (fx) { return fx['var'] > 0; }) ? 'l' : null;
      if (o.chave) {
        marca(g, lado || 'b', c.x0 + 6, y + 8, 10, T);
        var lns = quebra(o.chave, 12.5, 600, c.x1 - c.x0 - 18);
        lns.forEach(function (ln, j) { texto(g, c.x0 + 18, y + 12 + j * 17, ln, { size: 12.5, weight: 600, fill: T.ink2 }); });
        y += lns.length * 17 + 14;
      }
      var colW = 76, vals = o.faixas.map(function (fx) { return fx['var']; });
      var lo = Math.min(0, Math.min.apply(null, vals)), hi = Math.max(0, Math.max.apply(null, vals));
      var labW = largura('+00,0%', 13, 700) + 8;
      var pl = c.x0 + colW, pr = c.x1 - labW;
      var X = function (v) { return pl + (v - lo) / (hi - lo || 1) * (pr - pl); };
      var y0 = y;
      o.faixas.forEach(function (fx) {
        var k = fx['var'] >= 0 ? 'l' : 'b';
        texto(g, c.x0, y + 13, fx.rotulo, { size: 13, weight: 700, fill: T.ink });
        if (fx.desc && largura(fx.rotulo, 13, 700) + 5 + largura(fx.desc, 12, 400) < colW - 4) texto(g, c.x0 + largura(fx.rotulo, 13, 700) + 5, y + 13, fx.desc, { size: 12, fill: T.muted });
        var fill = fx.estimado ? hatch[k + 'Est'] : T[k];
        var b = barra(g, X(0), X(fx['var']), y + 1, 16, fill);
        if (fx.estimado) el('path', { d: b.getAttribute('d'), fill: 'none', stroke: T[k], 'stroke-width': 1 }, g);
        texto(g, X(fx['var']) + 5, y + 14, num(fx['var'], 1, true) + '%', { size: 13, weight: 700, fill: T.ink });
        texto(g, pl, y + 32, brl(fx.a) + ' → ' + brl(fx.b) + (fx.estimado ? ' · estimativa' : ''), { size: 12, fill: T.muted });
        y += 44;
      });
      el('line', { x1: X(0), x2: X(0), y1: y0 - 2, y2: y - 26, stroke: T.ink2 }, g);
      return y - 6;
    });
  }
  function distribuicao(cont, o) {
    return montar(cont, o, desenharDistribuicao, function (o) {
      var brl = function (v) { return 'R$ ' + Math.round(v).toLocaleString('pt-BR'); }, L = lados(o);
      return { cab: ['Faixa', L.b.nome, L.l.nome, 'Variação real'],
        linhas: o.faixas.map(function (f) { return [f.rotulo + (f.desc ? ' (' + f.desc + ')' : '') + (f.estimado ? ' – estimativa' : ''), brl(f.a), brl(f.b), num(f['var'], 1, true) + '%']; }) };
    });
  }

  /* =====================================================================
   * PROMESSAS: barra 100% empilhada por categoria
   * opts: titulo, categorias:[{id, nome, tipo:'cheio'|'claro'|'listrado'|'neutro'|'vazio'}],
   *       linhas:[{lado, nome, sub, contagens:{id:n}}], destaque:'cumprida', destaqueRotulo,
   *       excluir:['sem_evidencia'], grupos:[{tema, linhas}] (mapa tema a tema), fonte, nota
   * ===================================================================== */
  function corCategoria(cat, lado, T, hatch) {
    if (cat.cor) return cat.cor;   // cor de STATUS fixa, igual para os dois lados (registro de comparações)
    switch (cat.tipo) {
      case 'cheio': return T[lado];
      case 'claro': return T[lado + 'Claro'];
      case 'listrado': return hatch[lado + 'Claro'];
      case 'neutro': return T.neutro;
      default: return hatch.vazio;
    }
  }
  function contar(linha, o) {
    var total = 0, cats = o.categorias.filter(function (c) { return !(o.excluir && o.excluir.indexOf(c.id) >= 0); });
    cats.forEach(function (c) { total += linha.contagens[c.id] || 0; });
    var d = linha.contagens[o.destaque] || 0;
    return { cats: cats, total: total, d: d, pct: total ? d / total * 100 : 0 };
  }
  function barraEmpilhada(c, y, h, linha, o, hatch, rotular) {
    var T = c.T, g = c.g, r = contar(linha, o), x = c.x0, W = c.x1 - c.x0;
    var segs = r.cats.filter(function (cat) { return (linha.contagens[cat.id] || 0) > 0; });
    var gaps = (segs.length - 1) * 2, util = W - gaps;
    segs.forEach(function (cat, i) {
      var n = linha.contagens[cat.id], w = util * n / r.total;
      var fill = corCategoria(cat, linha.lado, T, hatch);
      var rx = (i === 0 || i === segs.length - 1) ? 4 : 0;
      var rect = el('rect', { x: x, y: y, width: Math.max(1, w), height: h, rx: rx, fill: fill, stroke: cat.tipo === 'vazio' ? 'none' : STATUS.borda, 'stroke-width': cat.tipo === 'vazio' ? 0 : 1 }, g);
      if (cat.tipo === 'vazio') el('rect', { x: x + 0.5, y: y + 0.5, width: Math.max(0, w - 1), height: h - 1, rx: rx, fill: 'none', stroke: T.muted, 'stroke-dasharray': '3 2' }, g);
      var tt = el('title', null, rect); tt.textContent = cat.nome + ': ' + n + ' de ' + r.total;
      var lab = String(n);
      if (rotular && largura(lab, 12, 700) + 10 < w) {
        var base = (cat.tipo === 'listrado' || cat.tipo === 'vazio') ? T.surface : fill;
        if (cat.tipo === 'listrado' || cat.tipo === 'vazio') el('rect', { x: x + w / 2 - largura(lab, 12, 700) / 2 - 4, y: y + h / 2 - 8, width: largura(lab, 12, 700) + 8, height: 16, rx: 3, fill: T.surface }, g);
        texto(g, x + w / 2, y + h / 2 + 4.5, lab, { size: 12, weight: 700, fill: textoSobre(base.charAt(0) === '#' ? base : T.surface), anchor: 'middle' });
      }
      x += w + 2;
    });
    return r;
  }
  function legendaPromessas(c, y, o, hatch) {
    var T = c.T, g = c.g, x = c.x0;
    o.categorias.forEach(function (cat) {
      if (o.excluir && o.excluir.indexOf(cat.id) >= 0) return;
      var w = 30 + largura(cat.nome, 12, 400) + 12;
      if (x + w > c.x1) { x = c.x0; y += 20; }
      // amostra dividida: metade com a cor de cada lado (mesma regra para os dois)
      if (cat.tipo === 'neutro' || cat.tipo === 'vazio') {
        el('rect', { x: x, y: y + 2, width: 24, height: 12, rx: 3, fill: corCategoria(cat, 'b', T, hatch) }, g);
        if (cat.tipo === 'vazio') el('rect', { x: x + 0.5, y: y + 2.5, width: 23, height: 11, rx: 3, fill: 'none', stroke: T.muted, 'stroke-dasharray': '3 2' }, g);
      } else {
        el('rect', { x: x, y: y + 2, width: 12, height: 12, rx: 2, fill: corCategoria(cat, 'b', T, hatch) }, g);
        el('rect', { x: x + 12, y: y + 2, width: 12, height: 12, rx: 2, fill: corCategoria(cat, 'l', T, hatch) }, g);
      }
      texto(g, x + 30, y + 12.5, cat.nome, { size: 12, fill: T.ink2 });
      x += w;
    });
    return y + 22;
  }
  function vencedorPromessas(linhas, o) {
    var a = contar(linhas[0], o).pct, b = contar(linhas[1], o).pct;
    if (Math.abs(a - b) < 0.05) return null;
    return a > b ? linhas[0].lado : linhas[1].lado;
  }
  function desenharPromessas(cont, o) {
    var L = lados(o);
    function ord(ls) { return ORDEM.map(function (k) { return ls.filter(function (l) { return l.lado === k; })[0]; }).filter(Boolean); }
    o.descricao = o.descricao || (o.titulo + '. ' + (o.linhas ? ord(o.linhas) : []).map(function (l) {
      var r = contar(l, o); return (l.nome || L[l.lado].nome) + ': ' + r.d + ' de ' + r.total + ' ' + (o.destaqueRotulo || o.destaque) + ' (' + num(r.pct, 1) + '%); ' +
        r.cats.map(function (cat) { return cat.nome + ' ' + (l.contagens[cat.id] || 0); }).join(', ');
    }).join('. ') + '.');
    return moldura(cont, o, function (c) {
      var T = c.T, g = c.g, y = c.y, hatch = padroes(c.defs, T);
      if (o.linhas) {
        var ls = ord(o.linhas), v = vencedorPromessas(ls, o);
        ls.forEach(function (l) {
          var r = contar(l, o), nm = l.nome || L[l.lado].nome;
          marca(g, l.lado, c.x0 + 6, y + 9, 11, T);
          texto(g, c.x0 + 18, y + 14, nm, { size: 14, weight: 700, fill: T.ink });
          var pctS = num(r.pct, 1) + '%', qtd = r.d + ' de ' + r.total + ' ' + (o.destaqueRotulo || '');
          texto(g, c.x1, y + 18, pctS, { size: 22, weight: 800, fill: T.ink, anchor: 'end' });
          texto(g, c.x1, y + 34, qtd, { size: 12, fill: T.ink2, anchor: 'end' });
          var subLs = l.sub ? quebra(l.sub, 12, 400, c.x1 - c.x0 - 18 - largura(qtd, 12, 400) - 12) : [];
          subLs.forEach(function (ln, j) { texto(g, c.x0 + 18, y + 31 + j * 15, ln, { size: 12, fill: T.muted }); });
          y += Math.max(42, 22 + subLs.length * 15 + 6);
          if (v === l.lado) { selo(g, c.x1, y, o.vencedorRotulo || 'maior proporção', l.lado, T); y += 28; }
          barraEmpilhada(c, y, 28, l, o, hatch, true);
          y += 44;
        });
      }
      if (o.grupos) {
        o.grupos.forEach(function (gr) {
          var ls2 = ord(gr.linhas), v2 = vencedorPromessas(ls2, o);
          texto(g, c.x0, y + 15, gr.tema, { size: 14, weight: 700, fill: T.ink });
          if (v2) selo(g, c.x1, y, L[v2].curto, v2, T); else seloNeutro(g, c.x1, y, 'empate', T);
          y += 30;
          ls2.forEach(function (l) {
            var r = contar(l, o);
            texto(g, c.x0, y + 12, L[l.lado].curto, { size: 12, weight: v2 === l.lado ? 700 : 400, fill: v2 === l.lado ? T.ink : T.ink2 });
            texto(g, c.x1, y + 12, r.d + ' de ' + r.total + ' (' + num(r.pct, 0) + '%)', { size: 12, weight: 700, fill: T.ink, anchor: 'end' });
            y += 17;
            barraEmpilhada(c, y, 16, l, o, hatch, true);
            y += 22;
          });
          y += 6; el('line', { x1: c.x0, x2: c.x1, y1: y, y2: y, stroke: T.grid }, g); y += 10;
        });
      }
      y = legendaPromessas(c, y + 2, o, hatch);
      return y;
    });
  }
  function promessas(cont, o) {
    return montar(cont, o, desenharPromessas, function (o) {
      var L = lados(o), linhas = [];
      var cats = o.categorias.filter(function (c) { return !(o.excluir && o.excluir.indexOf(c.id) >= 0); });
      (o.linhas || []).forEach(function (l) { var r = contar(l, o); linhas.push([l.nome || L[l.lado].nome].concat(cats.map(function (c) { return String(l.contagens[c.id] || 0); }), [r.total, num(r.pct, 1) + '%'])); });
      (o.grupos || []).forEach(function (gr) { gr.linhas.forEach(function (l) { var r = contar(l, o); linhas.push([gr.tema + ' · ' + L[l.lado].curto].concat(cats.map(function (c) { return String(l.contagens[c.id] || 0); }), [r.total, num(r.pct, 1) + '%'])); }); });
      return { cab: ['Linha'].concat(cats.map(function (c) { return c.nome; }), ['Total', '% ' + (o.destaqueRotulo || o.destaque)]), linhas: linhas };
    });
  }

  /* ---------- exportar PNG (para o botão "compartilhar imagem") ----------
   * paraPNG(svg, escala, urlFonte?): com urlFonte (ex.: '/assets/fonts/inter-latin-var.woff2') a fonte
   * vai embutida no SVG antes de rasterizar; sem ela, o navegador usa a fonte do sistema no PNG. */
  var _fonte64 = {};
  function fonteBase64(url) {
    if (_fonte64[url]) return Promise.resolve(_fonte64[url]);
    return fetch(url).then(function (r) { return r.arrayBuffer(); }).then(function (buf) {
      var b = new Uint8Array(buf), s = '', i;
      for (i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
      _fonte64[url] = btoa(s); return _fonte64[url];
    });
  }
  function paraPNG(svg, escala, urlFonte) {
    escala = escala || 2;
    var w = +svg.getAttribute('width'), h = +svg.getAttribute('height');
    var prep = urlFonte ? fonteBase64(urlFonte) : Promise.resolve(null);
    return prep.then(function (b64) {
      var clone = svg.cloneNode(true);
      clone.setAttribute('width', w); clone.setAttribute('height', h);
      clone.removeAttribute('style');
      if (b64) {
        var st = document.createElementNS(NS, 'style');
        st.textContent = "@font-face{font-family:'InterVar';font-weight:100 900;src:url(data:font/woff2;base64," + b64 + ") format('woff2')}";
        clone.insertBefore(st, clone.firstChild);
      }
      var xml = new XMLSerializer().serializeToString(clone);
      var url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
      return new Promise(function (ok, erro) {
        var img = new Image();
        img.onload = function () {
          var cv = document.createElement('canvas'); cv.width = w * escala; cv.height = h * escala;
          var cx = cv.getContext('2d'); cx.scale(escala, escala); cx.drawImage(img, 0, 0);
          cv.toBlob(function (b) { b ? ok(b) : erro(new Error('toBlob falhou')); }, 'image/png');
        };
        img.onerror = erro; img.src = url;
      });
    });
  }

  /* =====================================================================
   * CARDS v0.3 — "a seção É o card": o que se vê no site é o que se compartilha.
   *
   *   BPD.card(el, def, formato?)      desenha o card (formato 'web' = inline e responsivo; 'feed' 1080×1350;
   *                                    'story' 1080×1920; 'og' 1200×630). Devolve o <svg>.
   *   BPD.montarCard(el, def, op?)     card 'web' + botões [Compartilhar imagem] [WhatsApp] (+ tabela recolhida
   *                                    e "Saiba mais" opcionais). NUNCA desenha um segundo gráfico.
   *   BPD.cardPNG(def, formato)        Promise<Blob> com o PNG (sempre tema claro, fonte embutida).
   *
   * def = {
   *   id, tema: 'Inflação', criterio: 'menor'|'maior'|null, vencedor?: 'b'|'l'|null (calculado de def.valores
   *   quando houver criterio), valores?: {b,l} (o número que decide), titulo?: (pergunta neutra quando não há vencedor),
   *   detalhe: 'quanto os preços subiram', forca: 'clara'|'apertada', mudaria: 'o que mudaria o resultado',
   *   manchete: {valor, texto}, grafico: {tipo, titulo, sub, ...dados}, nota, fonte, periodo, dados, url,
   *   atualizado, lados, share: {texto, url}, tabela: {cab, linhas}, saibaMais: [parágrafos]
   * }
   * Regras: veredito UMA vez (no título); cada número UMA vez; ordem fixa Bolsonaro → Lula; zero declarado.
   * ===================================================================== */
  var FORMATOS = {
    web: { W: 0, H: 0, P: 16, s: 1, marca: false, url: false },
    feed: { W: 1080, H: 1350, P: 64, s: 2.3, marca: true, url: true },
    story: { W: 1080, H: 1920, P: 64, s: 2.45, topo: 250, base: 250, marca: true, url: true },
    og: { W: 1200, H: 630, P: 40, s: 1.4, marca: true, url: true, colunas: true }
  };
  var ESCURO = { fundo: '#18181b', ink: '#fafafa', ink2: '#d4d4d8', muted: '#a1a1aa', grid: '#2e2e33', axis: '#5b5b63', area: 'rgba(161,161,170,.18)', borda: '#2e2e33', tile: '#232327' };
  var CLARO = { fundo: '#ffffff', ink: '#18181b', ink2: '#3f3f46', muted: '#63636b', grid: '#ebebe8', axis: '#a1a1aa', area: 'rgba(113,113,122,.15)', borda: '#e4e4e7', tile: '#ffffff' };
  // cores de STATUS (iguais para os dois lados; nunca azul/roxo) — mesmas do /balanco/ v4
  // v0.3.5 (100-acessibilidade #20): tons ≥ 3:1 sobre branco; "não cumprida" com textura a 135° (distingue de "cumprida" em escala de
  // cinza e de "parcial" em tritanopia); "em andamento" listrado a 45°; contorno #3f3f46 entre segmentos; "sem evidência" vazado.
  var STATUS = { ok: '#1f6b47', mid: '#b47a1e', runA: '#6b8a7a', runB: '#ffffff', no: '#8f3a33', noB: '#c98a84', na: '#e4e4e7', naEsc: '#3f3f46', borda: '#3f3f46' };

  function cardTexto(g, x, y, s, size, weight, fill, anchor, ls) {
    var t = texto(g, x, y, s, { size: Math.round(size * 10) / 10, weight: weight, fill: fill, anchor: anchor });
    if (ls) t.setAttribute('letter-spacing', ls);
    return t;
  }
  function cardTicks(lo, hi, n) {
    var span = hi - lo || 1, passo = Math.pow(10, Math.floor(Math.log(span / n) / Math.LN10)), err = span / n / passo;
    passo *= err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1;
    var t = [], v = Math.floor(lo / passo + 1e-9) * passo;
    for (; v <= hi + passo * 0.001; v += passo) t.push(+v.toFixed(6));
    return t;
  }
  var _hid = 0;
  function hachura(defs, a, b, larg, angulo, fracao) {
    var id = 'bpdh' + (++_hid) + Math.random().toString(36).slice(2, 5), w = larg || 6;
    var pat = el('pattern', { id: id, patternUnits: 'userSpaceOnUse', width: w, height: w, patternTransform: 'rotate(' + (angulo || 45) + ')' }, defs);
    el('rect', { width: w, height: w, fill: b }, pat);
    el('rect', { width: w * (fracao || 0.5), height: w, fill: a }, pat);
    return 'url(#' + id + ')';
  }

  /* contexto de desenho: escala s, paleta, helpers em unidades lógicas */
  function ctxCard(svg, defs, g, F, escuro, L) {
    var C = escuro ? ESCURO : CLARO, T = TEMAS.light, s = F.s;
    return {
      svg: svg, defs: defs, g: g, F: F, C: C, T: T, s: s, L: L, escuro: escuro,
      z: function (n) { return n * s; },
      t: function (x, y, str, size, weight, fill, anchor, ls) { return cardTexto(g, x, y, str, size * s, weight, fill || C.ink, anchor, ls ? ls * s : null); },
      w: function (str, size, weight) { return largura(str, size * s, weight || 400); },
      q: function (str, size, weight, max) { return quebra(str, size * s, weight || 400, max); },
      marca: function (lado, cx, cy, tam) { return marca(g, lado, cx, cy, tam * s, { b: T.b, l: T.l, ctx: T.ctx, ring: C.fundo }); },
      corLado: function (lado) { return T[lado]; },
      st: function (tipo) {
        if (tipo === 'ok') return STATUS.ok; if (tipo === 'mid') return STATUS.mid;
        if (tipo === 'no') return hachura(defs, STATUS.no, STATUS.noB, 7 * s, 135, 0.7);
        if (tipo === 'run') return hachura(defs, STATUS.runA, STATUS.runB, 6 * s);
        return escuro ? STATUS.naEsc : STATUS.na;
      }
    };
  }

  /* ---------- blocos de texto ---------- */
  function vencedorDef(def) {
    if (def.vencedor !== undefined && !def.criterio) return def.vencedor;
    if (def.criterio && def.valores) return vencedor({ criterio: def.criterio, valores: def.valores, vencedor: def.vencedor, titulo: def.tema });
    return def.vencedor || null;
  }
  function blkMarca(c, x, y) { c.t(x, y + c.z(12), 'BORA PROS DADOS BRASIL', 12, 800, c.C.muted, 'start', 1.4); return y + c.z(24); }
  function blkTitulo(c, x, y, w, def, venc) {
    var C = c.C;
    if (venc) {
      c.q(def.tema + ':', 21, 800, w).forEach(function (ln) { y += c.z(25); c.t(x, y - c.z(5), ln, 21, 800, C.ink); });
      // tamanho fixado pelo nome mais longo dos dois lados (mesmo desenho para qualquer vencedor)
      var ts = 23, longo = c.w(c.L.b.nome, 10, 800) > c.w(c.L.l.nome, 10, 800) ? c.L.b.nome : c.L.l.nome;
      while (ts > 15 && c.w(longo + ' à frente', ts, 800) + c.z(ts * 0.85) > w) ts -= 0.5;
      y += c.z(ts * 1.2);
      c.marca(venc, x + c.z(ts * 0.3), y - c.z(ts * 0.36), ts * 0.5);
      var tx = x + c.z(ts * 0.8), nm = c.L[venc].nome + ' à frente';
      c.t(tx, y, nm, ts, 800, C.ink);
      el('rect', { x: tx, y: y + c.z(ts * 0.16), width: c.w(nm, ts, 800), height: c.z(Math.max(2.5, ts * 0.11)), rx: c.z(1.5), fill: c.corLado(venc) }, c.g);
      return y + c.z(ts * 0.38);
    }
    c.q(def.titulo || def.tema, 21, 800, w).forEach(function (ln) { y += c.z(25); c.t(x, y - c.z(5), ln, 21, 800, C.ink); });
    return y + c.z(2);
  }
  function blkCriterio(c, x, y, w, def) {
    var C = c.C, partes = [];
    var crit = def.criterio === 'menor' ? '↓ menor é melhor' : def.criterio === 'maior' ? '↑ maior é melhor' : (def.criterioTexto || 'sem vencedor: contexto');
    partes.push(crit + (def.detalhe ? ' · ' + def.detalhe : ''));
    var ls = c.q(partes[0], 13, 600, w);
    ls.forEach(function (ln) { y += c.z(18); c.t(x, y - c.z(4), ln, 13, 600, C.ink2); });
    if (def.forca) {
      var txt = def.forca === 'apertada' ? 'diferença apertada' : 'diferença clara', pw = c.w(txt, 13, 700) + c.z(18), ph = c.z(22);
      y += c.z(6);
      el('rect', { x: x + 0.5, y: y + 0.5, width: pw - 1, height: ph - 1, rx: ph / 2, fill: 'none', stroke: C.ink2, 'stroke-width': Math.max(1, c.z(1)), 'stroke-dasharray': def.forca === 'apertada' ? c.z(3) + ' ' + c.z(2) : null }, c.g);
      c.t(x + pw / 2, y + ph * 0.7, txt, 13, 700, C.ink2, 'middle');
      y += ph;
    }
    return y + c.z(4);
  }
  function blkManchete(c, x, y, w, def) {
    if (!def.manchete) return y;
    var C = c.C, ms = 42, mv = def.manchete.valor;
    while (ms > 28 && c.w(mv, ms, 800) > w * 0.55) ms -= 1;
    var mw = c.w(mv, ms, 800), tx = x + mw + c.z(12), tw = x + w - tx, tl;
    y += c.z(8);
    if (tw >= c.z(140)) {
      tl = c.q(def.manchete.texto, 14, 400, tw);
      var hT = tl.length * c.z(18), hM = c.z(ms * 0.78), y0 = y + Math.max(0, (hM - hT) / 2);
      c.t(x, y + hM, mv, ms, 800, C.ink);
      tl.forEach(function (ln, j) { c.t(tx, y0 + c.z(14) + j * c.z(18), ln, 14, j === 0 ? 700 : 400, j === 0 ? C.ink : C.ink2); });
      return y + Math.max(hM, hT) + c.z(8);
    }
    c.t(x, y + c.z(ms * 0.78), mv, ms, 800, C.ink); y += c.z(ms * 0.78) + c.z(12);
    c.q(def.manchete.texto, 14, 400, w).forEach(function (ln, j) { y += c.z(18); c.t(x, y - c.z(4), ln, 14, j === 0 ? 700 : 400, j === 0 ? C.ink : C.ink2); });
    return y + c.z(8);
  }
  function blkGraficoTitulo(c, x, y, w, gr) {
    if (gr.titulo) c.q(gr.titulo.toUpperCase(), 12.5, 800, w - c.z(gr.titulo.length * 0.6)).forEach(function (ln) { y += c.z(16); c.t(x, y - c.z(3), ln, 12.5, 800, c.C.ink, 'start', 0.6); });
    if (gr.sub) c.q(gr.sub, 13, 400, w).forEach(function (ln) { y += c.z(17); c.t(x, y - c.z(3), ln, 13, 400, c.C.muted); });
    return y + c.z(6);
  }
  function blkRodape(c, x, y, w, def, comUrl) {
    var C = c.C;
    if (def.mudaria) {
      y += c.z(4);
      var lab = 'O que mudaria o resultado: ';
      c.q(lab + def.mudaria, 13, 400, w).forEach(function (ln, j) {
        y += c.z(17);
        if (j === 0 && ln.indexOf(lab.trim()) === 0) { c.t(x, y - c.z(3), lab.trim(), 13, 700, C.ink); c.t(x + c.w(lab, 13, 700), y - c.z(3), ln.slice(lab.length), 13, 400, C.ink2); }
        else c.t(x, y - c.z(3), ln, 13, 400, C.ink2);
      });
    }
    if (def.nota) c.q(def.nota, 13, 400, w).forEach(function (ln) { y += c.z(17); c.t(x, y - c.z(3), ln, 13, 400, C.ink2); });
    y += c.z(8);
    el('line', { x1: x, x2: x + w, y1: y, y2: y, stroke: C.grid, 'stroke-width': Math.max(1, c.z(1)) }, c.g);
    y += c.z(2);
    var f = 'Fonte: ' + def.fonte + (def.periodo ? ' · ' + def.periodo : '') + (def.dados ? ' · dados até ' + def.dados : '');
    c.q(f, 12.5, 400, w).forEach(function (ln) { y += c.z(16); c.t(x, y - c.z(3), ln, 12.5, 400, C.muted); });
    if (comUrl) {
      c.q((def.url || SITE) + ' · atualizado em ' + (def.atualizado || ''), 12.5, 700, w).forEach(function (ln) { y += c.z(16); c.t(x, y - c.z(3), ln, 12.5, 700, C.ink2); });
    }
    return y + c.z(2);
  }

  /* ---------- gráficos (todos em px reais; c.z converte unidades lógicas) ---------- */
  var GRAF = {};
  GRAF.trajetoria = { flex: true, alt: 200, desenhar: function (c, x, y, w, h, gr) {
    var C = c.C, f = fmtFn(gr.formato), fy = fmtFn(gr.formatoEixo || gr.formato), n = Math.max(gr.b.length, gr.l.length) - 1;
    var todos = gr.b.concat(gr.l).filter(function (v) { return v != null; });
    var lo = Math.min(0, Math.min.apply(null, todos)), hi = Math.max(0, Math.max.apply(null, todos));
    if (gr.yMax != null) hi = Math.max(hi, gr.yMax);
    var ticks = cardTicks(lo, hi, 4); lo = Math.min(lo, ticks[0]); hi = Math.max(hi, ticks[ticks.length - 1]);
    var axW = Math.max.apply(null, ticks.map(function (t) { return c.w(fy(t), 12.5); })) + c.z(6);
    var fimTxt = function (lado) { return [c.L[lado].curto.toUpperCase(), gr.rotuloFim === 'nome' ? null : f(gr[lado][gr[lado].length - 1]), gr.fim ? gr.fim[lado] : null]; };
    var endW = Math.max.apply(null, ORDEM.map(function (l) { var a = fimTxt(l); return Math.max(c.w(a[0], 12, 800), a[1] ? c.w(a[1], 17, 800) : 0, a[2] ? c.w(a[2], 12.5) : 0); })) + c.z(14);
    var pl = x + axW, pr = x + w - endW, top = y + c.z(8), bot = y + h - c.z(gr.rotuloX ? 34 : 20);
    var X = function (i) { return pl + i / n * (pr - pl); }, Y = function (v) { return bot - (v - lo) / (hi - lo) * (bot - top); };
    ticks.forEach(function (t) {
      el('line', { x1: pl, x2: pr, y1: Y(t), y2: Y(t), stroke: t === 0 ? C.axis : C.grid, 'stroke-width': c.z(t === 0 ? 1.4 : 1) }, c.g);
      c.t(pl - c.z(5), Y(t) + c.z(4.5), fy(t), 12.5, 400, C.muted, 'end');
    });
    var passo = gr.passoX || 12;
    var r0 = gr.rotulo0 || 'Posse', fim0 = X(0) + c.w(r0, 12.5) + c.z(6), i;
    c.t(X(0), bot + c.z(15), r0, 12.5, 400, C.muted, 'start');
    for (i = passo; i <= n; i += passo) { if (X(i) - c.w(String(i), 12.5) / 2 < fim0) continue; c.t(X(i), bot + c.z(15), String(i), 12.5, 400, C.muted, 'middle'); }
    if (gr.rotuloX) c.t(pr, bot + c.z(30), gr.rotuloX, 12.5, 400, C.muted, 'end');
    var m = Math.min(gr.b.length, gr.l.length) - 1, d = '';
    for (i = 0; i <= m; i++) d += (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(gr.b[i]).toFixed(1);
    for (i = m; i >= 0; i--) d += 'L' + X(i).toFixed(1) + ',' + Y(gr.l[i]).toFixed(1);
    el('path', { d: d + 'Z', fill: C.area }, c.g);
    if (gr.marcaMes != null) {
      el('line', { x1: X(gr.marcaMes), x2: X(gr.marcaMes), y1: top, y2: bot, stroke: C.axis, 'stroke-width': c.z(1), 'stroke-dasharray': c.z(4) + ' ' + c.z(3) }, c.g);
      var mtTopo = gr.marcaValor && !gr.marcaValor.acima;
      if (gr.marcaTexto) {
        var mty = mtTopo ? top + c.z(10) : bot - c.z(5), mtw = c.w(gr.marcaTexto, 12.5, 600);
        el('rect', { x: X(gr.marcaMes) - c.z(6) - mtw, y: mty - c.z(12), width: mtw + c.z(4), height: c.z(16), rx: c.z(3), fill: C.fundo, opacity: 0.85 }, c.g);
        c.t(X(gr.marcaMes) - c.z(4), mty, gr.marcaTexto, 12.5, 600, C.ink2, 'end');
      }
    }
    ORDEM.forEach(function (lado) {
      var v = gr[lado], dd = '';
      v.forEach(function (val, j) { if (val != null) dd += (dd ? 'L' : 'M') + X(j).toFixed(1) + ',' + Y(val).toFixed(1); });
      el('path', { d: dd, fill: 'none', stroke: c.corLado(lado), 'stroke-width': c.z(2.6), 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, c.g);
    });
    // valor no "mesmo mês" (quando o outro lado ainda não terminou)
    if (gr.marcaValor) {
      var lv = gr.marcaValor.lado, iv = gr.marcaMes, vv = gr[lv][iv];
      c.marca(lv, X(iv), Y(vv), 7);
      var lab = f(vv), lw = c.w(lab, 13, 800);
      el('rect', { x: X(iv) - lw - c.z(12), y: Y(vv) - c.z(gr.marcaValor.acima ? 22 : -6), width: lw + c.z(6), height: c.z(16), rx: c.z(3), fill: C.fundo, opacity: 0.9 }, c.g);
      c.t(X(iv) - c.z(9), Y(vv) - c.z(gr.marcaValor.acima ? 9 : -18), lab, 13, 800, C.ink, 'end');
    }
    var fins = ORDEM.map(function (lado) { var v = gr[lado], j = v.length - 1; c.marca(lado, X(j), Y(v[j]), 8); return { lado: lado, x: X(j), y: Y(v[j]) }; });
    fins.sort(function (a, b) { return a.y - b.y; });
    var hB = function (lado) { var a = fimTxt(lado); return c.z(12) + (a[1] ? c.z(19) : 0) + (a[2] ? c.z(15) : 0); };
    var alt = Math.max(hB('b'), hB('l')) + c.z(6), lim0 = top + c.z(10), lim1 = bot - hB(fins[1].lado) + c.z(10);
    fins[0].ly = fins[0].y - c.z(6); fins[1].ly = fins[1].y - c.z(6);
    if (fins[1].ly - fins[0].ly < alt) { var mid = (fins[0].ly + fins[1].ly) / 2; fins[0].ly = mid - alt / 2; fins[1].ly = mid + alt / 2; }
    if (fins[1].ly > lim1) { fins[1].ly = lim1; fins[0].ly = Math.min(fins[0].ly, lim1 - alt); }
    if (fins[0].ly < lim0) { fins[0].ly = lim0; fins[1].ly = Math.max(fins[1].ly, lim0 + alt); }
    fins.forEach(function (fi) {
      var a = fimTxt(fi.lado), lx = pr + c.z(12), ly = fi.ly;
      el('line', { x1: fi.x + c.z(5), x2: lx - c.z(3), y1: fi.y, y2: ly + c.z(4), stroke: C.axis, 'stroke-width': c.z(0.8) }, c.g);
      c.t(lx, ly + c.z(8), a[0], 12, 800, C.ink2, 'start', 0.4);
      var yy = ly + c.z(8);
      if (a[1]) { yy += c.z(19); c.t(lx, yy, a[1], 17, 800, C.ink); }
      if (a[2]) { yy += c.z(15); c.t(lx, yy, a[2], 12.5, 400, C.muted); }
    });
  } };

  /* linha anual com faixas de governo (anos de calendário) */
  GRAF.anual = { flex: true, alt: 200, desenhar: function (c, x, y, w, h, gr) {
    var C = c.C, f = fmtFn(gr.formato), fy = fmtFn(gr.formatoEixo || gr.formato), anos = gr.anos, n = anos.length - 1;
    var vals = anos.map(function (a) { return gr.v[a]; });
    var lo = gr.yMin != null ? gr.yMin : Math.min(0, Math.min.apply(null, vals)), hi = gr.yMax != null ? gr.yMax : Math.max.apply(null, vals) * 1.08;
    var ticks = cardTicks(lo, hi, 4).filter(function (t) { return t >= lo - 1e-9; }); hi = Math.max(hi, ticks[ticks.length - 1]);
    if (lo !== 0) { c.q('Atenção: o eixo começa em ' + fy(lo) + ', não em zero', 12.5, 600, w).forEach(function (ln) { c.t(x, y + c.z(12), ln, 12.5, 600, C.ink2); y += c.z(17); h -= c.z(17); }); y += c.z(1); }
    var axW = Math.max.apply(null, ticks.map(function (t) { return c.w(fy(t), 12.5); })) + c.z(6);
    var pl = x + axW + c.z(10), pr = x + w - c.z(18);
    var X = function (i) { return pl + i / n * (pr - pl); };
    var faixaX = function (fx) { var ia = anos.indexOf(fx.de), ib = anos.indexOf(fx.ate); return [X(ia) - (ia > 0 ? (X(1) - X(0)) / 2 : c.z(8)), X(ib) + (ib < n ? (X(1) - X(0)) / 2 : c.z(8))]; };
    var linhasF = (gr.faixas || []).map(function (fx) { var ab = faixaX(fx); return fx.texto ? c.q(fx.texto, 12.5, 600, ab[1] - ab[0] - c.z(8)) : []; });
    var nL = Math.max.apply(null, [0].concat(linhasF.map(function (l) { return l.length; })));
    var hh = c.z(22 + nL * 16), top = y + hh + c.z(4), bot = y + h - c.z(20);
    var Y = function (v) { return bot - (v - lo) / (hi - lo) * (bot - top); };
    (gr.faixas || []).forEach(function (fx) {
      var ab = faixaX(fx), xa = ab[0], xb = ab[1], fi = (gr.faixas || []).indexOf(fx);
      el('rect', { x: xa, y: top - hh, width: xb - xa, height: bot - top + hh, fill: fx.lado === 'b' ? 'rgba(20,121,176,.09)' : 'rgba(114,80,251,.09)' }, c.g);
      c.marca(fx.lado, xa + c.z(8), top - hh + c.z(10), 7);
      c.t(xa + c.z(15), top - hh + c.z(14), c.L[fx.lado].curto, 12.5, 700, C.ink2);
      linhasF[fi].forEach(function (ln, j) { c.t(xa + c.z(6), top - hh + c.z(30 + 16 * j), ln, 12.5, 600, C.ink2); });
    });
    ticks.forEach(function (t) {
      el('line', { x1: pl - c.z(10), x2: pr + c.z(8), y1: Y(t), y2: Y(t), stroke: C.grid, 'stroke-width': c.z(1) }, c.g);
      c.t(pl - c.z(14), Y(t) + c.z(4.5), fy(t), 12.5, 400, C.muted, 'end');
    });
    var cada = Math.max(1, Math.ceil(c.w('2026', 12.5) * 1.6 / ((pr - pl) / Math.max(1, n))));
    var ultX = -1e9, lw4 = c.w('2026', 12.5);
    anos.forEach(function (a, i) { if ((i % cada === 0 || i === n) && X(i) - lw4 / 2 > ultX + c.z(4)) { c.t(X(i), bot + c.z(15), String(a), 12.5, 400, C.muted, 'middle'); ultX = X(i) + lw4 / 2; } });
    // linha: segmento de cada governo na sua cor; anos fora das faixas em cinza
    var ladoDe = function (a) { var r = null; (gr.faixas || []).forEach(function (fx) { if (a >= fx.de && a <= fx.ate) r = fx.lado; }); return r; };
    for (var i = 1; i <= n; i++) {
      var lado = ladoDe(anos[i]) || 'ctx';
      el('line', { x1: X(i - 1), y1: Y(vals[i - 1]), x2: X(i), y2: Y(vals[i]), stroke: lado === 'ctx' ? C.axis : c.corLado(lado), 'stroke-width': c.z(2.6), 'stroke-linecap': 'round' }, c.g);
    }
    var caixas = [];
    anos.forEach(function (a, i) {
      var lado = ladoDe(a);
      if (gr.parcial && gr.parcial.indexOf(a) >= 0) el('circle', { cx: X(i), cy: Y(vals[i]), r: c.z(4.5), fill: C.fundo, stroke: lado ? c.corLado(lado) : C.axis, 'stroke-width': c.z(2) }, c.g);
      else if (lado) c.marca(lado, X(i), Y(vals[i]), 8); else el('circle', { cx: X(i), cy: Y(vals[i]), r: c.z(3), fill: C.axis }, c.g);
      if (gr.rotular && gr.rotular.indexOf(a) >= 0) {
        var lab = f(vals[i]) + (gr.sufixoRotulo && gr.sufixoRotulo[a] ? ' ' + gr.sufixoRotulo[a] : ''), lw = c.w(lab, 13, 800);
        var abaixo = gr.abaixo && gr.abaixo.indexOf(a) >= 0, ly = abaixo ? Y(vals[i]) + c.z(19) : Y(vals[i]) - c.z(9);
        var anc = i === 0 ? 'start' : i === n ? 'end' : 'middle', bx = anc === 'start' ? X(i) - c.z(4) : anc === 'end' ? X(i) - lw + c.z(4) : X(i) - lw / 2;
        if (anc === 'middle' && bx + lw > x + w) { anc = 'end'; bx = X(i) - lw + c.z(4); }
        caixas.forEach(function (b) { if (bx < b.x + b.w && bx + lw > b.x && Math.abs(ly - b.y) < c.z(15)) ly = abaixo ? ly + c.z(15) : ly - c.z(15); });
        caixas.push({ x: bx, y: ly, w: lw });
        c.t(anc === 'start' ? X(i) - c.z(4) : anc === 'end' ? X(i) + c.z(4) : X(i), ly, lab, 13, 800, C.ink, anc);
      }
    });
  } };

  /* série no calendário, linhas NEUTRAS (contexto externo: tinta e cinza, nunca as cores dos lados) com faixas de governo
   * gr = {x:['2019-01',…], series:[{nome, v:[…], estilo:'ink'|'ctx'}], faixas:[{lado, de, ate}] (índices), yMin?, yMax?,
   *       formato, formatoEixo, anotacoes:[{i, texto}], rotuloX?:function(s){} } — acrescentado pela home (16/10/2026); revisado na v0.3.6 */
  GRAF.serie = { flex: true, alt: 190, desenhar: function (c, x, y, w, h, gr) {
    var C = c.C, f = fmtFn(gr.formato), fy = fmtFn(gr.formatoEixo || gr.formato), n = gr.x.length - 1;
    var todos = []; gr.series.forEach(function (s) { s.v.forEach(function (v) { if (v != null) todos.push(v); }); });
    var lo = gr.yMin != null ? gr.yMin : Math.min(0, Math.min.apply(null, todos)), hi = gr.yMax != null ? gr.yMax : Math.max.apply(null, todos) * 1.08;
    var ticks = cardTicks(lo, hi, 4).filter(function (t) { return t >= lo - 1e-9; }); hi = Math.max(hi, ticks[ticks.length - 1]);
    if (lo !== 0) { c.q('Atenção: o eixo começa em ' + fy(lo) + ', não em zero', 12.5, 600, w).forEach(function (ln) { c.t(x, y + c.z(12), ln, 12.5, 600, C.ink2); y += c.z(17); h -= c.z(17); }); }
    if (gr.series.length > 1) {
      var lx = x;
      gr.series.forEach(function (s) {
        el('line', { x1: lx, x2: lx + c.z(16), y1: y + c.z(9), y2: y + c.z(9), stroke: s.estilo === 'ctx' ? C.muted : C.ink, 'stroke-width': c.z(2.4), 'stroke-dasharray': s.estilo === 'ctx' ? c.z(4) + ' ' + c.z(3) : null }, c.g);
        c.t(lx + c.z(20), y + c.z(13), s.nome, 12.5, 600, C.ink2); lx += c.z(32) + c.w(s.nome, 12.5, 600);
      });
      y += c.z(20); h -= c.z(20);
    }
    var ultimo = function (s) { for (var j = s.v.length - 1; j >= 0; j--) if (s.v[j] != null) return j; return 0; };
    var fimLab = gr.series.map(function (s) { return f(s.v[ultimo(s)]); });
    var axW = Math.max.apply(null, ticks.map(function (t) { return c.w(fy(t), 12.5); })) + c.z(6);
    var endW = Math.max.apply(null, fimLab.map(function (l) { return c.w(l, 13, 800); })) + c.z(10);
    var pl = x + axW + c.z(6), pr = x + w - endW, top = y + c.z(24), bot = y + h - c.z(18);
    var X = function (i) { return pl + i / n * (pr - pl); }, Y = function (v) { return bot - (v - lo) / (hi - lo) * (bot - top); };
    (gr.faixas || []).forEach(function (fx) {
      var xa = X(fx.de), xb = X(fx.ate);
      el('rect', { x: xa, y: top - c.z(22), width: Math.max(0, xb - xa), height: bot - top + c.z(22), fill: fx.lado === 'b' ? 'rgba(20,121,176,.09)' : 'rgba(114,80,251,.09)' }, c.g);
      if (c.w(c.L[fx.lado].curto, 12.5, 700) + c.z(20) <= xb - xa) {   // rótulo só se couber na faixa
        c.marca(fx.lado, xa + c.z(9), top - c.z(11), 7);
        c.t(xa + c.z(16), top - c.z(7), c.L[fx.lado].curto, 12.5, 700, C.ink2);
      }
    });
    ticks.forEach(function (t) {
      el('line', { x1: pl, x2: pr, y1: Y(t), y2: Y(t), stroke: C.grid, 'stroke-width': c.z(1) }, c.g);
      c.t(pl - c.z(6), Y(t) + c.z(4.5), fy(t), 12.5, 400, C.muted, 'end');
    });
    var rx = gr.rotuloX || function (s) { return s.slice(5, 7) === '01' && (+s.slice(0, 4)) % 2 === 1 ? s.slice(0, 4) : ''; };
    var ultX = -1e9;
    gr.x.forEach(function (s, i) {
      var r = rx(s); if (!r) return; var lw = c.w(r, 12.5), ini = i === 0, esq = ini ? X(i) : X(i) - lw / 2;
      if (esq < ultX + c.z(4) || esq + lw > x + w) return;
      c.t(X(i), bot + c.z(15), r, 12.5, 400, C.muted, ini ? 'start' : 'middle'); ultX = esq + lw;
    });
    (gr.anotacoes || []).forEach(function (a, j) {
      var xa = X(a.i), lw = c.w(a.texto, 12.5, 600), dir = xa + lw + c.z(6) > pr, dy = c.z(18 * j);
      el('line', { x1: xa, x2: xa, y1: top, y2: bot, stroke: C.axis, 'stroke-width': c.z(1) }, c.g);
      el('rect', { x: dir ? xa - lw - c.z(6) : xa + c.z(2), y: top + c.z(2) + dy, width: lw + c.z(4), height: c.z(16), fill: C.fundo, opacity: 0.85 }, c.g);
      c.t(dir ? xa - c.z(4) : xa + c.z(4), top + c.z(14) + dy, a.texto, 12.5, 600, C.ink2, dir ? 'end' : 'start');
    });
    var fins = [];
    gr.series.forEach(function (s, k) {
      var d = '';
      s.v.forEach(function (v, i) { if (v != null) d += (d ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(v).toFixed(1); });
      el('path', { d: d, fill: 'none', stroke: s.estilo === 'ctx' ? C.muted : C.ink, 'stroke-width': c.z(s.estilo === 'ctx' ? 2.2 : 2.6), 'stroke-dasharray': s.estilo === 'ctx' ? c.z(5) + ' ' + c.z(4) : null, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, c.g);
      var j = ultimo(s);
      el('circle', { cx: X(j), cy: Y(s.v[j]), r: c.z(3.5), fill: s.estilo === 'ctx' ? C.muted : C.ink, stroke: C.fundo, 'stroke-width': c.z(1.5) }, c.g);
      fins.push({ y: Y(s.v[j]), lab: fimLab[k] });
    });
    fins.sort(function (a, b) { return a.y - b.y; });
    if (fins.length > 1 && fins[1].y - fins[0].y < c.z(16)) { var m = (fins[0].y + fins[1].y) / 2; fins[0].y = m - c.z(8); fins[1].y = m + c.z(8); }
    fins.forEach(function (fi) { c.t(pr + c.z(6), fi.y + c.z(4.5), fi.lab, 13, 800, C.ink); });
  } };

  /* barras ano a ano de mandato (1º ano × 1º ano ...) */
  GRAF.barras = { flex: true, alt: 210, desenhar: function (c, x, y, w, h, gr) {
    var C = c.C, f = fmtFn(gr.formato), fy = fmtFn(gr.formatoEixo || gr.formato), G = gr.grupos;
    // legenda (forma + nome + período)
    var lx = x, ly = y + c.z(12);
    ORDEM.forEach(function (lado) {
      var s = c.L[lado].curto + (gr.periodos ? ' · ' + gr.periodos[lado] : ''), sw = c.w(s, 12.5, 600) + c.z(26);
      if (lx + sw > x + w) { lx = x; ly += c.z(18); }
      c.marca(lado, lx + c.z(5), ly - c.z(4), 9); c.t(lx + c.z(14), ly, s, 12.5, 600, C.ink2); lx += sw;
    });
    y = ly + c.z(10);
    var vals = []; G.forEach(function (q) { ORDEM.forEach(function (l) { if (q[l] && q[l].v != null) vals.push(q[l].v); }); });
    var lo = gr.yMin != null ? gr.yMin : Math.min(0, Math.min.apply(null, vals)), hiV = Math.max(0, Math.max.apply(null, vals));
    var ticks = cardTicks(lo, hiV + (hiV - lo) * 0.12, 4).filter(function (t) { return t >= lo - 1e-9; }), hi = ticks[ticks.length - 1];
    if (lo < 0) lo = Math.min(lo, ticks[0]);
    if (gr.yMin != null && gr.yMin !== 0) { c.q('Atenção: o eixo começa em ' + fy(gr.yMin) + ', não em zero', 12.5, 600, w).forEach(function (ln) { c.t(x, y + c.z(12), ln, 12.5, 600, C.ink2); y += c.z(17); }); y += c.z(1); }
    var axW = Math.max.apply(null, ticks.map(function (t) { return c.w(fy(t), 12.5); })) + c.z(6);
    var pl = x + axW, pr = x + w, top = y + c.z(36), bot = c._fimGraf - c.z(gr.semRotuloGrupo ? 22 : 38);
    var botB = bot - (lo < 0 ? c.z(18) : 0);
    var Y = function (v) { return botB - (v - lo) / (hi - lo) * (botB - top); };
    ticks.forEach(function (t) {
      el('line', { x1: pl, x2: pr, y1: Y(t), y2: Y(t), stroke: t === 0 ? C.axis : C.grid, 'stroke-width': c.z(t === 0 ? 1.4 : 1) }, c.g);
      c.t(pl - c.z(5), Y(t) + c.z(4.5), fy(t), 12.5, 400, C.muted, 'end');
    });
    var gw = (pr - pl) / G.length, bw = Math.min(c.z(44), gw * 0.36), gap = c.z(3);
    var fv = 12.5, maxLab = Math.max.apply(null, vals.map(function (v) { return c.w(f(v), fv, 800); }));
    var escalona = maxLab + c.z(4) > bw + gap;
    var anosJuntos = G.some(function (q) { return ORDEM.some(function (l) { return q[l] && q[l].rot && c.w(q[l].rot, 12, 600) > bw + gap - c.z(1); }); });
    var y0 = Y(Math.max(lo, 0));
    G.forEach(function (q, gi) {
      var cx = pl + gw * gi + gw / 2, labY = {};
      ORDEM.forEach(function (lado) { var it = q[lado]; if (it && it.v != null && it.v >= 0) labY[lado] = Y(it.v) - c.z(5); });
      if (escalona && labY.b != null && labY.l != null) {
        // o rótulo da barra mais baixa não pode encostar na barra vizinha mais alta: sobe acima do rótulo dela
        var baixo = labY.b > labY.l ? 'b' : 'l', alto = baixo === 'b' ? 'l' : 'b';
        labY[baixo] = labY[alto] - c.z(15);
      }
      ORDEM.forEach(function (lado, li) {
        var bx = li === 0 ? cx - gap / 2 - bw : cx + gap / 2, it = q[lado];
        if (!it || it.v == null) {
          var tv = c.t(bx + bw / 2 + c.z(4), y0 - c.z(4), it && it.vazio ? it.vazio : '—', 12, 600, C.muted, 'start');
          tv.setAttribute('transform', 'rotate(-90 ' + (bx + bw / 2 + c.z(4)) + ' ' + (y0 - c.z(4)) + ')');
          if (it && it.rot && !anosJuntos) c.t(bx + bw / 2, bot + c.z(15), it.rot, 12, 600, C.ink2, 'middle');
          return;
        }
        var fill = it.parcial || it.fora ? hachura(c.defs, c.corLado(lado), C.fundo, c.z(6)) : c.corLado(lado);
        var yv = Y(it.v), ya = Math.min(yv, y0), hb = Math.max(c.z(1.5), Math.abs(yv - y0));
        el('rect', { x: bx, y: ya, width: bw, height: hb, rx: c.z(2), fill: fill, stroke: (it.parcial || it.fora) ? c.corLado(lado) : 'none', 'stroke-width': c.z(1.2) }, c.g);
        var neg = it.v < 0;
        c.t(bx + bw / 2, neg ? yv + c.z(14) : labY[lado], f(it.v), fv, 800, C.ink, 'middle');
        if (!anosJuntos) c.t(bx + bw / 2, bot + c.z(15), it.rot, 12, 600, C.ink2, 'middle');
      });
      if (anosJuntos) { var rb = q.b ? String(q.b.rot) : '', rl = q.l ? String(q.l.rot) : ''; c.t(cx, bot + c.z(15), rb + '/' + (rl.length === 4 && rb.length === 4 ? rl.slice(2) : rl), 12, 600, C.ink2, 'middle'); }
      if (!gr.semRotuloGrupo) c.t(cx, bot + c.z(31), q.rotulo, 12, 400, C.muted, 'middle');
    });
  } };

  /* duelo: dois valores, barras a partir de zero */
  GRAF.duelo = { flex: false, desenhar: function (c, x, y, w, h, gr) {
    var C = c.C, f = fmtFn(gr.formato), vals = ORDEM.map(function (l) { return gr.valores[l]; });
    var lo = Math.min(0, Math.min.apply(null, vals)), hi = Math.max(0, Math.max.apply(null, vals));
    var vs = 22; while (vs > 15 && Math.max.apply(null, vals.map(function (v) { return c.w(f(v), vs, 800); })) > w * 0.42) vs -= 1;
    var labW = Math.max.apply(null, vals.map(function (v) { return c.w(f(v), vs, 800); })) + c.z(10);
    var pl = x + (lo < 0 ? labW : 0), pr = x + w - (hi > 0 ? labW : 0);
    var X = function (v) { return pl + (v - lo) / (hi - lo || 1) * (pr - pl); };
    ORDEM.forEach(function (lado) {
      var nm = c.L[lado].nome + (gr.periodos ? ' · ' + gr.periodos[lado] : '');
      if (c.w(nm, 13, 700) + c.z(16) > w) nm = c.L[lado].curto + (gr.periodos ? ' · ' + gr.periodos[lado] : '');
      c.marca(lado, x + c.z(5), y + c.z(10), 10); c.t(x + c.z(15), y + c.z(14), nm, 13, 700, C.ink);
      y += c.z(22);
      var v = gr.valores[lado], xa = X(0), xb = X(v); if (Math.abs(xb - xa) < 2) xb = xa + (v < 0 ? -2 : 2);
      barra(c.g, xa, xb, y, c.z(24), c.corLado(lado));
      c.t(v < 0 ? xb - c.z(6) : xb + c.z(6), y + c.z(12) + c.z(vs * 0.36), f(v), vs, 800, C.ink, v < 0 ? 'end' : 'start');
      if (lo < 0) el('line', { x1: X(0), x2: X(0), y1: y - c.z(4), y2: y + c.z(28), stroke: C.ink2, 'stroke-width': c.z(1) }, c.g);
      y += c.z(24);
      if (gr.sub && gr.sub[lado]) c.q(gr.sub[lado], 13, 400, w).forEach(function (ln) { y += c.z(17); c.t(x, y - c.z(3), ln, 13, 400, C.ink2); });
      y += c.z(14);
    });
    return y;
  } };

  /* vários pares (b × l) em grupos, mesma escala ou escala própria por grupo */
  GRAF.pares = { flex: false, desenhar: function (c, x, y, w, h, gr) {
    var C = c.C, f = fmtFn(gr.formato);
    var nomeW = Math.max.apply(null, ORDEM.map(function (l) { return c.w(c.L[l].curto, 12.5, 600); })) + c.z(13) + c.z(8);
    var todos = []; gr.grupos.forEach(function (q) { todos.push(q.b, q.l); });
    var hiG = Math.max.apply(null, todos);
    gr.grupos.forEach(function (q) {
      var fq = q.formato ? fmtFn(q.formato) : f, hi = gr.escalaPropria ? Math.max(q.b, q.l) : hiG;
      var labW = Math.max(c.w(fq(q.b), 14, 800), c.w(fq(q.l), 14, 800)) + c.z(8);
      y += c.z(16); c.t(x, y - c.z(2), q.rotulo, 13.5, 800, C.ink);
      if (q.sub) { var sw = c.w(q.rotulo, 13.5, 800) + c.z(8); if (sw + c.w(q.sub, 12.5) <= w) c.t(x + sw, y - c.z(2), q.sub, 12.5, 400, C.muted); else { y += c.z(16); c.t(x, y - c.z(2), q.sub, 12.5, 400, C.muted); } }
      y += c.z(6);
      ORDEM.forEach(function (lado) {
        var v = q[lado], pl = x + nomeW, pr = x + w - labW, xb = pl + Math.max(c.z(2), v / hi * (pr - pl));
        c.marca(lado, x + c.z(5), y + c.z(8), 8); c.t(x + c.z(13), y + c.z(12.5), c.L[lado].curto, 12.5, 600, C.ink2);
        barra(c.g, pl, xb, y + c.z(2), c.z(14), c.corLado(lado));
        c.t(xb + c.z(5), y + c.z(14), fq(v), 14, 800, C.ink);
        y += c.z(21);
      });
      y += c.z(8);
    });
    return y;
  } };

  /* barras 100% empilhadas com categorias de STATUS (iguais para os dois lados) */
  function linhaEmpilhada(c, x, y, w, hb, cont, cats, rotulos, omitir) {
    var C = c.C, total = 0; cats.forEach(function (k) { total += cont[k.id] || 0; });
    var segs = cats.filter(function (k) { return (cont[k.id] || 0) > 0; }), gaps = (segs.length - 1) * c.z(2), util = w - gaps, xx = x;
    segs.forEach(function (k, i) {
      var n = cont[k.id], sw = util * n / total, fill = c.st(k.st), base = (k.st === 'run' || k.st === 'na') ? C.fundo : fill;
      var rx = (i === 0 || i === segs.length - 1) ? c.z(3) : 0;
      el('rect', { x: xx, y: y, width: Math.max(1, sw), height: hb, rx: rx, fill: fill, stroke: k.st === 'na' ? 'none' : STATUS.borda, 'stroke-width': k.st === 'na' ? 0 : Math.max(1, c.z(1)) }, c.g);
      if (k.st === 'na') el('rect', { x: xx + 0.5, y: y + 0.5, width: Math.max(0, sw - 1), height: hb - 1, rx: rx, fill: 'none', stroke: C.muted, 'stroke-dasharray': c.z(3) + ' ' + c.z(2) }, c.g);
      var lab = String(n), lw = c.w(lab, 12.5, 800);
      if (rotulos && !(omitir && omitir === k.id) && lw + c.z(8) < sw) {
        var comFundo = k.st === 'run' || k.st === 'no';
        if (comFundo) el('rect', { x: xx + sw / 2 - lw / 2 - c.z(3), y: y + hb / 2 - c.z(8), width: lw + c.z(6), height: c.z(16), rx: c.z(2), fill: C.fundo }, c.g);
        c.t(xx + sw / 2, y + hb / 2 + c.z(4.5), lab, 12.5, 800, (comFundo || k.st === 'na') ? C.ink : textoSobre(base), 'middle');
      }
      xx += sw + c.z(2);
    });
    return total;
  }
  function legendaStatus(c, x, y, w, cats, sufixos) {
    var C = c.C, xx = x; y += c.z(4);
    cats.forEach(function (k) {
      var nm = k.nome + (sufixos && sufixos[k.id] != null ? ' ' + sufixos[k.id] : ''), iw = c.z(20) + c.w(nm, 12.5) + c.z(12);
      if (xx + iw > x + w) { xx = x; y += c.z(19); }
      el('rect', { x: xx, y: y, width: c.z(14), height: c.z(12), rx: c.z(2), fill: c.st(k.st), stroke: k.st === 'na' ? 'none' : STATUS.borda, 'stroke-width': k.st === 'na' ? 0 : Math.max(1, c.z(1)) }, c.g);
      if (k.st === 'na') el('rect', { x: xx + 0.5, y: y + 0.5, width: c.z(13), height: c.z(11), rx: c.z(2), fill: 'none', stroke: C.muted, 'stroke-dasharray': c.z(2) + ' ' + c.z(1.5) }, c.g);
      c.t(xx + c.z(19), y + c.z(10.5), nm, 12.5, 400, C.ink2); xx += iw;
    });
    return y + c.z(18);
  }
  GRAF.empilhadas = { flex: false, desenhar: function (c, x, y, w, h, gr) {
    var C = c.C;
    ORDEM.forEach(function (lado) {
      var ln = gr.linhas[lado], nm = ln.nome || c.L[lado].nome;
      c.marca(lado, x + c.z(5), y + c.z(10), 10); c.t(x + c.z(15), y + c.z(14), nm, 13.5, 800, C.ink);
      if (ln.direita) c.t(x + w, y + c.z(14), ln.direita, 13, 700, C.ink, 'end');
      y += c.z(22);
      linhaEmpilhada(c, x, y, w, c.z(gr.altura || 26), ln.contagens, gr.categorias, true);
      y += c.z(gr.altura || 26) + c.z(12);
    });
    return legendaStatus(c, x, y, w, gr.categorias);
  } };
  /* placar de promessas no estilo antigo: número grande + barra das 5 categorias rotulada */
  GRAF.placarPromessas = { flex: false, desenhar: function (c, x, y, w, h, gr) {
    var C = c.C, lado2 = w >= c.z(560), bw = lado2 ? (w - c.z(16)) / 2 : w, y0 = y, yFim = y;
    ORDEM.forEach(function (lado, i) {
      var ln = gr.linhas[lado], bx = lado2 ? x + i * (bw + c.z(16)) : x, by = lado2 ? y0 : y;
      el('rect', { x: bx, y: by, width: bw, height: c.z(3), rx: c.z(1.5), fill: c.corLado(lado) }, c.g);
      by += c.z(8);
      c.marca(lado, bx + c.z(6), by + c.z(11), 11); c.t(bx + c.z(17), by + c.z(16), ln.nome || c.L[lado].nome, 15, 800, C.ink);
      by += c.z(22); if (ln.sub) { c.t(bx + c.z(17), by + c.z(12), ln.sub, 12.5, 400, C.muted); by += c.z(16); }
      var tot = 0; gr.categorias.forEach(function (k) { tot += ln.contagens[k.id] || 0; });
      var d = ln.contagens[gr.destaque] || 0, big = d + ' de ' + tot, pct = num(d / tot * 100, 1) + '%', rot = gr.destaqueRotulo || 'cumpridas';
      var bs = 40; while (bs > 30 && c.w(big, bs, 800) + c.z(10) + c.w(rot, 13, 700) > bw) bs -= 1;
      c.t(bx, by + c.z(bs), big, bs, 800, C.ink);
      var tx = bx + c.w(big, bs, 800) + c.z(10);
      if (tx + c.w(rot, 13, 700) <= bx + bw) { c.t(tx, by + c.z(bs * 0.55), rot, 13, 700, C.ink); c.t(tx, by + c.z(bs * 0.98), pct + ' do plano', 13, 400, C.ink2); by += c.z(bs + 12); }
      else { by += c.z(bs + 4); c.t(bx, by + c.z(14), rot + ' · ' + pct + ' do plano', 13, 700, C.ink); by += c.z(24); }
      linhaEmpilhada(c, bx, by, bw, c.z(28), ln.contagens, gr.categorias, true);
      by += c.z(36);
      if (lado2) yFim = Math.max(yFim, by); else { y = by + c.z(6); yFim = y; }
    });
    return legendaStatus(c, x, yFim, w, gr.categorias);
  } };

  /* blocos (resumo da home): dois blocos de mesmo tamanho, quesitos em grade, selo "apertada" igual */
  GRAF.blocos = { flex: false, desenhar: function (c, x, y, w, h, gr) {
    // manterOrdem: segue a ordem dada (ex.: a do placar da home, Economia → Contas); senão, ordem fixa Bolsonaro → Lula
    var C = c.C, grupos = gr.manterOrdem ? gr.grupos.slice() : gr.grupos.slice().sort(function (a, b) { return ORDEM.indexOf(a.vencedor) - ORDEM.indexOf(b.vencedor); });
    var lado2 = w >= c.z(600), bw = lado2 ? (w - c.z(14)) / 2 : w, pad = c.z(12), th = c.z(36), tg = c.z(7);
    var ap0 = c.w('apertada', 12, 700) + c.z(12), cw2 = (bw - 2 * pad - c.z(4) - tg) / 2;
    var cabe2 = grupos.every(function (g2) { return g2.itens.every(function (q) { return c.w('✓ ' + q.nome, 12, 700) + c.z(16) + (q.apertada ? ap0 + c.z(6) : 0) <= cw2; }); });
    var cols = cabe2 ? 2 : 1, maxI = Math.max.apply(null, grupos.map(function (g2) { return g2.itens.length; }));
    var rows = Math.ceil(maxI / cols), ts = 17;
    var longo = c.w(c.L.b.nome, 10, 800) > c.w(c.L.l.nome, 10, 800) ? c.L.b.nome : c.L.l.nome;
    while (ts > 13 && c.w(longo + ' à frente', ts, 800) + c.z(ts) > bw - 2 * pad - c.z(4)) ts -= 0.5;
    var altB = pad + c.z(16) + c.z(ts * 1.5) + c.z(8) + rows * (th + tg) - tg + pad, ap = 'apertada', apw = c.w(ap, 12, 700) + c.z(12);
    grupos.forEach(function (gp, i) {
      var k = gp.vencedor, bx = lado2 ? x + i * (bw + c.z(14)) : x, by = lado2 ? y : y + i * (altB + c.z(10));
      el('rect', { x: bx + 0.5, y: by + 0.5, width: bw - 1, height: altB - 1, rx: c.z(10), fill: C.tile, stroke: C.borda, 'stroke-width': c.z(1) }, c.g);
      el('rect', { x: bx, y: by, width: c.z(5), height: altB, rx: c.z(2.5), fill: c.corLado(k) }, c.g);
      var yy = by + pad + c.z(11);
      c.t(bx + pad + c.z(4), yy, gp.titulo.toUpperCase(), 12.5, 800, C.ink2, 'start', 0.8);
      yy += c.z(ts * 1.4);
      c.marca(k, bx + pad + c.z(4) + c.z(ts * 0.3), yy - c.z(ts * 0.36), ts * 0.5);
      var tx = bx + pad + c.z(4) + c.z(ts * 0.8), nm = c.L[k].nome + ' à frente';
      c.t(tx, yy, nm, ts, 800, C.ink);
      el('rect', { x: tx, y: yy + c.z(3), width: c.w(nm, ts, 800), height: c.z(2.5), rx: c.z(1), fill: c.corLado(k) }, c.g);
      yy += c.z(12);
      var cw = (bw - 2 * pad - c.z(4) - (cols - 1) * tg) / cols;
      gp.itens.forEach(function (q, j) {
        var cx = bx + pad + c.z(4) + (j % cols) * (cw + tg), cy = yy + Math.floor(j / cols) * (th + tg);
        el('rect', { x: cx, y: cy, width: cw, height: th, rx: c.z(7), fill: c.corLado(k) }, c.g);
        var fs = 13.5, rot = '✓ ' + q.nome, livre = cw - c.z(16) - (q.apertada ? apw + c.z(6) : 0);
        while (fs > 12 && c.w(rot, fs, 700) > livre) fs -= 0.5;
        c.t(cx + c.z(8), cy + th / 2 + c.z(fs * 0.36), rot, fs, 700, '#ffffff');
        if (q.apertada) {
          var ph = c.z(18), px = cx + cw - apw - c.z(7), py = cy + (th - ph) / 2;
          el('rect', { x: px, y: py, width: apw, height: ph, rx: ph / 2, fill: '#ffffff' }, c.g);
          c.t(px + apw / 2, py + ph * 0.72, ap, 12, 700, c.corLado(k), 'middle');
        }
      });
    });
    y += lado2 ? altB : 2 * altB + c.z(10);
    (gr.contexto || []).forEach(function (q) {
      y += c.z(8);
      var lc = c.q(q.nome + ': ' + (q.nota || 'contexto, não conta ponto'), 13, 600, w - c.z(20)), hc = c.z(12 + 17 * lc.length);
      el('rect', { x: x + 0.5, y: y + 0.5, width: w - 1, height: hc, rx: c.z(7), fill: 'none', stroke: C.axis, 'stroke-dasharray': c.z(4) + ' ' + c.z(3) }, c.g);
      lc.forEach(function (ln, j) { c.t(x + c.z(10), y + c.z(19.5 + 17 * j), ln, 13, 600, C.ink2); });
      y += hc;
    });
    if (gr.fecho) { y += c.z(4); c.q(gr.fecho, 15, 800, w).forEach(function (ln) { y += c.z(19); c.t(x, y - c.z(4), ln, 15, 800, C.ink); }); }
    if (gr.rodape) c.q(gr.rodape, 12.5, 400, w).forEach(function (ln) { y += c.z(17); c.t(x, y - c.z(3), ln, 12.5, 400, C.muted); });
    return y + c.z(4);
  } };

  /* barras anuais com segmentos (precatórios): base + hachurado + "fantasma" tracejado */
  GRAF.segmentos = { flex: true, alt: 230, desenhar: function (c, x, y, w, h, gr) {
    var C = c.C, f = fmtFn(gr.formato), B = gr.barras;
    var tot = B.map(function (b) { var s = b.v; (b.extra || []).forEach(function (e) { s += e.v; }); return s; });
    var hi = Math.max.apply(null, tot) * 1.12, ticks = cardTicks(0, hi, 4); hi = ticks[ticks.length - 1];
    var axW = Math.max.apply(null, ticks.map(function (t) { return c.w(f(t), 12.5); })) + c.z(6);
    var pl = x + axW, pr = x + w, top = y + c.z(10), bot = c._fimGraf - c.z(20);
    var Y = function (v) { return bot - v / hi * (bot - top); };
    ticks.forEach(function (t) { el('line', { x1: pl, x2: pr, y1: Y(t), y2: Y(t), stroke: t === 0 ? C.axis : C.grid, 'stroke-width': c.z(t === 0 ? 1.4 : 1) }, c.g); c.t(pl - c.z(5), Y(t) + c.z(4.5), f(t), 12.5, 400, C.muted, 'end'); });
    var gw = (pr - pl) / B.length, bw = Math.min(c.z(34), gw * 0.62);
    B.forEach(function (b, i) {
      var cx = pl + gw * i + gw / 2, bx = cx - bw / 2, cor = c.corLado(b.lado), base = b.v, yb = Y(base);
      el('rect', { x: bx, y: yb, width: bw, height: bot - yb, fill: cor }, c.g);
      var acc = base;
      (b.extra || []).forEach(function (e) {
        var y1 = Y(acc + e.v), y2 = Y(acc);
        if (e.tipo === 'fantasma') el('rect', { x: bx + 0.75, y: y1, width: bw - 1.5, height: y2 - y1, fill: 'none', stroke: cor, 'stroke-width': c.z(1.4), 'stroke-dasharray': c.z(4) + ' ' + c.z(3) }, c.g);
        else el('rect', { x: bx, y: y1, width: bw, height: y2 - y1, fill: hachura(c.defs, cor, C.fundo, c.z(6)), stroke: cor, 'stroke-width': c.z(1.2) }, c.g);
        if (e.rotulo) c.t(cx, y1 - c.z(5), e.rotulo, 12, 700, C.ink2, 'middle');
        acc += e.v;
      });
      if (b.rotuloBase) c.t(cx, Y(base) - c.z(5), b.rotuloBase, 12.5, 800, C.ink, 'middle');
      if (b.rotulo !== false) c.t(cx, Y(acc) - c.z((b.extra && b.extra.some(function (e) { return e.rotulo; })) ? 19 : 5), b.rotulo || f(acc), 12.5, 800, C.ink, 'middle');
      c.t(cx, bot + c.z(15), b.ano, 12, 600, C.ink2, 'middle');
    });
  } };

  /* ---------- composição ---------- */
  function compor(def, formato, escuro, largura0, altGraf, escala) {
    var F = {}, k; for (k in FORMATOS[formato]) F[k] = FORMATOS[formato][k];
    if (escala) F.s = escala;
    if (formato === 'web') { F.W = largura0; F.P = largura0 < 420 ? 14 : 18; }
    var L = lados(def), venc = vencedorDef(def), gr = def.grafico || {}, G = GRAF[gr.tipo] || GRAF.duelo;
    var svg = el('svg', { xmlns: NS, role: 'img', 'font-family': FONTE });
    var tt = el('title', null, svg), dd = el('desc', null, svg), defs = el('defs', null, svg);
    var fundo = el('rect', { x: 0, y: 0, width: F.W, fill: (escuro ? ESCURO : CLARO).fundo, rx: formato === 'web' ? 12 : 0 }, svg);
    var g = el('g', null, svg), c = ctxCard(svg, defs, g, F, escuro, L);
    tt.textContent = venc ? def.tema + ': ' + L[venc].nome + ' à frente' : (def.titulo || def.tema);
    dd.textContent = def.descricao || descreverDef(def, L, venc);
    var P = F.P, W = F.W, x = P, w = W - 2 * P, y = P + (F.topo || 0);
    var hG = altGraf != null ? altGraf : c.z(G.alt || 200);
    if (F.colunas) {
      var colW = Math.round(W * 0.46), xr = P + colW + c.z(18), wr = W - P - xr;
      if (F.marca) y = blkMarca(c, x, y);
      y = blkTitulo(c, x, y, colW, def, venc); y = blkCriterio(c, x, y, colW, def); y = blkManchete(c, x, y, colW, def);
      // rodapé embaixo, largura total
      var gr2 = el('g', null, svg), c2 = ctxCard(svg, defs, gr2, F, escuro, L);
      var hR = blkRodape(c2, x, 0, w, def, F.url);
      gr2.setAttribute('transform', 'translate(0,' + (F.H - P - hR) + ')');
      var yr = blkGraficoTitulo(c, xr, P, wr, gr), fim = F.H - P - hR - c.z(10);
      c._fimGraf = fim;
      var yG = G.desenhar(c, xr, yr, wr, fim - yr, gr);
      svg.setAttribute('width', W); svg.setAttribute('height', F.H); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + F.H); fundo.setAttribute('height', F.H);
      var sobraEsq = F.H - P - hR - c.z(10) - y;
      return { svg: svg, h: F.H, sobra: Math.min(sobraEsq, G.flex ? 0 : fim - (yG || fim)), flex: false, hG: fim - yr };
    }
    if (F.marca) y = blkMarca(c, x, y);
    y = blkTitulo(c, x, y, w, def, venc);
    y = blkCriterio(c, x, y, w, def);
    y = blkManchete(c, x, y, w, def);
    y = blkGraficoTitulo(c, x, y + c.z(4), w, gr);
    c._fimGraf = y + hG;
    var yAfter = G.desenhar(c, x, y, w, hG, gr);
    y = G.flex ? y + hG : (yAfter || y + hG);
    if (formato === 'web') {
      y = blkRodape(c, x, y, w, def, false) + P;
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + y); svg.setAttribute('width', W); svg.setAttribute('height', y); fundo.setAttribute('height', y);
      return { svg: svg, h: y };
    }
    // formatos fixos: rodapé ancorado embaixo; o gráfico flexível ocupa a sobra
    var gR = el('g', null, svg), cR = ctxCard(svg, defs, gR, F, escuro, L);
    var hR2 = blkRodape(cR, x, 0, w, def, F.url), yR = F.H - P - (F.base || 0) - hR2;
    gR.setAttribute('transform', 'translate(0,' + yR + ')');
    svg.setAttribute('width', W); svg.setAttribute('height', F.H); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + F.H); fundo.setAttribute('height', F.H);
    return { svg: svg, h: F.H, sobra: yR - c.z(10) - y, flex: G.flex, hG: hG };
  }
  function descreverDef(def, L, venc) {
    var p = [];
    if (venc) p.push(def.tema + ': ' + L[venc].nome + ' à frente (' + (def.criterio === 'menor' ? 'menor é melhor' : 'maior é melhor') + ').');
    else p.push((def.titulo || def.tema) + '.');
    if (def.grafico && def.grafico.tipo === 'blocos') {
      def.grafico.grupos.forEach(function (gp) { p.push(gp.titulo + ': ' + L[gp.vencedor].nome + ' à frente em ' + gp.itens.map(function (q) { return q.nome + (q.apertada ? ' (apertada)' : ''); }).join(', ') + '.'); });
      (def.grafico.contexto || []).forEach(function (q) { p.push(q.nome + ': ' + (q.nota || 'contexto, não conta ponto') + '.'); });
    }
    if (def.manchete) p.push(def.manchete.valor + ' ' + def.manchete.texto + '.');
    if (def.valores && def.formatoValores) { var f = fmtFn(def.formatoValores); p.push(L.b.nome + ': ' + f(def.valores.b) + '; ' + L.l.nome + ': ' + f(def.valores.l) + '.'); }
    if (def.grafico && def.grafico.tipo === 'serie') {
      var gs = def.grafico, fs2 = fmtFn(gs.formato);
      gs.series.forEach(function (sr) {
        var i0 = 0, i1 = sr.v.length - 1; while (i0 < i1 && sr.v[i0] == null) i0++; while (i1 > i0 && sr.v[i1] == null) i1--;
        var mx = -Infinity, imx = i0; sr.v.forEach(function (v, i) { if (v != null && v > mx) { mx = v; imx = i; } });
        p.push(sr.nome + ': ' + fs2(sr.v[i0]) + ' em ' + gs.x[i0] + ', máximo de ' + fs2(mx) + ' em ' + gs.x[imx] + ', ' + fs2(sr.v[i1]) + ' em ' + gs.x[i1] + '.');
      });
    }
    if (def.mudaria) p.push('O que mudaria o resultado: ' + def.mudaria + '.');
    p.push('Fonte: ' + def.fonte + '.');
    return p.join(' ');
  }
  function desenharCard(def, formato, escuro, largura0) {
    formato = formato || 'web';
    var r = compor(def, formato, escuro, largura0), esc = FORMATOS[formato].s, tent = 0;
    // conteúdo fixo maior que o formato: reduz a escala até caber (nunca sobrepõe o rodapé)
    while (formato !== 'web' && !r.flex && r.sobra < 0 && tent < 12) { esc *= 0.95; tent++; r = compor(def, formato, escuro, largura0, null, esc); }
    if (formato !== 'web' && r.flex && Math.abs(r.sobra) > 2) {
      var hMin = r.hG * 0.6;
      while (r.hG + r.sobra < hMin && tent < 12) { esc *= 0.95; tent++; r = compor(def, formato, escuro, largura0, null, esc); }
      r = compor(def, formato, escuro, largura0, Math.max(hMin, r.hG + r.sobra), esc);
    }
    var svg = r.svg;
    if (formato === 'web') { svg.style.display = 'block'; svg.style.width = '100%'; svg.style.height = 'auto'; }
    else { svg.style.display = 'block'; svg.style.maxWidth = '100%'; svg.style.height = 'auto'; }
    return svg;
  }
  function card(cont, def, formato) {
    if (typeof cont === 'string') cont = document.querySelector(cont);
    if (typeof def === 'object' && def.formato && !formato) formato = def.formato;
    formato = formato || 'web';
    var escuro = formato === 'web' && temaAtual() === TEMAS.dark;
    var larg = Math.max(300, Math.min(760, Math.round(cont.clientWidth || 358)));
    var svg = desenharCard(def, formato, escuro, larg);
    while (cont.firstChild) cont.removeChild(cont.firstChild);
    cont.appendChild(svg);
    return svg;
  }
  var URL_FONTE = '/assets/fonts/inter-latin-var.woff2';
  function cardPNG(def, formato, urlFonte) {
    var tmp = document.createElement('div'); tmp.style.cssText = 'position:absolute;left:-99999px;top:0;width:1080px';
    document.body.appendChild(tmp);
    var svg = desenharCard(def, formato || 'feed', false, 1080); tmp.appendChild(svg);
    return paraPNG(svg, 1, urlFonte || BPD.urlFonte || URL_FONTE).then(function (b) { document.body.removeChild(tmp); return b; }, function (e) { document.body.removeChild(tmp); throw e; });
  }

  /* ---------- montarCard: card inline + ações (sem segundo gráfico) ---------- */
  var CARDS_MONTADOS = [];
  function montarCard(cont, def, op) {
    if (typeof cont === 'string') cont = document.querySelector(cont);
    op = op || {};
    while (cont.firstChild) cont.removeChild(cont.firstChild);
    cont.classList.add('bpd-card');
    var area = document.createElement('div'); area.className = 'bpd-card-img'; cont.appendChild(area);
    card(area, def, 'web');
    var acoes = document.createElement('div'); acoes.className = 'bpd-card-acoes'; cont.appendChild(acoes);
    var st = document.createElement('span'); st.className = 'bpd-card-status'; st.setAttribute('role', 'status');
    function track(n, p) { try { if (root.__track) root.__track(n, p); } catch (e) {} }
    function urlCom(m) {
      var u = (def.share && def.share.url) || (location.origin + location.pathname + (cont.id ? '#' + cont.id : ''));
      return u + (u.indexOf('?') >= 0 ? '&' : '?') + 'o=' + m;
    }
    var texto0 = (def.share && def.share.texto) || descreverDef(def, lados(def), vencedorDef(def));
    var bImg = document.createElement('button'); bImg.type = 'button'; bImg.className = 'bpd-btn bpd-btn--img'; bImg.textContent = 'Compartilhar imagem';
    bImg.addEventListener('click', function () {
      st.textContent = 'Gerando a imagem…';
      track('share_click', { section: def.id, method: 'image', placement: 'card' });
      cardPNG(def, op.formatoPNG || 'feed').then(function (blob) {
        var nome = 'bora-pros-dados-' + (def.id || 'card') + '.png', file = null;
        try { file = new File([blob], nome, { type: 'image/png' }); } catch (e) {}
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
          return navigator.share({ files: [file], text: texto0 + ' ' + urlCom('img') }).then(function () { st.textContent = ''; track('share_success', { section: def.id, method: 'image' }); }, function () { st.textContent = ''; });
        }
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
        st.textContent = 'Imagem baixada. Agora é só anexar na conversa.';
        track('share_success', { section: def.id, method: 'download' });
      }).catch(function () { st.textContent = 'Não deu para gerar a imagem agora.'; });
    });
    var bWa = document.createElement('a'); bWa.className = 'bpd-btn bpd-btn--wa'; bWa.textContent = 'WhatsApp'; bWa.target = '_blank'; bWa.rel = 'noopener';
    bWa.href = 'https://wa.me/?text=' + encodeURIComponent(texto0 + ' ' + urlCom('wa'));
    bWa.addEventListener('click', function () { track('share_click', { section: def.id, method: 'whatsapp', placement: 'card' }); });
    acoes.appendChild(bImg); acoes.appendChild(bWa); acoes.appendChild(st);
    if (def.saibaMais && def.saibaMais.length) {
      var sm = document.createElement('details'); sm.className = 'bpd-card-mais';
      var s1 = document.createElement('summary'); s1.textContent = 'Saiba mais'; sm.appendChild(s1);
      def.saibaMais.forEach(function (p) { var pp = document.createElement('p'); pp.textContent = p; sm.appendChild(pp); });
      cont.appendChild(sm);
    }
    if (def.tabela && op.tabela !== false) tabelaGemea(cont, def.tabela.cab, def.tabela.linhas, (def.titulo || def.tema));
    var reg = { cont: cont, area: area, def: def, w: area.clientWidth };
    CARDS_MONTADOS.push(reg);
    return cont;
  }
  function redesenharCards(forcar) {
    CARDS_MONTADOS.forEach(function (r) { if (!r.area.isConnected) return; if (forcar || Math.abs(r.area.clientWidth - r.w) > 4) { r.w = r.area.clientWidth; card(r.area, r.def, 'web'); } });
  }
  if (typeof root.addEventListener === 'function') {
    var _tc; root.addEventListener('resize', function () { clearTimeout(_tc); _tc = setTimeout(function () { redesenharCards(false); }, 150); });
    if (root.MutationObserver) new MutationObserver(function () { redesenharCards(true); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    if (root.matchMedia) { var mq2 = root.matchMedia('(prefers-color-scheme: dark)'); if (mq2.addEventListener) mq2.addEventListener('change', function () { redesenharCards(true); }); }
  }
  /* compatibilidade com a v0.2: cardSintese(el, {formato, titulo, sub, grupos, contexto, fecho, rodapeContagem, fonte}) */
  function cardSintese(cont, o) {
    return card(cont, { id: 'resumo', titulo: o.titulo, criterioTexto: o.sub, fonte: o.fonte, url: o.url, atualizado: o.atualizado,
      grafico: { tipo: 'blocos', grupos: o.grupos, manterOrdem: o.manterOrdem, contexto: o.contexto, fecho: o.fecho, rodape: o.rodapeContagem } }, o.formato || 'web');
  }


  /* =====================================================================
   * CARROSSEL: no celular (≤ 760 px) uma seção com vários .bpd-card vira carrossel horizontal
   * (scroll-snap, ~8% do próximo card visível, pontinhos, "1/3", setas acessíveis, teclado ← →);
   * acima de 760 px, grade. BPD.carrossel(containerEl, {rotulo:'Cards da seção Emprego'})
   * ===================================================================== */
  var CSS_CAR = '.bpd-car{position:relative}' +
    '.bpd-car-trilho{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px}' +
    '.bpd-car-nav{display:none}' +
    '.bpd-car-slide{display:flex;min-width:0}.bpd-car-slide>*{flex:1 1 auto;min-width:0}' +
    '@media (max-width:760px){' +
    '.bpd-car-trilho{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;scroll-padding-left:0;-webkit-overflow-scrolling:touch;scrollbar-width:none;align-items:stretch;padding-bottom:2px}' +
    '.bpd-car-trilho::-webkit-scrollbar{display:none}' +
    '.bpd-car-trilho>*{flex:0 0 91%;max-width:91%;scroll-snap-align:start;scroll-snap-stop:always}' +
    '.bpd-car-trilho>:only-child{flex-basis:100%;max-width:100%}' +
    '.bpd-car-nav{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:8px}' +
    '.bpd-car-nav[hidden]{display:none}' +
    '.bpd-car-seta{width:44px;height:44px;border-radius:22px;border:1px solid currentColor;background:transparent;color:inherit;font:700 20px/1 inherit;cursor:pointer;opacity:.75}' +
    '.bpd-car-seta:disabled{opacity:.25;cursor:default}' +
    '.bpd-car-pontos{display:flex;gap:6px}' +
    '.bpd-car-pontos{gap:0}' +
    '.bpd-car-ponto{position:relative;min-width:24px;height:24px;border:0;padding:0;background:transparent;color:inherit;cursor:pointer}' +
    '.bpd-car-ponto::before{content:"";position:absolute;left:50%;top:50%;width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:4px;background:currentColor;opacity:.3}' +
    '.bpd-car-ponto[aria-current="true"]{min-width:32px}' +
    '.bpd-car-ponto[aria-current="true"]::before{width:20px;margin-left:-10px;opacity:.9}' +
    '.bpd-car-ponto:focus-visible{outline:2px solid currentColor;outline-offset:-2px;border-radius:12px}' +
    '.bpd-car-conta{font:600 13px/1 inherit;min-width:34px;text-align:center;opacity:.8}' +
    '}' +
    '@media (prefers-reduced-motion:reduce){.bpd-car-trilho{scroll-behavior:auto}}' +
    /* dica "Deslize ›" (v0.3.7): pílula decorativa sobre a borda direita (área do próximo card) */
    '.bpd-car-dica{position:absolute;right:2px;z-index:2;display:flex;flex-direction:column;align-items:center;gap:2px;width:60px;padding:7px 0 9px;border-radius:30px;' +
    'background:rgba(24,24,27,.92);color:#fff;font:700 12px/1 InterVar,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;' +
    'pointer-events:none;opacity:0;transition:opacity .3s ease;box-shadow:0 2px 8px rgba(0,0,0,.18)}' +
    '.bpd-car-dica.is-on{opacity:1}' +
    '.bpd-car-dica-seta{display:inline-block;font-size:24px;line-height:1}' +
    '.bpd-car-dica.is-anim .bpd-car-dica-seta{animation:bpd-car-seta 1s ease-in-out 3}' +
    '@keyframes bpd-car-seta{0%,100%{transform:translateX(0)}50%{transform:translateX(5px)}}' +
    '@media (prefers-reduced-motion:reduce){.bpd-car-dica{transition:none}.bpd-car-dica.is-anim .bpd-car-dica-seta{animation:none}}';
  function cssCarrossel() {
    if (document.getElementById('bpd-car-css')) return;
    var st = document.createElement('style'); st.id = 'bpd-car-css'; st.textContent = CSS_CAR; document.head.appendChild(st);
  }

  /* Dica de deslizar (v0.3.7): no celular, na 1ª vez que um carrossel aparece (≥ 50% visível), o trilho dá um
   * "empurrãozinho" de ~40 px (700 ms, 1 vez) e uma pílula compacta "› deslize" com a seta animada (3 ciclos) surge sobre a
   * borda direita e some. Some no 1º toque/arrasto/tecla/rolagem. No máximo 2 carrosséis por sessão.
   * Com prefers-reduced-motion: sem empurrão e sem seta em loop (pílula estática por 3 s). aria-hidden, sem foco. */
  var DICA_CHAVE = 'bpdCarDicas', DICA_MAX = 2;
  function dicasVistas() { try { return +(root.sessionStorage.getItem(DICA_CHAVE) || 0); } catch (e) { return DICA_MAX; } }
  function marcarDica() { try { root.sessionStorage.setItem(DICA_CHAVE, String(dicasVistas() + 1)); } catch (e) {} }
  function dicaDeslizar(cont, trilho, itens, op) {
    if (op.dica === false || itens.length < 2 || !root.matchMedia) return;
    var pilula = document.createElement('div'); pilula.className = 'bpd-car-dica'; pilula.setAttribute('aria-hidden', 'true');
    // compacta (60 px): fica sobre a fresta do próximo card e a margem do atual, sem cobrir o conteúdo
    var sa = document.createElement('span'); sa.className = 'bpd-car-dica-seta'; sa.textContent = '›';
    var tx = document.createElement('span'); tx.textContent = 'deslize';
    pilula.appendChild(sa); pilula.appendChild(tx); cont.appendChild(pilula);
    var rola = function () { return trilho.scrollWidth > trilho.clientWidth + 4; };
    var celular = root.matchMedia('(max-width: 760px)'), calmo = root.matchMedia('(prefers-reduced-motion: reduce)');
    var tFim = 0, anims = [], encerrada = false;
    function posicionar() { pilula.style.top = Math.round(trilho.offsetTop + Math.min(trilho.clientHeight * 0.30, 220)) + 'px'; }
    function esconder() {
      clearTimeout(tFim); pilula.classList.remove('is-on', 'is-anim');
      anims.forEach(function (a) { try { a.cancel(); } catch (e) {} }); anims = [];
    }
    function encerrar() {
      if (encerrada) return; encerrada = true; esconder();
      ['pointerdown', 'touchstart', 'wheel', 'keydown', 'scroll'].forEach(function (ev) { trilho.removeEventListener(ev, encerrar); });
      cont.removeEventListener('click', encerrar, true);
    }
    function mostrar() {
      if (encerrada || !celular.matches || !rola() || dicasVistas() >= DICA_MAX) return;
      marcarDica(); posicionar();
      pilula.classList.add('is-on');
      if (!calmo.matches) {
        pilula.classList.add('is-anim');
        if (itens[0].animate) itens.forEach(function (sl) {   // anima os slides (dentro do trilho), não a página: sem rolagem nem reflow
          anims.push(sl.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-40px)' }, { transform: 'translateX(0)' }], { duration: 700, easing: 'ease-in-out', delay: 150 }));
        });
      }
      tFim = setTimeout(encerrar, 3200);
    }
    ['pointerdown', 'touchstart', 'wheel', 'keydown', 'scroll'].forEach(function (ev) { trilho.addEventListener(ev, encerrar, { passive: true }); });
    cont.addEventListener('click', encerrar, true);   // setas e pontinhos
    if ('IntersectionObserver' in root) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (en) { if (en.isIntersecting && en.intersectionRatio >= 0.5) { io.disconnect(); mostrar(); } });
      }, { threshold: [0.5] });
      io.observe(trilho);
    }
    // largura intermediária com rolagem horizontal (sem dica animada): seta estática ao passar o mouse
    trilho.addEventListener('mouseenter', function () {
      if (celular.matches || !rola()) return;
      posicionar(); pilula.classList.add('is-on');
    });
    trilho.addEventListener('mouseleave', function () { if (!celular.matches) pilula.classList.remove('is-on'); });
  }

  function carrossel(cont, op) {
    if (typeof cont === 'string') cont = document.querySelector(cont);
    op = op || {};
    if (cont.__bpdCar) return cont.__bpdCar;
    cssCarrossel();
    var itens = [].slice.call(cont.children);
    cont.classList.add('bpd-car');
    var trilho = document.createElement('div'); trilho.className = 'bpd-car-trilho';
    trilho.setAttribute('role', 'region'); trilho.setAttribute('aria-roledescription', 'carrossel');
    trilho.setAttribute('aria-label', op.rotulo || 'Cards desta seção'); trilho.tabIndex = 0;
    // cada card vai num invólucro <div role="group" aria-roledescription="slide"> (não muda o papel do elemento do card)
    itens = itens.map(function (it, i) {
      var sl = document.createElement('div'); sl.className = 'bpd-car-slide';
      sl.setAttribute('role', 'group'); sl.setAttribute('aria-roledescription', 'slide');
      sl.setAttribute('aria-label', (i + 1) + ' de ' + itens.length);
      sl.appendChild(it); trilho.appendChild(sl); return sl;
    });
    cont.appendChild(trilho);
    var nav = document.createElement('div'); nav.className = 'bpd-car-nav';
    var ant = document.createElement('button'); ant.type = 'button'; ant.className = 'bpd-car-seta'; ant.textContent = '‹'; ant.setAttribute('aria-label', 'Card anterior');
    var pts = document.createElement('div'); pts.className = 'bpd-car-pontos';
    var conta = document.createElement('span'); conta.className = 'bpd-car-conta'; conta.setAttribute('aria-live', 'polite');
    var prox = document.createElement('button'); prox.type = 'button'; prox.className = 'bpd-car-seta'; prox.textContent = '›'; prox.setAttribute('aria-label', 'Próximo card');
    var pontos = itens.map(function (it, i) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'bpd-car-ponto'; b.setAttribute('aria-label', 'Ir para o card ' + (i + 1));
      b.addEventListener('click', function () { ir(i); }); pts.appendChild(b); return b;
    });
    nav.appendChild(ant); nav.appendChild(pts); nav.appendChild(conta); nav.appendChild(prox);
    if (itens.length < 2) nav.hidden = true;
    cont.appendChild(nav);
    var atual = 0;
    function ir(i) {
      i = Math.max(0, Math.min(itens.length - 1, i));
      var rd = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
      trilho.scrollTo({ left: itens[i].offsetLeft - trilho.offsetLeft, behavior: rd ? 'auto' : 'smooth' });
      marcar(i);
    }
    function marcar(i) {
      if (i === atual && conta.textContent) return;
      atual = i;
      pontos.forEach(function (b, j) { b.setAttribute('aria-current', j === i ? 'true' : 'false'); });
      conta.textContent = (i + 1) + '/' + itens.length;
      ant.disabled = i === 0; prox.disabled = i === itens.length - 1;
      try { if (root.__track && op.track !== false) root.__track('carousel_view', { section: cont.id || '', index: i + 1, total: itens.length }); } catch (e) {}
    }
    var raf = 0;
    trilho.addEventListener('scroll', function () {
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = 0; var x = trilho.scrollLeft, melhor = 0, d = 1e9;
        itens.forEach(function (it, j) { var dd = Math.abs(it.offsetLeft - trilho.offsetLeft - x); if (dd < d) { d = dd; melhor = j; } });
        marcar(melhor);
      });
    });
    ant.addEventListener('click', function () { ir(atual - 1); });
    prox.addEventListener('click', function () { ir(atual + 1); });
    trilho.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); ir(atual + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); ir(atual - 1); }
    });
    conta.textContent = ''; marcar(0);
    dicaDeslizar(cont, trilho, itens, op);
    redesenharCards(false);
    cont.__bpdCar = { ir: ir, atual: function () { return atual; } };
    return cont.__bpdCar;
  }


  /* =====================================================================
   * CARD DE SELEÇÃO (imagem única de uma seleção /c/1-3-5) — 96-revisao-dataviz §3. (catálogo; revisado v0.3.3)
   * Título neutro e fixo (nunca "X à frente em N"); uma linha de duelo compacto por item, na ordem dos ids;
   * selo "✓ à frente" idêntico para os dois lados; "apertada" vazado igual para os dois; contagem só em texto
   * pequeno no rodapé, junto de "Seleção feita por quem compartilhou" e do resumo do site inteiro.
   * BPD.cardSelecao(el, {formato:'feed'|'story', titulo, sub, itens:[{tema, criterio?:'menor'|'maior', criterioTexto,
   *   valores:{b,l}, formato, vencedor?:'b'|'l'|null, apertada, lados:{b:{curto},l:{curto}}, periodo}], resto, rodape:[...], url, atualizado})
   * Com `criterio`, o vencedor é CALCULADO (e conferido contra `vencedor`, se vier).
   * feed (1080×1350) e story (1080×1920, com zonas livres): até 6 itens, ou menos se as linhas não couberem; o resto vira "e mais K no link".
   * ===================================================================== */
  function cardSelecao(cont, o) {
    if (typeof cont === 'string') cont = document.querySelector(cont);
    while (cont.firstChild) cont.removeChild(cont.firstChild);
    var fmt = o.formato === 'story' ? 'story' : 'feed';
    var F = FORMATOS[fmt], W = F.W, H = F.H, P = F.P || 64, T = TEMAS.light, C = CLARO;
    var max = fmt === 'story' ? 9 : 6, todos = o.itens || [], itens = todos.slice(0, max);
    var resto = todos.length - itens.length + (o.resto || 0);
    var vencDe = function (it) { return it.criterio && it.valores ? vencedor({ criterio: it.criterio, valores: it.valores, vencedor: it.vencedor, titulo: it.tema }) : (it.vencedor || null); };
    var svg = el('svg', { xmlns: NS, width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'font-family': FONTE });
    svg.style.display = 'block'; svg.style.width = '100%'; svg.style.height = 'auto';
    var titulo = o.titulo || 'Comparações escolhidas, com dados oficiais';
    var tt = el('title', null, svg); tt.textContent = titulo;
    var dd = el('desc', null, svg);
    dd.textContent = itens.map(function (it) {
      var f = fmtFn(it.formato), L = lados(it), v = vencDe(it);
      return it.tema + ': ' + L.b.curto + ' ' + f(it.valores.b) + ', ' + L.l.curto + ' ' + f(it.valores.l) +
        (v ? ' (' + L[v].curto + ' à frente, ' + (it.criterioTexto || '') + ')' : ' (' + (it.criterioTexto || 'sem placar') + ')');
    }).join('. ') + '. ' + (o.rodape || []).join(' ');
    el('rect', { x: 0, y: 0, width: W, height: H, fill: C.fundo }, svg);
    var g = el('g', null, svg), y = P + (F.topo || 0), wU = W - 2 * P;
    cardTexto(g, P, y + 22, 'BORA PROS DADOS BRASIL', 24, 800, C.muted, 'start', 2);
    y += 52;
    quebra(titulo, 54, 800, wU).forEach(function (ln) { y += 60; cardTexto(g, P, y - 12, ln, 54, 800, C.ink); });
    if (o.sub) { y += 4; quebra(o.sub, 26, 400, wU).forEach(function (ln) { y += 34; cardTexto(g, P, y - 6, ln, 26, 400, C.ink2); }); }
    y += 26;
    // rodapé (de baixo para cima): o 1º item do rodapé em destaque (ex.: "Seleção feita por quem compartilhou")
    var pe = [];
    (o.rodape || []).forEach(function (t, i) { quebra(t, 21, i === 0 ? 700 : 400, wU).forEach(function (ln) { pe.push([ln, 21, i === 0 ? 700 : 400, i === 0 ? C.ink2 : C.muted]); }); });
    quebra((o.url || SITE) + (o.atualizado ? ' · atualizado em ' + o.atualizado : ''), 22, 700, wU).forEach(function (ln) { pe.push([ln, 22, 700, C.ink2]); });
    var altPe = pe.reduce(function (s, l) { return s + l[1] * 1.45; }, 0);
    var yPe = H - P - (F.base || 0) - altPe;
    // linhas de duelo compacto: mesma altura e mesma tipografia para todas
    var seloTxt = '✓ à frente', sw = largura(seloTxt, 20, 700) + 24, sh = 32, aw = largura('apertada', 18, 700) + 22;
    // cabeçalho de cada linha: tema e critério na mesma linha se couberem; senão, critério na linha de baixo (para TODAS)
    var critDe = function (it) { return (it.criterioTexto || '') + (it.periodo ? ' · ' + it.periodo : ''); };
    var duasLinhas = itens.some(function (it) { return largura(it.tema, 26, 800) + 24 + largura(critDe(it), 20, 600) + (it.apertada ? aw + 10 : 0) > wU; });
    var cab = duasLinhas ? 74 : 50, minRow = cab + 12 + 2 * (16 + 14) + 8;
    // quantos itens cabem sem apertar as linhas; o resto vira "e mais K no link"
    var cabem = Math.max(1, Math.floor((yPe - 30 - 44 - y) / minRow));
    if (itens.length > cabem) { itens = itens.slice(0, cabem); resto = todos.length - itens.length + (o.resto || 0); }
    var fim = yPe - 30 - (resto > 0 ? 44 : 0), n = Math.max(1, itens.length);
    var rh = Math.min(176, (fim - y) / n);
    var bh = Math.max(16, Math.min(26, (rh - cab - 12 - 28 - 8) / 2));
    var nomeW = 0;
    itens.forEach(function (it) { var L = lados(it); ORDEM.forEach(function (k) { nomeW = Math.max(nomeW, largura(L[k].curto, 24, 600)); }); });
    nomeW += 40;
    itens.forEach(function (it, idx) {
      var f = fmtFn(it.formato), L = lados(it), y0 = y + idx * rh, v = vencDe(it);
      el('line', { x1: P, x2: W - P, y1: y0, y2: y0, stroke: C.grid, 'stroke-width': 2 }, g);
      var tamT = 30, critTxt = critDe(it);
      var reserva = duasLinhas ? 0 : largura(critTxt, 20, 600) + 24 + (it.apertada ? aw + 10 : 0);
      if (duasLinhas && it.apertada) reserva = aw + 16;
      while (tamT > 22 && largura(it.tema, tamT, 800) + reserva > wU) tamT -= 1;
      cardTexto(g, P, y0 + 44, it.tema, tamT, 800, C.ink);
      if (it.apertada) {
        el('rect', { x: W - P - aw, y: y0 + 20, width: aw, height: 30, rx: 15, fill: '#ffffff', stroke: C.ink2, 'stroke-width': 2, 'stroke-dasharray': '6 4' }, g);
        cardTexto(g, W - P - aw / 2, y0 + 41, 'apertada', 18, 700, C.ink2, 'middle');
      }
      if (duasLinhas) cardTexto(g, P, y0 + 72, critTxt, 20, 600, C.muted, 'start');
      else cardTexto(g, W - P - (it.apertada ? aw + 10 : 0), y0 + 43, critTxt, 20, 600, C.muted, 'end');
      var vals = ORDEM.map(function (k) { return it.valores[k]; });
      var lo = Math.min(0, Math.min.apply(null, vals)), hi = Math.max(0, Math.max.apply(null, vals));
      var labW = Math.max.apply(null, vals.map(function (x) { return largura(f(x), 26, 800); })) + 16 + sw + 10;
      var pl = P + nomeW + (lo < 0 ? labW * 0.6 : 0), pr = W - P - (hi > 0 ? labW : 0);
      var X = function (x) { return pl + (x - lo) / ((hi - lo) || 1) * (pr - pl); };
      var yy = y0 + cab + 12;
      ORDEM.forEach(function (k) {
        var val = it.valores[k], xa = X(0), xb = X(val);
        if (Math.abs(xb - xa) < 3) xb = xa + (val < 0 ? -3 : 3);
        marca(g, k, P + 12, yy + bh / 2, 20, T);
        cardTexto(g, P + 30, yy + bh / 2 + 8, L[k].curto, 24, 600, C.ink2);
        barra(g, xa, xb, yy, bh, T[k]);
        var tx = val < 0 ? xb - 12 : xb + 12, vt = f(val);
        cardTexto(g, tx, yy + bh / 2 + 9, vt, 26, 800, C.ink, val < 0 ? 'end' : 'start');
        if (v === k) {
          var sx = val < 0 ? xa + 12 : tx + largura(vt, 26, 800) + 12;
          el('rect', { x: sx, y: yy + bh / 2 - sh / 2, width: sw, height: sh, rx: sh / 2, fill: T[k] }, g);
          cardTexto(g, sx + sw / 2, yy + bh / 2 + 7, seloTxt, 20, 700, '#ffffff', 'middle');
        }
        if (lo < 0) el('line', { x1: X(0), x2: X(0), y1: yy - 4, y2: yy + bh + 4, stroke: C.ink2, 'stroke-width': 2 }, g);
        yy += bh + 14;
      });
    });
    var yFim = y + itens.length * rh;
    el('line', { x1: P, x2: W - P, y1: yFim, y2: yFim, stroke: C.grid, 'stroke-width': 2 }, g);
    if (resto > 0) cardTexto(g, P, yFim + 36, 'e mais ' + resto + (resto === 1 ? ' comparação' : ' comparações') + ' no link', 24, 700, C.ink2);
    pe.forEach(function (l) { yPe += l[1] * 1.45; cardTexto(g, P, yPe - 4, l[0], l[1], l[2], l[3]); });
    dd.textContent = itens.map(function (it) {
      var f = fmtFn(it.formato), L = lados(it), v = vencDe(it);
      return it.tema + ': ' + L.b.curto + ' ' + f(it.valores.b) + ', ' + L.l.curto + ' ' + f(it.valores.l) +
        (v ? ' (' + L[v].curto + ' à frente, ' + (it.criterioTexto || '') + ')' : ' (' + (it.criterioTexto || 'sem placar') + ')');
    }).join('. ') + (resto > 0 ? '. E mais ' + resto + ' no link' : '') + '. ' + (o.rodape || []).join(' ');
    cont.appendChild(svg);
    return svg;
  }

  root.BPD = {
    placar: placar, duelo: duelo, trajetoria: trajetoria, distribuicao: distribuicao,
    promessas: promessas, resumo: resumo, card: card, montarCard: montarCard, carrossel: carrossel, cardPNG: cardPNG, cardSintese: cardSintese, cardSelecao: cardSelecao,
    carregarFonte: function () { return Promise.all(['400', '600', '700', '800'].map(function (w) { return document.fonts.load(w + ' 20px InterVar'); })); },
    paraPNG: paraPNG, redesenhar: function () { redesenhar(true); redesenharCards(true); },
    TEMAS: TEMAS, FORMATOS: FORMATOS, STATUS: STATUS, urlFonte: '/assets/fonts/inter-latin-var.woff2', versao: '0.3.7'
  };
})(typeof window !== 'undefined' ? window : this);
