# Analytics — GA4 + jornada do usuário

## Ativação (pendência)

1. Crie uma propriedade **Google Analytics 4** (analytics.google.com) para o domínio.
2. Copie o **ID de medição** (formato `G-XXXXXXXXXX`) e cole no `.env`:
   `GA_MEASUREMENT_ID=G-XXXXXXXXXX`
3. `scripts/deploy.sh --apply` (o build injeta o ID nas páginas).
   > O site funciona normalmente sem o ID — a instrumentação apenas fica inativa.

Opcional: em Admin → Retenção de dados, ampliar para 14 meses; considerar Google Signals conforme decisão de LGPD (ver abaixo).

## Eventos instrumentados

| Evento | Quando dispara | Parâmetros principais |
|---|---|---|
| `page_view` | automático (GA4) | page_id, página |
| `section_view` | usuário alcança 35% de uma seção (uma vez por seção/página) | `section`, `section_name`, `page_id` |
| `scroll_depth` | 25 / 50 / 75 / 90 / 100% (uma vez cada) | `percent` |
| `file_download` | clique em qualquer botão "baixar" dos dados | `file_name`, `file_type`, `file_size`, `file_cat` |
| `outbound_click` | clique em link externo (fontes oficiais etc.) | `link_domain`, `link_url`, `link_text` |
| `nav_click` | clique na navegação do site (sitebar/rodapé/âncoras) | `target`, `label` |
| `plano_pagina_aberta` | abertura do PDF/modal na página citada (propostas/balanço) | `label` |
| `trecho_original_aberto` | "Ver o texto exato na proposta/plano" | — |
| `detalhes_abertos` | "detalhes" no catálogo (propostas/balanço) e, nos componentes novos, o `<summary data-track="detalhes_abertos" data-track-label="q-…">` de "Ver gráfico e detalhes" / recolhíveis `.q-mais` | `label` (id do card) |
| `share_click` | clique num canal de compartilhar (`share.js`; não conta o "Mais", que só abre o painel) | `method` (`whatsapp`\|`telegram`\|`x`\|`facebook`\|`copy`\|`native`\|`image`), `section` (slug), `placement` (`card`\|`capitulo`\|`placar`\|`fim`\|`barra`) |
| `share_success` | a folha nativa conclui (`native`/`image`) ou a cópia dá certo (`copy`) | `method`, `section` |
| `share_cancel` | a pessoa fecha a folha nativa (AbortError) | `method`, `section` |
| `bbar_click` | toque na barra inferior do celular (`ui.js`) | `label` (`resumo`\|`compartilhar`\|`secoes`) |
| `page_exit` | usuário sai/oculta a aba | `last_section`, `seconds_on_page`, `scroll_max` |

Observações:
- `share_*` vêm de `/assets/js/share.js` via `window.__track` (o `page_id` é acrescentado pelo `analytics.js`). Os cliques nos botões de compartilhar não geram `outbound_click` duplicado (`stopPropagation`). Pela barra inferior, `placement = barra` e `section` = o componente `.share` do capítulo em leitura (ou `page_id` se o capítulo não tiver um).
- `nav_click` nas abas do cabeçalho: no HTML cada aba tem rótulo longo e curto (`.t-longo`/`.t-curto`), então `label` traz os dois ("Governo Lula × Bolsonaro Governos"); use `target` (o href) como dimensão principal.
- Dimensões personalizadas de evento a criar no GA4: `method`, `placement` (e `label`, se ainda não existir). Eventos-chave sugeridos: `share_success` e `share_click` com `method = whatsapp` (o WhatsApp não confirma envio).

As seções marcadas para `section_view` são as **10 áreas de cada página** (placar, capítulos, catálogo, método, dados/fontes…) — cada uma tem id e nome legível no atributo `data-track-section`/`data-track-name`. Isso permite funis por conteúdo real, e não só por percentual de rolagem.

## Respondendo às perguntas de negócio (receitas no GA4)

1. **Acessos e usuários por página** → Relatórios → Envolvimento → Páginas e telas.
2. **Origem do tráfego** → Relatórios → Aquisição (ou Explorar → Origem da sessão × página).
3. **Página de entrada e de saída** → Explorar → "Exploração de caminho": dimensão *Página de destino* (entrada) e evento **`page_exit`** com `last_section` (saída; o GA4 não tem métrica nativa de saída, esse evento cobre).
4. **Funil de consumo (exemplo do pedido)** → Explorar → **Explorador de funil**, etapas:
   1. `page_view` (ou sessões)
   2. `section_view` com `section = dados`
   3. `file_download` (qualquer arquivo)
   → quebra por `page_id` para comparar páginas. Resultado do tipo: *10.000 acessaram → 7.800 chegaram a "Dados" → 2.100 baixaram*.
5. **Quais seções são efetivamente alcançadas** → Explorar livre: `section_name` × usuários; ou funil com uma etapa por seção.
6. **Quais arquivos são baixados** → Explorar: `file_name` × usuários (também disponível em Tempo real ao publicar).
7. **Profundidade de leitura** → `scroll_depth.percent` × usuários (complementar ao `section_view`).

## Campanhas e compartilhamento

Os botões de compartilhar do site já montam o link com UTM (padrão único, `utm_medium=share`):
`<página>?utm_source=whatsapp|telegram|x|facebook|copia|nativo|imagem&utm_medium=share&utm_campaign=<page_id>&utm_content=<slug>#<âncora>`.
Para links divulgados à mão, use o mesmo padrão (ex.: `?utm_source=whatsapp&utm_medium=share&utm_campaign=comparativo`). Sem UTM, a origem vem por referrer/direto normalmente.
Ciclo de volta: sessões com `utm_medium = share` por `utm_content` (slug) × `share_click` do mesmo slug.

## LGPD / consentimento

`CONSENT_MODE` no `.env`:
- `none` (padrão): o GA carrega direto (IP anonimizado por padrão no GA4).
- `banner`: mostra uma faixa pedindo consentimento; o GA só carrega após "Aceitar" (guardado em localStorage).

**Pendência de decisão:** definir com o jurídico/responsável qual modo usar antes do lançamento (docs/PENDENCIAS.md).

## Depuração

- `window.__track_events` (console): histórico dos eventos disparados na sessão.
- GA4 → Admin → DebugView com a extensão de debug ativa.
