/* ==== Bora pros dados Brasil — "Comparações" e "Minha lista" (catalogo.js) — ES5, sem dependências, ok com a CSP ====
   Três modos, escolhidos pelo HTML:
     <div data-catalogo="lista">    página /comparacoes/: filtros, linhas/cartões, estrela, compartilhar a lista
     <div data-catalogo="selecao">  página de chegada /c/1-3-5 (também ?ids=1-3-5, #1-3-5 e /c/<slug>/)
     <script id="bpd-ancoras">      páginas de análise: estrela nos cartões (mapa cartão → comparação, injetado pelo build)
   Modelo de cartão (99-principios-imagem): o cartão É o gráfico (título com o veredito uma vez, números uma vez,
   régua e força impressas na imagem, fonte dentro); embaixo só [imagem] [compartilhar] [Saiba mais], recolhido.
   Lista do usuário ("Minha lista"): sessionStorage; opção explícita "Lembrar neste aparelho" → localStorage.
   API para integração: window.BPDCatalogo.{favoritos, parseIds, caminhoSelecao}; evento 'bpd:favoritos' (detail.ids).
   Eventos GA (window.__track): favorite_add/_remove, favorites_remember, favorites_clear, catalog_filter,
   selection_share_open, selection_share, selection_view, selection_save_all, card_image. Sem consentimento
   registrado, os eventos de lista vão sem o número da comparação (LGPD). Todo texto entra via textContent. */
