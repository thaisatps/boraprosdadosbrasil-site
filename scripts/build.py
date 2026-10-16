#!/usr/bin/env python3
"""Build do site "Bora pros dados Brasil".
Lê o .env (variáveis de ambiente têm prioridade), gera dist/ a partir de public/
com os tokens substituídos (__SITE_URL__, __GA_ID__, __CONSENT__ e as datas
__DATE_PUBLISHED__/__DATE_MODIFIED__ de cada página, tiradas do git; e
__UPDATED__/__UPDATED_ISO__ = data do último commit, para o "atualizado em"), e ainda:
  - gera sitemap.xml (lastmod real, do git) e dados/SHA256SUMS.txt;
  - SEO/IA: pré-renderiza no HTML os catálogos que hoje só aparecem via JS
    (/propostas/ e /balanco/), externaliza a biblioteca ECharts da home para um
    arquivo em cache, injeta o JSON-LD Dataset/DataCatalog de /fontes/ e gera
    llms-full.txt (texto integral das páginas + catálogos, para buscadores de IA);
  - opcional: meta de verificação do Google/Bing e arquivo de chave do IndexNow;
  - valida os links internos e a sintaxe dos JSON-LD.
Sem dependências externas."""
import datetime, hashlib, html, json, os, re, shutil, subprocess, sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUB, DIST = ROOT / 'public', ROOT / 'dist'
TOKENS = ('__SITE_URL__', '__GA_ID__', '__CONSENT__', '__DATE_PUBLISHED__', '__DATE_MODIFIED__', '__UPDATED__')
ENV_KEYS = ('SITE_URL', 'GA_MEASUREMENT_ID', 'CONSENT_MODE', 'GOOGLE_SITE_VERIFICATION',
            'BING_SITE_VERIFICATION', 'INDEXNOW_KEY', 'PRERENDER')

# páginas do site: (url, arquivo-fonte, título curto usado no llms-full.txt)
PAGES = [
    ('/', 'index.html', 'Governo Bolsonaro (2019-2022) × Governo Lula (2023-2026): comparativo em dados oficiais'),
    ('/propostas/', 'propostas/index.html', 'Propostas 2026: Lula × Flávio Bolsonaro (planos de governo registrados no TSE, 2º turno)'),
    ('/balanco/', 'balanco/index.html', 'Promessas e realizações: planos de Bolsonaro (2018) e Lula (2022) × o que foi cumprido'),
    ('/fontes/', 'fontes/index.html', 'Fontes e dados: os 50 arquivos originais'),
    ('/sobre/', 'sobre/index.html', 'Sobre e método: quem fez, as regras e como reportar um erro'),
    ('/comparacoes/', 'comparacoes/index.html', 'Comparações: todas as comparações do site, com os números dos dois lados, a fonte e a data'),
]


def load_env():
    env = {}
    f = ROOT / '.env'
    if f.exists():
        for line in f.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                env[k.strip()] = v.strip()
    # variáveis de ambiente têm prioridade sobre o .env (ex.: build no Netlify/CI)
    for k in ENV_KEYS:
        if os.environ.get(k):
            env[k] = os.environ[k]
    # no Netlify, URL é definida automaticamente com o endereço principal do site
    if not env.get('SITE_URL') and os.environ.get('URL'):
        env['SITE_URL'] = os.environ['URL']
    return env


def sha256(p):
    h = hashlib.sha256()
    with open(p, 'rb') as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


# ---------------------------------------------------------------- datas (git)
def _git(*args):
    try:
        r = subprocess.run(['git', *args], cwd=ROOT, capture_output=True, text=True, timeout=20)
        return r.stdout.strip() if r.returncode == 0 else ''
    except Exception:
        return ''


def page_dates(src):
    """(publicado, modificado) em ISO 8601. Publicado = 1º commit do arquivo;
    modificado = último commit, ou o mtime se houver alteração ainda não commitada."""
    rel = str(src.relative_to(ROOT))
    mtime = datetime.datetime.fromtimestamp(src.stat().st_mtime).astimezone().replace(microsecond=0).isoformat()
    hist = _git('log', '--follow', '--format=%aI', '--', rel).splitlines()
    if not hist:
        return mtime, mtime
    published, modified = hist[-1], hist[0]
    if _git('status', '--porcelain', '--', rel):
        modified = mtime
    return published, modified


