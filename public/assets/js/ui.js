/* ==== Bora pros dados Brasil — comportamento da interface (ui.js) ====
   ES5, sem dependências, compatível com a CSP (script-src 'self'). Carregar com defer, DEPOIS de share.js.
   1. abas do cabeçalho e menu de seções: esmaecer a borda que ainda rola + levar o item ativo para a vista
   2. <details> (.q-mais, .vrd-det e qualquer outro): ao abrir, redimensiona os gráficos de dentro
      (ECharts: echarts.getInstanceByDom(el).resize(); charts.js: evento resize); âncora (#id) dentro de
      <details> fechado abre o <details>; details[data-abrir-desktop] não tem mais efeito (tudo começa fechado)
   3. barra inferior fixa (≤ 760 px, páginas com .topnav): Resumo · Compartilhar · Seções, com folhas inferiores
   4. acessibilidade: nomes com contexto ("Saiba mais sobre …"), tabelas roláveis focáveis, foco nunca
      escondido pelas barras fixas, aria-current no menu de seções, foco segue o "Pular para o conteúdo"
   Eventos (via data-track, lidos pelo analytics.js): bbar_click (label resumo|compartilhar|secoes).
   Compartilhar usa o componente .share (share.js): share_click / share_success / share_cancel. */
(function () {
  'use strict';
  var doc = document, html = doc.documentElement, win = window;
  html.classList.add('js');
  var cfg = (typeof win.SITE_CONFIG === 'object' && win.SITE_CONFIG) || {};
  var PAGE = cfg.pageId || 'site';
  var REDUZ = win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var CELULAR = win.matchMedia ? win.matchMedia('(max-width: 760px)') : { matches: false };

  function $(s, r) { return (r || doc).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); }
  function raf(fn) { return (win.requestAnimationFrame || setTimeout)(fn); }

  /* ------------------------------------------------ 1. trilhos roláveis */
  function trilho(sc) {
    if (!sc || sc.__ui) return; sc.__ui = 1;
    sc.classList.add('ui-rola');
    var t = false;
    function upd() {
      t = false;
      var max = sc.scrollWidth - sc.clientWidth;
      sc.classList.toggle('ui-fade-l', sc.scrollLeft > 4);
      sc.classList.toggle('ui-fade-r', max > 4 && sc.scrollLeft < max - 4);
    }
    sc.addEventListener('scroll', function () { if (!t) { t = true; raf(upd); } }, { passive: true });
    /* foco pelo teclado num item escondido na borda: traz o item para o meio da faixa */
    sc.addEventListener('focusin', function (e) { if (e.target && e.target !== sc) centraliza(sc, e.target, false); });
    win.addEventListener('resize', upd);
    upd();
    return upd;
  }
  /* centraliza o item na faixa horizontal, sem mexer na rolagem vertical da página */
  function centraliza(sc, a, suave) {
    if (!sc || !a || sc.scrollWidth <= sc.clientWidth) return;
    var alvo = a.offsetLeft - (sc.clientWidth - a.offsetWidth) / 2;
    alvo = Math.max(0, Math.min(alvo, sc.scrollWidth - sc.clientWidth));
    if (Math.abs(sc.scrollLeft - alvo) < 2) return;
    if (sc.scrollTo && suave && !REDUZ) sc.scrollTo({ left: alvo, behavior: 'smooth' });
    else sc.scrollLeft = alvo;
  }

  function iniciaTrilhos() {
    var abas = $('.sitebar .sb-nav');
    if (abas) { trilho(abas); centraliza(abas, $('a.ativo', abas), false); }
    var sec = $('.topnav .in');
    if (!sec) return;
    trilho(sec);
    /* o script de cada página liga/desliga .on ao rolar; seguimos a mudança */
    var ultimo = null;
    function segue() {
      var on = $('a.on', sec);
      if (on && on !== ultimo) { ultimo = on; centraliza(sec, on, true); }
    }
    if (win.MutationObserver) {
      new MutationObserver(function () { raf(segue); }).observe(sec, { subtree: true, attributes: true, attributeFilter: ['class'] });
    }
    segue();
  }

  /* ------------------------------------------------ 2. <details> */
  var resizeT = null;
  function redimensiona(raiz) {
    var ec = win.echarts;
    if (ec && ec.getInstanceByDom) {
      $$('[_echarts_instance_]', raiz).forEach(function (el) {
        var c = ec.getInstanceByDom(el); if (c) { try { c.resize(); } catch (e) {} }
      });
    }
    /* charts.js (SVG) e scripts das páginas reagem ao resize da janela */
    clearTimeout(resizeT);
    resizeT = setTimeout(function () {
      try { win.dispatchEvent(new Event('resize')); }
      catch (e) { var ev = doc.createEvent('UIEvents'); ev.initUIEvent('resize', true, false, win, 0); win.dispatchEvent(ev); }
    }, 30);
  }
  /* 'toggle' não sobe na árvore; escutamos na fase de captura */
  doc.addEventListener('toggle', function (e) {
    var d = e.target;
    if (d && d.tagName === 'DETAILS' && d.open) raf(function () { redimensiona(d); });
  }, true);

  function abreAte(el) {
    var aberto = false, p = el;
    while (p && p !== doc.body) {
      if (p.tagName === 'DETAILS' && !p.open) { p.open = true; aberto = true; }
      p = p.parentElement;
    }
    return aberto;
  }
  function alvoDoHash(h) {
    if (!h || h.length < 2) return null;
    try { return doc.getElementById(decodeURIComponent(h.slice(1))); } catch (e) { return null; }
  }
  function vaiParaHash() {
    var el = alvoDoHash(location.hash);
    if (el && abreAte(el)) raf(function () { el.scrollIntoView(); });
  }
  /* clique num link interno: abre o <details> antes de o navegador rolar até o alvo */
  doc.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!a) return;
    var el = alvoDoHash(a.getAttribute('href'));
    if (el) abreAte(el);
  }, true);
  win.addEventListener('hashchange', vaiParaHash);

  /* decisão do dono (16/10/2026): todo recolhível começa FECHADO, em qualquer tela.
     data-abrir-desktop fica sem efeito; só um link para #id interno abre o recolhível. */
  function abreNoDesktop() {}

  /* ------------------------------------------------ 3. barra inferior + folhas */
  var TEXTO_PADRAO = {
    comparativo: '📊 Governo Bolsonaro (2019-22) × Governo Lula (2023-25), só dados oficiais: na economia e renda, Lula à frente (crescimento, inflação, emprego, proteção social); nas contas públicas, Bolsonaro à frente (controle do gasto, dívida, conta de juros). Fontes: IBGE, Banco Central, Tesouro.',
    propostas: '📊 Planos de governo de 2026 registrados no TSE: em quantos temas o plano diz COMO vai fazer (instrumento nomeado)? Flávio Bolsonaro em 1 de 19 × Lula em 11 de 19. Programas já em execução contam como caminho, o que favorece quem governa.',
    balanco: '📊 Promessas dos planos registrados no TSE, mesma régua para os dois (Gov. Bolsonaro × Gov. Lula, mandato em curso até 30/09/2026): cumpridas 15,2% × 35,3%; só as verificáveis 22,7% × 38,7%; cumpridas + parciais 27,3% × 50,0%.',
    fontes: '📊 Os 50 arquivos oficiais (TSE, Banco Central, IBGE, Tesouro, Fed, Congresso e STF) por trás das análises do Bora pros dados Brasil, com impressão digital SHA-256 para conferir.'
  };
  var ICO = {
    resumo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
    secoes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10"/></svg>'
  };

  function el(tag, cls, attrs, txt) {
    var n = doc.createElement(tag), k;
    if (cls) n.className = cls;
    if (attrs) for (k in attrs) if (attrs.hasOwnProperty(k)) n.setAttribute(k, attrs[k]);
    if (txt) n.textContent = txt;
    return n;
  }

  /* seção em leitura (mesma regra do share.js: a última cujo topo passou de 40% da tela) */
  function secaoAtual() {
    var cur = null;
    $$('[data-track-section]').forEach(function (s) { if (s.getBoundingClientRect().top < win.innerHeight * 0.4) cur = s; });
    return cur;
  }
  function shareDaSecao() {
    var s = secaoAtual();
    return s && (s.querySelector('.share:not([data-share-variant])') || s.querySelector('.share:not([data-share-section="auto"])'));
  }

  var folhaAberta = null, focoAntes = null, inertes = [];
  /* com a folha aberta, o resto da página fica inerte (leitor de tela e Tab não saem da folha) */
  function inerte(f, liga) {
    if (liga) {
      inertes = $$('body > *').filter(function (n) {
        return n !== f && !n.hasAttribute('inert') && !/^(SCRIPT|STYLE|TEMPLATE)$/.test(n.tagName);
      });
      inertes.forEach(function (n) { n.setAttribute('inert', ''); if (!('inert' in n)) n.setAttribute('aria-hidden', 'true'); });
    } else {
      inertes.forEach(function (n) { n.removeAttribute('inert'); if (!('inert' in n)) n.removeAttribute('aria-hidden'); });
      inertes = [];
    }
  }
  function folha(id, titulo) {
    var f = el('div', 'ui-sheet', { id: id, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id + '-t', hidden: '' });
    var fundo = el('button', 'ui-sheet-fundo', { type: 'button', 'aria-label': 'Fechar', tabindex: '-1' });
    var p = el('div', 'ui-sheet-painel');
    var hd = el('div', 'ui-sheet-hd');
    var x = el('button', 'ui-sheet-x', { type: 'button', 'aria-label': 'Fechar' }, '×');
    hd.appendChild(el('h2', '', { id: id + '-t' }, titulo)); hd.appendChild(x);
    p.appendChild(el('div', 'ui-sheet-pega', { 'aria-hidden': 'true' })); p.appendChild(hd);
    f.appendChild(fundo); f.appendChild(p);
    fundo.addEventListener('click', function () { fecha(); }); x.addEventListener('click', function () { fecha(); });
    doc.body.appendChild(f);
    f.__painel = p;
    return f;
  }
  function abre(f, origem) {
    if (folhaAberta) fecha();
    focoAntes = origem || doc.activeElement;
    f.hidden = false; folhaAberta = f;
    html.classList.add('ui-travado');
    if (origem && origem.setAttribute) origem.setAttribute('aria-expanded', 'true');
    inerte(f, true);
    var foco = f.querySelector('.ui-sheet-x');
    if (foco) foco.focus();
  }
  function fecha(semDevolverFoco) {
    if (!folhaAberta) return;
    folhaAberta.hidden = true; folhaAberta = null;
    html.classList.remove('ui-travado');
    inerte(null, false);
    if (focoAntes && focoAntes.hasAttribute && focoAntes.hasAttribute('aria-expanded')) focoAntes.setAttribute('aria-expanded', 'false');
    if (semDevolverFoco === true) return;
    if (focoAntes && focoAntes.focus) { try { focoAntes.focus({ preventScroll: true }); } catch (e) { focoAntes.focus(); } }
  }
  doc.addEventListener('keydown', function (e) {
    if (!folhaAberta) return;
    if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); fecha(); return; }
    if (e.key === 'Tab') { /* mantém o foco dentro da folha */
      var fs = $$('a[href], button:not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])', folhaAberta.__painel)
        .filter(function (n) { return n.offsetParent !== null; });
      if (!fs.length) return;
      var i = fs.indexOf(doc.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); fs[fs.length - 1].focus(); }
      else if (!e.shiftKey && i === fs.length - 1) { e.preventDefault(); fs[0].focus(); }
    }
  });

  function folhaCompartilhar() {
    var f = folha('ui-folha-share', 'Compartilhar');
    var prev = el('p', 'ui-sheet-prev');
    var sh = el('div', 'share', {
      'data-share-section': 'auto', 'data-share-placement': 'barra', 'data-share-name': 'este dado',
      'data-share-text': TEXTO_PADRAO[PAGE] || doc.title,
      'data-share-lead': 'Vai a mensagem acima, com o link para conferir números, ressalvas e método.'
    });
    f.__painel.appendChild(prev); f.__painel.appendChild(sh);
    if (win.__share && win.__share.init) win.__share.init(f.__painel);
    f.__prev = prev;
    return f;
  }
  function atualizaPrevia(f) {
    var s = shareDaSecao(), txt = (s && s.getAttribute('data-share-text')) || TEXTO_PADRAO[PAGE] || doc.title;
    f.__prev.textContent = '';
    f.__prev.appendChild(el('b', '', null, 'O que vai na mensagem'));
    f.__prev.appendChild(doc.createTextNode(txt));
  }

  function folhaSecoes(links) {
    var f = folha('ui-folha-secoes', 'Seções desta página');
    var ul = el('ul', 'ui-secoes');
    links.forEach(function (a) {
      var li = el('li'), b = el('a', '', { href: a.getAttribute('href') }, (a.textContent || '').trim());
      /* ao escolher a seção, o foco vai para ela (e não volta para a barra inferior) */
      b.addEventListener('click', function () { fecha(true); focaAlvo(alvoDoHash(b.getAttribute('href'))); });
      li.appendChild(b); ul.appendChild(li);
    });
    f.__painel.appendChild(ul);
    f.__marca = function () {
      var on = $('.topnav a.on'), h = on && on.getAttribute('href');
      $$('a', ul).forEach(function (b) { if (b.getAttribute('href') === h) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
    };
    return f;
  }

  function alvoResumo() {
    var ids = ['resumo', 'placar', 'topo'], i;
    for (i = 0; i < ids.length; i += 1) if (doc.getElementById(ids[i])) return '#' + ids[i];
    return '#';
  }

  function barraInferior() {
    var nav = $('.topnav .in');
    if (!nav || $('.bbar')) return;
    var links = $$('a[href^="#"]', nav);
    var bar = el('nav', 'bbar', { 'aria-label': 'Atalhos' });
    var bRes = el('a', 'bbar-btn', { href: alvoResumo(), 'data-track': 'bbar_click', 'data-track-label': 'resumo' });
    bRes.innerHTML = ICO.resumo + '<span>Resumo</span>';
    var bSh = el('button', 'bbar-btn bbar-btn--pri', { type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'data-track': 'bbar_click', 'data-track-label': 'compartilhar' });
    bSh.innerHTML = ICO.share + '<span>Compartilhar</span>';
    var bSec = el('button', 'bbar-btn', { type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'data-track': 'bbar_click', 'data-track-label': 'secoes' });
    bSec.innerHTML = ICO.secoes + '<span>Seções</span>';
    bar.appendChild(bRes); bar.appendChild(bSh); bar.appendChild(bSec);
    doc.body.appendChild(bar);
    doc.body.classList.add('tem-bbar');
    /* a barra do share.js não aparece junto com esta (as duas viram uma só) */
    $$('.share--bar').forEach(function (b) { b.hidden = true; });

    var fSh = null, fSec = null;
    bRes.addEventListener('click', function () { bRes.setAttribute('href', alvoResumo()); });
    bSh.addEventListener('click', function () { fSh = fSh || folhaCompartilhar(); atualizaPrevia(fSh); abre(fSh, bSh); });
    bSec.addEventListener('click', function () { fSec = fSec || folhaSecoes(links); fSec.__marca(); abre(fSec, bSec); });

    var t = false;
    function upd() {
      t = false;
      var y = win.pageYOffset || html.scrollTop || 0;
      var ligada = CELULAR.matches && y > win.innerHeight * 0.6 && !$('.consent');
      bar.classList.toggle('is-on', ligada);
    }
    win.addEventListener('scroll', function () { if (!t) { t = true; raf(upd); } }, { passive: true });
    win.addEventListener('resize', upd);
    upd();
  }

  /* ------------------------------------------------ 4. acessibilidade (WCAG 2.2 AA / eMAG) */
  var FOCAVEL = /^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY)$/;
  function focaAlvo(alvo) {
    if (!alvo) return;
    abreAte(alvo);
    if (!FOCAVEL.test(alvo.tagName) && !alvo.hasAttribute('tabindex')) alvo.setAttribute('tabindex', '-1');
    setTimeout(function () { try { alvo.focus({ preventScroll: true }); } catch (e) { alvo.focus(); } }, 0);
  }

  /* 4.1 nomes acessíveis com contexto: "Saiba mais", "Fechar", "Ver os números em tabela",
     "Compartilhar imagem", "WhatsApp" se repetem dezenas de vezes; o leitor de tela passa a ouvir
     "Saiba mais sobre Salário mínimo real". O texto visível continua no começo do nome (WCAG 2.5.3). */
  var GENERICO = /^(saiba mais|ver mais|ver menos|fechar|ver os números em tabela|ver em tabela|ver gráfico|ver o gráfico|detalhes|compartilhar imagem|compartilhar a imagem deste card|⤴ imagem|imagem|whatsapp)$/i;
  function limpa(t) { return (t || '').replace(/\s+/g, ' ').replace(/[›»→↓]+/g, '').replace(/\s*[:·]\s*$/, '').trim(); }
  function visivel(n) { return n && n.getClientRects().length > 0; }
  function contexto(n) {
    /* linha de tabela (catálogos): a célula com mais texto (a proposta/promessa) */
    var tr = n.closest('tr');
    if (tr) {
      var maior = '';
      $$('td, th', tr).forEach(function (c) { if (!c.contains(n)) { var x = limpa(c.textContent); if (x.length > maior.length) maior = x; } });
      if (maior) return maior;
    }
    /* botão que aponta para o card (data-card-img="id") */
    var ref = n.getAttribute('data-card-img'), alvo = ref && doc.getElementById(ref);
    var hRef = alvo && alvo.querySelector('h2, h3, h4');
    if (hRef) return limpa(hRef.textContent);
    /* 1º: o título do card do gráfico (charts.js) */
    var card = n.closest('.bpd-card, [data-card], .vrd, .vrd-ind, figure');
    /* contêiner com vários cards (ex.: grupo "no bolso"): vale o título da seção */
    if (card && card.querySelectorAll('.bpd-card, .vrd-ind').length > 1) {
      var sec = card.closest('section'), hs2 = sec && sec.querySelector('h2');
      if (hs2) return limpa(hs2.textContent);
      card = null;
    }
    var t = card && card.querySelector('h2, h3, h4, .figt, svg > title');
    if (t && !n.contains(t) && limpa(t.textContent)) return limpa(t.textContent);
    /* 2º: o título mais próximo ANTES do controle, na ordem do documento */
    var hs = $$('h1, h2, h3, h4'), achado = null, i;
    for (i = 0; i < hs.length; i += 1) {
      var h = hs[i];
      if (h.contains(n) || n.contains(h)) continue;
      if (h.compareDocumentPosition(n) & 4) achado = h; else break;
    }
    return achado ? limpa(achado.textContent) : '';
  }
  function curto(t) {
    /* "Salário mínimo real: Governo Lula à frente" → "Salário mínimo real" */
    var p = t.split(/:\s/)[0];
    p = p.length >= 4 ? p : t;
    return p.length > 90 ? p.slice(0, 88).replace(/\s+\S*$/, '') + '…' : p;
  }
  function rotula(n, nome) {
    if (n.hasAttribute('aria-label') && !n.hasAttribute('data-a11y-rotulo')) return; /* respeita o rótulo do autor */
    if (n.getAttribute('aria-label') !== nome) n.setAttribute('aria-label', nome);
    n.setAttribute('data-a11y-rotulo', '1');
  }
  var REPETIDOS = {};
  function baseSummary(s) { var ab = s.querySelector('.ao-abrir'); return limpa(ab ? ab.textContent : s.textContent); }
  function rotulaSummary(s) {
    var fe = s.querySelector('.ao-fechar');
    var base = baseSummary(s);
    if (!base || s.querySelector('h1, h2, h3, h4, h5')) return; /* resumo com título dentro já tem nome próprio */
    var gen = GENERICO.test(base), ctx = (gen || REPETIDOS[base] > 1) ? curto(contexto(s)) : '';
    var nome = !ctx ? base : gen ? base + (/^ver /i.test(base) ? ': ' : ' sobre ') + ctx : base + ' – ' + ctx;
    var tFe = limpa(fe && fe.textContent);
    if (s.parentNode && s.parentNode.open && tFe && tFe !== base) nome = tFe + ': ' + nome;
    if (!ctx && !(s.parentNode && s.parentNode.open && tFe && tFe !== base)) {
      if (s.hasAttribute('data-a11y-rotulo')) { s.removeAttribute('aria-label'); s.removeAttribute('data-a11y-rotulo'); }
      return;
    }
    rotula(s, nome);
  }
  function rotulaBotao(b) {
    var txt = limpa(b.getAttribute('data-a11y-txt') || b.textContent);
    if (!GENERICO.test(txt)) return;
    b.setAttribute('data-a11y-txt', txt);
    var ctx = curto(contexto(b));
    if (!ctx) return;
    var nome = /whatsapp/i.test(txt) ? txt + ': enviar “' + ctx + '”' : txt + ': ' + ctx;
    if (b.target === '_blank') nome += ' (abre em nova aba)';
    rotula(b, nome);
  }
  var rotT = null;
  function rotulaTudo() {
    rotT = null;
    REPETIDOS = {};
    var sums = $$('summary');
    sums.forEach(function (s) { var b = baseSummary(s); REPETIDOS[b] = (REPETIDOS[b] || 0) + 1; });
    sums.forEach(rotulaSummary);
    $$('.bpd-btn, .card-img, .detail-btn, a[target="_blank"].bpd-btn').forEach(function (b) {
      if (!b.hasAttribute('aria-label') || b.hasAttribute('data-a11y-rotulo') || GENERICO.test(limpa(b.getAttribute('aria-label')))) {
        if (b.hasAttribute('aria-label') && !b.hasAttribute('data-a11y-rotulo')) { b.setAttribute('data-a11y-txt', limpa(b.getAttribute('aria-label'))); b.removeAttribute('aria-label'); }
        rotulaBotao(b);
      }
    });
    regioesRolaveis();
  }
  function agendaRotulos() { if (!rotT) rotT = setTimeout(rotulaTudo, 150); }
  doc.addEventListener('toggle', function (e) {
    var d = e.target;
    if (d && d.tagName === 'DETAILS') { var s = d.querySelector(':scope > summary'); if (s) rotulaSummary(s); agendaRotulos(); }
  }, true);

  /* 4.2 tabelas largas em caixa rolável: focáveis pelo teclado e com nome (WCAG 2.1.1, 1.3.1) */
  function regioesRolaveis() {
    var usados = {};
    $$('[data-a11y-rola][aria-label]').forEach(function (n) { usados[n.getAttribute('aria-label')] = 1; });
    $$('main div, main figure, main section').forEach(function (n) {
      if (!n.hasAttribute('data-a11y-rola') && n.scrollWidth <= n.clientWidth + 2 && n.scrollHeight <= n.clientHeight + 2) return;
      if (n.closest('.sb-nav, .topnav, .bbar, .ui-sheet') || !visivel(n)) return;
      var cs = win.getComputedStyle(n), rola = /(auto|scroll)/.test(cs.overflowX + cs.overflowY);
      var precisa = rola && (n.scrollWidth > n.clientWidth + 2 || n.scrollHeight > n.clientHeight + 2);
      var temFoco = n.querySelector('a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])');
      if (precisa && !temFoco) {
        if (!n.hasAttribute('tabindex')) { n.setAttribute('tabindex', '0'); n.setAttribute('data-a11y-rola', '1'); }
        if (!n.hasAttribute('role')) n.setAttribute('role', 'region');
        if (!n.hasAttribute('aria-label') && !n.hasAttribute('aria-labelledby')) {
          var cap = n.querySelector('caption'), c = limpa(cap ? cap.textContent : contexto(n));
          var nome = (c ? curto(c) : 'Tabela'), k = 2;
          while (usados[nome + ' (role para os lados para ver tudo)']) { nome = (c ? curto(c) : 'Tabela') + ', tabela ' + k; k += 1; }
          nome += ' (role para os lados para ver tudo)'; usados[nome] = 1;
          n.setAttribute('aria-label', nome);
        }
      } else if (n.hasAttribute('data-a11y-rola') && !precisa) {
        n.removeAttribute('tabindex'); n.removeAttribute('data-a11y-rola');
      }
    });
  }

  /* 4.3 foco nunca escondido atrás do menu de seções (topo) nem da barra inferior (WCAG 2.4.11) */
  function folgaFoco(e) {
    var t = e.target;
    if (!t || !t.getBoundingClientRect || folhaAberta || t === doc.body || t.tagName === 'MAIN') return;
    try { if (!t.matches(':focus-visible')) return; } catch (er) { /* navegador sem :focus-visible */ }
    if (t.closest('.topnav, .bbar, .ui-sheet, .sitebar, .consent, .share--bar')) return;
    var r = t.getBoundingClientRect(), topo = 0, base = win.innerHeight;
    var tn = $('.topnav'); if (tn) { var rt = tn.getBoundingClientRect(); if (/(sticky|fixed)/.test(win.getComputedStyle(tn).position) && rt.top <= 1) topo = rt.bottom; }
    var bb = $('.bbar.is-on'); if (bb) base = bb.getBoundingClientRect().top;
    var sb = $$('.share--bar').filter(function (b) { return !b.hidden && visivel(b) && /(fixed|sticky)/.test(win.getComputedStyle(b).position); })[0];
    if (sb) base = Math.min(base, sb.getBoundingClientRect().top);
    var dy = 0;
    if (r.bottom > base - 8) dy = r.bottom - base + 16;
    else if (r.top < topo + 8) dy = r.top - topo - 16;
    if (dy) { try { win.scrollBy({ top: dy, left: 0, behavior: 'instant' }); } catch (er) { win.scrollBy(0, dy); } }
  }
  doc.addEventListener('focusin', function (e) { raf(function () { folgaFoco(e); }); });
  /* navegando pelo teclado, a rolagem que acompanha o foco é imediata (sem rolagem suave) */
  doc.addEventListener('keydown', function (e) { if (e.key === 'Tab') html.classList.add('ui-teclado'); }, true);
  doc.addEventListener('pointerdown', function () { html.classList.remove('ui-teclado'); }, true);

  /* 4.4 menu de seções: a seção em leitura é anunciada (aria-current) */
  function marcaSecaoAtual() {
    var sec = $('.topnav .in'); if (!sec) return;
    function upd() {
      $$('a', sec).forEach(function (a) {
        if (a.classList.contains('on')) { if (a.getAttribute('aria-current') !== 'location') a.setAttribute('aria-current', 'location'); }
        else if (a.hasAttribute('aria-current')) a.removeAttribute('aria-current');
      });
    }
    if (win.MutationObserver) new MutationObserver(function () { raf(upd); }).observe(sec, { subtree: true, attributes: true, attributeFilter: ['class'] });
    upd();
  }

  /* 4.5 "Pular para o conteúdo" e links internos: o foco acompanha a rolagem */
  doc.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a.pular[href^="#"]') : null;
    if (a) focaAlvo(alvoDoHash(a.getAttribute('href')));
  });

  function iniciaA11y() {
    marcaSecaoAtual();
    rotulaTudo();
    /* cards e linhas de catálogo desenhados depois (charts.js, cards-*.js, catálogo) */
    if (win.MutationObserver) {
      new MutationObserver(function (ms) {
        for (var i = 0; i < ms.length; i += 1) {
          var t = ms[i].target;
          if (t && t.closest && t.closest('.ui-sheet, .bbar')) continue;
          if (ms[i].addedNodes && ms[i].addedNodes.length) { agendaRotulos(); return; }
        }
      }).observe(doc.body, { childList: true, subtree: true });
    }
    win.addEventListener('resize', function () { agendaRotulos(); });
  }

  function inicia() {
    iniciaTrilhos();
    abreNoDesktop();
    barraInferior();
    iniciaA11y();
    if (location.hash) vaiParaHash();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', inicia);
  else inicia();
})();
