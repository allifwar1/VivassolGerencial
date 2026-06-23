# Arquitetura do Estoque — baixa idempotente por "recibo"

> Documenta como o Vivassol Gerencial controla o estoque de insumos de forma
> **robusta, idempotente e à prova de sincronização lenta/defasada**.
> Substitui o modelo antigo (somar/subtrair por transição) que acumulava erro.

## O problema do modelo antigo

O estoque era ajustado por **deltas a cada transição de etapa**:
- pedido vira "ativo" (Pedido feito, Em produção, Pronto, Entregue) → **subtrai** insumos;
- pedido vira "inativo" (Orçamento, Cancelado) → **soma de volta**.

Isso quebrava porque `insumos.quantidade` e o status em `vendas` são salvos em
**tabelas separadas** na planilha. Quando a sincronização lenta trazia de volta
uma versão **defasada de uma só** das duas, elas ficavam **inconsistentes**, e o
próximo delta era calculado sobre um número errado. O erro **acumulava** e nunca
se corrigia (ex.: 10 canecas viravam 13 depois de alternar etapas várias vezes).

Causa de fundo: estoque era um **acumulador** sem fonte da verdade, e os deltas
podiam ser **aplicados em dobro** (corrida/clique duplo) ou **sobre estado
inconsistente** (sync defasado).

## O modelo novo: recibo de baixa (snapshot)

Cada pedido guarda, **na própria linha** (coluna `vendas.estoque_baixado`), um
**recibo** do que retirou do estoque, no formato compacto:

```
INS3(1), INS5(2)
```

(significa: este pedido tirou 1 de INS3 e 2 de INS5). Vazio = nada baixado.

A função central é `definirBaixaVenda(idVenda, deveBaixar)` (em `js/core.js`):

| Situação | Recibo atual | Ação |
|----------|--------------|------|
| Deve baixar **e** ainda não baixou | vazio | calcula consumo (itens × receita), **subtrai** do estoque, **grava** o recibo |
| Não deve baixar **e** já tinha baixado | preenchido | **devolve exatamente o que o recibo diz** e **apaga** o recibo |
| Já está no estado certo | — | **não faz nada** (idempotente) |

`deveBaixar` = `contaComoVenda(status)` (true quando não é Orçamento nem Cancelado).

### Por que isso é à prova de falhas

1. **Idempotência** — repetir a mesma transição (corrida, clique duplo, reenvio)
   não tem efeito: se o recibo já reflete o estado desejado, não mexe em nada.
2. **Reversão exata** — a devolução usa o **recibo guardado**, não recalcula pela
   receita atual. Se a receita do produto mudou entre baixar e devolver, ainda
   assim devolve exatamente o que foi tirado. Zero drift.
3. **Consistência sob sync defasado** — o recibo viaja **junto** do status (mesma
   linha, mesma tabela `vendas`). Logo, "status" e "o que foi baixado" **nunca**
   chegam dessincronizados. No pior caso, uma versão antiga sobrescreve a nova
   (um clique a refazer) — **nunca** surge estoque-fantasma.
4. **Compatível com arquivamento** — pedidos arquivados levam o recibo junto e o
   `insumos.quantidade` já reflete a baixa; nada "volta" ao desarquivar.

## Onde está no código

- `js/core.js`:
  - `consumoDasLinhas(linhas)` — quanto o pedido consome agora (itens × receita).
  - `serializarConsumo` / `parseConsumo` — formato `INSx(qtd)` ⇄ lista.
  - `lerSnapshotBaixa` / `gravarSnapshotBaixa` — lê/grava o recibo nas linhas.
  - `aplicarConsumoNoEstoque(lista, sinal)` — soma/subtrai no estoque.
  - **`definirBaixaVenda(idVenda, deveBaixar)`** — o coração idempotente.
  - `reconciliarEstoqueVenda(idVenda)` — acerta conforme o status atual.
  - `migrarSnapshotsBaixa()` — migração única (inicializa recibos dos ativos
    **sem** mexer no estoque; assume que a quantidade atual já reflete as baixas).
- `js/vendas.js` — criar pedido (PDV), editar e excluir usam `definirBaixaVenda`.
- `apps-script/Code.gs` — coluna `estoque_baixado` adicionada ao fim de `ABAS.vendas`.

## Migração (uma vez, automática)

Na primeira sincronização após o deploy, `migrarSnapshotsBaixa()`:
1. Para cada pedido **ativo** sem recibo, grava o recibo = consumo atual (apenas
   marca "já baixado"; **não** mexe no estoque).
2. Marca a config `estoque_snapshot_v1 = sim` para não repetir.

A partir daí, toda baixa/devolução é idempotente. Se o estoque já estava com
algum erro acumulado do modelo antigo, basta **corrigir a quantidade uma vez**
na tela de Estoque — e ele nunca mais vai "andar sozinho".

## Garantia testada

O motor foi validado por simulação (`scratchpad/sim_estoque.js`) com:
- 20.000 transições aleatórias retornando ao estado inicial → estoque **idêntico**;
- idempotência (mesma transição 2×) → sem efeito duplo;
- cancelar/voltar → devolve e rebaixa exatamente;
- reconciliar estado já consistente → não cria fantasma.

---
_Atualize este documento se o modelo de estoque mudar._