# ------------------------------------------------- texto visível (llms-full.txt)
class TextExtractor(HTMLParser):
    """HTML -> texto com marcação Markdown leve (títulos, listas, tabelas).
    Ignora scripts/estilos, cabeçalho/menu/rodapé e modais."""
    SKIP_TAGS = {'script', 'style', 'template', 'noscript', 'svg', 'nav', 'footer', 'select', 'button'}
    BLOCK = {'p', 'div', 'section', 'li', 'tr', 'table', 'ul', 'ol', 'br', 'dt', 'dd', 'figcaption', 'caption', 'h1', 'h2', 'h3', 'h4', 'h5'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out, self.skip_stack = [], []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if self.skip_stack:
            if tag == self.skip_stack[-1][0]:
                self.skip_stack[-1][1] += 1
            return
        cls = a.get('class') or ''
        if (tag in self.SKIP_TAGS or (tag == 'header' and 'sitebar' in cls.split())
                or (tag == 'div' and re.search(r'\bmodal\b', cls)) or 'filters' in cls.split()):
            if tag not in ('br',):
                self.skip_stack.append([tag, 1])
            return
        if tag in self.BLOCK:
            self.out.append('\n')
        if tag in ('h1', 'h2', 'h3', 'h4', 'h5'):
            self.out.append('#' * int(tag[1]) + ' ')
        elif tag == 'li':
            self.out.append('- ')
        elif tag in ('td', 'th'):
            self.out.append(' | ')

    def handle_endtag(self, tag):
        if self.skip_stack:
            if tag == self.skip_stack[-1][0]:
                self.skip_stack[-1][1] -= 1
                if self.skip_stack[-1][1] == 0:
                    self.skip_stack.pop()
            return
        if tag in self.BLOCK:
            self.out.append('\n')

    def handle_data(self, d):
        if not self.skip_stack:
            self.out.append(d)

    def text(self):
        lines = (' '.join(l.split()) for l in ''.join(self.out).splitlines())
        txt = '\n'.join(l for l in lines if l and l != '|')
        return re.sub(r'\n(#+ )', r'\n\n\1', txt).strip()


def visible_text(page_html):
    body = page_html[page_html.find('<body'):] if '<body' in page_html else page_html
    p = TextExtractor()
    p.feed(body)
    return p.text()


# ----------------------------------------------------------- dados embutidos
def embedded_json(page_html, elem_id):
    m = re.search(r'<script id="%s" type="application/json">(.*?)</script>' % re.escape(elem_id), page_html, re.S)
    return json.loads(m.group(1)) if m else None


esc = lambda s: html.escape(str(s), quote=False)

# rótulos (os mesmos do JS das páginas)
PROP_CAND = {'lula': ('Lula', 'lula', 'Lula (PT)'), 'flavio': ('Flávio', 'flavio', 'Flávio Bolsonaro (PL)')}
PROP_ROT = {'ok': ('ferramenta nomeada', 'chip-ok'), 'mid': ('parcial', 'chip-partial'), 'no': ('só intenção', 'chip-warn')}
PROP_TEMA = {'bolso': 'Bolso', 'seguranca': 'Segurança', 'servicos': 'Serviços', 'economia': 'Economia', 'ambiente': 'Ambiente e instituições'}
BAL_CAND = {'bolsonaro': ('Bolsonaro', 'bolso', 'Bolsonaro, plano de 2018'), 'lula': ('Lula', 'lula', 'Lula, plano de 2022')}
BAL_CAT = {'ok': ('Cumprida', 'chip-ok'), 'mid': ('Parcial', 'chip-mid'), 'no': ('Não cumprida', 'chip-no'),
           'run': ('Em andamento', 'chip-run'), 'na': ('Sem evidência oficial', 'chip-na')}
BAL_TEMA = {'estado': 'Estado, reformas e privatizações', 'impostos': 'Impostos, renda e custo de vida',
            'social': 'Pobreza e proteção social', 'trabalho': 'Trabalho e emprego', 'seguranca': 'Segurança pública',
            'saude': 'Saúde', 'educacao': 'Educação', 'meioambiente': 'Meio ambiente e Amazônia',
            'infraenergia': 'Infraestrutura, energia e digital', 'instituicoes': 'Instituições e política externa'}
BAL_TEMA_ORD = ['impostos', 'trabalho', 'social', 'saude', 'educacao', 'estado', 'infraenergia', 'seguranca', 'meioambiente', 'instituicoes']


def bal_label(it):
    if it['cat'] == 'no' and it['cand'] == 'lula':
        return 'Não cumprida até 30/09/2026'
    return BAL_CAT[it['cat']][0]


def bal_sorted(prom):
    idx = {it['id']: i for i, it in enumerate(prom)}
    return sorted(prom, key=lambda it: (BAL_TEMA_ORD.index(it['tema']) if it['tema'] in BAL_TEMA_ORD else 99,
                                        0 if it['cand'] == 'bolsonaro' else 1, idx[it['id']]))


snip = lambda s: s[:150] + '…' if len(s) > 150 else s


def prerender_propostas(t):
    """Preenche <tbody id="cat-body"> com as mesmas linhas que o JS gera (o JS
    substitui o conteúdo ao carregar; sem JS, buscadores e IAs leem o catálogo)."""
    data = embedded_json(t, 'data-catalogo')
    if not data or '<tbody id="cat-body"></tbody>' not in t:
        return t, 0
    rows = []
    for it in data:
        nome, cls, _ = PROP_CAND[it['cand']]
        rot, rcls = PROP_ROT[it['rot']]
        rows.append('<tr><td class="who %s">%s</td><td>%s</td><td><span class="t">%s · %s</span><span class="tr-snip">%s</span></td>'
                    '<td class="small">%s</td><td><span class="chip %s sm">%s</span></td><td></td></tr>'
                    % (cls, esc(nome), esc(PROP_TEMA.get(it['tema'], it['tema'])), esc(it['id']), esc(it['sub']),
                       esc(snip(it['what'])), esc(it['pags']), rcls, esc(rot)))
    return t.replace('<tbody id="cat-body"></tbody>', '<tbody id="cat-body">' + ''.join(rows) + '</tbody>', 1), len(rows)


def prerender_balanco(t):
    prom = embedded_json(t, 'data-promessas')
    if not prom or '<tbody id="cat-body"></tbody>' not in t:
        return t, 0
    rows = []
    for it in bal_sorted(prom):
        nome, cls, _ = BAL_CAND[it['cand']]
        rows.append('<tr><td class="who %s">%s</td><td>%s</td><td><span class="t">%s · %s</span><span class="tr-snip">%s</span></td>'
                    '<td class="small">%s</td><td><span class="chip %s sm">%s</span></td><td></td></tr>'
                    % (cls, nome, esc(BAL_TEMA.get(it['tema'], it['tema'])), esc(it['id']), esc(it['titulo']),
                       esc(snip(it['trecho'])), esc(it['pag']), BAL_CAT[it['cat']][1], esc(bal_label(it))))
    return t.replace('<tbody id="cat-body"></tbody>', '<tbody id="cat-body">' + ''.join(rows) + '</tbody>', 1), len(rows)


def externalize_echarts(t):
    """Move a biblioteca ECharts (~1 MB embutida no HTML da home) para
    /assets/js/echarts-<versão>.min.js. Mesma posição e sem defer: a ordem de
    execução não muda. O HTML cai de ~1,1 MB para ~0,1 MB."""
    for m in re.finditer(r'<script>(.*?)</script>', t, re.S):
        code = m.group(1)
        if len(code) > 200_000 and 'echarts' in code and 'Apache Software Foundation' in code[:2000]:
            v = re.search(r'version:"(\d+\.\d+\.\d+)"', code)
            name = 'echarts-%s.min.js' % (v.group(1) if v else hashlib.sha256(code.encode()).hexdigest()[:10])
            out = DIST / 'assets' / 'js' / name
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(code, encoding='utf-8')
            return t[:m.start()] + '<script src="/assets/js/%s"></script>' % name + t[m.end():], name
    return t, None


# ------------------------------------------------------- JSON-LD de /fontes/
FONTE_ORG = {
    'fonte-tse': ('Tribunal Superior Eleitoral (TSE)', 'https://dadosabertos.tse.jus.br/'),
    'fonte-banco-central': ('Banco Central do Brasil', 'https://www.bcb.gov.br/'),
    'fonte-ibge': ('Instituto Brasileiro de Geografia e Estatística (IBGE)', 'https://sidra.ibge.gov.br/'),
    'fonte-tesouro-siconfi': ('Secretaria do Tesouro Nacional', 'https://www.tesourotransparente.gov.br/'),
    'fonte-federal-reserve': ('Federal Reserve Bank of New York', 'https://markets.newyorkfed.org/'),
    'fonte-tesouro-rtn': ('Secretaria do Tesouro Nacional', 'https://www.tesourotransparente.gov.br/'),
    'fonte-legislacao-fiscal': ('Presidência da República, Congresso Nacional e STF', 'https://www.planalto.gov.br/'),
}
MIME = {'pdf': 'application/pdf', 'zip': 'application/zip', 'json': 'application/json', 'jsonl': 'application/x-ndjson',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'htm': 'text/html', 'html': 'text/html'}


RX_TOTAL_ARQ = re.compile(r'\b(?:50|32)(\s+arquivos)\b')


def conta_arquivos():
    """Arquivos oficiais em public/dados (o que entra no SHA256SUMS.txt; os derivados ficam fora)."""
    return sum(1 for q in (PUB / 'dados').rglob('*') if q.is_file()
               and q.name not in ('SHA256SUMS.txt', 'SHA256SUMS-derivados.txt') and str(q.relative_to(PUB)) not in DERIVADOS)


def total_arquivos(texto, n):
    """Troca os totais antigos escritos nas páginas ("50 arquivos", "32 arquivos") pela contagem real."""
    return RX_TOTAL_ARQ.sub(lambda m: f'{n}{m.group(1)}', texto)


def fontes_datasets(t, site_url, modified):
    strip = lambda s: ' '.join(html.unescape(re.sub(r'<[^>]+>', ' ', s)).split())
    items = []
    for s in re.finditer(r'<section class="chap" id="([^"]+)".*?</section>', t, re.S):
        org = FONTE_ORG.get(s.group(1))
        if not org:
            continue
        for r in re.finditer(r'<tr><td class="fname">(.*?)</td><td>(.*?)</td><td[^>]*>(.*?)</td><td><a class="dl" href="([^"]+)"', s.group(0), re.S):
            fname, desc, usado, href = strip(r.group(1)), strip(r.group(2)), strip(r.group(3)), r.group(4)
            f = DIST / href.lstrip('/')
            if not f.exists():
                continue
            ext = fname.rsplit('.', 1)[-1].lower()
            items.append({
                '@type': 'Dataset',
                '@id': f'{site_url}/fontes/#{fname}',
                'name': f'{desc} ({fname})',
                'description': f'{desc}. Arquivo original publicado por {org[0]}, copiado sem alteração; '
                               f'usado na análise “{usado}” do Bora pros dados Brasil. Integridade: SHA-256 em /dados/SHA256SUMS.txt.',
                'inLanguage': 'pt-BR' if s.group(1) != 'fonte-federal-reserve' else 'en',
                'isAccessibleForFree': True,
                'creator': {'@type': 'GovernmentOrganization' if s.group(1) != 'fonte-federal-reserve' else 'Organization',
                            'name': org[0], 'url': org[1]},
                'isBasedOn': org[1],
                'includedInDataCatalog': {'@id': f'{site_url}/fontes/#catalogo'},
                'distribution': [{
                    '@type': 'DataDownload',
                    'contentUrl': site_url + href,
                    'encodingFormat': MIME.get(ext, 'application/octet-stream'),
                    'contentSize': f'{f.stat().st_size} B',
                    'sha256': sha256(f),
                }],
            })
    if not items:
        return None
    return {
        '@context': 'https://schema.org',
        '@type': 'DataCatalog',
        '@id': f'{site_url}/fontes/#catalogo',
        'name': f'Bora pros dados Brasil: fontes primárias das análises ({conta_arquivos()} arquivos oficiais)',
        'description': 'Arquivos originais, sem tratamento, do TSE, Banco Central, IBGE, Tesouro Nacional, Federal Reserve, '
                       'Planalto, Congresso e STF usados nas análises Governo Lula × Bolsonaro, Propostas 2026 e Promessas e Realizações, com hash SHA-256.',
        'url': f'{site_url}/fontes/',
        'inLanguage': 'pt-BR',
        'dateModified': modified,
        'publisher': {'@id': f'{site_url}/#org'},
        'dataset': items,
    }


# --------------------------------------------------------------- llms-full.txt
def llms_full(site_url, texts, prop_data, bal_data, dates):
    today = datetime.date.today().isoformat()
    out = [
        '# Bora pros dados Brasil — texto integral (llms-full.txt)',
        '',
        f'> Versão em texto puro de todas as páginas de {site_url}, gerada automaticamente no build em {today} '
        'a partir do mesmo HTML publicado. Inclui os catálogos completos (38 propostas de 2026 e 67 promessas com veredito) '
        'que no site aparecem em tabelas interativas. Análises descritivas com dados públicos oficiais; o site não '
        'recomenda voto. Ao citar, use o link da página correspondente.',
        '',
    ]
    for (url, _, title), txt in zip(PAGES, texts):
        pub, mod = dates[url]
        out += ['', '---', '', f'## Página: {title}', f'URL: {site_url}{url}', f'Atualizada em: {mod[:10]}', '', txt, '']
        if url == '/propostas/' and prop_data:
            out += ['', '### Catálogo completo das propostas (38; 19 por candidato)',
                    'Rótulo do “como”: ferramenta nomeada = o plano nomeia o instrumento; parcial = instrumento para parte da medida; '
                    'só intenção = só declara a intenção. “pág.” = página do PDF registrado no TSE.', '']
            for it in prop_data:
                out += [f'- [{it["id"]}] {PROP_CAND[it["cand"]][2]} · {it["sub"]} — rótulo: {PROP_ROT[it["rot"]][0]} (pág. {it["pags"]})',
                        f'  - O que promete: {it["what"]}', f'  - Como diz que vai fazer: {it["how"]}']
        if url == '/balanco/' and bal_data:
            out += ['', '### Catálogo completo das promessas e vereditos (67: 33 de Bolsonaro/2018, 34 de Lula/2022)',
                    'Categorias: Cumprida, Parcial, Não cumprida, Em andamento (só mandato em curso), Sem evidência oficial. '
                    'Corte do mandato de Lula: 30/09/2026.', '']
            for it in bal_sorted(bal_data):
                out += [f'- [{it["id"]}] {BAL_CAND[it["cand"]][2]} · {BAL_TEMA.get(it["tema"], it["tema"])} · {it["titulo"]} — veredito: {bal_label(it)} (pág. {it["pag"]})',
                        f'  - Trecho do plano: {it["trecho"]}', f'  - Critério: {it["criterio"]}', f'  - O que aconteceu: {it["fato"]}']
                if it.get('obs'):
                    out.append(f'  - Observação: {it["obs"]}')
                if it.get('fontes'):
                    out.append('  - Fontes oficiais: ' + ' ; '.join(it['fontes']))
    return '\n'.join(out).rstrip() + '\n'


# ------------------------------------------- registro único de comparações
REGISTRO = 'dados/comparacoes.json'
LIVRO_IDS = 'dados/comparacoes-ids.json'
# publicados em /dados/, mas não são "arquivos originais": ficam fora do SHA256SUMS.txt e ganham o
# SHA256SUMS-derivados.txt (calculados pelo site a partir dos originais), mostrado à parte em /fontes/
DERIVADOS = {REGISTRO, LIVRO_IDS}
REG_CAMPOS = ('id', 'ref', 'slug', 'status', 'titulo', 'tema', 'pagina', 'ancora', 'catalogo', 'metrica', 'lados',
              'resultado', 'vencedor', 'criterio', 'forca', 'ressalva', 'impacto', 'como_chega', 'fonte', 'arquivos', 'atualizado_em')
REG_RESULTADO = {'vitoria', 'contexto', 'sem-placar', 'nao-comparavel'}
PAGINAS_ANCORA = {'/': 'index.html', '/propostas/': 'propostas/index.html', '/balanco/': 'balanco/index.html'}


def reg_impressao(it):
    """Mesma impressão digital da PERGUNTA usada por scripts/gen_comparacoes.py."""
    base = '|'.join([it.get('metrica', ''), it.get('unidade', ''), str(it.get('criterio')),
                     it['lados']['b'].get('periodo', ''), it['lados']['l'].get('periodo', '')])
    return hashlib.sha256(base.encode('utf-8')).hexdigest()[:16]


def primeiro_numero(txt):
    """'R$ 1.374' -> (1374.0, 0); '−3,6 pontos' -> (-3.6, 1); '0,531' -> (0.531, 3)."""
    m = re.search(r'[−+-]?\d[\d.]*(?:,\d+)?', str(txt or ''))
    if not m:
        return None, 0
    t = m.group(0).replace('−', '-').replace('.', '')
    casas = len(t.split(',')[1]) if ',' in t else 0
    return float(t.replace(',', '.')), casas


def ledger_producao(site_url):
    """Livro-razão publicado em produção (é ele que define os links já enviados). None se indisponível."""
    if os.environ.get('CHECK_PROD') == '0' or not re.match(r'^https://', site_url or '') or 'EXEMPLO' in site_url:
        return None, 'conferência com produção desligada'
    import urllib.request, urllib.error
    try:
        with urllib.request.urlopen(site_url + '/' + LIVRO_IDS, timeout=8) as r:
            return json.loads(r.read().decode('utf-8')), 'conferido com produção'
    except urllib.error.HTTPError as e:
        return None, f'produção sem livro-razão (HTTP {e.code}; 1º deploy?)'
    except Exception as e:  # rede indisponível no build: avisa, não barra
        return None, f'produção inacessível ({e.__class__.__name__})'


def validate_registry(site_url=''):
    """Valida public/dados/comparacoes.json e o livro-razão. Devolve (erros, avisos, resumo); erros barram o build."""
    f, fl = PUB / REGISTRO, PUB / LIVRO_IDS
    if not f.exists():
        return [], [], 'registro ausente'
    err, avisos = [], []
    try:
        reg = json.loads(f.read_text(encoding='utf-8'))
    except ValueError as e:
        return [f'{REGISTRO}: JSON inválido ({e})'], [], ''
    try:
        livro = json.loads(fl.read_text(encoding='utf-8'))
    except (OSError, ValueError) as e:  # falha de leitura é erro, não silêncio
        return [f'{LIVRO_IDS}: ausente ou inválido ({e})'], [], ''
    cfg = reg.get('config', {})
    reservados = set(cfg.get('slugs_reservados', []))
    rx_sel = re.compile(cfg.get('regex_selecao', r'^[pb]?\d+(-[pb]?\d+)*$'))
    itens, prox = reg.get('comparacoes', []), reg.get('proximo_id', 0)
    niveis, temas, paginas = reg.get('impacto_niveis', {}), reg.get('temas', {}), reg.get('paginas', {})
    retirados = set(reg.get('ids_retirados', []))
    ids, slugs, refs, por_id = {}, set(), {}, {}
    page_ids, sha_cache = {}, {}

    def ids_da_pagina(pag):
        src = PUB / PAGINAS_ANCORA[pag]
        if src not in page_ids:
            page_ids[src] = set(re.findall(r'\sid="([^"]+)"', src.read_text(encoding='utf-8'))) if src.exists() else set()
        return page_ids[src]

    for it in itens:
        tag = f'id {it.get("id")} ({it.get("ref")})'
        i = it.get('id')
        if not isinstance(i, int) or isinstance(i, bool) or i < 1:
            err.append(f'{tag}: id deve ser inteiro >= 1'); continue
        if i in ids:
            err.append(f'{tag}: id repetido (também em {ids[i]})')
        elif i >= prox:
            err.append(f'{tag}: id >= proximo_id ({prox})')
        ids[i] = it.get('ref'); por_id[i] = it
        if it.get('ref') in refs:
            err.append(f'{tag}: ref repetida')
        refs[it.get('ref')] = i
        slug = it.get('slug', '')
        if not re.match(r'^[a-z][a-z0-9-]*$', slug) or slug in slugs:
            err.append(f'{tag}: slug inválido ou repetido ({slug}); precisa começar com letra')
        if slug in reservados or rx_sel.match(slug):
            err.append(f'{tag}: slug "{slug}" colide com rota reservada de /c/ (kit ou seleção)')
        slugs.add(slug)
        if it.get('status') == 'descontinuado':
            if i not in retirados:
                err.append(f'{tag}: descontinuado precisa estar em ids_retirados')
            continue
        if it.get('status') != 'ativo':
            err.append(f'{tag}: status inválido'); continue
        if i in retirados:
            err.append(f'{tag}: id retirado não pode voltar a ser usado')
        falta = [k for k in REG_CAMPOS if k not in it]
        if falta:
            err.append(f'{tag}: campos obrigatórios ausentes: {", ".join(falta)}'); continue
        res, venc, crit = it['resultado'], it['vencedor'], it['criterio']
        if res not in REG_RESULTADO:
            err.append(f'{tag}: resultado inválido ({res})')
        if (res == 'vitoria') != (venc in ('b', 'l')):
            err.append(f'{tag}: vencedor só existe (b|l) quando resultado = vitoria')
        if crit not in ('maior', 'menor', None):
            err.append(f'{tag}: criterio inválido')
        g = it.get('grafico') or {}
        vals = g.get('valores') or {}
        if res == 'vitoria':
            if it['forca'] not in ('clara', 'apertada', 'depende-da-regua'):
                err.append(f'{tag}: vitória sem força válida')
            if crit not in ('maior', 'menor'):
                err.append(f'{tag}: vitória exige criterio maior|menor')
            if not all(isinstance(vals.get(k), (int, float)) for k in ('b', 'l')):
                err.append(f'{tag}: vitória exige grafico.valores numéricos dos dois lados')
            elif crit in ('maior', 'menor'):
                vb, vl = vals['b'], vals['l']
                calc = None if vb == vl else (('b' if vb < vl else 'l') if crit == 'menor' else ('b' if vb > vl else 'l'))
                if calc != venc:
                    err.append(f'{tag}: vencedor "{venc}" não bate com o critério "{crit}" sobre os valores ({vb} × {vl})')
            if not it.get('selo'):
                err.append(f'{tag}: vitória sem texto de selo')
        for k in ('b', 'l'):
            if not (it['lados'].get(k) or {}).get('valor'):
                err.append(f'{tag}: lado {k} sem valor')
            elif isinstance(vals.get(k), (int, float)):
                n, casas = primeiro_numero(it['lados'][k]['valor'])
                if n is None or abs(n - vals[k]) > 0.5 * 10 ** -casas + 1e-9:
                    err.append(f'{tag}: texto "{it["lados"][k]["valor"]}" não bate com grafico.valores.{k} = {vals[k]}')
        if it['impacto'] is not None and it['impacto'] not in niveis:
            err.append(f'{tag}: impacto inválido ({it["impacto"]})')
        if (it.get('pagina_id') in ('propostas', 'balanco')) != (it['impacto'] == 'panorama'):
            err.append(f'{tag}: "panorama" é o canal de planos e promessas, e só deles (medem texto de plano/cumprimento)')
        if it['tema'] not in temas:
            err.append(f'{tag}: tema inválido ({it["tema"]})')
        if it['pagina'] not in paginas and it['pagina'] != '/comparacoes/':
            err.append(f'{tag}: página inválida ({it["pagina"]})')
        if not it['como_chega'] or len(it['como_chega']) > 140:
            err.append(f'{tag}: como_chega vazio ou com mais de 140 caracteres')
        if not it['arquivos']:
            err.append(f'{tag}: sem arquivo de fonte')
        for a in it['arquivos']:
            if a.get('externo'):   # arquivo grande (> 5 MB): fica na fonte oficial, com URL e sha256
                if not a.get('url') or not re.match(r'^[0-9a-f]{64}$', a.get('sha256') or ''):
                    err.append(f'{tag}: arquivo externo sem URL ou sha256: {a["arquivo"]}')
                continue
            p = PUB / a['arquivo'].lstrip('/')
            if not p.exists():
                err.append(f'{tag}: arquivo não existe: {a["arquivo"]}'); continue
            sha_cache.setdefault(p, sha256(p))
            if sha_cache[p] != a.get('sha256'):
                err.append(f'{tag}: sha256 não confere para {a["arquivo"]}')
        if it['pagina'] in PAGINAS_ANCORA:
            if it['ancora'] not in ids_da_pagina(it['pagina']):
                err.append(f'{tag}: âncora #{it["ancora"]} não existe em {it["pagina"]}')
            if it.get('ancora_card') and it['ancora_card'] not in ids_da_pagina(it['pagina']):
                err.append(f'{tag}: cartão #{it["ancora_card"]} não existe em {it["pagina"]}')
    for it in itens:
        for v in it.get('variante_de', []) or []:
            if v not in ids:
                err.append(f'id {it["id"]}: variante_de aponta para id inexistente ({v})')
        sub = it.get('substituido_por')
        if sub is not None and (sub not in por_id or por_id[sub].get('status') != 'ativo'):
            err.append(f'id {it["id"]}: substituido_por precisa ser um id ativo ({sub})')
    # livro-razão append-only: todo id do livro existe com a mesma ref, slug e pergunta (e vice-versa)
    vistos = set()
    for e in livro.get('ids', []):
        i = e.get('id')
        if i in vistos:
            err.append(f'{LIVRO_IDS}: id {i} repetido'); continue
        vistos.add(i)
        it = por_id.get(i)
        if not it:
            err.append(f'{LIVRO_IDS}: id {i} ({e.get("ref")}) sumiu do registro: ids são permanentes (use status "descontinuado")'); continue
        if it.get('ref') != e.get('ref') or it.get('slug') != e.get('slug'):
            err.append(f'id {i}: ref/slug diferente do livro-razão ({e.get("ref")}/{e.get("slug")} × {it.get("ref")}/{it.get("slug")})')
        if it.get('status') == 'ativo' and 'lados' in it and e.get('pergunta') != reg_impressao(it):
            err.append(f'id {i} ({e.get("ref")}): a pergunta mudou (métrica/unidade/critério/período); crie um id novo e descontinue este')
    for i in ids:
        if i not in vistos:
            err.append(f'id {i}: não está no livro-razão {LIVRO_IDS}')
    if vistos and max(vistos) >= prox:
        err.append(f'proximo_id ({prox}) precisa ser maior que o maior id do livro-razão ({max(vistos)})')
    # contra a produção: o livro publicado só pode crescer
    prod, nota_prod = ledger_producao(site_url)
    if prod:
        local = {e['id']: e for e in livro.get('ids', [])}
        for e in prod.get('ids', []):
            l = local.get(e.get('id'))
            if not l or any(l.get(k) != e.get(k) for k in ('ref', 'slug', 'pergunta')):
                err.append(f'id {e.get("id")} ({e.get("ref")}) publicado em produção foi removido ou alterado no livro-razão')
    elif 'inacessível' in nota_prod:
        avisos.append('livro-razão: ' + nota_prod)
    # pastas estáticas /c/<nome>/: precisam ser slug do registro ou nome reservado (sem colisão com seleções)
    pc = PUB / 'c'
    if pc.exists():
        for d in pc.iterdir():
            if d.is_dir() and d.name not in slugs and d.name not in reservados:
                err.append(f'/c/{d.name}/ não é slug do registro nem nome reservado')
            if d.is_dir() and rx_sel.match(d.name):
                err.append(f'/c/{d.name}/ colide com o formato de seleção')
    ativos = sum(1 for it in itens if it.get('status') == 'ativo')
    return err, avisos, (f'{len(itens)} comparações ({ativos} ativas), ids 1–{prox - 1}, {len(sha_cache)} arquivos com sha256 conferido, '
                         f'livro-razão com {len(vistos)} ids ({nota_prod})')


# --------------------------------------------- páginas: catálogo, estrelas, derivados
ANALISE = {'comparativo': 'Governos', 'propostas': 'Planos 2026', 'balanco': 'Promessas'}


def prerender_comparacoes(t, reg):
    """Lista estática das comparações dentro de <div data-catalogo="lista"> (o catalogo.js substitui ao carregar):
    buscadores e IAs leem todas as comparações, com os dois valores, o critério e a fonte."""
    marca = '<!--PRERENDER-COMPARACOES-->'
    if marca not in t:
        return t, 0
    itens = [c for c in reg['comparacoes'] if c.get('status') == 'ativo' and c.get('catalogo')]
    out = []
    for c in itens:
        L = c['lados']
        if c['resultado'] == 'vitoria':
            res = f'{L[c["vencedor"]]["nome"]} à frente ({c["criterio"]} é melhor; diferença {c["forca"].replace("-", " ")})'
        else:
            res = {'contexto': 'contexto, não conta ponto', 'sem-placar': 'sem placar (comparação descritiva)'}.get(c['resultado'], 'não comparável')
        out.append(f'<li id="cmp-{c["id"]}"><b>Comparação nº {c["id"]} · {esc(c["titulo"])}</b> '
                   f'<span>{esc(ANALISE.get(c.get("pagina_id"), ""))} · {esc(c.get("tema_curto") or "")}</span><br>'
                   f'{esc(L["b"]["nome"])}: {esc(L["b"]["valor"])} · {esc(L["l"]["nome"])}: {esc(L["l"]["valor"])} · {esc(res)}<br>'
                   f'<small>Fonte: {esc(c["fonte"])}. {esc(c.get("ressalva") or "")}</small></li>')
    return t.replace(marca, '<ol class="cat-pre">' + ''.join(out) + '</ol>', 1), len(out)


def mapa_ancoras(reg, pagina):
    """{id do cartão na página: [id da comparação, rótulo curto]} para a estrela injetada pelo catalogo.js."""
    m = {}
    for c in reg['comparacoes']:
        if c.get('status') == 'ativo' and c.get('catalogo') and c.get('pagina') == pagina and c.get('ancora_card') and not c.get('variante_de'):
            m.setdefault(c['ancora_card'], [c['id'], c.get('tema_curto') or c['titulo']])
    return m


def bloco_indicadores(reg, pagina_fontes=''):
    """Seção injetada em /fontes/ (no dist) com os arquivos dos indicadores que só existem na página Comparações
    (pré-registrados, cards do dono, contrapeso): arquivo, onde é usado, SHA-256 e download (ou link oficial, se > 5 MB)."""
    usos, ordem = {}, []
    listados = set(re.findall(r'href="(/dados/[^"]+)"', pagina_fontes))
    for c in reg['comparacoes']:
        if c.get('status') != 'ativo':
            continue
        for a in c.get('arquivos', []):
            k = a['arquivo']
            if k in listados:
                continue
            if k not in usos:
                usos[k] = {'a': a, 'usos': []}; ordem.append(k)
            usos[k]['usos'].append(f'nº {c["id"]} {c.get("tema_curto") or c["titulo"]}')
    # arquivos publicados em /dados/ que nenhuma seção lista (ex.: tabelas usadas só em gráficos da home)
    for q in sorted((PUB / 'dados').rglob('*')):
        k = '/' + str(q.relative_to(PUB))
        if (q.is_file() and k not in listados and k not in usos and q.name not in ('SHA256SUMS.txt', 'SHA256SUMS-derivados.txt')
                and str(q.relative_to(PUB)) not in DERIVADOS):
            usos[k] = {'a': {'arquivo': k, 'sha256': sha256(q)}, 'usos': ['gráficos da página Governo Lula × Bolsonaro']}; ordem.append(k)
    if not ordem:
        return '', 0
    linhas = []
    for k in ordem:
        a, nome = usos[k]['a'], k.split('/')[-1]
        if a.get('externo'):
            baixar = f'<a class="dl" href="{esc(a.get("url") or "#")}" rel="noopener" data-cat="indicadores">No site oficial ({a.get("tamanho_mb", "> 5")} MB)</a>'
        else:
            baixar = f'<a class="dl" href="{esc(k)}" download data-download="1" data-file="{esc(nome)}">Baixar</a>'
        linhas.append(f'<tr><td class="fname">{esc(nome)}</td><td>{esc(" · ".join(usos[k]["usos"]))}</td>'
                      f'<td><code style="font-size:12px;overflow-wrap:anywhere">{esc(a.get("sha256", ""))}</code></td><td>{baixar}</td></tr>')
    html_ = ('<section class="chap" id="fonte-indicadores" data-track-section="fontes-indicadores" data-track-name="Indicadores do catálogo">'
             '<div class="chap-hd"><div class="kicker">Página Comparações</div>'
             '<h2>Mais arquivos: indicadores da página Comparações e de gráficos</h2></div>'
             '<p class="lead">Crédito e dívidas das famílias, preços, emprego, segurança, meio ambiente e contas públicas: os arquivos oficiais '
             'por trás das comparações que entram só em <a href="/comparacoes/">Comparações</a>, com o número de cada comparação que os usa. '
             'Arquivos maiores que 5 MB ficam no site oficial; o SHA-256 é o do arquivo baixado na data da extração.</p>'
             '<div class="tbl-card"><table class="dados-tbl"><thead><tr><th style="width:24%">Arquivo</th><th>Usado em</th><th>SHA-256</th><th>Baixar</th></tr></thead>'
             f'<tbody>{"".join(linhas)}</tbody></table></div></section>')
    return html_, len(ordem)


def bloco_derivados(itens):
    """Seção "Arquivos derivados" injetada em /fontes/ (no dist): registro e livro-razão, com SHA-256."""
    linhas = ''.join(
        f'<tr><td class="fname">{esc(n)}</td><td>{esc(d)}</td><td><code style="font-size:12px;overflow-wrap:anywhere">{h}</code></td>'
        f'<td><a class="dl" href="/{esc(p)}" download data-download="1" data-file="{esc(n)}" data-type="json">Baixar</a></td></tr>'
        for p, n, d, h in itens)
    return ('<section class="chap" id="derivados" data-track-section="fontes-derivados" data-track-name="Derivados">'
            '<div class="chap-hd"><div class="kicker">Calculados pelo site</div>'
            '<h2>Arquivos derivados: o registro das comparações</h2></div>'
            '<p class="lead">Não são arquivos oficiais: é o que o site calculou a partir deles. O <b>registro</b> traz cada comparação '
            '(valores dos dois lados, critério, fonte e o SHA-256 do arquivo original usado); o <b>livro-razão</b> garante que o número de '
            'cada comparação (usado nos links <code>/c/1-3-5</code>) nunca muda. Hashes também em '
            '<a href="/dados/SHA256SUMS-derivados.txt">SHA256SUMS-derivados.txt</a>.</p>'
            '<div class="tbl-card"><table class="dados-tbl"><thead><tr><th style="width:24%">Arquivo</th><th>O que é</th><th>SHA-256</th><th>Baixar</th></tr></thead>'
            f'<tbody>{linhas}</tbody></table></div></section>')


def main():
    env = load_env()
    warns = []
    site_url = (env.get('SITE_URL') or '').rstrip('/')
    ga = env.get('GA_MEASUREMENT_ID') or ''
    consent = env.get('CONSENT_MODE') or 'none'
    prerender = (env.get('PRERENDER') or '1') != '0'
    if not re.match(r'^https?://', site_url):
        site_url = 'https://EXEMPLO.example.com'
        warns.append('SITE_URL não configurada no .env — usando placeholder https://EXEMPLO.example.com')
    if not re.match(r'^G-[A-Z0-9]{6,}$', ga) or len(set(ga[2:])) == 1:
        ga = ''
        warns.append('GA_MEASUREMENT_ID não configurado — analytics ficará inativo até preencher o .env')

    # registro único de comparações: erro aqui barra o build (dado errado não vai ao ar)
    reg_err, reg_avisos, reg_resumo = validate_registry(site_url)
    if reg_err:
        print('build FALHOU: registro %s inválido:' % REGISTRO)
        for e in reg_err:
            print('   -', e)
        return 1
    warns.extend(reg_avisos)
    try:
        sys.path.insert(0, str(ROOT / 'scripts'))
        import conferir_registro
        reg_div, reg_ok = conferir_registro.conferir()
    except Exception as e:  # falha de leitura é erro, não silêncio
        reg_div, reg_ok = [f'conferência do registro com as páginas falhou: {e}'], 0
    if reg_div:
        print('build FALHOU: o registro diverge do que as páginas publicam (prevalece a página; ver scripts/conferir_registro.py):')
        for e in reg_div:
            print('   -', e)
        if os.environ.get('CONFERIR_REGISTRO') != 'aviso':
            return 1
        warns.extend('registro diverge: ' + e for e in reg_div)
    reg_resumo += f'; {reg_ok} valores conferidos com as páginas'
    registro = json.loads((PUB / REGISTRO).read_text(encoding='utf-8')) if (PUB / REGISTRO).exists() else None

    if DIST.exists():
        shutil.rmtree(DIST)
    shutil.copytree(PUB, DIST)

    dates = {u: page_dates(PUB / f) for u, f, _ in PAGES}
    dist_pages = {DIST / f: u for u, f, _ in PAGES}

    # "Atualizado em" (faixa de credibilidade e rodapé): data do último commit do site
    upd_iso = _git('log', '-1', '--format=%cI')[:10] or datetime.date.today().isoformat()
    upd_br = '%s/%s/%s' % (upd_iso[8:10], upd_iso[5:7], upd_iso[:4])

    n_arq = conta_arquivos()   # total real: substitui os "50 arquivos" escritos à mão nas páginas e no llms.txt
    n_tok = 0
    DADOS_DIST = DIST / 'dados'
    for p in DIST.rglob('*'):
        if DADOS_DIST in p.parents:
            continue  # arquivos oficiais: copiados sem nenhuma alteração (o SHA-256 tem de bater)
        if p.is_file() and p.suffix.lower() in ('.html', '.xml', '.txt', '.json', '.css', '.js', '.svg'):
            s = p.read_text(encoding='utf-8')
            o = s
            s = s.replace('__SITE_URL__', site_url).replace('__GA_ID__', ga).replace('__CONSENT__', consent)
            s = s.replace('__UPDATED_ISO__', upd_iso).replace('__UPDATED__', upd_br)
            if p.suffix.lower() in ('.html', '.txt'):
                s = total_arquivos(s, n_arq)
            if p in dist_pages:
                pub, mod = dates[dist_pages[p]]
                s = s.replace('__DATE_PUBLISHED__', pub).replace('__DATE_MODIFIED__', mod)
            if s != o:
                p.write_text(s, encoding='utf-8'); n_tok += 1

    # meta de verificação (Search Console / Bing Webmaster) só na home
    verif = ''
    if env.get('GOOGLE_SITE_VERIFICATION'):
        verif += '<meta name="google-site-verification" content="%s">\n' % html.escape(env['GOOGLE_SITE_VERIFICATION'])
    if env.get('BING_SITE_VERIFICATION'):
        verif += '<meta name="msvalidate.01" content="%s">\n' % html.escape(env['BING_SITE_VERIFICATION'])
    if verif:
        home = DIST / 'index.html'
        home.write_text(home.read_text(encoding='utf-8').replace('</head>', verif + '</head>', 1), encoding='utf-8')
    # IndexNow (Bing, Yandex, Seznam…): arquivo da chave na raiz — https://www.indexnow.org
    if re.match(r'^[A-Za-z0-9-]{8,128}$', env.get('INDEXNOW_KEY') or ''):
        (DIST / (env['INDEXNOW_KEY'] + '.txt')).write_text(env['INDEXNOW_KEY'], encoding='utf-8')

    # SEO/IA: pré-renderização dos catálogos, ECharts externo, Dataset de /fontes/
    notes = []
    raw = {u: (DIST / f).read_text(encoding='utf-8') for u, f, _ in PAGES}
    prop_data = embedded_json(raw['/propostas/'], 'data-catalogo')
    bal_data = embedded_json(raw['/balanco/'], 'data-promessas')
    # catálogo de comparações: lista estática (antes do texto do llms-full, para entrar nele)
    if registro and '/comparacoes/' in raw:
        t, n = prerender_comparacoes(raw['/comparacoes/'], registro)
        if n: raw['/comparacoes/'] = t; notes.append(f'{n} comparações pré-renderizadas')
    # texto para o llms-full.txt: do HTML antes da pré-renderização (os catálogos entram completos à parte)
    texts = [visible_text(raw[u]) for u, _, _ in PAGES]
    # estrelas: mapa cartão -> comparação, lido pelo catalogo.js (só no dist; as páginas-fonte não mudam)
    if registro:
        n_est = 0
        for u in ('/', '/propostas/', '/balanco/'):
            m = mapa_ancoras(registro, u)
            if m and '</head>' in raw[u]:
                raw[u] = raw[u].replace('</head>', '<script id="bpd-ancoras" type="application/json">%s</script>\n</head>'
                                        % json.dumps(m, ensure_ascii=False).replace('</', '<\\/'), 1)
                n_est += len(m)
        notes.append(f'{n_est} cartões com estrela')
    if prerender:
        t, n = prerender_propostas(raw['/propostas/'])
        if n: raw['/propostas/'] = t; notes.append(f'{n} propostas pré-renderizadas')
        t, n = prerender_balanco(raw['/balanco/'])
        if n: raw['/balanco/'] = t; notes.append(f'{n} promessas pré-renderizadas')
        t, name = externalize_echarts(raw['/'])
        if name: raw['/'] = t; notes.append(f'ECharts externo em /assets/js/{name}')
    ld = fontes_datasets(raw['/fontes/'], site_url, dates['/fontes/'][1])
    if ld:
        raw['/fontes/'] = raw['/fontes/'].replace(
            '</head>', '<script type="application/ld+json">%s</script>\n</head>' % json.dumps(ld, ensure_ascii=False).replace('</', '<\\/'), 1)
        notes.append(f'{len(ld["dataset"])} Datasets no JSON-LD de /fontes/')
    # /fontes/: arquivos derivados (registro e livro-razão) com SHA-256, separados dos originais
    deriv = [(r, r.split('/')[-1], d, sha256(PUB / r)) for r, d in (
        (REGISTRO, 'Registro das comparações: valores dos dois lados, critério, vencedor, força, fonte e SHA-256 dos arquivos originais'),
        (LIVRO_IDS, 'Livro-razão dos números das comparações (só cresce): id, referência e impressão digital da pergunta'))
        if (PUB / r).exists()]
    if deriv:
        (DIST / 'dados' / 'SHA256SUMS-derivados.txt').write_text(''.join(f'{h}  {r}\n' for r, _, _, h in deriv), encoding='utf-8')
        # marca do bloco "Notas" (h4 antes da revisão de acessibilidade; h2 depois)
        marca = next((m for m in ('<div class="explain">\n    <h2>Notas</h2>', '<div class="explain">\n    <h4>Notas</h4>')
                      if m in raw['/fontes/']), None)
        if marca:
            ind, n_ind = bloco_indicadores(registro, raw['/fontes/']) if registro else ('', 0)
            raw['/fontes/'] = raw['/fontes/'].replace(marca, ind + bloco_derivados(deriv) + '\n  ' + marca, 1)
            if n_ind: notes.append(f'{n_ind} arquivos dos indicadores do catálogo em /fontes/')
            notes.append('derivados com SHA-256 em /fontes/')
        else:
            warns.append('/fontes/: lugar da seção de derivados não encontrado')
    for u, f, _ in PAGES:
        (DIST / f).write_text(raw[u], encoding='utf-8')

    # llms-full.txt (texto integral, para buscadores de IA)
    (DIST / 'llms-full.txt').write_text(total_arquivos(llms_full(site_url, texts, prop_data, bal_data, dates), n_arq), encoding='utf-8')
    notes.append(f'total de arquivos nas páginas: {n_arq}')

    sobra = [str(p.relative_to(DIST)) for p in DIST.rglob('*') if p.is_file() and DADOS_DIST not in p.parents
             and p.suffix.lower() in ('.html', '.xml', '.txt') and any(t in p.read_text(encoding='utf-8') for t in TOKENS)]
    if sobra:
        warns.append('tokens não substituídos em: ' + ', '.join(sobra))

    # checksums dos dados
    dados = sorted((DIST / 'dados').rglob('*'))
    lines = [f'{sha256(p)}  dados/{p.relative_to(DIST / "dados")}' for p in dados if p.is_file()
             and p.name not in ('SHA256SUMS.txt', 'SHA256SUMS-derivados.txt') and str(p.relative_to(DIST)) not in DERIVADOS]
    (DIST / 'dados' / 'SHA256SUMS.txt').write_text('\n'.join(lines) + '\n', encoding='utf-8')

    # sitemap (lastmod = data real da última alteração de cada página)
    urls = '\n'.join(f'  <url><loc>{site_url}{u}</loc><lastmod>{dates[u][1]}</lastmod></url>' for u, _, _ in PAGES)
    (DIST / 'sitemap.xml').write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + '\n</urlset>\n', encoding='utf-8')

    # validação de links internos e dos JSON-LD
    missing, checked, n_ld = [], 0, 0
    for p in DIST.rglob('*.html'):
        if DADOS_DIST in p.parents:
            continue  # páginas oficiais arquivadas (STF etc.): os links delas não são do site
        t = p.read_text(encoding='utf-8')
        for m in re.finditer(r'(?:href|src)="(/[^"#?]*|[^"#?]*\.(?:css|js|png|jpg|ico|txt))"', t):
            u = m.group(1)
            if u.startswith('#'):
                continue
            if u.startswith('/'):
                tgt = DIST / u.lstrip('/')
                if u.endswith('/'):
                    tgt = tgt / 'index.html'
            else:
                tgt = (p.parent / u).resolve()
            checked += 1
            if not tgt.exists():
                missing.append(f'{p.relative_to(DIST)} -> {u}')
        for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', t, re.S):
            try:
                json.loads(m.group(1)); n_ld += 1
            except ValueError as e:
                warns.append(f'JSON-LD inválido em {p.relative_to(DIST)}: {e}')
    if missing:
        warns.append('links internos quebrados:\n    ' + '\n    '.join(sorted(set(missing))[:25]))

    print(f'build ok -> {DIST}')
    print(f'  páginas: {len(PAGES)} | tokens substituídos em {n_tok} arquivo(s) | links internos verificados: {checked} | JSON-LD válidos: {n_ld}')
    print(f'  dados: {len(lines)} arquivos, SHA256SUMS.txt regenerado')
    print(f'  registro: {reg_resumo}')
    print('  seo/ia: ' + ('; '.join(notes) if notes else 'nada a fazer') + ' | llms-full.txt gerado')
    for w in warns:
        print('  AVISO:', w)
    return 0


if __name__ == '__main__':
    sys.exit(main())
