#!/usr/bin/env python3
"""Confere o registro (public/dados/comparacoes.json) contra o que as páginas PUBLICAM:
  - home: o resumo (blocos .md, texto dos dois valores e o selo de força) e os cartões montados pelo
    charts.js (cards-home.js: valores, critério e força), ligados ao registro pelo ancora_card;
  - /balanco/: cards-balanco.js (percentuais do placar e contagens por categoria de cada tema);
  - /propostas/: cards-propostas.js (contagens ferramenta/parcial/só intenção de cada tema).
Em caso de divergência, PREVALECE A PÁGINA (decisão do dono): corrija o registro (gen_comparacoes.py) e, se a
métrica mudar, siga a regra do livro-razão (id novo + descontinuado).
Uso: python3 scripts/conferir_registro.py   (sai com 1 se houver divergência). Também roda dentro do build."""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / 'public'


def num(txt):
    m = re.search(r'[−+-]?\d[\d.]*(?:,\d+)?', str(txt or ''))
    if not m:
        return None
    return float(m.group(0).replace('−', '-').replace('.', '').replace(',', '.'))


def ler(p):
    f = PUB / p
    return f.read_text(encoding='utf-8') if f.exists() else ''


def conferir():
    reg = json.loads(ler('dados/comparacoes.json'))
    itens = [c for c in reg['comparacoes'] if c.get('status') == 'ativo']
    por_card = {c['ancora_card']: c for c in itens if c.get('ancora_card') and c['pagina'] == '/'}
    por_ref = {c['ref']: c for c in itens}
    div, ok = [], 0

    def compara(c, onde, vb, vl, forca=None, crit=None):
        nonlocal ok
        g = (c.get('grafico') or {}).get('valores') or {}
        for k, v in (('b', vb), ('l', vl)):
            if v is None:
                continue
            reg_v = g.get(k, num(c['lados'][k]['valor']))
            if reg_v is None or abs(float(reg_v) - float(v)) > 0.051:
                div.append(f'id {c["id"]} ({c["ref"]}, {c.get("tema_curto")}): {onde} mostra {k}={v}, registro tem {reg_v}')
            else:
                ok += 1
        if forca and c.get('forca') and forca != c['forca']:
            div.append(f'id {c["id"]} ({c["ref"]}): {onde} diz força "{forca}", registro "{c["forca"]}"')
        if crit and c.get('criterio') and crit != c['criterio']:
            div.append(f'id {c["id"]} ({c["ref"]}): {onde} diz critério "{crit}", registro "{c["criterio"]}"')

    home = ler('index.html')
    # 1. resumo da home: <a href="#q-..."> + os dois valores (<b>) + selo de força
    for bloco in home.split('<div class="md">')[1:]:
        bloco = bloco.split('<div class="md">')[0][:3000]
        m = re.match(r'\s*<div class="md-hd"><span class="md-tema"><a href="#(q-[a-z-]+)">', bloco)
        if not m:
            continue
        alvo = m.group(1)
        c = por_card.get(alvo)
        if not c:
            continue
        vb = re.search(r'md-row--b[^"]*".*?<b[^>]*>([^<]+)</b>', bloco, re.S)
        vl = re.search(r'md-row--l[^"]*".*?<b[^>]*>([^<]+)</b>', bloco, re.S)
        fz = re.search(r'class="q-forca(?: q-forca--(\w+))?"', bloco)
        forca = (fz.group(1) or 'clara') if fz else None
        compara(c, 'resumo da home', num(vb.group(1)) if vb else None, num(vl.group(1)) if vl else None, forca)
    # 2. cartões da home (cards-home.js), pelo data-card do <article id="q-...">
    js = ler('assets/js/cards-home.js')
    defs = {}
    for m in re.finditer(r"id: '(q-[a-z-]+)', tema: '[^']*', criterio: (null|'(?:maior|menor)'), valores: \{ b: ([-0-9.]+), l: ([-0-9.]+) \}(.{0,300})", js):
        fz = re.search(r"forca: '([a-z-]+)'", m.group(5))
        defs[m.group(1)] = (m.group(2).strip("'") if m.group(2) != 'null' else None, float(m.group(3)), float(m.group(4)), fz.group(1) if fz else None)
    for m in re.finditer(r'<article class="vrd[^"]*" id="(q-[a-z-]+)" data-card="(q-[a-z-]+)"', home):
        c, d = por_card.get(m.group(1)), defs.get(m.group(2))
        if c and d:
            compara(c, f'cartão {m.group(2)} da home', d[1], d[2], d[3], d[0])
    # 3. /balanco/
    jb = ler('assets/js/cards-balanco.js')
    mb = re.search(r"id: 'b-placar'.*?valores: \{ b: ([-0-9.]+), l: ([-0-9.]+) \}.*?forca: '([a-z-]+)'", jb)
    if mb and 'B00' in por_ref:
        compara(por_ref['B00'], 'placar do balanço', float(mb.group(1)), float(mb.group(2)), mb.group(3))
    CATB = {'cumprida': 'ok', 'parcial': 'mid', 'andamento': 'run', 'nao': 'no', 'sem': 'na'}
    for ref, cid in (('B01', 'b-bolso'), ('B02', 'b-servicos'), ('B03', 'b-estado'), ('B04', 'b-seguranca')):
        m = re.search(r"tema\('%s', '[^']*', \{([^}]*)\}, \{([^}]*)\}, '([a-z-]+)'\)" % cid, jb)
        c = por_ref.get(ref)
        if not (m and c):
            continue
        for k, txt in (('b', m.group(1)), ('l', m.group(2))):
            pag = {CATB[a]: int(b) for a, b in re.findall(r'(\w+): (\d+)', txt)}
            reg_c = c['grafico']['contagens'][k]
            if any(reg_c.get(x, 0) != v for x, v in pag.items()):
                div.append(f'id {c["id"]} ({ref}): contagens do lado {k} no cartão {cid} = {pag}, registro = {reg_c}')
            else:
                ok += 1
        if m.group(3) != c.get('forca'):
            div.append(f'id {c["id"]} ({ref}): cartão {cid} diz força "{m.group(3)}", registro "{c.get("forca")}"')
    # 4. /propostas/
    jp = ler('assets/js/cards-propostas.js')
    CATP = {'exp': 'ok', 'par': 'mid', 'sem': 'no'}
    for ref, cid in (('P00', 'p-geral'), ('P01', 'p-bolso'), ('P02', 'p-seguranca'), ('P03', 'p-servicos'), ('P04', 'p-economia'), ('P05', 'p-ambiente')):
        m = re.search(r"c\('%s', '[^']*', \d+, \{([^}]*)\}, \{([^}]*)\}" % cid, jp)
        c = por_ref.get(ref)
        if not (m and c):
            continue
        for k, txt in (('b', m.group(1)), ('l', m.group(2))):
            pag = {CATP[a]: int(b) for a, b in re.findall(r'(\w+): (\d+)', txt)}
            reg_c = c['grafico']['contagens'][k]
            if any(reg_c.get(x, 0) != v for x, v in pag.items()):
                div.append(f'id {c["id"]} ({ref}): contagens do lado {k} no cartão {cid} = {pag}, registro = {reg_c}')
            else:
                ok += 1
    return div, ok


if __name__ == '__main__':
    d, n = conferir()
    for x in d:
        print('DIVERGE:', x)
    print(f'{n} valores conferidos com as páginas; {len(d)} divergência(s)')
    sys.exit(1 if d else 0)
