/* Cards de /propostas/ — "qual plano diz COMO vai fazer" (decisão 4: sem vencedor). Contagens: "Saldo da seção" da página. */
(function () {
  var L = { b: { nome: 'Flávio Bolsonaro', curto: 'Flávio', periodo: 'PL' }, l: { nome: 'Lula', curto: 'Lula', periodo: 'PT' } };
  var CAT = [{ id: 'exp', nome: 'Instrumento nomeado', st: 'ok' }, { id: 'par', nome: 'Parcial', st: 'mid' }, { id: 'sem', nome: 'Só intenção', st: 'na' }];
  var FONTE = 'Planos de governo registrados no TSE (2026); rótulos desta página';
  var NOTA = 'Programas já em execução contam como caminho, o que favorece quem governa. Mede o que o plano escreve, não a chance de cumprir.';
  function c(id, titulo, n, fb, fl, man) {
    return { id: id, titulo: titulo, criterio: null, criterioTexto: 'o plano diz a ferramenta (lei, programa, fonte de dinheiro)? · ' + n + ' temas', lados: L,
      manchete: man || null,
      grafico: { tipo: 'empilhadas', categorias: CAT, linhas: { b: { contagens: fb, direita: n + ' temas' }, l: { contagens: fl, direita: n + ' temas' } } },
      nota: NOTA, fonte: FONTE, atualizado: '16/10/2026' };
  }
  window.CARDS_PROPOSTAS = [
    c('p-geral', 'Qual plano mais diz COMO vai fazer?', 19, { exp: 1, par: 12, sem: 6 }, { exp: 11, par: 6, sem: 2 },
      { valor: '1 × 11', texto: 'ferramenta nomeada: Flávio 1 de 19 × Lula 11 de 19 temas. Com algum caminho: 13 × 17' }),
    c('p-bolso', 'Bolso (impostos, trabalho, renda, casa): o plano diz como?', 5, { exp: 0, par: 2, sem: 3 }, { exp: 2, par: 3, sem: 0 }),
    c('p-seguranca', 'Segurança e crime organizado: o plano diz como?', 3, { exp: 0, par: 3, sem: 0 }, { exp: 2, par: 1, sem: 0 }),
    c('p-servicos', 'Saúde, educação e serviços: o plano diz como?', 5, { exp: 0, par: 2, sem: 3 }, { exp: 4, par: 1, sem: 0 }),
    c('p-economia', 'Economia e crescimento: o plano diz como?', 4, { exp: 1, par: 3, sem: 0 }, { exp: 2, par: 1, sem: 1 }),
    c('p-ambiente', 'Meio ambiente e instituições: o plano diz como?', 2, { exp: 0, par: 2, sem: 0 }, { exp: 1, par: 0, sem: 1 })
  ];
})();