(function () {
  'use strict';
  var D = document, W = window;
  var URL_REG = '/dados/comparacoes.json';
  var KEY = 'bpd:meus-dados:v1', KEY_LEMBRAR = 'bpd:meus-dados:lembrar';
  var ORDEM = ['b', 'l'];                  // ordem fixa (cronológica), nunca pela vitória
  var ANALISE = { comparativo: 'Governos', propostas: 'Planos 2026', balanco: 'Promessas' };
  var ANALISE_URL = { governos: 'comparativo', planos: 'propostas', promessas: 'balanco' };
  var CFG_SITE = W.SITE_CONFIG || {};
  var BASE = /^https?:\/\//.test(CFG_SITE.siteUrl || '') ? CFG_SITE.siteUrl.replace(/\/$/, '') : location.origin;
  var CEL = W.matchMedia ? W.matchMedia('(max-width: 899px)') : { matches: false };
  var REG = null, CFG = { max_selecao: 12, impacto_filtro: false };

  /* ------------------------------------------------------------------ utilidades */
  function el(tag, cls, txt, at) {
    var n = D.createElement(tag), k; if (cls) n.className = cls; if (txt != null) n.textContent = txt;
    if (at) for (k in at) if (at.hasOwnProperty(k) && at[k] != null) n.setAttribute(k, at[k]); return n;
  }
  function add(p) { for (var i = 1; i < arguments.length; i += 1) if (arguments[i]) p.appendChild(arguments[i]); return p; }
  function consentido() {           // LGPD: com banner, só manda o número da comparação depois do "aceito"
    if (CFG_SITE.consent !== 'banner') return true;
    try { return W.localStorage.getItem('bpb_consent_v1') === 'yes'; } catch (e) { return false; }
  }
  function track(n, p) { try { if (W.__track) W.__track(n, p || {}); } catch (e) {} }
  function trackLista(n, p) { if (!consentido()) { delete p.comparacao_id; delete p.slug; delete p.ids; } track(n, p); }
  function dataBR(iso) { var m = /^(\d{4})-(\d\d)-(\d\d)/.exec(iso || ''); return m ? m[3] + '/' + m[2] + '/' + m[1] : (iso || ''); }

  /* ------------------------------------------------------------------ Minha lista (favoritos) */
  function store(kind) { try { var s = W[kind]; s.setItem('__t', '1'); s.removeItem('__t'); return s; } catch (e) { return null; } }
  var SS = store('sessionStorage'), LS = store('localStorage'), mem = [];
  function lembrando() { try { return !!LS && LS.getItem(KEY_LEMBRAR) === '1'; } catch (e) { return false; } }
  function onde() { return lembrando() ? LS : SS; }
  function ler() {
    var s = onde(), v; if (!s) return mem.slice();
    try { v = JSON.parse(s.getItem(KEY) || '[]'); } catch (e) { v = []; }
    return (Object.prototype.toString.call(v) === '[object Array]' ? v : []).filter(function (x) { return typeof x === 'number' && x > 0 && x % 1 === 0; });
  }
  function gravar(ids) {
    var s = onde(); mem = ids.slice();
    if (s) try { s.setItem(KEY, JSON.stringify(ids)); } catch (e) {}
    try { D.dispatchEvent(new CustomEvent('bpd:favoritos', { detail: { ids: ids.slice() } })); } catch (e) {}
  }
  var favoritos = {
    lista: ler,
    tem: function (id) { return ler().indexOf(id) >= 0; },
    alternar: function (id) { var ids = ler(), i = ids.indexOf(id), on = i < 0; if (on) ids.push(id); else ids.splice(i, 1); gravar(ids); return on; },
    juntar: function (novos) { var ids = ler(); novos.forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); }); gravar(ids); return ids; },
    definir: function (ids) { gravar(ids.slice()); },
    limpar: function () { gravar([]); },
    lembrar: function (sim) {
      var ids = ler(); if (!LS) return false;
      try {
        if (sim) { LS.setItem(KEY_LEMBRAR, '1'); LS.setItem(KEY, JSON.stringify(ids)); if (SS) SS.removeItem(KEY); }
        else { LS.removeItem(KEY_LEMBRAR); LS.removeItem(KEY); if (SS) SS.setItem(KEY, JSON.stringify(ids)); }
      } catch (e) { return false; }
      return true;
    },
    lembrando: lembrando
  };

  /* ------------------------------------------------------------------ aviso curto (toast) com ações */
  var toastEl = null, toastT = null;
  function toast(texto, acoes, ms) {
    if (!toastEl) { toastEl = el('div', 'cat-toast', null, { role: 'status', 'aria-live': 'polite' }); D.body.appendChild(toastEl); }
    toastEl.textContent = ''; clearTimeout(toastT);
    toastEl.appendChild(el('span', 'cat-toast-t', texto));
    (acoes || []).forEach(function (a) {
      var b = a.href ? el('a', 'cat-toast-a', a.rotulo, { href: a.href }) : el('button', 'cat-toast-a', a.rotulo, { type: 'button' });
      if (a.fn) b.addEventListener('click', function () { a.fn(); esconde(); });
      toastEl.appendChild(b);
    });
    toastEl.classList.add('is-on');
    function esconde() { toastEl.classList.remove('is-on'); }
    toastT = setTimeout(esconde, ms || 4000);
  }

  /* ------------------------------------------------------------------ ids e links */
  function parseIds(txt) {             // "1-3-5", "1,3,5" → [1,3,5] (únicos, na ordem)
    var out = [];
    String(txt || '').split(/[^0-9]+/).forEach(function (p) {
      if (!p || p.length > 4) return; var n = parseInt(p, 10);
      if (n > 0 && out.indexOf(n) < 0) out.push(n);
    });
    return out;
  }
  function pedidoDaUrl() {              // {ids:[...]} ou {slug:'inflacao'}
    var m = /^\/c\/([0-9][0-9-]*)\/?$/.exec(location.pathname);
    if (m) return { ids: parseIds(m[1]) };
    var s = /^\/c\/([a-z][a-z0-9-]*)\/?$/.exec(location.pathname);
    if (s) return { slug: s[1] };
    var q = /[?&]ids=([0-9,.\-]+)/.exec(location.search); if (q) return { ids: parseIds(q[1]) };
    var h = /^#([0-9][0-9,.\-]*)$/.exec(location.hash); if (h) return { ids: parseIds(h[1]) };
    return { ids: [] };
  }
  function porId(id) { var c = REG.comparacoes, i; for (i = 0; i < c.length; i += 1) if (c[i].id === id) return c[i]; return null; }
  function porSlug(s) { var c = REG.comparacoes, i; for (i = 0; i < c.length; i += 1) if (c[i].slug === s) return c[i]; return null; }
  function ativos() { return REG.comparacoes.filter(function (it) { return it.status === 'ativo' && it.catalogo; }); }
  /* link canônico /c/1-3-5 (ids em ordem crescente); com 1 item, /c/<slug>/ (ganha a prévia própria do item) */
  function caminhoSelecao(ids) {
    var o = ids.slice().sort(function (a, b) { return a - b; });
    if (o.length === 1 && REG) { var it = porId(o[0]); if (it && it.slug) return '/c/' + it.slug + '/'; }
    return '/c/' + o.join('-');
  }

  /* ------------------------------------------------------------------ registro */
  function carregar(cb) {
    var inl = D.getElementById('bpd-comparacoes');
    if (inl) { try { REG = JSON.parse(inl.textContent); CFG = REG.config || CFG; return cb(null); } catch (e) {} }
    var x = new XMLHttpRequest();
    x.open('GET', URL_REG);
    x.onload = function () { try { if (x.status !== 200) throw 0; REG = JSON.parse(x.responseText); CFG = REG.config || CFG; cb(null); } catch (e) { cb(e); } };
    x.onerror = function () { cb(new Error('rede')); };
    x.send();
  }

  /* ------------------------------------------------------------------ textos (mesmo molde para os dois lados) */
  function nomeLado(it, k) { return it.lados[k].nome.replace(/\s*\(plano \d{4}\)$/, ''); }
  function titulo(it) {             // o veredito aparece UMA vez, aqui
    var t = it.tema_curto || it.titulo;
    if (it.resultado === 'vitoria') {
      if (it.pagina_id === 'propostas') return t + ': ' + it.lados[it.vencedor].curto + ' diz mais como fazer';
      if (it.pagina_id === 'balanco') return t + ': mais cumpridas no ' + nomeLado(it, it.vencedor);
      return t + ': ' + nomeLado(it, it.vencedor) + ' à frente';
    }
    if (it.resultado === 'contexto') return t + ': contexto, não conta ponto';
    if (it.resultado === 'sem-placar') return t + ': comparação sem placar';
    return t + ': não comparável';
  }
  function criterioTexto(it) {
    if (it.resultado === 'vitoria') return it.criterio === 'menor' ? '↓ menor é melhor' : '↑ maior é melhor';
    if (it.resultado === 'contexto') return 'contexto · não conta ponto';
    return 'comparação sem placar';
  }
  var FORCA = { clara: 'Diferença clara', apertada: 'Diferença apertada', 'depende-da-regua': 'Depende da régua' };
  function mudaria(it) { return it.resultado === 'vitoria' && it.forca === 'apertada' ? (it.o_que_mudaria || it.ressalva || '') : ''; }
  function notaImagem(it) {          // regra particular + força + "o que mudaria": impressas na imagem
    var p = [], m = mudaria(it);
    if (it.nota_visual) p.push(it.nota_visual.replace(/\.$/, '') + '.');
    if (it.resultado === 'vitoria' && it.forca) p.push(FORCA[it.forca] + (m ? '. O que mudaria: ' + m.replace(/\.$/, '') + '.' : '.'));
    return p.join(' ');
  }
  function fonteImagem(it) { return it.fonte + ' · ' + it.periodo_curto.b + ' × ' + it.periodo_curto.l + (it.dados_ate ? ' · dados até ' + it.dados_ate : ''); }

  /* ------------------------------------------------------------------ contagens neutras, por análise */
  function contaPorAnalise(lista) {
    var r = {};
    lista.forEach(function (it) {
      if (it.variante_de && it.variante_de.length) return;    // leituras alternativas não contam de novo
      var c = r[it.pagina_id] || (r[it.pagina_id] = { b: 0, l: 0, outro: 0, it: it });
      if (it.resultado === 'vitoria') c[it.vencedor] += 1; else c.outro += 1;
    });
    return r;
  }
  function linhasContagem(lista) {
    var r = contaPorAnalise(lista), out = [];
    ['comparativo', 'propostas', 'balanco'].forEach(function (pid) {
      var c = r[pid]; if (!c) return;
      var L = c.it.lados, ctx = c.outro ? ' · contexto ou sem placar ' + c.outro : '';
      if (pid === 'propostas') out.push('Planos 2026, qual diz mais como fazer: ' + L.b.curto + ' em ' + c.b + ' · ' + L.l.curto + ' em ' + c.l + ctx);
      else if (pid === 'balanco') out.push('Promessas, mais cumpridas: Governo Bolsonaro em ' + c.b + ' · Governo Lula em ' + c.l + ctx);
      else out.push('Governos: Governo Bolsonaro à frente em ' + c.b + ' · Governo Lula em ' + c.l + ctx);
    });
    return out;
  }
  function contagemCurta(lista) {   // "Governos: Bolsonaro 3 · Lula 8 · sem placar 13 | ..."
    var r = contaPorAnalise(lista), out = [];
    ['comparativo', 'propostas', 'balanco'].forEach(function (pid) {
      var c = r[pid]; if (!c) return;
      var L = c.it.lados;
      out.push(ANALISE[pid] + ' (à frente): ' + L.b.curto + ' ' + c.b + ' · ' + L.l.curto + ' ' + c.l + (c.outro ? ' · sem placar ' + c.outro : ''));
    });
    return out.join(' | ') + (lista.some(function (it) { return it.variante_de && it.variante_de.length; }) ? ' (leituras alternativas não contam de novo)' : '');
  }
  function composicao(lista) {      // para os eventos (P1-8): agregado, sem identificar a pessoa
    var r = contaPorAnalise(lista), nb = 0, nl = 0, no = 0, k;
    for (k in r) if (r.hasOwnProperty(k)) { nb += r[k].b; nl += r[k].l; no += r[k].outro; }
    return { n_b: nb, n_l: nl, n_outro: no, lados: nb && nl ? 'ambos' : (nb || nl ? 'um_lado' : 'sem_placar') };
  }
  /* resumo do site inteiro, por análise, no vocabulário decidido (nunca um placar único somado) */
  function resumoSite() {
    var it = ativos(), out = [], blocos = {}, ordem = [];
    it.forEach(function (c) {
      if (!c.no_placar || c.resultado !== 'vitoria' || !c.bloco_placar) return;
      if (!blocos[c.bloco_placar]) { blocos[c.bloco_placar] = { b: 0, l: 0 }; ordem.push(c.bloco_placar); }
      blocos[c.bloco_placar][c.vencedor] += 1;
    });
    if (ordem.length) out.push('Governos (placar de quesitos): ' + ordem.map(function (b) {
      var x = blocos[b], v = x.b && x.l ? 'Governo Bolsonaro ' + x.b + ' · Governo Lula ' + x.l : (x.b ? 'Governo Bolsonaro' : 'Governo Lula') + ' à frente (' + (x.b || x.l) + ')';
      return b + ': ' + v;
    }).join(' · '));
    var p0 = porRef('P00'), b0 = porRef('B00');
    if (b0) out.push('Promessas cumpridas: Governo Bolsonaro ' + b0.lados.b.valor + ' × Governo Lula ' + b0.lados.l.valor + ' (mandato de Lula em curso)');
    if (p0) out.push('Planos 2026, ferramenta nomeada: ' + p0.lados.b.curto + ' ' + p0.lados.b.valor + ' × ' + p0.lados.l.curto + ' ' + p0.lados.l.valor + ' (programas em execução contam)');
    return out;
  }
  function selecaoCurta(lista) {   // "Bolsonaro 1 · Lula 2" (e Flávio, se houver planos)
    var r = contaPorAnalise(lista), out = [];
    ['comparativo', 'propostas', 'balanco'].forEach(function (pid) {
      var c = r[pid]; if (!c) return;
      var L = c.it.lados, pre = Object.keys(r).length > 1 ? ANALISE[pid] + ': ' : '';
      out.push(pre + L.b.curto + ' ' + c.b + ' · ' + L.l.curto + ' ' + c.l + (c.outro ? ' · sem placar ' + c.outro : ''));
    });
    return out.join(' | ');
  }
  function placarCurto() {          // os dois blocos do placar dos governos, no vocabulário decidido
    var blocos = {}, ordem = [];
    ativos().forEach(function (c) {
      if (!c.no_placar || c.resultado !== 'vitoria' || !c.bloco_placar) return;
      if (!blocos[c.bloco_placar]) { blocos[c.bloco_placar] = { b: 0, l: 0 }; ordem.push(c.bloco_placar); }
      blocos[c.bloco_placar][c.vencedor] += 1;
    });
    return ordem.map(function (b) {
      var x = blocos[b];
      return b + ': ' + (x.b && x.l ? 'Bolsonaro ' + x.b + ' × Lula ' + x.l : (x.b ? 'Bolsonaro' : 'Lula') + ' (' + (x.b || x.l) + ')');
    }).join(' · ');
  }
  function porRef(r) { var c = REG.comparacoes, i; for (i = 0; i < c.length; i += 1) if (c[i].ref === r && c[i].status === 'ativo') return c[i]; return null; }

  /* ------------------------------------------------------------------ gráfico do cartão */
  function desenhar(box, it) {
    if (!W.BPD || !it.grafico) { box.appendChild(add(el('p', 'cat-sem-graf'), D.createTextNode(it.lados.b.nome + ': ' + it.lados.b.valor + ' · ' + it.lados.l.nome + ': ' + it.lados.l.valor))); return null; }
    var g = it.grafico, base = {
      titulo: titulo(it), nota: notaImagem(it) || null, fonte: fonteImagem(it), atualizado: dataBR(it.atualizado_em), tabela: false,
      lados: { b: { nome: it.lados.b.nome, curto: it.lados.b.curto, periodo: it.periodo_curto.b }, l: { nome: it.lados.l.nome, curto: it.lados.l.curto, periodo: it.periodo_curto.l } }
    };
    try {
      if (g.tipo === 'promessas') {
        base.categorias = g.categorias; base.destaque = g.destaque; base.excluir = g.excluir || [];
        base.destaqueRotulo = (g.categorias.filter(function (c) { return c.id === g.destaque; })[0] || {}).nome;
        base.linhas = ORDEM.map(function (k) { return { lado: k, nome: base.lados[k].nome, contagens: g.contagens[k] }; });
        return W.BPD.promessas(box, base);
      }
      if ((it.serie && it.serie.b) || (it.grupos && it.grupos.length)) return trajetoriaDe(box, it, base);
      base.criterio = it.resultado === 'vitoria' ? it.criterio : null;
      base.criterioTexto = it.resultado === 'vitoria' ? null : criterioTexto(it);
      base.vencedorRotulo = it.selo || 'à frente';
      base.valores = g.valores; base.formato = g.formato;
      base.sub = { b: it.lados.b.detalhe || null, l: it.lados.l.detalhe || null };
      return W.BPD.duelo(box, base);
    } catch (e) {
      box.textContent = 'Não foi possível mostrar o gráfico: ' + it.lados.b.nome + ' ' + it.lados.b.valor + ' · ' + it.lados.l.nome + ' ' + it.lados.l.valor + '.';
      return null;
    }
  }
  function escala(vals, zero) {
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (zero || (lo >= 0 && lo < hi * 0.45)) lo = Math.min(0, lo);
    var span = (hi - lo) || Math.abs(hi) || 1, passo = Math.pow(10, Math.floor(Math.log(span / 4) / Math.LN10)), e = span / 4 / passo;
    passo *= e >= 7.5 ? 10 : e >= 3.5 ? 5 : e >= 1.5 ? 2 : 1;
    return { min: Math.floor(lo / passo) * passo, max: Math.ceil(hi / passo) * passo, passo: passo };
  }
  function trajetoriaDe(box, it, base) {
    var x, sb, sl, fmt = (it.serie && it.serie.formato_eixo) || (it.grafico && it.grafico.formato) || {};
    if (it.serie && it.serie.b) {
      var n = Math.max(it.serie.b.length, it.serie.l.length);
      x = []; sb = []; sl = [];
      for (var i = 0; i < n; i += 1) { x.push(i === 0 ? 'Posse' : String(i)); sb.push(it.serie.b[i] == null ? null : it.serie.b[i]); sl.push(it.serie.l[i] == null ? null : it.serie.l[i]); }
      base.rotuloX = function (s, i) { return i === 0 ? 'posse' : (i % 12 === 0 ? (i / 12) + (i === 12 ? ' ano' : ' anos') : ''); };
    } else {
      x = it.grupos.map(function (g) { return g.rotulo; });
      sb = it.grupos.map(function (g) { return g.b ? g.b.v : null; });
      sl = it.grupos.map(function (g) { return g.l ? g.l.v : null; });
    }
    var vals = sb.concat(sl).filter(function (v) { return v != null; });
    base.x = x; base.formato = fmt; base.y = escala(vals, !(it.serie && it.serie.b)); base.y.formato = fmt;
    base.series = [{ lado: 'b', nome: base.lados.b.nome + (it.grupos ? ' (' + it.grupos.map(function (g) { return g.b ? g.b.rot : ''; }).filter(Boolean).join(', ') + ')' : ''), valores: sb },
                   { lado: 'l', nome: base.lados.l.nome + (it.grupos ? ' (' + it.grupos.map(function (g) { return g.l ? g.l.rot : ''; }).filter(Boolean).join(', ') + ')' : ''), valores: sl }];
    base.altura = 170;
    // comparação em destaque (a régua do veredito), uma vez, na própria imagem
    var dest = (it.periodo_curto.b + ' × ' + it.periodo_curto.l) + ': ' + it.lados.b.nome + ' ' + it.lados.b.valor + ' × ' + it.lados.l.nome + ' ' + it.lados.l.valor +
      ' (' + criterioTexto(it).replace(/^[↓↑] /, '') + ').';
    base.nota = 'Comparação em destaque, ' + dest + (base.nota ? ' ' + base.nota : '') +
      (it.serie && it.serie.b ? ' Linhas: valor mês a mês desde a posse de cada governo.' : ' Pontos: cada ano de mandato (1º ano × 1º ano...).');
    return W.BPD.trajetoria(box, base);
  }
  var io = ('IntersectionObserver' in W) ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); if (e.target.__desenha) e.target.__desenha(); } });
  }, { rootMargin: '400px 0px' }) : null;
  function preguicoso(box, fn) { box.__desenha = function () { if (!box.__ok) { box.__ok = 1; fn(); } }; if (io) io.observe(box); else box.__desenha(); }

  /* ------------------------------------------------------------------ estrela */
  function estrela(id, rotulo, aoMudar) {
    var on = favoritos.tem(id);
    var b = el('button', 'cat-star', on ? '★' : '☆', { type: 'button', 'aria-pressed': on ? 'true' : 'false', 'data-cmp': id,
      'aria-label': 'Guardar na minha lista: ' + rotulo, title: 'Guardar na minha lista' });
    b.addEventListener('click', function () {
      var agora = favoritos.alternar(id);
      sincronizaEstrelas();
      trackLista(agora ? 'favorite_add' : 'favorite_remove', { comparacao_id: id, total: favoritos.lista().length });
      if (aoMudar) aoMudar(agora); else avisoLista(agora, rotulo, id);
    });
    return b;
  }
  function sincronizaEstrelas() {
    var f = favoritos.lista(), bs = D.querySelectorAll('.cat-star[data-cmp]'), i;
    for (i = 0; i < bs.length; i += 1) {
      var on = f.indexOf(+bs[i].getAttribute('data-cmp')) >= 0;
      bs[i].setAttribute('aria-pressed', on ? 'true' : 'false'); bs[i].textContent = on ? '★' : '☆';
    }
  }
  function avisoLista(on, rotulo, id) {
    var n = favoritos.lista().length;
    if (on) toast('Guardado na sua lista (' + n + ').', [{ rotulo: 'Ver lista', href: '/comparacoes/?lista=1' }, { rotulo: 'Mandar', href: '/comparacoes/?lista=1&compartilhar=1' }]);
    else toast('Retirado da sua lista: ' + rotulo + ' (' + n + ').', [{ rotulo: 'Desfazer', fn: function () { favoritos.alternar(id); sincronizaEstrelas(); } }]);
  }

  /* ------------------------------------------------------------------ imagem (PNG) de um SVG */
  function compartilharImagem(svg, nome, texto, origem) {
    if (!svg || !W.BPD || !W.BPD.paraPNG) return;
    W.BPD.paraPNG(svg, 2, '/assets/fonts/inter-latin-var.woff2').then(function (blob) {
      var arq = null;
      try { arq = new File([blob], nome + '.png', { type: 'image/png' }); } catch (e) {}
      track('card_image', { origem: origem, method: arq && navigator.canShare && navigator.canShare({ files: [arq] }) ? 'native' : 'download' });
      if (arq && navigator.canShare && navigator.canShare({ files: [arq] })) {
        navigator.share({ files: [arq], text: texto }).catch(function () {});
      } else {
        var a = el('a', null, null, { href: URL.createObjectURL(blob), download: nome + '.png' });
        D.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.parentNode.removeChild(a); }, 1000);
      }
    }, function () { toast('Não deu para gerar a imagem. Tente de novo.'); });
  }
  function textoItem(it) {
    return '📊 ' + titulo(it) + ': ' + it.lados.b.nome + ' ' + it.lados.b.valor + ' × ' + it.lados.l.nome + ' ' + it.lados.l.valor + ' (' + criterioTexto(it).replace(/^[↓↑] /, '') + '). Fonte: ' + it.fonte + '.';
  }

  /* ------------------------------------------------------------------ cartão: o gráfico é o cartão */
  function cartao(it, opt) {
    opt = opt || {};
    var a = el('article', 'cat-card', null, { id: opt.semId ? null : 'cmp-' + it.id, 'data-id': it.id, 'data-res': it.resultado });
    var top = el('div', 'cat-top'), tags = el('p', 'cat-tags');
    add(tags, el('span', 'cat-tag', ANALISE[it.pagina_id] || ''),
      it.impacto && REG.impacto_niveis[it.impacto] ? el('span', 'cat-tag cat-tag--canal', REG.impacto_niveis[it.impacto].rotulo, { title: REG.impacto_nota || '' }) : null,
      el('span', 'cat-id', 'Comparação nº ' + it.id, { title: 'Número permanente desta comparação (usado no link de compartilhar)' }));
    add(top, tags, opt.semEstrela ? null : estrela(it.id, it.tema_curto || it.titulo, opt.aoMudar));
    a.appendChild(top);
    a.appendChild(el('h2', 'cat-sr', titulo(it)));
    var box = el('div', 'cat-graf', null, { 'aria-hidden': null });
    a.appendChild(box);
    preguicoso(box, function () {
      box.__svg = desenhar(box, it);
      // a camada de toque da trajetória (rect aria-hidden) não deve receber foco pelo Tab (axe: aria-hidden-focus)
      Array.prototype.forEach.call(box.querySelectorAll('[aria-hidden="true"][tabindex]'), function (r) { r.setAttribute('tabindex', '-1'); });
    });
    var acoes = el('div', 'cat-actions');
    var bImg = el('button', 'cat-btn', 'Imagem', { type: 'button', 'aria-label': 'Enviar ou baixar a imagem desta comparação' });
    bImg.addEventListener('click', function () { box.__desenha && box.__desenha(); compartilharImagem(box.querySelector('svg'), 'comparacao-' + it.id + '-' + it.slug, textoItem(it) + ' ' + BASE + '/c/' + it.slug + '/?o=img', 'cartao'); });
    acoes.appendChild(bImg);
    var sh = el('div', 'share share--mini', null, { 'data-share-variant': 'mini', 'data-share-section': it.slug, 'data-share-placement': 'catalogo',
      'data-share-path': '/c/' + it.slug + '/', 'data-share-name': 'a comparação nº ' + it.id, 'data-share-text': textoItem(it) });
    acoes.appendChild(sh);
    if (W.__share) W.__share.init(acoes);
    var det = el('details', 'cat-mais'), sum = el('summary', null, 'Saiba mais');
    det.appendChild(sum);
    var corpo = el('div', 'cat-mais-corpo');
    if (it.impacto && REG.impacto_niveis[it.impacto]) add(corpo, add(el('p'), el('b', null, 'Como chega em você: '), D.createTextNode(it.como_chega)));
    else if (it.como_chega) add(corpo, el('p', null, it.como_chega));
    if (it.ressalva && it.ressalva !== mudaria(it)) add(corpo, add(el('p'), el('b', null, 'Ressalva: '), D.createTextNode(it.ressalva)));
    if (it.atual_2026 && it.atual_2026.valor) add(corpo, add(el('p'), el('b', null, '2026 (' + (it.atual_2026.periodo || 'parcial') + '): '), D.createTextNode(it.atual_2026.valor + (it.atual_2026.nota ? ' · ' + it.atual_2026.nota : ''))));
    (it.variantes_agrupadas || []).forEach(function (v) { add(corpo, el('p', null, v)); });
    if (it.como_calculamos) add(corpo, add(el('p'), el('b', null, 'Como calculamos: '), D.createTextNode(it.como_calculamos)));
    var arq = el('p', 'cat-arq'); arq.appendChild(el('b', null, 'Arquivos originais: '));
    it.arquivos.forEach(function (f, i) {
      if (i) arq.appendChild(D.createTextNode(' · '));
      var nome = f.arquivo.split('/').pop();
      add(arq, el('a', null, nome, { href: f.arquivo, download: '', 'data-download': '1', 'data-file': nome, 'data-cat': 'comparacoes' }),
        el('span', 'cat-sha', ' SHA-256 ' + f.sha256.slice(0, 12) + '…', { title: f.sha256 }));
      (f.fonte_original || []).forEach(function (o) {
        if (!o || !o.url) return;
        add(arq, D.createTextNode(' (extrato de '), el('a', null, o.arquivo_original || 'arquivo original', { href: o.url, rel: 'noopener' }),
          el('span', 'cat-sha', ' SHA-256 ' + (o.sha256 || '').slice(0, 12) + '…', { title: o.sha256 || '' }), D.createTextNode(')'));
      });
    });
    corpo.appendChild(arq);
    if (it.variante_de && it.variante_de.length) corpo.appendChild(el('p', null, 'Leitura alternativa da comparação nº ' + it.variante_de.join(', nº ') + ': não conta de novo nas contagens.'));
    var onde = it.pagina === '/comparacoes/' ? null : it.pagina + '#' + (it.ancora_card || it.ancora);
    if (onde) corpo.appendChild(el('a', 'cat-link', 'Ver na página da análise ›', { href: onde }));
    det.appendChild(corpo);
    acoes.appendChild(det);
    a.appendChild(acoes);
    return a;
  }

  /* ------------------------------------------------------------------ linha (modo lista e chegada): números uma vez */
  function linha(it, opt) {
    opt = opt || {};
    var r = el('div', 'cat-row', null, { id: 'cmp-' + it.id, 'data-id': it.id });
    var hd = el('div', 'cat-row-hd');
    var bt = el('button', 'cat-row-bt', null, { type: 'button', 'aria-expanded': 'false', 'aria-controls': 'cmp-' + it.id + '-c' });
    var t = el('span', 'cat-row-t');
    add(t, el('b', null, it.tema_curto || it.titulo), el('span', 'cat-row-crit', ' · ' + criterioTexto(it) + (it.forca === 'apertada' ? ' · apertada' : '')));
    var vals = el('span', 'cat-row-vals');
    ORDEM.forEach(function (k) {
      var win = it.vencedor === k;
      var v = el('span', 'cat-row-v cat-row-v--' + k + (win ? ' is-win' : ''));
      add(v, el('i', 'mk mk--' + k, null, { 'aria-hidden': 'true' }), el('span', 'cat-row-n', it.lados[k].curto + ' '), el('b', null, it.lados[k].valor));
      if (win) v.appendChild(el('span', 'cat-row-ok', ' ✓', { 'aria-label': ' (à frente)' }));
      vals.appendChild(v);
    });
    add(bt, t, vals, el('span', 'cat-row-mais', '›', { 'aria-hidden': 'true' }));
    add(hd, bt, estrela(it.id, it.tema_curto || it.titulo, opt.aoMudar));
    r.appendChild(hd);
    var c = el('div', 'cat-row-c', null, { id: 'cmp-' + it.id + '-c', hidden: '' });
    r.appendChild(c);
    bt.addEventListener('click', function () {
      var abrir = c.hidden;
      c.hidden = !abrir; bt.setAttribute('aria-expanded', abrir ? 'true' : 'false'); r.classList.toggle('is-open', abrir);
      if (abrir && !c.firstChild) { c.appendChild(cartao(it, { semId: true, semEstrela: true })); }
      if (abrir) { var b = c.querySelector('.cat-graf'); if (b && b.__desenha) b.__desenha(); }
    });
    return r;
  }

  /* ------------------------------------------------------------------ compartilhar a lista (folha) */
  var ABREV = 280, CTA = ' Números, ressalvas e método: ';
  function textoSelecao(itens, path) {
    var url = BASE + path + '?o=wa', pre = '📊 Separei ' + itens.length + (itens.length === 1 ? ' comparação' : ' comparações') + ' com dados oficiais: ';
    var fixo = '. Cada uma tem os números dos dois lados e a fonte; no site há comparações com cada lado à frente.';
    var orc = ABREV - pre.length - fixo.length - CTA.length - url.length - 12, lista = '', i;
    for (i = 0; i < itens.length; i += 1) {
      var prox = (lista ? lista + ', ' : '') + (itens[i].tema_curto || itens[i].titulo);
      if (prox.length > orc) { lista += ' e mais ' + (itens.length - i); break; }
      lista = prox;
    }
    return pre + lista + fixo;
  }
  function imagemSelecao(itens, path, origem) {
    if (!W.BPD || !W.BPD.cardSelecao) return;
    var tmp = el('div', null, null, { style: 'position:absolute;left:-9999px;top:0;width:1080px' }); D.body.appendChild(tmp);
    var svg = W.BPD.cardSelecao(tmp, {
      formato: itens.length > 6 ? 'story' : 'feed', titulo: 'Comparações escolhidas, com dados oficiais',
      sub: 'Em cada linha, os números dos dois lados, a régua e o lado à frente.',
      itens: itens.map(function (it) {
        return { tema: it.tema_curto || it.titulo, criterioTexto: criterioTexto(it), valores: it.grafico ? it.grafico.valores : { b: 0, l: 0 },
          formato: it.grafico ? it.grafico.formato : {}, vencedor: it.vencedor, apertada: it.forca === 'apertada',
          lados: { b: { curto: it.lados.b.curto }, l: { curto: it.lados.l.curto } }, periodo: it.periodo_curto.b + ' × ' + it.periodo_curto.l };
      }),
      rodape: ['Seleção feita por quem compartilhou.'].concat(resumoSite().map(function (s) { return 'No site: ' + s + '.'; })),
      url: BASE.replace(/^https?:\/\//, '') + path, atualizado: dataBR(REG.gerado_em)
    });
    compartilharImagem(svg, 'selecao-' + path.replace(/[^0-9a-z-]/g, ''), textoSelecao(itens, path) + CTA + BASE + path + '?o=img', origem);
    setTimeout(function () { tmp.parentNode && tmp.parentNode.removeChild(tmp); }, 3000);
  }
  function painelLista(host) {
    host.textContent = '';
    var ids = favoritos.lista(), validos = ids.map(porId).filter(function (it) { return it && it.status === 'ativo'; });
    validos.sort(function (a, b) { return a.id - b.id; });
    var max = CFG.max_selecao || 12, vai = validos.slice(0, max);
    if (!vai.length) {
      host.appendChild(el('p', 'cat-note', 'Sua lista está vazia: vai o link desta página. Toque ☆ em qualquer comparação para montar a sua.'));
      var shp = el('div', 'share', null, { 'data-share-section': 'comparacoes', 'data-share-placement': 'catalogo', 'data-share-path': '/comparacoes/',
        'data-share-name': 'a página de comparações', 'data-share-text': '📊 Todas as comparações do Bora pros dados Brasil, com os números dos dois lados e a fonte oficial.' });
      host.appendChild(shp); if (W.__share) W.__share.init(host); return;
    }
    var path = caminhoSelecao(vai.map(function (it) { return it.id; }));
    if (validos.length > max) host.appendChild(el('p', 'cat-note cat-note--warn', 'O link leva até ' + max + ' comparações: vão as ' + max + ' primeiras.'));
    var prev = el('p', 'cat-linkprev'); add(prev, el('span', null, 'Link: '), el('code', null, BASE.replace(/^https?:\/\//, '') + path));
    host.appendChild(prev);
    var sh = el('div', 'share', null, { 'data-share-section': 'selecao', 'data-share-placement': 'selecao', 'data-share-path': path,
      'data-share-name': 'sua lista', 'data-share-text': textoSelecao(vai, path), 'data-share-lead': 'Quem receber vê os números dos dois lados, a fonte e o link para todas as comparações.' });
    host.appendChild(sh);
    sh.addEventListener('click', function (e) {    // captura: antes do stopPropagation do share.js
      var t = e.target && e.target.closest ? e.target.closest('[data-m]') : null;
      if (!t || t.getAttribute('data-m') === 'more') return;
      var p = composicao(vai); p.ids = path.slice(3); p.count = vai.length; p.method = t.getAttribute('data-m');
      trackLista('selection_share', p);
    }, true);
    if (W.__share) W.__share.init(host);
    var bi = el('button', 'cat-btn', 'Imagem da lista', { type: 'button', 'aria-label': 'Enviar ou baixar uma imagem com a sua lista' });
    bi.addEventListener('click', function () { imagemSelecao(vai, path, 'lista'); });
    host.appendChild(add(el('p', 'cat-acoes-ex'), bi));
  }
  function caixaLembrar() {
    var w = el('div', 'cat-lembrar-box');
    var lab = el('label', 'cat-lembrar'), cb = el('input', null, null, { type: 'checkbox' });
    cb.checked = favoritos.lembrando(); if (!LS) cb.disabled = true;
    add(lab, cb, el('span', null, 'Lembrar minha lista neste aparelho'));
    cb.addEventListener('change', function () {
      favoritos.lembrar(cb.checked); track('favorites_remember', { valor: cb.checked ? '1' : '0' });
      toast(cb.checked ? 'Sua lista fica guardada neste aparelho até você desmarcar.' : 'Sua lista fica só nesta aba.');
    });
    add(w, lab, el('p', 'cat-note', 'Sem isso, a lista some ao fechar a aba (se abriu pelo WhatsApp, some ao voltar para a conversa). Dica: mande o link da lista para você mesmo.'));
    return w;
  }

  /* ================================================================== PÁGINA /comparacoes/ */
  var FILTROS = ['analise', 'tema', 'forca', 'impacto'];
  function lerEstado() {
    var e = { lista: false, modo: '' };
    location.search.replace(/^\?/, '').split('&').forEach(function (kv) {
      var p = kv.split('='), k = decodeURIComponent(p[0] || ''), v = decodeURIComponent((p[1] || '').replace(/\+/g, ' '));
      if (k === 'pagina') { k = 'analise'; v = v === 'comparativo' ? 'governos' : (v === 'propostas' ? 'planos' : (v === 'balanco' ? 'promessas' : v)); }
      if (k === 'meus') k = 'lista';
      if (FILTROS.indexOf(k) >= 0 && /^[a-z0-9-]{1,30}$/.test(v)) e[k] = v;
      if (k === 'lista' && v === '1') e.lista = true;
      if (k === 'modo' && (v === 'lista' || v === 'cartoes')) e.modo = v;
      if (k === 'compartilhar' && v === '1') e.compartilhar = true;
    });
    if (!CFG.impacto_filtro) e.impacto = '';
    return e;
  }
  function gravarEstado(e) {
    var q = [];
    FILTROS.forEach(function (k) { if (e[k]) q.push(k + '=' + encodeURIComponent(e[k])); });
    if (e.lista) q.push('lista=1');
    if (e.modo) q.push('modo=' + e.modo);
    try { history.replaceState(null, '', location.pathname + (q.length ? '?' + q.join('&') : '') + location.hash); } catch (x) {}
  }

  function iniciarCatalogo(root) {
    root.textContent = '';
    var est = lerEstado(), todos = ativos();
    var cont = el('div', 'cat-filtros');
    /* 1. Análise: controle segmentado */
    var seg = el('div', 'cat-seg', null, { role: 'radiogroup', 'aria-label': 'Análise' });
    [['', 'Tudo'], ['governos', 'Governos'], ['planos', 'Planos 2026'], ['promessas', 'Promessas']].forEach(function (o) {
      var b = el('button', 'cat-seg-b', o[1], { type: 'button', role: 'radio', 'data-v': o[0] });
      b.addEventListener('click', function () { est.analise = o[0]; aplicar(); track('catalog_filter', { filtro: 'analise', valor: o[0] || 'tudo' }); });
      seg.appendChild(b);
    });
    /* 2. Tema: chips com rolagem lateral */
    var chips = el('div', 'cat-chips', null, { role: 'group', 'aria-label': 'Tema' });
    var usados = {}; todos.forEach(function (it) { usados[it.tema] = (usados[it.tema] || 0) + 1; });
    [['', 'Todos os temas']].concat(Object.keys(REG.temas).filter(function (k) { return usados[k]; }).map(function (k) { return [k, REG.temas[k]]; })).forEach(function (o) {
      var b = el('button', 'cat-chip', o[1], { type: 'button', 'aria-pressed': 'false', 'data-v': o[0] });
      b.addEventListener('click', function () { est.tema = est.tema === o[0] ? '' : o[0]; aplicar(); track('catalog_filter', { filtro: 'tema', valor: est.tema || 'todos' }); });
      chips.appendChild(b);
    });
    /* 3. Mais filtros (recolhido) */
    var mais = el('details', 'cat-maisf'), sm = el('summary', null, 'Mais filtros');
    var corpoF = el('div', 'cat-maisf-c');
    var lf = el('label', 'cat-f'); lf.appendChild(el('span', null, 'Diferença'));
    var sF = el('select', null, null, { name: 'forca' });
    [['', 'Todas'], ['clara', 'Clara'], ['apertada', 'Apertada'], ['depende-da-regua', 'Depende da régua']].forEach(function (o) { sF.appendChild(el('option', null, o[1], { value: o[0] })); });
    sF.value = est.forca || ''; sF.addEventListener('change', function () { est.forca = sF.value; aplicar(); track('catalog_filter', { filtro: 'forca', valor: sF.value || 'todas' }); });
    lf.appendChild(sF); corpoF.appendChild(lf);
    var canais = null, canalCont = null;
    if (CFG.impacto_filtro) {   // portão cumprido: lista pré-registrada no registro (decisão do dono, item 8)
      canais = el('div', 'cat-chips cat-canais', null, { role: 'group', 'aria-label': 'Como chega em você' });
      var nivs = Object.keys(REG.impacto_niveis).sort(function (a, b) { return REG.impacto_niveis[a].ordem - REG.impacto_niveis[b].ordem; });
      [['', 'Todos os canais']].concat(nivs.map(function (k) { return [k, REG.impacto_niveis[k].rotulo]; })).forEach(function (o) {
        var b = el('button', 'cat-chip', o[1], { type: 'button', 'aria-pressed': 'false', 'data-v': o[0], title: o[0] ? REG.impacto_niveis[o[0]].regra : '' });
        b.addEventListener('click', function () { est.impacto = est.impacto === o[0] ? '' : o[0]; aplicar(); track('catalog_filter', { filtro: 'impacto', valor: est.impacto || 'todos' }); });
        canais.appendChild(b);
      });
      // contagem dos dois lados em CADA canal (catálogo inteiro), em tamanho de detalhe, com o link do método
      var cc = {};
      todos.forEach(function (it) {
        if (!it.impacto || (it.variante_de && it.variante_de.length)) return;
        var c = cc[it.impacto] || (cc[it.impacto] = { b: 0, l: 0, o: 0 });
        if (it.resultado === 'vitoria') c[it.vencedor] += 1; else c.o += 1;
      });
      var CURTO = { bolso: 'No bolso', servicos: 'Serviços', economia: 'Contas', panorama: 'Panorama' };
      canalCont = el('div', 'cat-canal-cont', null, { role: 'group', 'aria-label': 'Quantas comparações cada lado tem à frente, por canal' });
      var cab = el('p', 'cat-canal-hd');
      add(cab, D.createTextNode('À frente ('), el('i', 'mk mk--b', null, { 'aria-hidden': 'true' }), D.createTextNode(' Bolsonaro × '),
        el('i', 'mk mk--l', null, { 'aria-hidden': 'true' }), D.createTextNode(' Lula) · '), el('a', null, 'método ›', { href: '#metodo-canais' }));
      var grade = el('dl', 'cat-canal-tab');
      nivs.filter(function (k) { return cc[k]; }).forEach(function (k) {
        var c = cc[k], cel = el('div');
        add(cel, el('dt', null, CURTO[k] || REG.impacto_niveis[k].rotulo, { title: REG.impacto_niveis[k].rotulo }),
          el('dd', null, c.b + ' × ' + c.l, { 'aria-label': 'Bolsonaro ' + c.b + ', Lula ' + c.l }));
        grade.appendChild(cel);
      });
      add(canalCont, cab, grade);
    }
    var bModo = el('button', 'cat-chip', '', { type: 'button' });
    bModo.addEventListener('click', function () { est.modo = modoAtual() === 'lista' ? 'cartoes' : 'lista'; aplicar(); });
    corpoF.appendChild(bModo);
    add(mais, sm, corpoF);
    var limpar = el('button', 'cat-clear', 'Limpar filtros', { type: 'button' });
    limpar.addEventListener('click', function () { est.analise = est.tema = est.forca = est.impacto = ''; est.lista = false; sF.value = ''; aplicar(); });
    var l2 = add(el('div', 'cat-filtros-l2'), mais, limpar);
    add(cont, seg, chips, canais, canalCont, l2);

    var nota = el('p', 'cat-note cat-contagem', null, { 'aria-live': 'polite' });
    var cabLista = el('div', 'cat-cablista', null, { hidden: '' });
    var lista = el('div', 'cat-list', null, { id: 'cat-lista' });
    var vazio = el('div', 'cat-empty', null, { hidden: '' });

    /* barra (fixa embaixo no celular; no computador, presa no topo da lista) */
    var bar = el('div', 'cat-bar', null, { role: 'region', 'aria-label': 'Minha lista' });
    var bFil = el('button', 'cat-bar-b', 'Filtros', { type: 'button' });
    bFil.addEventListener('click', function () { cont.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    var bSh = el('button', 'cat-bar-b cat-bar-b--pri', '', { type: 'button', 'aria-haspopup': 'dialog', 'aria-controls': 'cat-share' });
    var bLista = el('button', 'cat-bar-b', '', { type: 'button', 'aria-controls': 'cat-lista' });
    bLista.addEventListener('click', function () { est.lista = !est.lista; aplicar(); });
    add(bar, bFil, bSh, bLista);

    var folha = el('div', 'cat-sheet', null, { id: 'cat-share', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'cat-share-t', hidden: '' });
    var fundo = el('button', 'cat-sheet-fundo', null, { type: 'button', 'aria-label': 'Fechar', tabindex: '-1' });
    var painel = el('div', 'cat-sheet-p'), hdp = el('div', 'cat-sheet-hd');
    var tP = el('h2', null, 'Compartilhar', { id: 'cat-share-t', tabindex: '-1' }), xP = el('button', 'cat-sheet-x', '×', { type: 'button', 'aria-label': 'Fechar' });
    var corpoP = el('div'), apagar = el('button', 'cat-linkbtn', 'Apagar minha lista', { type: 'button' });
    add(painel, add(hdp, tP, xP), corpoP, caixaLembrar(), apagar);
    add(folha, fundo, painel);
    function abrir(sim) {
      folha.hidden = !sim; D.documentElement.classList.toggle('cat-travado', sim);
      if (!sim) { bSh.focus(); return; }
      painelLista(corpoP); tP.textContent = favoritos.lista().length ? 'Compartilhar minha lista' : 'Compartilhar esta página';
      track('selection_share_open', { count: favoritos.lista().length }); tP.focus();
    }
    bSh.addEventListener('click', function () { abrir(true); });
    fundo.addEventListener('click', function () { abrir(false); }); xP.addEventListener('click', function () { abrir(false); });
    D.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !folha.hidden) abrir(false); });
    apagar.addEventListener('click', function () {
      var antes = favoritos.lista(); if (!antes.length) return;
      favoritos.limpar(); track('favorites_clear', { count: antes.length }); abrir(false); aplicar();
      toast('Lista apagada.', [{ rotulo: 'Desfazer', fn: function () { favoritos.definir(antes); aplicar(); } }], 6000);
    });

    l2.appendChild(nota);   // a contagem fica na mesma linha de "Mais filtros" (primeiro item mais alto na tela)
    add(root, cont, bar, cabLista, lista, vazio, folha);   // barra antes da lista: no computador fica presa no topo (sticky)

    function modoAtual() { return est.modo || (CEL.matches ? 'lista' : 'cartoes'); }
    function aoMudar(on) {
      var n = favoritos.lista().length;
      if (on) toast('Guardado na sua lista (' + n + ').', [{ rotulo: 'Ver lista', fn: function () { est.lista = true; aplicar(); } }, { rotulo: 'Mandar', fn: function () { abrir(true); } }]);
      else toast('Retirado da sua lista (' + n + ').');
      atualizarBarra(); if (est.lista && !on) aplicar();
    }
    function atualizarBarra() {
      var n = favoritos.lista().length;
      bLista.textContent = '★ Minha lista (' + n + ')'; bLista.setAttribute('aria-pressed', est.lista ? 'true' : 'false');
      bSh.textContent = n ? '↗ Compartilhar lista (' + n + ')' : '↗ Compartilhar';
    }
    function aplicar() {
      var fav = favoritos.lista(), pid = ANALISE_URL[est.analise] || '';
      var vis = todos.filter(function (it) {
        if (pid && it.pagina_id !== pid) return false;
        if (est.tema && it.tema !== est.tema) return false;
        if (est.forca && it.forca !== est.forca) return false;
        if (est.impacto && it.impacto !== est.impacto) return false;
        if (est.lista && fav.indexOf(it.id) < 0) return false;
        return true;
      });  // ordem = ordem do registro (a ordem de leitura do site), nunca por vencedor ou canal
      var modo = modoAtual();
      lista.textContent = ''; lista.className = 'cat-list cat-list--' + modo;
      vis.forEach(function (it) { lista.appendChild(modo === 'lista' ? linha(it, { aoMudar: aoMudar }) : cartao(it, { aoMudar: aoMudar })); });
      if (W.__share) W.__share.init(lista);
      // contagem por análise, em texto pequeno (nunca um placar único somado)
      var filtrado = est.analise || est.tema || est.forca || est.impacto || est.lista;
      nota.textContent = vis.length + (vis.length === 1 ? ' comparação' : ' comparações') + (filtrado && vis.length ? ' · ' + contagemCurta(vis) : '');
      // estados vazios
      vazio.textContent = ''; vazio.hidden = vis.length > 0;
      if (!vis.length && est.lista && !fav.length) {
        add(vazio, el('p', null, 'Sua lista está vazia. Toque ☆ em qualquer comparação para guardar.'));
        var bv = el('button', 'cat-clear', 'Ver todas', { type: 'button' }); bv.addEventListener('click', function () { est.lista = false; aplicar(); }); vazio.appendChild(bv);
      } else if (!vis.length) {
        add(vazio, el('p', null, 'Nenhuma comparação com esses filtros.'));
        var bl = el('button', 'cat-clear', 'Limpar filtros', { type: 'button' }); bl.addEventListener('click', function () { limpar.click(); }); vazio.appendChild(bl);
      }
      // cabeçalho da "Minha lista": lembrar + mandar para si
      cabLista.textContent = ''; cabLista.hidden = !est.lista;
      if (est.lista) add(cabLista, el('h2', null, 'Minha lista'), caixaLembrar());
      // estado visual dos filtros
      Array.prototype.forEach.call(seg.children, function (b) { b.setAttribute('aria-checked', b.getAttribute('data-v') === (est.analise || '') ? 'true' : 'false'); });
      Array.prototype.forEach.call(chips.children, function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-v') === (est.tema || '') ? 'true' : 'false'); });
      if (canais) Array.prototype.forEach.call(canais.children, function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-v') === (est.impacto || '') ? 'true' : 'false'); });
      bModo.textContent = modo === 'lista' ? 'Ver como cartões' : 'Ver como lista';
      limpar.hidden = !(est.analise || est.tema || est.forca || est.impacto || est.lista);
      atualizarBarra(); gravarEstado(est);
    }
    D.addEventListener('bpd:favoritos', atualizarBarra);
    if (CEL.addEventListener) CEL.addEventListener('change', function () { if (!est.modo) aplicar(); });
    aplicar();
    if (est.compartilhar) abrir(true);
  }

  /* ================================================================== CHEGADA /c/1-3-5 */
  function iniciarSelecao(root) {
    root.textContent = '';
    var max = CFG.max_selecao || 12, ped = pedidoDaUrl(), pedidos = ped.ids || [], achados = [], invalidos = [], retirados = [];
    if (ped.slug) { var s = porSlug(ped.slug); if (s) pedidos = [s.id]; else invalidos.push(ped.slug); }
    var excesso = pedidos.length > max; pedidos = pedidos.slice(0, max);
    pedidos.forEach(function (id) {
      var it = porId(id);
      if (!it) invalidos.push(id); else if (it.status !== 'ativo') retirados.push(it); else achados.push(it);
    });
    var n = achados.length;
    var hd = el('header', 'sel-hd');
    add(hd, el('p', 'sel-sobre', 'Seleção feita por quem te enviou este link'),
      el('h1', null, n ? n + (n === 1 ? ' comparação' : ' comparações') + ' com dados oficiais' : 'Este link não traz comparações válidas'));
    root.appendChild(hd);
    var tabela = el('div', 'sel-tab');
    achados.forEach(function (it) { tabela.appendChild(linha(it, { aoMudar: function (on) { toast(on ? 'Guardado na sua lista (' + favoritos.lista().length + ').' : 'Retirado da sua lista.', on ? [{ rotulo: 'Ver lista', href: '/comparacoes/?lista=1' }] : null); } })); });
    if (n) root.appendChild(tabela);
    root.appendChild(add(el('p', 'sel-neutro'), D.createTextNode('Este site compara dados oficiais com a mesma regra para os dois lados. Não indica voto. '), el('a', null, 'Quem fez ›', { href: '/sobre/' })));
    // contexto: esta seleção e o site inteiro, por análise (2 blocos curtos)
    var ctx = el('div', 'sel-ctx');
    if (n) ctx.appendChild(el('p', null, 'Nesta seleção: ' + selecaoCurta(achados) + '.'));
    ctx.appendChild(el('p', null, 'No site: ' + placarCurto() + '.'));
    ctx.appendChild(el('a', 'cat-link', 'Ver o placar completo ›', { href: '/#resumo' }));
    root.appendChild(ctx);
    // P1-11: seleção só com vitórias de um lado → link simétrico para as do outro lado, na mesma análise
    var cpa = contaPorAnalise(achados), pid;
    for (pid in cpa) if (cpa.hasOwnProperty(pid)) {
      var c = cpa[pid], so = c.b && !c.l ? 'b' : (c.l && !c.b ? 'l' : null);
      if (!so) continue;
      var outro = so === 'b' ? 'l' : 'b';
      var ids = ativos().filter(function (it) { return it.pagina_id === pid && it.resultado === 'vitoria' && it.vencedor === outro && !(it.variante_de && it.variante_de.length); })
        .map(function (it) { return it.id; }).slice(0, max);
      if (ids.length) root.appendChild(add(el('p', 'sel-outro'), el('a', 'cat-link', 'Ver também as comparações de ' + ANALISE[pid] + ' em que o outro lado fica à frente (' + ids.length + ') ›', { href: caminhoSelecao(ids) })));
    }
    var pe = el('div', 'sel-acoes');
    if (n) {
      var bAll = el('button', 'cat-btn cat-btn--pri', 'Guardar estes ' + n + ' na minha lista', { type: 'button' });
      bAll.addEventListener('click', function () {
        favoritos.juntar(achados.map(function (it) { return it.id; })); sincronizaEstrelas();
        trackLista('selection_save_all', { ids: achados.map(function (it) { return it.id; }).join('-'), count: n });
        toast('Guardados na sua lista.', [{ rotulo: 'Ver lista', href: '/comparacoes/?lista=1' }]);
      });
      var bImg = el('button', 'cat-btn', 'Imagem desta seleção', { type: 'button' });
      bImg.addEventListener('click', function () { imagemSelecao(achados, caminhoSelecao(achados.map(function (it) { return it.id; })), 'chegada'); });
      add(pe, bAll, bImg);
    }
    pe.appendChild(el('a', 'cat-link', 'Ver todas as comparações ›', { href: '/comparacoes/' }));
    root.appendChild(pe);
    if (invalidos.length || retirados.length || excesso) {
      var av = el('div', 'sel-aviso');
      if (invalidos.length) av.appendChild(el('p', null, 'Não encontramos ' + (invalidos.length === 1 ? 'o item ' : 'os itens ') + invalidos.join(', ') + ' (link incompleto ou digitado errado).'));
      retirados.forEach(function (it) {
        var p = el('p', null, 'A comparação nº ' + it.id + ' saiu do site' + (it.substituido_por ? '; veja a versão atual: ' : '.'));
        if (it.substituido_por) p.appendChild(el('a', null, 'comparação nº ' + it.substituido_por, { href: '/c/' + it.substituido_por }));
        av.appendChild(p);
      });
      if (excesso) av.appendChild(el('p', null, 'O link tinha mais de ' + max + ' itens: mostramos os ' + max + ' primeiros.'));
      root.appendChild(av);
    }
    if (!n) {   // sem itens válidos: mostra o resumo do site inteiro (os dois lados), não só o link
      var tab2 = el('div', 'sel-tab');
      ativos().filter(function (it) { return it.no_placar; }).forEach(function (it) { tab2.appendChild(linha(it)); });
      root.appendChild(add(el('section', 'sel-site'), el('h2', null, 'Os quesitos do placar dos governos'), tab2));
    }
    var o = (/[?&]utm_source=([a-z]+)/.exec(location.search) || [])[1] || 'link';
    var p = composicao(achados); p.ids = achados.map(function (it) { return it.id; }).join('-'); p.count = n;
    p.invalid_count = invalidos.length + retirados.length; p.origem = o;
    trackLista('selection_view', p);
  }

  /* ================================================================== ESTRELAS NAS PÁGINAS DE ANÁLISE */
  function iniciarEstrelas(mapa) {
    var k, n = 0;
    for (k in mapa) if (mapa.hasOwnProperty(k)) {
      var alvo = D.getElementById(k); if (!alvo) continue;
      var id = mapa[k][0], rot = mapa[k][1];
      // na linha de ações do cartão ([Compartilhar imagem] [WhatsApp] ☆), à direita, como último item; o .bpd-card-acoes
      // é montado pelo charts.js (inclusive dentro de .bpd-car-slide do carrossel), então a estrela é realocada depois
      var host = alvo.querySelector('.bpd-card-acoes') || alvo.querySelector('.vrd-acoes') || alvo.querySelector('.chap-hd') || alvo;
      if (host.querySelector('.cat-star')) continue;
      var b = estrela(id, rot, null);
      b.classList.add('cat-star--pg');
      host.classList.add('cat-com-estrela');
      host.appendChild(b); n += 1;
    }
    // o charts.js monta o cartão (.card-slot) depois: a estrela muda para o canto do cartão montado
    function reloca() {
      Array.prototype.forEach.call(D.querySelectorAll('.cat-star--pg'), function (st) {
        var card = st.closest('.vrd, section'), alvo = card && card.querySelector('.bpd-card-acoes');
        if (alvo && st.parentNode !== alvo) { alvo.classList.add('cat-com-estrela'); alvo.appendChild(st); }
      });
    }
    [0, 600, 1500, 3000].forEach(function (t) { setTimeout(reloca, t); });
    // "Ver todas as comparações" no fim do resumo (decisão do dono, item 9) — só acrescenta, não altera o resumo
    var res = D.getElementById('resumo');
    if (res && !res.querySelector('.cat-ver-todas')) res.appendChild(add(el('p', 'cat-ver-todas'), el('a', 'cat-link', 'Ver todas as comparações e montar sua lista ›', { href: '/comparacoes/' })));
    return n;
  }
  /* barra inferior do ui.js e aba do cabeçalho: "★ Minha lista (n)" depois do 1º favorito */
  function ligaAtalhos(tent) {
    var nav = D.querySelector('.sb-nav a[href="/comparacoes/"]');
    function upd() {
      var n = favoritos.lista().length;
      if (nav) {
        var b = nav.querySelector('.cat-n'); if (!b) { b = el('span', 'cat-n'); nav.appendChild(b); }
        b.textContent = n ? ' ★' + n : ''; b.hidden = !n;
        nav.setAttribute('aria-label', n ? 'Comparações (sua lista tem ' + n + ')' : 'Comparações');
      }
      var bar = D.querySelector('.bbar'); if (!bar) return;
      var sec = bar.querySelector('[data-track-label="secoes"]'), ml = bar.querySelector('.cat-bbar-lista');
      if (!ml) {
        ml = el('a', 'bbar-btn cat-bbar-lista', null, { href: '/comparacoes/?lista=1', 'data-track': 'bbar_click', 'data-track-label': 'minha_lista' });
        if (sec) sec.parentNode.insertBefore(ml, sec.nextSibling); else bar.appendChild(ml);
      }
      ml.textContent = '★ Minha lista (' + n + ')';
      ml.style.display = n ? '' : 'none'; if (sec) sec.style.display = n ? 'none' : '';
    }
    upd();
    D.addEventListener('bpd:favoritos', upd);
    if (!D.querySelector('.bbar') && D.querySelector('.topnav') && (tent || 0) < 10) setTimeout(function () { ligaAtalhos((tent || 0) + 1); }, 300);
  }

  /* ------------------------------------------------------------------ boot */
  D.addEventListener('click', function (e) {   // link para o método: abre o recolhível (que começa fechado)
    var a = e.target && e.target.closest ? e.target.closest('a[href="#metodo-canais"]') : null;
    var d = a && D.getElementById('metodo-canais'); if (d) d.open = true;
  });
  /* ------------------------------------------------------------------ diálogos das páginas (#mcat, #modal, #modal-detail, #modal-plan)
     Acessibilidade (2.1.2 / 2.4.3): enquanto um .modal-backdrop está aberto, o resto da página fica inert, o Tab
     circula só dentro do diálogo, Esc fecha (se a página não fechar, clica no "Fechar") e o foco volta ao gatilho. */
  function guardaModais() {
    var mods = D.querySelectorAll('.modal-backdrop'); if (!mods.length) return;
    var aberto = null, gatilho = null, inertes = [], ultimoFoco = null;
    function focaveis(m) {
      return Array.prototype.filter.call(m.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'),
        function (e) { return e.offsetWidth > 0 || e.offsetHeight > 0; });
    }
    function abriu(m) {
      if (aberto === m) return;
      if (!aberto) gatilho = ultimoFoco;
      aberto = m;
      inertes.forEach(function (c) { c.removeAttribute('inert'); }); inertes = [];
      Array.prototype.forEach.call(D.body.children, function (c) {
        if (c !== m && !c.contains(m) && c.tagName !== 'SCRIPT' && !c.hasAttribute('inert')) { c.setAttribute('inert', ''); inertes.push(c); }
      });
      m.setAttribute('aria-hidden', 'false');
      setTimeout(function () {
        if (!m.contains(D.activeElement)) { var f = m.querySelector('.modal-body[tabindex]') || focaveis(m)[0]; if (f) f.focus({ preventScroll: true }); }
      }, 40);
    }
    function fechou(m) {
      if (aberto !== m) return;
      aberto = null; m.setAttribute('aria-hidden', 'true');
      inertes.forEach(function (c) { c.removeAttribute('inert'); }); inertes = [];
      setTimeout(function () {
        if (aberto) return;   // trocou direto para outro diálogo
        var a = D.activeElement;
        if (gatilho && D.body.contains(gatilho) && (!a || a === D.body || m.contains(a))) gatilho.focus();
        gatilho = null;
      }, 40);
    }
    D.addEventListener('focusin', function (e) { if (!aberto && !(e.target.closest && e.target.closest('.modal-backdrop'))) ultimoFoco = e.target; }, true);
    Array.prototype.forEach.call(mods, function (m) {
      var obs = new MutationObserver(function () { if (m.classList.contains('open')) abriu(m); else fechou(m); });
      obs.observe(m, { attributes: true, attributeFilter: ['class'] });
    });
    D.addEventListener('keydown', function (e) {
      if (!aberto) return;
      if (e.key === 'Tab') {
        var f = focaveis(aberto); if (!f.length) { e.preventDefault(); return; }
        var cur = D.activeElement, i = f.indexOf(cur);
        if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && (i === f.length - 1 || i < 0)) { e.preventDefault(); f[0].focus(); }
      } else if (e.key === 'Escape') {
        var m = aberto;
        setTimeout(function () { if (m.classList.contains('open')) { var x = m.querySelector('.close-btn'); if (x) x.click(); } }, 60);
      }
    }, true);
  }
  function boot() {
    guardaModais();
    var mapaEl = D.getElementById('bpd-ancoras');
    if (mapaEl) { try { iniciarEstrelas(JSON.parse(mapaEl.textContent)); } catch (e) {} }
    ligaAtalhos(0);
    var roots = D.querySelectorAll('[data-catalogo]'); if (!roots.length) return;
    carregar(function (err) {
      var i;
      for (i = 0; i < roots.length; i += 1) {
        var r = roots[i];
        if (err || !REG) { r.appendChild(el('p', 'cat-note', 'Não foi possível carregar as comparações agora. A lista abaixo é a versão estática.')); continue; }
        if (r.getAttribute('data-catalogo') === 'selecao') iniciarSelecao(r); else iniciarCatalogo(r);
        r.setAttribute('data-pronto', '1');
      }
    });
  }
  W.BPDCatalogo = { favoritos: favoritos, parseIds: parseIds, caminhoSelecao: caminhoSelecao };
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', boot); else boot();
})();
