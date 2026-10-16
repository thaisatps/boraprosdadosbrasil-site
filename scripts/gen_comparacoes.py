#!/usr/bin/env python3
"""Gera/atualiza o REGISTRO ÚNICO de comparações (public/dados/comparacoes.json) e o
LIVRO-RAZÃO de IDs (public/dados/comparacoes-ids.json).

Uso:
  python3 scripts/gen_comparacoes.py <10-matriz-vereditos.json> [--novos <97-novos-indicadores.json> --dados <pasta>]

Regras de ID (permanentes):
  - Cada comparação tem um `id` inteiro (1, 2, 3...) que NUNCA muda e NUNCA é reaproveitado.
  - O vínculo com a origem é o campo `ref` (H01, P00, B03, N01...). Quem já tem `ref` no livro-razão mantém
    o `id`; refs novas recebem `proximo_id` (que só cresce).
  - O livro-razão é APPEND-ONLY: cada linha guarda id, ref, slug e a impressão digital da PERGUNTA
    (métrica | unidade | critério | período de cada lado). Corrigir um número não muda nada; mudar a
    pergunta (outra métrica, outra régua, outro período) com o mesmo id é recusado: crie um item novo e
    marque o antigo como "descontinuado" com `substituido_por` (em DESCONTINUAR, abaixo).
  - Comparação retirada não é apagada: vira `status: "descontinuado"` e o id vai para `ids_retirados`.
  - O build (scripts/build.py) confere tudo isso de novo, inclusive contra o livro-razão em produção.

Novos indicadores (--novos): lista JSON de itens no formato da matriz (valor_a/valor_b, periodo_a/periodo_b,
vencedor, criterio, forca, ressalva, fonte...) ou já no formato do registro (lados, resultado, vencedor b|l).
Campos extras aceitos: slug, titulo, tema, tema_curto, impacto, como_chega, fonte_publica, selo,
periodo_curto, nota_visual, dados_ate, variante_de (ref), pre_registrado, grafico.valores {b,l}, formato,
arquivos [{arquivo|origem, destino, sha256}]. Os arquivos de dados são copiados de --dados para
public/dados/<destino> e o sha256 é conferido. Esses itens entram só no catálogo (decisão do dono, item 9).
Sem dependências externas.
"""
import argparse, datetime, hashlib, json, re, shutil, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUB = ROOT / 'public'
OUT = PUB / 'dados' / 'comparacoes.json'
LIVRO = PUB / 'dados' / 'comparacoes-ids.json'
HOJE = datetime.date.today().isoformat()

# ------------------------------------------------------------------ configuração do catálogo
CONFIG = {
    # Filtro "Como chega em você": DESLIGADO até a lista pré-registrada (decisão do dono, item 8) estar no registro.
    'impacto_filtro': True,   # ligado em 16/10/2026: lista pré-registrada cumprida (supervisor, decisão do dono 8)
    'max_selecao': 12,
    # /c/<nome>/ reservados para páginas compostas do kit de compartilhamento (31-cards-share, 96-revisao-share §1)
    'slugs_reservados': ['placar', 'promessas', 'planos', 'balanco', 'propostas', 'selecao', 'compartilhar', 'lista',
                         'carrossel-placar', 'carrossel-promessas', 'carrossel-balanco', 'carrossel-planos'],
    # seleções (/c/1-3-5, e o prefixo futuro /c/p12-b08): um slug que case com isto é erro de build
    'regex_selecao': r'^[pb]?\d+(-[pb]?\d+)*$',
}

# ------------------------------------------------------------------ canal de impacto (só etiqueta)
# Regra testável em uma linha, fixada ANTES de olhar quem venceu (95 §2, 96-revisao-dados §2, decisão do dono 8):
#   bolso    = a unidade é R$ por pessoa/família, variação de preço ao consumidor, % de pessoas numa situação
#              (desempregadas, pobres) ou juro/parcela paga pela família;
#   servicos = gasto ou entrega do governo a pessoas (saúde, educação, segurança, assistência, previdência);
#   contas   = agregado da economia ou das contas do governo (PIB, gasto total, dívida, juros, câmbio...).
# Planos (2026) e promessas medem texto de plano / cumprimento: canal 'panorama' (fora dos três canais). Variantes não contam.
IMPACTO = {
    'bolso':    {'ordem': 1, 'rotulo': 'Direto no bolso',
                 'regra': 'Medido na família ou no preço que ela paga: R$ por pessoa ou família, preço ao consumidor, % de pessoas numa situação, juro ou parcela paga pela família.'},
    'servicos': {'ordem': 2, 'rotulo': 'Nos serviços e na proteção social',
                 'regra': 'O que o governo gasta ou entrega a pessoas: saúde, educação, segurança, assistência e previdência.'},
    'economia': {'ordem': 3, 'rotulo': 'Pelas contas do governo',
                 'regra': 'Agregado da economia ou das contas do governo (PIB, gasto total, dívida, juros, câmbio): chega ao bolso pelo juro do crediário, pelos impostos e pelo espaço no orçamento.'},
    'panorama': {'ordem': 4, 'rotulo': 'Panorama',
                 'regra': 'Planos de 2026 e promessas: medem o texto dos planos e o cumprimento das promessas, não um canal até a família.'},
}
NOTA_IMPACTO = ('O canal mostra por onde o dado chega até você, não a importância: dívida e juros também chegam ao bolso, '
                'pelo juro do crediário e pelo espaço no orçamento.')

FONTE_PUB = {
    'pib': 'IBGE (Contas Nacionais), via Banco Central', 'ipca': 'IBGE (IPCA), via Banco Central',
    'pnad': 'IBGE (PNAD Contínua), via Banco Central', 'sidra': 'IBGE (PNAD Contínua/SIDRA)',
    'bc': 'Banco Central', 'nfsp': 'Banco Central (NFSP)', 'tesouro': 'Tesouro Nacional (SICONFI/RREO)',
    'tesouro_pib': 'Tesouro Nacional (SICONFI) e Banco Central', 'rgf': 'Tesouro Nacional (SICONFI/RGF)',
    'fed': 'Federal Reserve Bank of New York', 'sm': 'Banco Central (SGS 1619) e IBGE (IPCA)',
    'ibge4562': 'IBGE (PNAD Contínua, SIDRA 4562: taxa de desocupação anual)',
    'tse26': 'TSE: planos de governo de 2026 registrados', 'tse_bal': 'TSE: planos de 2018 e 2022 + fonte oficial de cada promessa',
}

LADOS = {
    'comparativo': {'b': {'nome': 'Governo Bolsonaro', 'curto': 'Bolsonaro'}, 'l': {'nome': 'Governo Lula', 'curto': 'Lula'}},
    'propostas': {'b': {'nome': 'Flávio Bolsonaro (plano 2026)', 'curto': 'Flávio'}, 'l': {'nome': 'Lula (plano 2026)', 'curto': 'Lula'}},
    'balanco': {'b': {'nome': 'Governo Bolsonaro (plano 2018)', 'curto': 'Bolsonaro'}, 'l': {'nome': 'Governo Lula (plano 2022)', 'curto': 'Lula'}},
}
PER_CURTO = {'comparativo': ('2019–22', '2023–25'), 'propostas': ('plano 2026', 'plano 2026'), 'balanco': ('2019–22', '2023–set/26')}
DADOS_ATE = {'comparativo': '2025', 'propostas': 'planos registrados no TSE em 2026', 'balanco': '30/09/2026'}
SELO = {'propostas': 'diz mais como fazer', 'balanco': 'mais cumpridas'}

