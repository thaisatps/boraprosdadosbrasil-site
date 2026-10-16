/* cards-home.js: séries (series.js) + definições dos cards da home (home.js), do agente de data-viz. Gerado por cópia; não editar à mão. */
/* séries mês a mês "desde a posse" (índice 0 = 1º mês) e anuais; geradas por cálculo sobre public/dados */
var SERIES = {"origem": "Cálculos sobre public/dados (BCB SGS 433, 13762, 24369, 5727−5793; IBGE SIDRA 7435, 7531) e mundo-data (public/index.html). Régua: matriz 10.", "ipca": {"b": [0.0, 0.32, 0.75, 1.51, 2.09, 2.22, 2.23, 2.42, 2.54, 2.49, 2.6, 3.12, 4.31, 4.53, 4.79, 4.86, 4.53, 4.14, 4.41, 4.78, 5.04, 5.71, 6.62, 7.57, 9.02, 9.29, 10.23, 11.26, 11.6, 12.53, 13.12, 14.21, 15.2, 16.54, 18.0, 19.12, 19.99, 20.63, 21.85, 23.83, 25.14, 25.73, 26.57, 25.71, 25.26, 24.89, 25.63, 26.15, 26.93], "l": [0.0, 0.53, 1.37, 2.09, 2.72, 2.95, 2.87, 2.99, 3.23, 3.5, 3.75, 4.04, 4.62, 5.06, 5.93, 6.1, 6.51, 7.0, 7.22, 7.63, 7.61, 8.08, 8.68, 9.11, 9.68, 9.85, 11.29, 11.91, 12.39, 12.69, 12.96, 13.25, 13.13, 13.67, 13.77, 13.98, 14.35, 14.73, 15.53, 16.55, 17.33, 18.01, 18.2, 18.28, 17.9]}, "dbgg": {"b": [0.0, 0.17, 0.25, 1.44, 1.85, 1.28, 1.4, 1.56, 2.28, 1.33, 0.52, 0.93, -0.83, -0.52, -0.12, 1.51, 2.76, 4.68, 7.6, 8.23, 10.56, 12.15, 12.39, 11.69, 11.67, 11.64, 11.6, 9.83, 7.35, 6.18, 5.33, 4.98, 4.37, 4.35, 4.25, 2.95, 2.04, 1.73, 1.65, 1.13, 1.06, 0.41, 0.34, -0.03, -0.7, -1.12, -1.57, -2.32, -3.59], "l": [0.0, -0.3, 0.09, -0.14, -0.11, 0.43, 0.29, 0.8, 1.21, 1.33, 1.64, 1.64, 2.15, 2.79, 3.13, 3.34, 3.47, 3.99, 5.0, 5.53, 5.68, 5.41, 5.7, 5.82, 4.59, 3.8, 4.1, 3.87, 3.94, 4.07, 4.62, 5.5, 5.63, 6.16, 6.61, 7.27, 6.96, 7.02, 7.45, 8.2, 8.42, 9.36, 10.27, 10.88, 11.18]}, "desemprego": {"b": [12.2, 12.5, 12.8, 12.6, 12.4, 12.1, 11.9, 11.9, 11.9, 11.7, 11.3, 11.1, 11.3, 11.7, 12.4, 12.7, 13.1, 13.6, 14.1, 14.8, 14.9, 14.6, 14.3, 14.2, 14.4, 14.6, 14.9, 14.8, 14.7, 14.2, 13.7, 13.2, 12.7, 12.1, 11.6, 11.1, 11.2, 11.2, 11.1, 10.5, 9.8, 9.3, 9.1, 8.9, 8.7, 8.3, 8.1, 7.9], "l": [8.4, 8.6, 8.8, 8.5, 8.3, 8.0, 7.9, 7.8, 7.7, 7.6, 7.5, 7.4, 7.6, 7.8, 7.9, 7.5, 7.1, 6.9, 6.8, 6.6, 6.4, 6.2, 6.1, 6.2, 6.5, 6.8, 7.0, 6.6, 6.2, 5.8, 5.6, 5.6, 5.6, 5.4, 5.2, 5.1, 5.4, 5.8, 6.1, 5.8, 5.6, 5.4, 5.3, 5.3]}, "juros12m": {"b": [5.29, 5.28, 5.43, 5.48, 5.37, 4.98, 4.98, 4.82, 4.94, 5.0, 5.02, 4.97, 5.16, 5.12, 5.26, 5.11, 4.8, 4.84, 4.55, 4.33, 4.49, 4.66, 4.16, 4.1, 4.12, 4.08, 3.92, 3.5, 3.6, 3.4, 3.82, 3.9, 4.03, 4.29, 4.68, 4.98, 4.7, 4.65, 4.4, 5.28, 5.34, 6.21, 6.11, 5.93, 6.04, 5.79, 5.82, 5.82], "l": [6.11, 6.43, 6.7, 6.33, 6.63, 6.05, 6.05, 6.46, 6.53, 6.67, 6.56, 6.56, 6.77, 6.73, 6.7, 6.92, 6.94, 7.38, 7.61, 7.43, 7.08, 7.45, 7.83, 8.07, 7.69, 7.74, 7.77, 7.65, 7.74, 7.42, 7.6, 7.6, 7.86, 7.84, 7.76, 7.91, 8.05, 8.06, 8.33, 8.4, 8.47, 8.8, 8.68, 8.86]}, "selic": {"b": [6.5, 6.5, 6.5, 6.5, 6.5, 6.5, 6.5, 6.0, 5.8, 5.48, 5.0, 4.68, 4.5, 4.29, 4.04, 3.75, 3.15, 2.67, 2.25, 2.04, 2.0, 2.0, 2.0, 2.0, 2.0, 2.0, 2.34, 2.75, 3.38, 3.85, 4.25, 5.12, 5.52, 6.44, 7.75, 8.86, 9.25, 10.64, 11.23, 11.75, 12.62, 13.0, 13.25, 13.7, 13.75, 13.75, 13.75, 13.75], "l": [13.75, 13.75, 13.75, 13.75, 13.75, 13.75, 13.75, 13.28, 13.08, 12.75, 12.27, 11.96, 11.75, 11.25, 11.07, 10.75, 10.56, 10.5, 10.5, 10.5, 10.6, 10.75, 11.15, 11.9, 12.31, 13.25, 13.64, 14.25, 14.64, 14.85, 15.0, 15.0, 15.0, 15.0, 15.0, 15.0, 15.0, 15.0, 14.9, 14.74, 14.5, 14.39, 14.25, 14.04, 13.88]}, "renda": {"2019": 1894, "2020": 1788, "2021": 1635, "2022": 1806, "2023": 2013, "2024": 2103, "2025": 2264}, "gini": {"2014": 0.526, "2015": 0.524, "2016": 0.537, "2017": 0.539, "2018": 0.545, "2019": 0.543, "2020": 0.523, "2021": 0.543, "2022": 0.517, "2023": 0.517, "2024": 0.504, "2025": 0.511}};

