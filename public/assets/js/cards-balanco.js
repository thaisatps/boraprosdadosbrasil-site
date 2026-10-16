/* Cards de /balanco/ — placar no estilo antigo + três jeitos de contar + um card por tema. Contagens: catálogo da página. */
(function () {
  var L = { b: { nome: 'Governo Bolsonaro', curto: 'Bolsonaro', periodo: 'plano 2018' }, l: { nome: 'Governo Lula', curto: 'Lula', periodo: 'plano 2022' } };
  var CAT = [{ id: 'cumprida', nome: 'Cumprida', st: 'ok' }, { id: 'parcial', nome: 'Parcial', st: 'mid' }, { id: 'andamento', nome: 'Em andamento', st: 'run' },
             { id: 'nao', nome: 'Não cumprida', st: 'no' }, { id: 'sem', nome: 'Sem evidência oficial', st: 'na' }];
  var FONTE = 'catálogo desta página (67 promessas; planos registrados no TSE; vereditos só em fontes oficiais)';
  function tema(id, nome, cb, cl, forca) {
    var tb = 0, tl = 0, k; for (k in cb) tb += cb[k]; for (k in cl) tl += cl[k];
    var pb = Math.round(cb.cumprida / tb * 100), pl = Math.round(cl.cumprida / tl * 100);
    return { id: id, tema: nome, lados: L, criterio: 'maior', valores: { b: pb, l: pl }, detalhe: '% das promessas do tema cumpridas', forca: forca, /* força da matriz (B01–B04) */
      grafico: { tipo: 'empilhadas', categorias: CAT, altura: 24, linhas: { b: { contagens: cb, direita: pb + '% cumpridas' }, l: { contagens: cl, direita: pl + '% cumpridas' } } },
      fonte: FONTE, periodo: 'corte em 30/09/2026', atualizado: '16/10/2026' };
  }
  window.CARDS_BALANCO = [
    { id: 'b-placar', tema: 'Promessas cumpridas', lados: L, criterio: 'maior', valores: { b: 15.2, l: 35.3 }, detalhe: '% do plano cumprida integralmente', forca: 'clara',
      grafico: { tipo: 'placarPromessas', categorias: CAT, destaque: 'cumprida', destaqueRotulo: 'cumpridas integralmente',
        linhas: { b: { sub: 'plano de 2018 · mandato encerrado', contagens: { cumprida: 5, parcial: 4, andamento: 0, nao: 13, sem: 11 } },
                  l: { sub: 'plano de 2022 · em curso (corte 30/09/2026)', contagens: { cumprida: 12, parcial: 5, andamento: 12, nao: 2, sem: 3 } } } },
      nota: 'Conjuntos diferentes (33 × 34 promessas): compare a %, não a quantidade.',
      fonte: FONTE, atualizado: '16/10/2026' },
    { id: 'b-tres', tema: 'Três jeitos de contar', lados: L, criterio: 'maior', valores: { b: 15.2, l: 35.3 }, detalhe: '% das promessas de cada plano', forca: 'clara',
      grafico: { tipo: 'pares', formato: { casas: 1, sufixo: '%' },
        grupos: [ { rotulo: 'Cumpridas', sub: 'sobre o total', b: 15.2, l: 35.3 }, { rotulo: 'Só as verificáveis', sub: 'sem "sem evidência"', b: 22.7, l: 38.7 },
                  { rotulo: 'Cumpridas + parciais', sub: 'sobre o total', b: 27.3, l: 50.0 } ] },
      nota: '"Sem evidência oficial" (11 × 3) não é descumprimento. "Não cumprida" fica fora do veredito: o mandato de Lula está em curso.',
      fonte: FONTE, atualizado: '16/10/2026' },
    tema('b-bolso', 'Impostos e trabalho', { cumprida: 0, parcial: 0, andamento: 0, nao: 4, sem: 3 }, { cumprida: 5, parcial: 1, andamento: 0, nao: 1, sem: 0 }, 'clara'),
    tema('b-servicos', 'Proteção social, saúde e educação', { cumprida: 0, parcial: 3, andamento: 0, nao: 1, sem: 1 }, { cumprida: 4, parcial: 4, andamento: 3, nao: 0, sem: 1 }, 'apertada'),
    tema('b-estado', 'Estado e infraestrutura', { cumprida: 5, parcial: 0, andamento: 0, nao: 3, sem: 5 }, { cumprida: 1, parcial: 0, andamento: 5, nao: 0, sem: 1 }, 'apertada'),
    tema('b-seguranca', 'Segurança, ambiente e instituições', { cumprida: 0, parcial: 1, andamento: 0, nao: 5, sem: 2 }, { cumprida: 2, parcial: 0, andamento: 4, nao: 1, sem: 1 }, 'apertada')
  ];
})();