PAGINA = {'/': ('comparativo', 'Governos'), '/propostas/': ('propostas', 'Planos 2026'), '/balanco/': ('balanco', 'Promessas')}
TEMAS = {'precos': 'Preços', 'trabalho': 'Emprego', 'renda': 'Renda e salário', 'protecao': 'Proteção social',
         'servicos': 'Saúde e educação', 'seguranca': 'Segurança', 'economia': 'Crescimento', 'juros': 'Juros',
         'contas': 'Contas públicas', 'mundo': 'Cenário externo', 'ambiente': 'Meio ambiente e instituições',
         'credito': 'Crédito e dívidas das famílias', 'planos': 'Planos de governo', 'promessas': 'Promessas'}

R = {'casas': 1, 'prefixo': 'R$ '}
# Metadados por linha da matriz.
#  slug · titulo (pergunta) · tema · tema_curto · impacto (canal) · como (≤ 140) · fonte · crit · num (b, l) · fmt
#  ancora (seção que existe hoje) · card (id do cartão na página, onde entra a estrela) · selo · per (período curto)
#  nota (regra particular escrita no gráfico) · ress (ressalva revisada, simétrica) · val (texto dos valores) · det
#  resultado (força o roteiro) · variante_de · bloco (bloco do placar da home) · catalogo · obs
META = {
 'H01': dict(slug='crescimento', titulo='Quanto a economia cresceu por ano?', tema='economia', tc='Crescimento', impacto='economia',
             como='Economia que cresce gera vagas e renda ao longo dos anos, e mais arrecadação para o governo.',
             fonte='pib', crit='maior', num=(1.4, 3.0), fmt={'casas': 1, 'sufixo': '% ao ano'}, ancora='cap-motor', card='q-crescimento',
             selo='cresceu mais', bloco='Economia e renda'),
 'H02': dict(slug='inflacao', titulo='Quanto os preços subiram por ano?', tema='precos', tc='Inflação', impacto='bolso',
             como='É o aumento de preços do mercado, do aluguel e da conta de luz: quanto o seu dinheiro deixa de comprar.',
             fonte='ipca', crit='menor', num=(6.1, 4.6), fmt={'casas': 1, 'sufixo': '% ao ano'}, ancora='cap-motor', card='q-inflacao',
             selo='menor inflação', bloco='Economia e renda', ress='Só com 2019: 4,3% × 4,6%, inverte. Sem 2020–21: 5,0% × 4,6%.'),
 'H03': dict(slug='desemprego', titulo='Quantos procuravam emprego e não achavam?', tema='trabalho', tc='Desemprego', impacto='bolso',
             como='Mostra a chance de quem procura trabalho encontrar uma vaga.',
             fonte='pnad', crit='menor', num=(12.1, 7.0), fmt={'casas': 1, 'sufixo': '%'}, ancora='cap-motor', card=None,
             selo='menos desemprego', bloco='Economia e renda', ress='Sem 2020–21 (pandemia): 10,8% × 7,0%; só 2019: 12,0% × 7,0%. O resultado não muda.',
             obs='Descontinuado em 16/10/2026: a home passou a usar a média anual oficial do IBGE (decisão do dono); substituído pela comparação H03A.'),
 'H03A': dict(slug='desemprego-media-anual', titulo='Quantos procuravam emprego e não achavam?', tema='trabalho', tc='Desemprego', impacto='bolso',
             como='Mostra a chance de quem procura trabalho encontrar uma vaga.',
             fonte='ibge4562', crit='menor', num=(12.3, 6.6), fmt={'casas': 1, 'sufixo': '%'}, ancora='cap-motor', card='q-emprego',
             selo='menos desemprego', bloco='Economia e renda', ress='Sem 2020–21 (pandemia): 10,7% × 6,6%; só 2019: 11,8% × 6,6%. O resultado não muda.',
             grupos=[{'rotulo': '1º ano', 'b': {'rot': '2019', 'v': 11.8}, 'l': {'rot': '2023', 'v': 7.7}},
                     {'rotulo': '2º ano', 'b': {'rot': '2020', 'v': 13.7}, 'l': {'rot': '2024', 'v': 6.6}},
                     {'rotulo': '3º ano', 'b': {'rot': '2021', 'v': 14.0}, 'l': {'rot': '2025', 'v': 5.6}},
                     {'rotulo': '4º ano', 'b': {'rot': '2022', 'v': 9.6}, 'l': None}],
             obs='Média anual oficial do IBGE (decisão do dono, 16/10/2026); substitui a comparação nº 3 (média de trimestres móveis).'),
 'H04': dict(slug='assistencia', titulo='Quanto foi gasto com assistência social, por ano?', tema='protecao', tc='Proteção social', impacto='servicos',
             como='É o dinheiro de programas como Bolsa Família, Auxílio Brasil e BPC, que chega a famílias de baixa renda.',
             fonte='tesouro', crit='maior', num=(188.1, 293.5), fmt={'prefixo': 'R$ ', 'casas': 1, 'sufixo': ' bi/ano'}, ancora='placar', card='q-protecao-social',
             selo='gastou mais', bloco='Economia e renda', nota='Regra desta comparação: Governo Bolsonaro sem 2020 (Auxílio Emergencial) · em R$ de dez/2025',
             per=('2019, 2021–22', '2023–25'), ress='Com 2020 na conta: R$ 282,1 × R$ 293,5 bi/ano (ver a comparação nº 17).'),
 'H05': dict(slug='selic', titulo='Juro básico (Selic): quanto custava o dinheiro?', tema='juros', tc='Selic', impacto='economia',
             como='Chega pelo juro do crediário, do cartão e do financiamento, e pelo rendimento das aplicações.',
             fonte='bc', crit=None, num=(6.5, 12.9), fmt={'casas': 1, 'sufixo': '% ao ano'}, ancora='cap-motor', card='q-selic',
             ress='É decidida pelo Banco Central (autônomo desde 2021) para controlar a inflação: é ferramenta, não resultado.'),
 'H06': dict(slug='gasto', titulo='Quanto o governo federal gastou por ano, sem contar juros?', tema='contas', tc='Controle do gasto', impacto='economia',
             como='Gasto maior pode trazer mais serviços agora e mais dívida ou imposto depois; gasto menor, o contrário.',
             fonte='tesouro', crit='menor', num=(2.67, 3.02), fmt={'prefixo': 'R$ ', 'casas': 2, 'sufixo': ' tri/ano'}, ancora='cap-conta', card='q-gasto',
             selo='gastou menos', bloco='Contas públicas', nota='Regra desta comparação: em R$ de dez/2025 (sem a inflação)',
             ress='Em % do PIB: 25,0% × 24,5%, inverte.'),
 'H07': dict(slug='divida', titulo='Quanto a dívida pública mudou, em pontos do PIB?', tema='contas', tc='Dívida pública', impacto='economia',
             como='Dívida maior tende a pressionar juros e impostos no futuro; dívida menor abre espaço no orçamento.',
             fonte='bc', crit='menor', num=(-3.6, 11.2), fmt={'casas': 1, 'sufixo': ' pontos', 'sinal': True}, ancora='cap-conta', card='q-divida',
             selo='dívida subiu menos', bloco='Contas públicas', nota='Regra desta comparação: Governo Lula parcial, até ago/26',
             per=('dez/18–dez/22', 'dez/22–ago/26'), val=('−3,6 pontos', '+11,2 pontos'),
             det=('75,3% → 71,7% do PIB', '71,7% → 82,9% do PIB (parcial, até ago/26)'),
             ress='Contando o Governo Lula só até dez/2025: −3,6 × +7,0 pontos. O resultado não muda.'),
 'H08': dict(slug='juros', titulo='Quanto se pagou de juros da dívida por ano?', tema='juros', tc='Conta de juros', impacto='economia',
             como='O dinheiro que vai para juros não vai para serviços; dívida maior e Selic alta encarecem essa conta.',
             fonte='nfsp', crit='menor', num=(5.0, 7.5), fmt={'casas': 1, 'sufixo': '% do PIB'}, ancora='cap-conta', card='q-juros',
             selo='menos juros', bloco='Contas públicas', ress='Juros nominais incluem a inflação; dependem do tamanho da dívida e da Selic.'),
 'H09': dict(slug='salario-minimo', titulo='Quanto o salário mínimo comprava?', tema='renda', tc='Salário mínimo', impacto='bolso',
             como='É o piso de quem ganha o mínimo e a base de aposentadorias e benefícios ligados a ele.',
             fonte='sm', crit='maior', num=(1374, 1478), fmt={'prefixo': 'R$ ', 'casas': 0}, ancora='cap-bolso', card='q-salario-minimo',
             selo='mínimo maior', nota='Em R$ de dez/2025 (sem a inflação)'),
 'H10': dict(slug='renda', titulo='Quanto cada pessoa da família tinha por mês?', tema='renda', tc='Renda por pessoa', impacto='bolso',
             como='É quanto, em média, cada pessoa da família tem por mês para viver, já sem a inflação.',
             fonte='sidra', crit='maior', num=(1781, 2127), fmt={'prefixo': 'R$ ', 'casas': 0}, ancora='cap-bolso', card='q-renda',
             selo='renda maior', nota='Em R$ de dez/2025 (sem a inflação)'),
 'H11': dict(slug='desigualdade', titulo='A renda ficou menos desigual? (índice de Gini)', tema='renda', tc='Desigualdade', impacto=None,
             como='Mostra se a renda cresceu mais para quem ganha menos ou para quem ganha mais.',
             fonte='sidra', crit='menor', num=(0.531, 0.511), fmt={'casas': 3}, ancora='cap-bolso', card='q-desigualdade', selo='menos desigual',
             obs='Canal: pela regra estrita o Gini (índice de distribuição) não é "bolso"; o rótulo "Pelas contas do governo" também não o descreve. Fica sem etiqueta de canal até decisão.'),
 'H12': dict(slug='renda-por-faixa', titulo='Ganho de renda por faixa (P10 a P99)', tema='renda', tc='Renda por faixa', impacto='bolso',
             como='Mostra em que faixa de renda o ganho, sem a inflação, foi maior.',
             fonte='sidra', crit=None, num=None, ancora='cap-bolso', resultado='sem-placar', catalogo=False,
             obs='Fora do catálogo: a tabela usada (SIDRA 7438) não está nos arquivos publicados em /dados/.'),
 'H13': dict(slug='renda-metade-mais-pobre', titulo='Quanto tinha a metade mais pobre, por pessoa?', tema='renda', tc='Renda dos 50% mais pobres', impacto='bolso',
             como='É a renda média por pessoa da metade da população que ganha menos.',
             fonte='sidra', crit='maior', num=(576, 743), fmt={'prefixo': 'R$ ', 'casas': 0}, ancora='cap-bolso', card='q-renda-pobres',
             selo='renda maior', nota='Em R$ de dez/2025 (sem a inflação)'),
 'H14': dict(slug='renda-10-mais-ricos', titulo='Renda dos 10% mais ricos', tema='renda', tc='Renda dos 10% mais ricos', impacto='bolso',
             como='Serve de referência para comparar o topo com a base da renda; não conta ponto.',
             fonte='sidra', crit=None, num=(7455, 8557), fmt={'prefixo': 'R$ ', 'casas': 0}, ancora='cap-bolso'),
 'H15': dict(slug='saude-educacao', titulo='Quanto foi gasto com saúde e educação?', tema='servicos', tc='Saúde e educação', impacto='servicos',
             como='Financia hospitais, postos, escolas e universidades; gastar mais não garante, sozinho, serviço melhor.',
             fonte='tesouro', crit=None, num=(327.2, 384.8), fmt={'prefixo': 'R$ ', 'casas': 1, 'sufixo': ' bi/ano'}, ancora='cap-gasto',
             resultado='sem-placar', nota='Em R$ de dez/2025 · sem placar: gastar mais não é, sozinho, melhor'),
 'H16': dict(slug='investimentos', titulo='Quanto foi investido em obras e equipamentos?', tema='contas', tc='Investimentos', impacto='economia',
             como='São estradas, obras e equipamentos públicos; somam cerca de 2% do gasto nos dois governos.',
             fonte='tesouro', crit=None, num=(59.1, 72.9), fmt={'prefixo': 'R$ ', 'casas': 1, 'sufixo': ' bi/ano'}, ancora='cap-gasto',
             resultado='sem-placar', nota='Em R$ de dez/2025 · sem placar: gastar mais não é, sozinho, melhor'),
 'H17': dict(slug='assistencia-com-2020', titulo='Assistência social contando 2020', tema='protecao', tc='Assistência com 2020', impacto='servicos',
             como='Mesmo dado da assistência social, contando 2020, o ano do Auxílio Emergencial.',
             fonte='tesouro', crit='maior', num=(282.1, 293.5), fmt={'prefixo': 'R$ ', 'casas': 1, 'sufixo': ' bi/ano'}, ancora='cap-gasto',
             selo='gastou mais', variante_de='H04', nota='Leitura alternativa da comparação nº 4 (não conta de novo) · em R$ de dez/2025',
             obs='Coerência H04 × H17 (96-revisao-dados §2, opção a): H04 é vitória pelo critério do placar; H17 é a mesma pergunta com 2020, vitória-variante apertada.'),
 'H18': dict(slug='previdencia', titulo='Gasto com Previdência', tema='protecao', tc='Previdência', impacto='servicos',
             como='Paga aposentadorias e pensões; cresce com o envelhecimento da população, por isso não conta ponto.',
             fonte='tesouro', crit=None, num=(1007.8, 1087.6), fmt={'prefixo': 'R$ ', 'casas': 1, 'sufixo': ' bi/ano'}, ancora='cap-gasto'),
 'H19': dict(slug='pessoal', titulo='Gasto com a folha de pessoal', tema='contas', tc='Folha de pessoal', impacto='economia',
             como='Paga os servidores federais (professores, médicos, policiais); sozinho, não diz se o serviço melhorou.',
             fonte='tesouro', crit=None, num=(407.6, 392.6), fmt={'prefixo': 'R$ ', 'casas': 1, 'sufixo': ' bi/ano'}, ancora='cap-gasto'),
 'H20': dict(slug='juros-orcamento', titulo='Juros no orçamento federal (outra conta)', tema='juros', tc='Juros no orçamento', impacto='economia',
             como='Outra forma de contar os juros (só a União, pelo orçamento); o placar usa a conta do Banco Central.',
             fonte='tesouro', crit=None, num=(362.9, 331.3), fmt={'prefixo': 'R$ ', 'casas': 1, 'sufixo': ' bi/ano'}, ancora='cap-gasto'),
 'H21': dict(slug='gasto-dentro-do-mandato', titulo='Quanto o gasto cresceu dentro de cada mandato?', tema='contas', tc='Gasto no mandato', impacto='economia',
             como='Mostra o ritmo do gasto dentro de cada mandato; as janelas têm tamanhos diferentes, por isso não conta ponto.',
             fonte='tesouro', crit=None, num=(8.6, 9.5), fmt={'casas': 1, 'sufixo': '%', 'sinal': True}, ancora='cap-conta', per=('2019→22', '2023→25')),
 'H22': dict(slug='gasto-pib', titulo='O gasto subiu ou caiu em relação ao PIB?', tema='contas', tc='Gasto em % do PIB', impacto='economia',
             como='Compara o gasto com o tamanho da economia: subir indica gasto crescendo mais que o PIB.',
             fonte='tesouro_pib', crit='menor', num=(-0.7, 0.7), fmt={'casas': 1, 'sufixo': ' pontos', 'sinal': True}, ancora='cap-conta',
             selo='gasto/PIB subiu menos', variante_de='H06', per=('2019→22', '2023→25'), val=('−0,7 pontos', '+0,7 pontos'),
             det=('24,0% → 23,2% do PIB', '24,3% → 25,0% do PIB'), nota='Leitura alternativa do controle do gasto (nº 6): não conta de novo',
             obs='Variante de H06 (96-revisao-dados §2): o gasto não conta duas vezes.'),
 'H23': dict(slug='divida-estados', titulo='Dívida dos estados', tema='contas', tc='Dívida dos estados', impacto='economia',
             como='É a dívida dos governos estaduais: pesa nos serviços do seu estado, mas não é gerida pelo governo federal.',
             fonte='rgf', crit=None, num=(0.78, 0.94), fmt={'prefixo': 'R$ ', 'casas': 2, 'sufixo': ' tri'}, ancora='cap-conta',
             per=('2019→22', '2023→26'), val=('R$ 0,78 tri', 'R$ 0,94 tri'), det=('R$ 0,82 → 0,78 tri (nominal)', 'R$ 0,83 → 0,94 tri (nominal, até 2026)')),
 'H24': dict(slug='juros-eua', titulo='Juros nos Estados Unidos', tema='mundo', tc='Juros nos EUA', impacto='economia',
             como='Juro alto nos EUA costuma encarecer o dólar e, por ele, combustíveis e alimentos no Brasil.',
             fonte='fed', crit=None, num=(1.1, 4.8), fmt={'casas': 1, 'sufixo': '% ao ano'}, ancora='cap-mundo'),
 'H25': dict(slug='dolar', titulo='Quanto custava o dólar?', tema='mundo', tc='Dólar', impacto='economia',
             como='Dólar mais caro encarece combustíveis, trigo e eletrônicos; reflete fatores de fora e de dentro.',
             fonte='bc', crit=None, num=(4.92, 5.32), fmt={'prefixo': 'R$ ', 'casas': 2}, ancora='cap-mundo'),
 'H26': dict(slug='juro-real-divida', titulo='Juro real que a dívida pagou', tema='juros', tc='Juro real da dívida', impacto='economia',
             como='Juro real alto faz a dívida crescer mais rápido e ocupa espaço no orçamento.',
             fonte='bc', crit=None, num=(-1.5, 4.8), fmt={'casas': 1, 'sufixo': '% ao ano', 'sinal': True}, ancora='cap-divida', card='q-juro-real'),
 'H27': dict(slug='deficit-primario', titulo='Déficit primário (gasto acima da arrecadação, sem juros)', tema='contas', tc='Déficit primário', impacto='economia',
             como='Gastar mais do que arrecada, sem contar juros, faz a dívida subir; o ano de 2020 decide o sinal.',
             fonte='nfsp', crit=None, num=(2.0, 1.0), fmt={'casas': 1, 'sufixo': '% do PIB'}, ancora='cap-divida',
             val=('déficit médio de 2,0% do PIB', 'déficit médio de 1,0% do PIB')),
 'H28': dict(slug='teste-sem-pandemia', titulo='E sem 2020–21? Crescimento, inflação e desemprego', tema='economia', tc='Teste sem pandemia', impacto=None,
             como='Refaz três contas sem os anos de pandemia, para ver se o resultado muda.',
             fonte='bc', crit=None, num=None, ancora='cap-divida', variante_de='H01,H02,H03A', resultado='sem-placar', per=('2019 e 2022', '2023–25'),
             val=('PIB 2,1% · IPCA 5,0% · desemprego 10,7%', 'PIB 3,0% · IPCA 4,6% · desemprego 6,6%'),
             obs='Teste de sensibilidade de H01–H03 (não é comparação própria, não conta ponto). Matriz: "Lula segue à frente"; só 2019: IPCA 4,3% × 4,6%.'),
 'P00': dict(slug='planos-caminho-explicito', titulo='Qual plano mais diz COMO vai fazer?', tema='planos', tc='Planos: ferramenta nomeada', impacto='panorama',
             como='Mostra se o plano nomeia a ferramenta (lei, programa, dinheiro), não se a proposta é boa.',
             fonte='tse26', crit='maior', num=(1, 11), fmt={'casas': 0, 'sufixo': ' de 19'}, ancora='placar', card='placar', temas_p=None,
             nota='Programas já em execução contam como caminho, o que favorece quem governa'),
 'P00b': dict(slug='planos-algum-caminho', titulo='Planos com algum caminho (ferramenta ou parcial)', tema='planos', tc='Planos: algum caminho', impacto='panorama',
              como='Versão mais branda da mesma régua: conta também o caminho parcial.',
              fonte='tse26', crit='maior', num=(13, 17), fmt={'casas': 0, 'sufixo': ' de 19'}, ancora='placar', variante_de='P00', temas_p=None, algum=True),
 'P01': dict(slug='planos-bolso', titulo='Planos: impostos, trabalho, renda e casa', tema='planos', tc='Planos: bolso', impacto='panorama',
             como='Diz se o plano explica como vai mexer em imposto, trabalho e renda.',
             fonte='tse26', crit='maior', num=(0, 2), fmt={'casas': 0, 'sufixo': ' de 5'}, ancora='cap-bolso', card='cap-bolso', temas_p=['bolso']),
 'P02': dict(slug='planos-seguranca', titulo='Planos: segurança e crime organizado', tema='planos', tc='Planos: segurança', impacto='panorama',
             como='Diz se o plano explica como vai agir contra o crime.',
             fonte='tse26', crit='maior', num=(0, 2), fmt={'casas': 0, 'sufixo': ' de 3'}, ancora='cap-seguranca', card='cap-seguranca', temas_p=['seguranca']),
 'P03': dict(slug='planos-servicos', titulo='Planos: saúde, educação e serviços', tema='planos', tc='Planos: serviços', impacto='panorama',
             como='Diz se o plano explica como vai mudar saúde, escola e outros serviços.',
             fonte='tse26', crit='maior', num=(0, 4), fmt={'casas': 0, 'sufixo': ' de 5'}, ancora='cap-servicos', card='cap-servicos', temas_p=['servicos']),
 'P04': dict(slug='planos-economia', titulo='Planos: economia e crescimento', tema='planos', tc='Planos: economia', impacto='panorama',
             como='Diz se o plano explica como vai fazer a economia crescer.',
             fonte='tse26', crit='maior', num=(1, 2), fmt={'casas': 0, 'sufixo': ' de 4'}, ancora='cap-economia', card='cap-economia', temas_p=['economia']),
 'P05': dict(slug='planos-ambiente', titulo='Planos: meio ambiente e instituições', tema='planos', tc='Planos: ambiente', impacto='panorama',
             como='Diz se o plano explica como vai agir no meio ambiente e nas instituições.',
             fonte='tse26', crit=None, num=(0, 1), fmt={'casas': 0, 'sufixo': ' de 2'}, ancora='cap-ambiente', card='cap-ambiente', temas_p=['ambiente'],
             resultado='sem-placar', obs='Força "não comparável" (2 cartões; o resultado depende da régua): sem placar.'),
 'B00': dict(slug='promessas-cumpridas', titulo='Quantas promessas do plano foram cumpridas?', tema='promessas', tc='Promessas cumpridas', impacto='panorama',
             como='Compara o que cada plano registrado no TSE prometeu com o que foi feito.',
             fonte='tse_bal', crit='maior', num=(15.2, 35.3), fmt={'casas': 1, 'sufixo': '%'}, ancora='placar', card='q-cumpridas', temas_b=None,
             nota='Mandato de Lula em curso (corte em 30/09/2026)', det=('5 de 33 (mandato fechado)', '12 de 34 (em curso, até 30/09/2026)')),
 'B00b': dict(slug='promessas-cumpridas-verificaveis', titulo='Cumpridas, contando só as promessas verificáveis', tema='promessas', tc='Cumpridas entre as verificáveis', impacto='panorama',
              como='Mesma conta, sem as promessas que não têm como ser checadas em fonte oficial.',
              fonte='tse_bal', crit='maior', num=(22.7, 38.7), fmt={'casas': 1, 'sufixo': '%'}, ancora='placar', card='q-verificaveis', variante_de='B00',
              temas_b=None, excluir_na=True, det=('5 de 22', '12 de 31')),
 'B00c': dict(slug='promessas-cumpridas-ou-parciais', titulo='Cumpridas ou parciais', tema='promessas', tc='Cumpridas ou parciais', impacto='panorama',
              como='Mesma conta, somando as promessas cumpridas em parte.',
              fonte='tse_bal', crit='maior', num=(27.3, 50.0), fmt={'casas': 1, 'sufixo': '%'}, ancora='placar', card='q-cumpridas-parciais', variante_de='B00',
              temas_b=None, okmid=True, det=('9 de 33', '17 de 34')),
 'B01': dict(slug='promessas-impostos-trabalho', titulo='Promessas de impostos e trabalho cumpridas', tema='promessas', tc='Promessas: impostos e trabalho', impacto='panorama',
             como='São as promessas sobre imposto, emprego e renda.',
             fonte='tse_bal', crit='maior', num=(0, 71), fmt={'casas': 0, 'sufixo': '%'}, ancora='cap-bolso', card='cap-bolso', temas_b=['impostos', 'trabalho']),
 'B02': dict(slug='promessas-servicos', titulo='Promessas de proteção social, saúde e educação cumpridas', tema='promessas', tc='Promessas: serviços', impacto='panorama',
             como='São as promessas sobre os serviços e programas que as famílias usam.',
             fonte='tse_bal', crit='maior', num=(0, 33), fmt={'casas': 0, 'sufixo': '%'}, ancora='cap-servicos', card='cap-servicos', temas_b=['social', 'saude', 'educacao']),
 'B03': dict(slug='promessas-estado-infra', titulo='Promessas de Estado e infraestrutura cumpridas', tema='promessas', tc='Promessas: Estado e infraestrutura', impacto='panorama',
             como='São as promessas sobre reformas, privatizações, energia e obras.',
             fonte='tse_bal', crit='maior', num=(38, 14), fmt={'casas': 0, 'sufixo': '%'}, ancora='cap-estado', card='cap-estado', temas_b=['estado', 'infraenergia']),
 'B04': dict(slug='promessas-seguranca-instituicoes', titulo='Promessas de segurança, meio ambiente e instituições cumpridas', tema='promessas', tc='Promessas: segurança e instituições', impacto='panorama',
             como='São as promessas sobre segurança, meio ambiente e instituições.',
             fonte='tse_bal', crit='maior', num=(0, 25), fmt={'casas': 0, 'sufixo': '%'}, ancora='cap-seguranca', card='cap-seguranca', temas_b=['seguranca', 'meioambiente', 'instituicoes']),
 'B05': dict(slug='promessas-nao-cumpridas', titulo='Promessas não cumpridas', tema='promessas', tc='Não cumpridas', impacto='panorama',
             como='Não dá para comparar: um mandato terminou e o outro está em curso.',
             fonte='tse_bal', crit=None, num=(39.4, 5.9), fmt={'casas': 1, 'sufixo': '%'}, ancora='placar', resultado='nao-comparavel', catalogo=False,
             temas_b=None, dest='no', obs='Fora do catálogo: decisão do dono (item 3) tira "não cumpridas" do veredito.'),
}
# Itens a descontinuar (ref -> {'substituido_por': ref_novo}); o id fica no livro-razão para sempre.
DESCONTINUAR = {'H03': {'substituido_por': 'H03A'}}