/* Cards da HOME (/) — "a seção é o card". Números: matriz 10 (H01–H14) e 50-decisoes-dono; séries: series.js
 * (cálculo sobre public/dados e os dados embutidos na página). Cada número aparece UMA vez por card. */
(function () {
  var S = window.SERIES, P = { b: '2019–22', l: '2023–25' };
  var BASE = { atualizado: '16/10/2026' };
  function card(o) { var r = {}, k; for (k in BASE) r[k] = BASE[k]; for (k in o) r[k] = o[k]; return r; }
  function anos(a, b) { var r = []; for (var i = a; i <= b; i++) r.push(i); return r; }
  var sm = { 2019: 1389, 2020: 1391, 2021: 1331, 2022: 1386, 2023: 1443, 2024: 1472, 2025: 1518, 2026: 1572 };
  window.CARDS_HOME = [
    card({ id: 'q-crescimento', tema: 'Crescimento da economia', criterio: 'maior', valores: { b: 1.4, l: 3.0 }, detalhe: 'PIB real, média por ano', forca: 'clara',
      manchete: { valor: '3,0%', texto: 'de crescimento médio por ano no Governo Lula, contra 1,4% no Governo Bolsonaro' },
      grafico: { tipo: 'barras', titulo: 'Ano a ano de mandato', sub: 'PIB real, % sobre o ano anterior', formato: { casas: 1, sufixo: '%' }, formatoEixo: { casas: 0, sufixo: '%' }, periodos: P,
        grupos: [ { rotulo: '1º ano', b: { rot: '2019', v: 1.2 }, l: { rot: '2023', v: 3.2 } }, { rotulo: '2º ano', b: { rot: '2020', v: -3.3 }, l: { rot: '2024', v: 3.4 } },
                  { rotulo: '3º ano', b: { rot: '2021', v: 4.8 }, l: { rot: '2025', v: 2.3 } }, { rotulo: '4º ano', b: { rot: '2022', v: 3.0 }, l: { rot: '2026', v: null, vazio: 'em curso' } } ] },
      nota: 'Sem 2020–21 (pandemia): 2,1% × 3,0% ao ano.',
      fonte: 'IBGE, PIB real (Banco Central, SGS 7326)', periodo: 'média composta 2019–2022 × 2023–2025', dados: '2025',
      tabela: { cab: ['Ano', 'Governo Bolsonaro', 'Governo Lula'], linhas: [['1º', '1,2%', '3,2%'], ['2º', '−3,3%', '3,4%'], ['3º', '4,8%', '2,3%'], ['4º', '3,0%', 'em curso'], ['Média', '1,4%', '3,0%']] } }),

    card({ id: 'q-inflacao', tema: 'Inflação', criterio: 'menor', valores: { b: 6.1, l: 4.6 }, detalhe: 'quanto os preços subiram', forca: 'apertada',
      manchete: { valor: '4,6%', texto: 'de inflação média por ano no Governo Lula, contra 6,1% no Governo Bolsonaro' },
      grafico: { tipo: 'trajetoria', titulo: 'Quanto os preços subiram desde a posse', sub: 'IPCA acumulado mês a mês, %', b: S.ipca.b, l: S.ipca.l,
        formato: { casas: 1, sufixo: '%' }, formatoEixo: { casas: 0, sufixo: '%' }, marcaMes: 44, marcaTexto: 'mesmos 44 meses', marcaValor: { lado: 'b', acima: true },
        rotuloX: 'meses desde a posse', fim: { b: 'em 48 meses', l: 'em 44 meses' } },
      mudaria: 'sem 2020–21, 5,0% × 4,6%; só 2019, 4,3% × 4,6% (inverte)',
      fonte: 'IBGE, IPCA (Banco Central, SGS 433)', periodo: 'média anual 2019–2022 × 2023–2025; curva jan/2019–dez/2022 × jan/2023–ago/2026', dados: 'ago/2026',
      tabela: { cab: ['', 'Governo Bolsonaro', 'Governo Lula'], linhas: [['Média anual', '6,1%', '4,6%'], ['Acumulado em 44 meses', '25,3%', '17,9%'], ['Acumulado no mandato', '26,9% (48 meses)', '17,9% (44 meses, parcial)']] } }),

    card({ id: 'q-desemprego', tema: 'Emprego', criterio: 'menor', valores: { b: 12.3, l: 6.6 }, detalhe: 'taxa de desemprego, média anual oficial', forca: 'clara',
      manchete: { valor: '6,6%', texto: 'de desemprego médio no Governo Lula, contra 12,3% no Governo Bolsonaro' },
      grafico: { tipo: 'barras', titulo: 'Ano a ano de mandato', sub: '% da força de trabalho, média anual (IBGE)', formato: { casas: 1, sufixo: '%' }, formatoEixo: { casas: 0, sufixo: '%' }, periodos: P,
        grupos: [ { rotulo: '1º ano', b: { rot: '2019', v: 11.8 }, l: { rot: '2023', v: 7.7 } }, { rotulo: '2º ano', b: { rot: '2020', v: 13.7 }, l: { rot: '2024', v: 6.6 } },
                  { rotulo: '3º ano', b: { rot: '2021', v: 14.0 }, l: { rot: '2025', v: 5.6 } }, { rotulo: '4º ano', b: { rot: '2022', v: 9.6 }, l: { rot: '2026', v: null, vazio: 'em curso' } } ] },
      nota: '2026 (trimestre jun–ago): 5,3%. 2020–21 tiveram a pandemia.',
      fonte: 'IBGE, PNAD Contínua (SIDRA 4562, média anual)', periodo: 'médias 2019–2022 × 2023–2025', dados: '2025 (anual); ago/2026 (trimestre)',
      saibaMais: ['Pela média dos trimestres móveis (Banco Central, SGS 24369), a régua da matriz: 12,1% × 7,0%.'],
      tabela: { cab: ['Ano', 'Governo Bolsonaro', 'Governo Lula'], linhas: [['1º', '11,8%', '7,7%'], ['2º', '13,7%', '6,6%'], ['3º', '14,0%', '5,6%'], ['4º', '9,6%', 'em curso'], ['Média', '12,3%', '6,6%']] } }),

    card({ id: 'q-protecao', tema: 'Proteção social', criterio: 'maior', valores: { b: 188.1, l: 293.5 }, detalhe: 'gasto com Assistência social, média por ano sem 2020', forca: 'apertada',
      manchete: { valor: 'R$ 293,5 bi', texto: 'por ano em Assistência social no Governo Lula, contra R$ 188,1 bi no Governo Bolsonaro (média sem 2020)' },
      grafico: { tipo: 'barras', titulo: 'Gasto ano a ano de mandato', sub: 'Assistência social (função 08), R$ bi de dez/2025', formato: { casas: 0 }, formatoEixo: { casas: 0 }, periodos: P,
        grupos: [ { rotulo: '1º ano', b: { rot: '2019', v: 133.5 }, l: { rot: '2023', v: 293.3 } }, { rotulo: '2º ano', b: { rot: '2020', v: 563.9, fora: true }, l: { rot: '2024', v: 296.6 } },
                  { rotulo: '3º ano', b: { rot: '2021', v: 204.0 }, l: { rot: '2025', v: 290.7 } }, { rotulo: '4º ano', b: { rot: '2022', v: 226.8 }, l: { rot: '2026', v: null, vazio: 'em curso' } } ] },
      nota: 'Barra listrada: 2020, fora da média (pico do Auxílio Emergencial).',
      mudaria: 'com 2020 na média, R$ 282,1 bi × R$ 293,5 bi',
      fonte: 'Tesouro/SICONFI (RREO, função 08), corrigido pelo IPCA', periodo: 'R$ de dez/2025', dados: '2025' }),

    card({ id: 'q-gasto', tema: 'Controle do gasto', criterio: 'menor', valores: { b: 2.67, l: 3.02 }, detalhe: 'gasto do governo sem juros, média real por ano', forca: 'apertada',
      manchete: { valor: 'R$ 2,67 tri', texto: 'de gasto por ano no Governo Bolsonaro, contra R$ 3,02 tri no Governo Lula (já sem a inflação)' },
      grafico: { tipo: 'barras', titulo: 'Gasto ano a ano de mandato', sub: 'despesa primária estimada da União, R$ tri de dez/2025', formato: { casas: 2 }, formatoEixo: { casas: 1 }, periodos: P,
        grupos: [ { rotulo: '1º ano', b: { rot: '2019', v: 2.46 }, l: { rot: '2023', v: 2.91 } }, { rotulo: '2º ano', b: { rot: '2020', v: 3.06 }, l: { rot: '2024', v: 2.97 } },
                  { rotulo: '3º ano', b: { rot: '2021', v: 2.47 }, l: { rot: '2025', v: 3.18 } }, { rotulo: '4º ano', b: { rot: '2022', v: 2.68 }, l: { rot: '2026', v: null, vazio: 'em curso' } } ] },
      mudaria: 'em % do PIB, 25,0% × 24,5% (inverte)',
      nota: 'Estimativa: empenhado da União menos juros e amortização. Precatórios: ver o card ao lado.',
      fonte: 'Tesouro/SICONFI (RREO), corrigido pelo IPCA', periodo: 'R$ de dez/2025', dados: '2025' }),

    card({ id: 'q-precatorios', titulo: 'Precatórios: o que muda na conta do gasto', criterio: null, criterioTexto: 'nuance do gasto, sem placar',
      manchete: { valor: '≈ +5%', texto: 'foi a alta real do gasto de 2022 para 2023 sem o pagamento extra de dez/2023 (R$ 92,4 bi = 60,2 atrasados + 32,3 antecipados de 2024); com ele, +8,7%. O veredito do gasto não muda.' },
      grafico: { tipo: 'segmentos', titulo: 'Precatórios pagos por ano', sub: 'dívidas judiciais da União, R$ bi (valores da época)', formato: { casas: 1 },
        barras: [ { ano: '2019', lado: 'b', v: 41.6 }, { ano: '2020', lado: 'b', v: 50.4 }, { ano: '2021', lado: 'b', v: 54.9 },
                  { ano: '2022', lado: 'b', v: 58.7, rotulo: false, rotuloBase: '58,7', extra: [{ v: 22.3, tipo: 'fantasma', rotulo: '+22,3' }] },
                  { ano: '2023', lado: 'l', v: 59.4, extra: [{ v: 92.4, tipo: 'hachura' }] }, { ano: '2024', lado: 'l', v: 70.4 },
                  { ano: '2025', lado: 'l', v: 59.7, extra: [{ v: 41.1, tipo: 'hachura' }] } ] },
      nota: 'Tracejado (+22,3): R$ 22,3 bi adiados em 2022 pelo limite da EC 114. Listrado: R$ 92,4 bi pagos em dez/2023 após o STF (60,2 atrasados + 32,3 antecipados de 2024) e R$ 41,1 bi acima do limite em 2025, fora da meta.',
      fonte: 'Tesouro Nacional, RTN (série dez/2025); Consultorias do Congresso (NT 5/2022, NT 48/2023); STF (ADIs 7047/7064)', periodo: '2019–2025',
      saibaMais: ['STF: "Com a decisão, o Tribunal autorizou o governo a regularizar os pagamentos que estavam retidos para cumprir a meta fiscal."',
                  'Tesouro (RTN dez/2023): "Déficit primário acumulado no ano é de R$ 230,5 bilhões, resultado pior que o previsto no RARDP do 5º bimestre devido, principalmente, ao pagamento do estoque de precatórios em dezembro não previsto no RARDP, no valor de R$ 92,4 bilhões."',
                  'Com cada precatório contado no ano em que venceu, as médias do gasto ficam em R$ 2,67 tri × R$ 3,01 tri por ano.'] }),

    card({ id: 'q-divida', tema: 'Dívida pública', criterio: 'menor', valores: { b: -3.6, l: 11.2 }, detalhe: 'quanto a dívida bruta mudou, em pontos do PIB', forca: 'clara',
      manchete: { valor: '−3,6', texto: 'pontos do PIB: a dívida caiu no Governo Bolsonaro (dez/18 → dez/22). No Governo Lula, subiu 11,2 (dez/22 → ago/26, parcial).' },
      grafico: { tipo: 'trajetoria', titulo: 'Quanto a dívida mudou desde a posse', sub: 'dívida bruta do governo geral, pontos do PIB, mês a mês', b: S.dbgg.b, l: S.dbgg.l,
        formato: { casas: 1, sinal: true }, formatoEixo: { casas: 0, sinal: true }, rotuloFim: 'nome', fim: { b: '48 meses', l: '44 meses' },
        marcaMes: 44, marcaTexto: 'mesmos 44 meses', marcaValor: { lado: 'b' }, rotuloX: 'meses desde a posse' },
      nota: 'Pico na pandemia: +12,4 pontos (out/2020).',
      fonte: 'Banco Central, DBGG (SGS 13762)', periodo: 'dez/2018–dez/2022 × dez/2022–ago/2026', dados: 'ago/2026' }),

    card({ id: 'q-juros', tema: 'Conta de juros', criterio: 'menor', valores: { b: 5.0, l: 7.5 }, detalhe: 'juros pagos pelo setor público, % do PIB', forca: 'clara',
      manchete: { valor: '5,0%', texto: 'do PIB por ano em juros no Governo Bolsonaro, contra 7,5% no Governo Lula (R$ 535 × R$ 928 bi por ano, em R$ de dez/2025)' },
      grafico: { tipo: 'trajetoria', titulo: 'Conta de juros em 12 meses, desde a posse', sub: 'juros nominais do setor público, % do PIB', b: S.juros12m.b, l: S.juros12m.l,
        formato: { casas: 1, sufixo: '%' }, formatoEixo: { casas: 0, sufixo: '%' }, rotuloX: 'meses desde a posse', fim: { b: 'dez/2022', l: 'ago/2026' } },
      fonte: 'Banco Central, NFSP (SGS 5727 − 5793)', periodo: 'média dos dezembros 2019–2022 × 2023–2025', dados: 'ago/2026' }),

    card({ id: 'q-selic', titulo: 'Selic, o juro básico: contexto, não conta ponto', criterio: null, criterioTexto: 'contexto: juro alto segura a inflação e encarece o crédito',
      manchete: { valor: '6,5% × 12,9%', texto: 'Selic média: Governo Bolsonaro × Governo Lula' },
      grafico: { tipo: 'trajetoria', titulo: 'Selic mês a mês desde a posse', sub: '% ao ano', b: S.selic.b, l: S.selic.l, formato: { casas: 1, sufixo: '%' }, formatoEixo: { casas: 0, sufixo: '%' },
        rotuloX: 'meses desde a posse', fim: { b: 'dez/2022', l: 'set/2026' } },
      nota: 'Em 2026, média de 14,4% até setembro.',
      fonte: 'Banco Central, Selic (SGS 432)', periodo: 'médias 2019–2022 × 2023–2025', dados: 'set/2026' }),

    card({ id: 'q-salario', tema: 'Salário mínimo', criterio: 'maior', valores: { b: 1374, l: 1478 }, detalhe: 'poder de compra do salário mínimo', forca: 'clara',
      manchete: { valor: 'R$ 1.478', texto: 'de salário mínimo médio no Governo Lula, contra R$ 1.374 no Governo Bolsonaro (+7,5%, em poder de compra de hoje)' },
      grafico: { tipo: 'anual', titulo: 'Salário mínimo ano a ano', sub: 'R$ de dez/2025; 2026: R$ 1.621 vigente = R$ 1.572', anos: anos(2019, 2026), v: sm, yMin: 1200, yMax: 1650,
        formato: { prefixo: 'R$ ', casas: 0 }, formatoEixo: { prefixo: 'R$ ', casas: 0 },
        faixas: [{ lado: 'b', de: 2019, ate: 2022, texto: '−0,2% (2019→22)' }, { lado: 'l', de: 2023, ate: 2026, texto: '+5,2% (2023→25)' }],
        parcial: [2026], rotular: [2019, 2022, 2026], abaixo: [2022] },
      fonte: 'Banco Central (SGS 1619), corrigido pelo IPCA (SGS 433)', periodo: 'médias 2019–2022 × 2023–2025', dados: '2026',
      saibaMais: ['Pelo INPC (a inflação das famílias de renda mais baixa): R$ 1.362 × R$ 1.474 (+8,2%).'] }),

    card({ id: 'q-renda', tema: 'Renda por pessoa', criterio: 'maior', valores: { b: 1781, l: 2127 }, detalhe: 'renda média da casa por pessoa, sem a inflação', forca: 'clara',
      manchete: { valor: 'R$ 2.127', texto: 'por pessoa por mês no Governo Lula, contra R$ 1.781 no Governo Bolsonaro (+19,4%)' },
      grafico: { tipo: 'anual', titulo: 'Renda por pessoa ano a ano', sub: 'R$ de dez/2025 por mês', anos: anos(2019, 2025), v: S.renda, yMin: 1400, yMax: 2400,
        formato: { prefixo: 'R$ ', casas: 0 }, formatoEixo: { prefixo: 'R$ ', casas: 0 },
        faixas: [{ lado: 'b', de: 2019, ate: 2022 }, { lado: 'l', de: 2023, ate: 2025 }], rotular: [2019, 2021, 2025], abaixo: [2021] },
      fonte: 'IBGE, PNAD Contínua (SIDRA 7531), corrigido pelo IPCA de dezembro', periodo: 'médias 2019–2022 × 2023–2025', dados: '2025' }),

    card({ id: 'q-gini', tema: 'Desigualdade', criterio: 'menor', valores: { b: 0.531, l: 0.511 }, detalhe: 'índice de Gini (quanto menor, menos desigual)', forca: 'clara',
      manchete: { valor: '0,511', texto: 'de Gini médio no Governo Lula, contra 0,531 no Governo Bolsonaro' },
      grafico: { tipo: 'anual', titulo: 'Gini ano a ano', sub: 'renda da casa por pessoa', anos: anos(2014, 2025), v: S.gini, yMin: 0.48, yMax: 0.56,
        formato: { casas: 3 }, formatoEixo: { casas: 2 }, faixas: [{ lado: 'b', de: 2019, ate: 2022 }, { lado: 'l', de: 2023, ate: 2025 }],
        rotular: [2014, 2019, 2022, 2024], sufixoRotulo: { 2024: '· menor da série' }, abaixo: [2024] },
      nota: 'Em 2025, o índice voltou a subir.',
      fonte: 'IBGE, PNAD Contínua (SIDRA 7435)', periodo: 'médias 2019–2022 × 2023–2025', dados: '2025' }),

    card({ id: 'q-renda-pobres', tema: 'Renda dos 50% mais pobres', criterio: 'maior', valores: { b: 576, l: 743 }, detalhe: 'renda por pessoa por mês, sem a inflação', forca: 'clara',
      manchete: { valor: '11,5×', texto: 'é quanto a renda dos 10% mais ricos vale a dos 50% mais pobres no Governo Lula; no Governo Bolsonaro, 12,9×' },
      grafico: { tipo: 'pares', titulo: 'Base e topo da renda', sub: 'R$ por pessoa por mês, de dez/2025 (escala própria em cada par)', escalaPropria: true, formato: { prefixo: 'R$ ', casas: 0 },
        grupos: [ { rotulo: '50% mais pobres', sub: '+29,1%', b: 576, l: 743 }, { rotulo: '10% mais ricos', sub: '+14,8%', b: 7455, l: 8557 } ] },
      fonte: 'IBGE, PNAD Contínua (SIDRA 7531), corrigido pelo IPCA', periodo: 'médias 2019–2022 × 2023–2025', dados: '2025' }),

    card({ id: 'resumo', titulo: 'Onde cada governo ficou à frente', criterio: null, criterioTexto: 'média de cada governo · 2019–2022 × 2023–2025',
      grafico: { tipo: 'blocos',
        grupos: [ { titulo: 'Economia e renda', vencedor: 'l', itens: [{ nome: 'Crescimento' }, { nome: 'Inflação', apertada: true }, { nome: 'Emprego' }, { nome: 'Proteção social', apertada: true }] },
                  { titulo: 'Contas públicas', vencedor: 'b', itens: [{ nome: 'Controle do gasto', apertada: true }, { nome: 'Dívida pública' }, { nome: 'Conta de juros' }] } ],
        contexto: [{ nome: 'Selic (juro básico)' }], fecho: 'Nenhum governo ficou à frente em tudo.',
        rodape: '7 quesitos: 4 e 3 · "apertada" = vence por pouco ou depende da métrica' },
      fonte: 'Banco Central, IBGE e Tesouro/SICONFI · matriz de vereditos H01–H08' })
  ];
})();
