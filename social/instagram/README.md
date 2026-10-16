# Carrosséis do Instagram

Imagens 1080×1350 (4:5) para publicar como carrossel. Esta pasta fica **fora do site**: o `scripts/build.py` publica só o que está em `public/`, e `social/` não vai para o `dist/`.

```
social/instagram/<data>/
  governos/01.png … 10.png + legenda.txt   "Governos: onde cada um ficou à frente"
  promessas/01.png … 07.png + legenda.txt  "Promessas cumpridas"
  contato.png                              folha de contato com todos os slides, para revisão
```

## Ordem dos slides

A ordem foi fixada antes de olhar quem fica à frente. Ela segue a ordem do placar no site: primeiro Economia e renda, depois Contas públicas. Os dois carrosséis têm cards em que cada lado fica à frente.

**governos/**

| # | Slide | Âncora no site |
|---|---|---|
| 01 | Capa + card-síntese (dois blocos de mesmo peso: Economia e renda · Contas públicas; Selic como contexto) | `/#resumo` |
| 02 | Crescimento (1,4% × 3,0% ao ano) | `/#q-crescimento` |
| 03 | Inflação (6,1% × 4,6%, apertada) | `/#q-inflacao` |
| 04 | Emprego (desemprego 12,3% × 6,6%) | `/#q-emprego` |
| 05 | Proteção social (R$ 188,1 × 293,5 bi sem 2020, apertada) | `/#q-protecao-social` |
| 06 | Controle do gasto (R$ 2,67 × 3,02 tri, apertada) | `/#q-gasto` |
| 07 | Dívida pública (−3,6 × +11,2 pontos do PIB; Lula parcial até ago/26) | `/#q-divida` |
| 08 | Conta de juros (5,0% × 7,5% do PIB) | `/#q-juros` |
| 09 | Selic: contexto, não conta ponto (6,5% × 12,9%) | `/#q-selic` |
| 10 | Contracapa: como calculamos, fontes, link e data | `/#apendice` |

**promessas/**

| # | Slide | Âncora no site |
|---|---|---|
| 01 | Capa (os dois planos com o mesmo peso) | `/balanco/#resumo` |
| 02 | Três jeitos de contar: 15,2% × 35,3% · 22,7% × 38,7% · 27,3% × 50,0% | `/balanco/#resumo` |
| 03 | Impostos e trabalho | `/balanco/#cap-bolso` |
| 04 | Proteção social, saúde e educação | `/balanco/#cap-servicos` |
| 05 | Estado e infraestrutura | `/balanco/#cap-estado` |
| 06 | Segurança, ambiente e instituições | `/balanco/#cap-seguranca` |
| 07 | Contracapa: como classificamos, fonte, link e data | `/balanco/#metodo` |

## De onde vêm os números

- **Slides de conteúdo:** são os cards do próprio site. O script chama `BPD.cardPNG(def, 'feed')` (charts.js) dentro das páginas do `dist/`, com as mesmas definições que o site usa: `public/assets/js/cards-home.js` e `cards-balanco.js`. Esses arquivos seguem a matriz de vereditos e as decisões do dono. Nada é redesenhado à mão, e a imagem é a mesma do botão "Compartilhar imagem" do site, com o link da seção.
- **Capa e contracapa:** são HTML no mesmo estilo (fonte Inter do site, azul `#1479B0` para o Governo Bolsonaro e roxo `#7250FB` para o Governo Lula, neutros). Não usam verde-amarelo nem vermelho para lado algum. A capa de governos mostra o card-síntese do site.
- **Em cada slide** aparecem a fonte, a data ("atualizado em") e o endereço da seção.
- **O script confere, a cada geração:**
  - tamanho 1080×1350;
  - sobreposição de textos (mesma regra do `dv-overlap` do data-viz);
  - presença da URL, da fonte e da data;
  - se os números de cada quesito aparecem no card **e** no texto da página publicada (o "Resumo em 1 minuto").

  Se alguma conferência falhar, o script termina com erro.

## Como regenerar

Na raiz do repositório:

```bash
SITE_URL=https://boraprosdadosbrasil.netlify.app python3 scripts/build.py   # gera dist/
npm i --no-save playwright && npx playwright install chromium              # só na 1ª vez
node scripts/gen_instagram.js 2026-10-16                                    # data da pasta (padrão: hoje)
```

O script usa caminhos relativos ao repositório. Se o Playwright estiver instalado em outro lugar, passe `PLAYWRIGHT_PATH=/caminho/para/node_modules/playwright`.

Depois de mudar um número no site (`cards-*.js`), gere uma pasta com a nova data. Assim as imagens antigas continuam rastreáveis.

## Legendas

O `legenda.txt` de cada carrossel tem no máximo 2.200 caracteres. As hashtags são só de tema ou de fonte, sem nome de candidato, partido ou número. O texto não pede voto, e o script confere isso. As duas regras valem para qualquer post: **não impulsionar** os posts (impulsionamento pago de conteúdo eleitoral só é permitido a partido, coligação ou candidato) e **não publicar conteúdo novo em 25/10**.