# Linhas que não estão na matriz 10 (mesmo formato dela), em geral substitutas de itens descontinuados.
EXTRA_ROWS = [
    {'id': 'H03A', 'pagina': '/', 'secao': 'placar; cap-motor; cap-bolso', 'tema': 'Emprego', 'no_placar': True,
     'metrica': 'Taxa de desocupação anual do IBGE (PNAD Contínua, SIDRA 4562), média simples dos anos de cada governo',
     'unidade': '% da força de trabalho', 'periodo_a': '2019-2022 (média anual)', 'periodo_b': '2023-2025 (média anual)',
     'valor_a': '12,3%', 'valor_b': '6,6%', 'vencedor': 'Governo Lula', 'criterio': 'menor é melhor', 'forca': 'clara',
     'fonte': 'public/dados/ibge/ibge_sidra_4562_taxa_desocupacao_anual.json',
     'ressalva': 'Sem 2020–21 (pandemia): 10,7% × 6,6%; só 2019: 11,8% × 6,6%.',
     'como_reproduzido': 'SIDRA 4562 (taxa de desocupação anual): 2019 11,8; 2020 13,7; 2021 14,0; 2022 9,6 → média 12,3 (12,275); '
                         '2023 7,7; 2024 6,6; 2025 5,6 → média 6,6 (6,633). Sem 2020–21: 10,7. Substitui a média dos trimestres móveis (SGS 24369), comparação nº 3.'},
]


# ------------------------------------------------------------------ utilidades
def sha256(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def impressao(it):
    """Impressão digital da PERGUNTA: muda só quando muda a métrica, a unidade, o critério ou o período."""
    base = '|'.join([it.get('metrica', ''), it.get('unidade', ''), str(it.get('criterio')),
                     it['lados']['b'].get('periodo', ''), it['lados']['l'].get('periodo', '')])
    return hashlib.sha256(base.encode('utf-8')).hexdigest()[:16]


def pontos(s):
    return re.sub(r'\bp\.p\.', 'pontos', s or '')


def arquivos(fonte_txt):
    out, seen = [], set()
    for m in re.finditer(r'(?:public/)?dados/[\w./-]+\.(?:jsonl|json|pdf|zip|xlsx|csv)\b', fonte_txt):
        rel = m.group(0).replace('public/', '')
        if rel not in seen and (PUB / rel).exists():
            seen.add(rel); out.append({'arquivo': '/' + rel, 'sha256': sha256(PUB / rel)})
    for name in re.findall(r'\b(20\d\dBR\d+(?:_01)?\.pdf)', fonte_txt):
        rel = 'dados/tse/' + name
        if rel not in seen and (PUB / rel).exists():
            seen.add(rel); out.append({'arquivo': '/' + rel, 'sha256': sha256(PUB / rel)})
    if 'IPCA' in fonte_txt and 'dados/banco-central/bcb_sgs_series.json' not in seen:
        rel = 'dados/banco-central/bcb_sgs_series.json'
        out.append({'arquivo': '/' + rel, 'sha256': sha256(PUB / rel), 'papel': 'deflator (IPCA, SGS 433)'})
    return out


def embutido(pagina, elem_id):
    t = (PUB / pagina).read_text(encoding='utf-8')
    m = re.search(r'<script id="%s" type="application/json">(.*?)</script>' % elem_id, t, re.S)
    return json.loads(m.group(1)) if m else []


CAT_PROP = [{'id': 'ok', 'nome': 'Ferramenta nomeada', 'tipo': 'cheio', 'cor': '#2f7d55'}, {'id': 'mid', 'nome': 'Parcial', 'tipo': 'claro', 'cor': '#e2a63c'},
            {'id': 'no', 'nome': 'Só intenção', 'tipo': 'vazio'}]
CAT_BAL = [{'id': 'ok', 'nome': 'Cumprida', 'tipo': 'cheio', 'cor': '#2f7d55'}, {'id': 'mid', 'nome': 'Parcial', 'tipo': 'claro', 'cor': '#e2a63c'},
           {'id': 'run', 'nome': 'Em andamento', 'tipo': 'listrado', 'cor': '#8da597'}, {'id': 'no', 'nome': 'Não cumprida', 'tipo': 'neutro', 'cor': '#e3867f'},
           {'id': 'na', 'nome': 'Sem evidência oficial', 'tipo': 'vazio'}]


def contagens_propostas(meta):
    data = embutido('propostas/index.html', 'data-catalogo')
    lado = {'flavio': 'b', 'lula': 'l'}
    c = {'b': {k['id']: 0 for k in CAT_PROP}, 'l': {k['id']: 0 for k in CAT_PROP}}
    for it in data:
        if meta['temas_p'] is None or it['tema'] in meta['temas_p']:
            c[lado[it['cand']]][it['rot']] += 1
    cats = CAT_PROP
    if meta.get('algum'):
        cats = [{'id': 'okmid', 'nome': 'Algum caminho (ferramenta ou parcial)', 'tipo': 'cheio', 'cor': '#2f7d55'}, {'id': 'no', 'nome': 'Só intenção', 'tipo': 'vazio'}]
        c = {k: {'okmid': v['ok'] + v['mid'], 'no': v['no']} for k, v in c.items()}
        return {'categorias': cats, 'contagens': c, 'destaque': 'okmid'}
    return {'categorias': cats, 'contagens': c, 'destaque': 'ok'}


def contagens_balanco(meta):
    data = embutido('balanco/index.html', 'data-promessas')
    lado = {'bolsonaro': 'b', 'lula': 'l'}
    c = {'b': {k['id']: 0 for k in CAT_BAL}, 'l': {k['id']: 0 for k in CAT_BAL}}
    for it in data:
        if meta['temas_b'] is None or it['tema'] in meta['temas_b']:
            c[lado[it['cand']]][it['cat']] += 1
    if meta.get('okmid'):
        cats = [{'id': 'okmid', 'nome': 'Cumprida ou parcial', 'tipo': 'cheio', 'cor': '#2f7d55'}] + [k for k in CAT_BAL if k['id'] not in ('ok', 'mid')]
        c = {k: dict({'okmid': v['ok'] + v['mid']}, **{x: v[x] for x in ('run', 'no', 'na')}) for k, v in c.items()}
        return {'categorias': cats, 'contagens': c, 'destaque': 'okmid'}
    return {'categorias': CAT_BAL, 'contagens': c, 'destaque': meta.get('dest', 'ok'), 'excluir': ['na'] if meta.get('excluir_na') else []}


def pct(c, destaque, excluir=()):
    tot = sum(v for k, v in c.items() if k not in excluir)
    return 100.0 * c[destaque] / tot if tot else 0.0


def resultado_de(vencedor_txt, forcado=None):
    if forcado:
        return forcado, None
    v = vencedor_txt
    if v.startswith('sem vencedor'):
        return ('nao-comparavel' if 'não comparável' in v else 'contexto'), None
    if 'Bolsonaro' in v or 'Flávio' in v:
        return 'vitoria', 'b'
    if 'Lula' in v:
        return 'vitoria', 'l'
    raise SystemExit('vencedor não reconhecido: %s' % v)


def forca_de(f):
    return {'clara': 'clara', 'apertada': 'apertada'}.get(f, 'depende-da-regua')


# ------------------------------------------------------------------ itens da matriz
def item_da_matriz(row):
    ref = row['id']; meta = META[ref]
    pag = row['pagina']; pid = PAGINA[pag][0]
    res, venc = resultado_de(row['vencedor'], meta.get('resultado'))
    per = meta.get('per') or PER_CURTO[pid]
    lados = {}
    for i, k in enumerate(('b', 'l')):
        L = dict(LADOS[pid][k])
        L['periodo'] = row['periodo_a' if k == 'b' else 'periodo_b']
        L['valor'] = pontos(row['valor_a' if k == 'b' else 'valor_b'])
        lados[k] = L
    if meta.get('val'):
        lados['b']['valor'], lados['l']['valor'] = meta['val']
    if meta.get('det'):
        for k, d in zip(('b', 'l'), meta['det']):
            lados[k]['valor'] = re.sub(r'\s*\(.*\)\s*$', '', lados[k]['valor']) if not meta.get('val') else lados[k]['valor']
            lados[k]['detalhe'] = d
    grafico = None
    if 'temas_p' in meta:
        g = contagens_propostas(meta)
        tot = {k: sum(v.values()) for k, v in g['contagens'].items()}
        for k in ('b', 'l'):
            n = g['contagens'][k][g['destaque']]
            lados[k]['valor'] = '%d de %d' % (n, tot[k])
            outros = [c for c in g['categorias'] if c['id'] != g['destaque']]
            lados[k]['detalhe'] = ' · '.join('%s %d' % (c['nome'].lower(), g['contagens'][k][c['id']]) for c in outros)
        grafico = dict(tipo='promessas', valores={'b': meta['num'][0], 'l': meta['num'][1]}, formato=meta['fmt'], **g)
    elif 'temas_b' in meta:
        g = contagens_balanco(meta)
        exc = g.get('excluir', [])
        for k in ('b', 'l'):
            c = g['contagens'][k]
            tot = sum(v for x, v in c.items() if x not in exc)
            p = pct(c, g['destaque'], exc)
            casas = meta['fmt']['casas']
            lados[k]['valor'] = ('%.*f%%' % (casas, p)).replace('.', ',')
            lados[k]['detalhe'] = lados[k].get('detalhe') or '%d de %d' % (c[g['destaque']], tot)
        grafico = dict(tipo='promessas', valores={'b': meta['num'][0], 'l': meta['num'][1]}, formato=meta['fmt'], **g)
    elif meta.get('num'):
        grafico = {'tipo': 'duelo', 'valores': {'b': meta['num'][0], 'l': meta['num'][1]}, 'formato': meta.get('fmt', {})}
    it = {
        'ref': ref, 'slug': meta['slug'], 'status': 'ativo', 'origem': 'matriz',
        'titulo': meta['titulo'], 'tema': meta['tema'], 'tema_curto': meta['tc'], 'tema_matriz': row['tema'],
        'pagina': pag, 'pagina_id': pid, 'analise': PAGINA[pag][1], 'ancora': meta['ancora'], 'ancora_card': meta.get('card'),
        'no_placar': bool(row['no_placar']) and pid == 'comparativo', 'bloco_placar': meta.get('bloco'),
        'catalogo': meta.get('catalogo', True),
        'metrica': row['metrica'], 'unidade': pontos(row['unidade']), 'lados': lados,
        'periodo_curto': {'b': per[0], 'l': per[1]},
        'resultado': res, 'vencedor': venc,
        'criterio': meta['crit'], 'criterio_texto': row['criterio'],
        'forca': forca_de(row['forca']) if res == 'vitoria' else None,
        'selo': (meta.get('selo') or SELO.get(pid) or 'à frente') if res == 'vitoria' else None,
        'ressalva': pontos(meta.get('ress') or row['ressalva']),
        'nota_visual': meta.get('nota'),
        'impacto': meta['impacto'], 'como_chega': meta['como'],
        'fonte': FONTE_PUB[meta['fonte']], 'fonte_detalhe': row['fonte'], 'arquivos': arquivos(row['fonte']),
        'como_calculamos': pontos(row['como_reproduzido']),
        'grafico': grafico, 'dados_ate': DADOS_ATE[pid] if ref != 'H07' else 'ago/2026',
        'atualizado_em': HOJE,
    }
    if res != 'vitoria' and row['vencedor'] and not row['vencedor'].startswith('sem vencedor'):
        it['vencedor_matriz'] = row['vencedor']
    if meta.get('variante_de'):
        it['variante_de'] = meta['variante_de'].split(',')
    if meta.get('grupos'):
        it['grupos'] = meta['grupos']
    if meta.get('obs'):
        it['revisao'] = meta['obs']
    return it


# ------------------------------------------------------------------ novos indicadores (97-novos-indicadores.json)
LIMITE_BYTES = 5 * 1024 * 1024   # arquivos maiores não vão para public/dados/ (ficam como fonte externa, com URL e sha256)
EXTRAS_NOVOS = ('o_que_mudaria', 'recortes', 'serie', 'grupos', 'atual_2026', 'fonte_url', 'pre_registro', 'variantes_agrupadas',
                'variante', 'manchete', 'revisao', 'fonte_original')


def _url_do_arquivo(nome, urls):
    base = nome.rsplit('.', 1)[0].lower()
    for u in urls or []:
        ul = u.lower()
        if nome.lower() in ul or base in ul or base.replace('_', '-') in ul:
            return u
    return (urls or [None])[0]


def item_novo(row, dados_dir):
    """Item do 97-novos-indicadores.json (formato do registro). Copia os arquivos de dados de --dados para
    public/dados/ conferindo o sha256; arquivo > 5 MB não é copiado e fica como fonte externa (url + sha256)."""
    ref = row.get('ref')
    if not ref or not row.get('slug'):
        raise SystemExit('novo indicador sem ref/slug: %r' % row.get('id'))
    lados = row['lados']
    for k in ('b', 'l'):
        for p, v in LADOS['comparativo'][k].items():
            lados[k].setdefault(p, v)
        lados[k]['valor'] = pontos(str(lados[k]['valor']))
    arqs = []
    for a in row.get('arquivos', []):
        dest = a['arquivo'].lstrip('/')
        dest = dest if dest.startswith('dados/') else 'dados/' + dest
        src = Path(dados_dir or '.') / dest[len('dados/'):]
        alvo = PUB / dest
        reg = {k: v for k, v in a.items() if k not in ('arquivo',)}
        reg['arquivo'] = '/' + dest
        if src.exists():
            h = sha256(src)
            if a.get('sha256') and h != a['sha256']:
                raise SystemExit('%s: sha256 de %s não confere com o informado' % (ref, src))
            reg['sha256'] = h
            if src.stat().st_size > LIMITE_BYTES:
                reg['externo'] = True
                reg['tamanho_mb'] = round(src.stat().st_size / 1048576, 1)
                reg['url'] = (a.get('fonte_original') or {}).get('url') or _url_do_arquivo(src.name, row.get('fonte_url'))
                if alvo.exists():
                    alvo.unlink()
            else:
                alvo.parent.mkdir(parents=True, exist_ok=True)
                if not alvo.exists() or sha256(alvo) != h:
                    shutil.copyfile(src, alvo)
        elif alvo.exists():
            reg['sha256'] = sha256(alvo)
        elif a.get('fonte_original') or a.get('externo'):
            reg['externo'] = True
        else:
            raise SystemExit('%s: arquivo de dados não encontrado: %s' % (ref, src))
        arqs.append(reg)
    impacto = row.get('impacto')
    impacto = 'economia' if impacto == 'contas' else impacto
    pid = row.get('pagina_id')
    it = {
        'ref': ref, 'slug': row['slug'], 'status': row.get('status', 'ativo'), 'origem': row.get('origem') or 'novos-indicadores',
        'titulo': row['titulo'], 'tema': row['tema'], 'tema_curto': row.get('tema_curto') or row['titulo'], 'tema_matriz': row.get('tema_matriz'),
        # só no catálogo (decisão do dono, item 9): página /comparacoes/, análise "Governos"
        'pagina': '/comparacoes/', 'pagina_id': 'comparativo' if pid in (None, 'comparacoes', 'comparativo') else pid,
        'analise': 'Governos', 'ancora': None, 'ancora_card': None,
        'no_placar': False, 'bloco_placar': None, 'catalogo': row.get('catalogo', True),
        'metrica': row.get('metrica', ''), 'unidade': pontos(row.get('unidade', '')), 'lados': lados,
        'periodo_curto': row.get('periodo_curto') or {'b': '2019–22', 'l': '2023–25'},
        'resultado': row['resultado'], 'vencedor': row.get('vencedor'),
        'criterio': row.get('criterio'), 'criterio_texto': row.get('criterio_texto'),
        'forca': row.get('forca') if row['resultado'] == 'vitoria' else None,
        'selo': row.get('selo') if row['resultado'] == 'vitoria' else None,
        'ressalva': pontos(row.get('ressalva') or ''), 'nota_visual': row.get('nota_visual'),
        'impacto': impacto, 'como_chega': row.get('como_chega', ''),
        'fonte': row.get('fonte', ''), 'fonte_detalhe': row.get('fonte_detalhe', ''),
        'arquivos': arqs, 'como_calculamos': row.get('como_calculamos', ''),
        'grafico': row.get('grafico'), 'dados_ate': row.get('dados_ate', ''), 'atualizado_em': row.get('atualizado_em') or HOJE,
        'id_provisorio': row.get('id'),
    }
    for k in EXTRAS_NOVOS:
        if row.get(k) is not None:
            it[k] = row[k]
    if row.get('variante_de'):
        it['variante_de'] = row['variante_de'] if isinstance(row['variante_de'], list) else [row['variante_de']]
    return it


# ------------------------------------------------------------------ montagem
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('matriz')
    ap.add_argument('--novos')
    ap.add_argument('--dados')
    a = ap.parse_args()

    matriz = json.loads(Path(a.matriz).read_text(encoding='utf-8'))
    itens = [item_da_matriz(r) for r in matriz + EXTRA_ROWS]
    # ordem de leitura: a do arquivo de origem; o substituto ocupa o lugar do item que substitui
    pos = {it['ref']: i for i, it in enumerate(itens)}
    for i, it in enumerate(itens):
        it['ordem'] = i
    for velho, d in DESCONTINUAR.items():
        for it in itens:
            if it['ref'] == d.get('substituido_por') and velho in pos:
                it['ordem'] = pos[velho] + 0.5
    if a.novos:
        novos = json.loads(Path(a.novos).read_text(encoding='utf-8'))
        if isinstance(novos, dict):
            TEMAS.update(novos.get('temas_novos') or {})
            novos = novos.get('itens') or novos.get('indicadores') or []
        base = len(itens)
        novos_itens = [item_novo(r, a.dados) for r in novos]
        for i, it in enumerate(novos_itens):
            it['ordem'] = base + i
        itens += novos_itens

    # livro-razão: append-only
    livro = json.loads(LIVRO.read_text(encoding='utf-8')) if LIVRO.exists() else {'ids': []}
    if not livro['ids'] and OUT.exists():  # primeira vez: herda os ids do registro v1
        for c in json.loads(OUT.read_text(encoding='utf-8')).get('comparacoes', []):
            livro['ids'].append({'id': c['id'], 'ref': c['ref'], 'slug': c['slug'], 'pergunta': None, 'criado_em': c.get('atualizado_em', HOJE)})
    by_ref = {e['ref']: e for e in livro['ids']}
    proximo = max([e['id'] for e in livro['ids']] + [0]) + 1
    erros = []
    refs = set()
    for it in itens:
        refs.add(it['ref'])
        fp = impressao(it)
        e = by_ref.get(it['ref'])
        if e:
            it['id'] = e['id']
            if e['slug'] != it['slug']:
                erros.append('%s: o slug mudou (%s → %s); slugs são permanentes' % (it['ref'], e['slug'], it['slug']))
            if e.get('pergunta') is None:
                e['pergunta'] = fp
            elif e['pergunta'] != fp:
                erros.append('%s (id %d): a PERGUNTA mudou (métrica/unidade/critério/período). Crie um item novo e '
                             'descontinue este (DESCONTINUAR), em vez de mudar o id %d.' % (it['ref'], e['id'], e['id']))
        else:
            it['id'] = proximo
            e = {'id': proximo, 'ref': it['ref'], 'slug': it['slug'], 'pergunta': fp, 'criado_em': HOJE}
            livro['ids'].append(e); by_ref[it['ref']] = e
            proximo += 1
        it['pergunta'] = fp
    for it in itens:
        if it.get('id_provisorio') and it['id_provisorio'] != it['id']:
            print('aviso: %s recebeu o id %d (provisório era %d)' % (it['ref'], it['id'], it['id_provisorio']))
        it.pop('id_provisorio', None)
    if erros:
        print('ERRO no livro-razão de ids:\n  ' + '\n  '.join(erros))
        return 2
    ids = {i['ref']: i['id'] for i in itens}
    # itens do livro que sumiram da origem: continuam no registro como descontinuados
    old = {c['ref']: c for c in json.loads(OUT.read_text(encoding='utf-8')).get('comparacoes', [])} if OUT.exists() else {}
    retirados = []
    for e in livro['ids']:
        if e['ref'] not in refs:
            c = dict(old.get(e['ref']) or {'ref': e['ref'], 'slug': e['slug'], 'titulo': e['ref']}, id=e['id'], status='descontinuado', catalogo=False)
            itens.append(c); retirados.append(e['id'])
    for it in itens:
        if it['ref'] in DESCONTINUAR:
            it['status'] = 'descontinuado'; it['catalogo'] = False
            sub = DESCONTINUAR[it['ref']].get('substituido_por')
            if sub:
                it['substituido_por'] = ids[sub]
            retirados.append(it['id'])
        if 'variante_de' in it:
            it['variante_de'] = [r if isinstance(r, int) else ids.get(r, r) for r in it['variante_de']]
    itens.sort(key=lambda i: i['id'])
    reg = {
        'versao': 2,
        'gerado_em': HOJE,
        'descricao': 'Registro único das comparações do site (governos Bolsonaro × Lula; planos 2026; promessas). '
                     'IDs permanentes: nunca mudam nem são reaproveitados (livro-razão em /dados/comparacoes-ids.json). '
                     'Usado pela página /comparacoes/, pelas estrelas das páginas e pelos links /c/1-3-5.',
        'regra_ids': 'id inteiro sequencial; permanente; mudar a pergunta exige id novo; item retirado vira "descontinuado" e o id vai para ids_retirados.',
        'proximo_id': proximo,
        'ids_retirados': sorted(set(retirados)),
        'config': CONFIG,
        'impacto_niveis': IMPACTO,
        'impacto_nota': NOTA_IMPACTO,
        'temas': TEMAS,
        'paginas': {k: {'id': v[0], 'nome': v[1]} for k, v in PAGINA.items()},
        'comparacoes': itens,
    }
    livro_out = {
        'descricao': 'Livro-razão APPEND-ONLY dos IDs das comparações: uma linha por id, nunca removida nem alterada. '
                     '"pergunta" = impressão digital (sha256, 16 hex) de métrica|unidade|critério|período de cada lado.',
        'ids': sorted(livro['ids'], key=lambda e: e['id']),
    }
    OUT.write_text(json.dumps(reg, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    LIVRO.write_text(json.dumps(livro_out, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print('ok: %d comparações -> %s · livro-razão com %d ids (proximo_id=%d)' % (len(itens), OUT.relative_to(ROOT), len(livro_out['ids']), proximo))
    return 0


if __name__ == '__main__':
    sys.exit(main())
