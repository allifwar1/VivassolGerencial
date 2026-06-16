# Metas — Conferência Financeira e Contabilidade Vivassol

> Documento de visão. Lista o que o sistema **deve passar a fazer** para o módulo
> financeiro ficar completo. Não é código — é o combinado do que será construído,
> em ordem de prioridade. Atualizar conforme cada etapa for entregue.

## Visão geral

A Vivassol vai **concentrar todo o dinheiro digital na conta do Mercado Pago**.
O Mercado Pago vira o "cofre central" da empresa, e o sistema (Vivassol Gerencial)
vira o **conferente automático**: cada movimentação que entra ou sai dessa conta
deve ser reconhecida, casada com uma venda/saída do sistema e, se algo não bater,
sinalizada imediatamente.

### Fluxo do dinheiro (combinado pelo dono)

```
Vendas Shopee ─────┐
Cartão de crédito ─┤
Cartão de débito ──┤──→  CONTA MERCADO PAGO  ──→  Vivassol (conferência automática)
PIX ───────────────┤        (cofre central)
Maquininha MP ─────┘
                                                  Dinheiro físico = único saldo
                                                  controlado à parte (manual)
```

- **Tudo que é digital** (Shopee, cartão crédito/débito, PIX, maquininha MP)
  cai na conta do Mercado Pago, que será integrada ao sistema.
- **Dinheiro físico (vivo)** continua sendo o único saldo controlado
  separadamente, como já é hoje no módulo Caixa.

---

## Metas (em ordem de prioridade)

### 1. Integração com o Mercado Pago (conferência do cofre central)
- [ ] Conectar o sistema à conta do Mercado Pago **somente leitura** (consulta de
      pagamentos e extrato de saldo), sem nenhuma permissão de saque/transferência.
- [ ] O Access Token do Mercado Pago **nunca** fica em arquivo do navegador.
      Mora apenas nas Propriedades do Script (Apps Script), do lado servidor.
- [ ] O saldo da conta Mercado Pago no sistema tem que **bater com o saldo real**
      mostrado no app do Mercado Pago. Qualquer diferença é sinalizada na hora.
- [ ] Cada entrada (PIX, cartão, maquininha, repasse Shopee) é **casada
      automaticamente** com uma venda registrada no sistema, por valor + data/hora.
- [ ] Cada saída/movimento (taxa de maquininha, transferência, saque) é casado
      com um lançamento já existente; se não houver, fica marcado como
      **"sem justificativa"** até ser categorizado ali na própria tela.
- [ ] Sinalização visual: 🟢 bateu certinho · 🟡 bateu com valor diferente
      (ex.: taxa maior que o esperado) · 🔴 sem par / sem justificativa.

### 2. Conferência das vendas de marketplace
- [ ] Conferir cada venda da **Shopee** e do **Mercado Livre** com o que está
      cadastrado no sistema.
- [ ] Tratar o **repasse em lote** dos marketplaces: marketplace não repassa
      venda a venda, junta várias e deposita o lote (já com comissão descontada).
      Conferência em duas camadas: (a) venda do marketplace × venda no sistema;
      (b) valor do lote depositado × soma das vendas daquele lote − comissão.
- [ ] Avaliar usar um **integrador único (ex.: Bling)** como hub dos marketplaces,
      em vez de uma integração separada por canal. O Bling resolve os *pedidos*;
      o Mercado Pago e o extrato resolvem o *dinheiro*.

### 3. Contas a pagar e a receber
- [ ] Módulo de **compras/contas a pagar** (fornecedores, vencimentos, status pago/pendente).
- [ ] **Contas a receber** consolidadas (já existe parcialmente via vendas a prazo
      / cobranças — integrar ao painel financeiro).

### 4. Relatórios contábeis automáticos (todo mês)
- [ ] **DRE completa** (Demonstração do Resultado do Exercício) gerada
      automaticamente a cada mês: receita, custos, despesas, lucro.
- [ ] **Balanço Patrimonial** mensal automático: ativos (caixa, MP, a receber,
      estoque), passivos (a pagar), patrimônio líquido.
- [ ] Fechamento mensal: o sistema "fecha o mês" sozinho e guarda o histórico.

---

## Metas — Produtividade e Receita

### 5. Lembrete de cobrança vencendo
- [ ] No painel Início, exibir alerta visual "X clientes vencem hoje, R$ Y a receber"
      com link direto para a lista.
- [ ] Botão de **atalho WhatsApp** em cada cobrança vencida: abre o WhatsApp já com
      mensagem de lembrete montada (nome do cliente, valor, vencimento).
- [ ] Marcar cobranças em atraso em vermelho na lista de Cobranças.
- [ ] Opcional: **aviso com 2 dias de antecedência** antes de vencer, pra dar tempo
      de contatar o cliente com calma.

### 6. Margem por produto / produto que mais dá lucro
- [ ] Relatório de **margem real por produto**: faturamento − custo de insumos = lucro bruto.
- [ ] Quando integrar o Mercado Pago e marketplaces: **margem líquida** = lucro bruto
      − taxa da maquininha/plataforma (Shopee, ML, cartão cada um com taxa diferente).
      Ex.: um produto que parece lucrativo pode encolher quando a taxa da Shopee (até 20%)
      entra no cálculo.
- [ ] Ranking visual "Top produtos por lucro" e "Produtos que valem a pena
      empurrar mais" vs. "Produtos que precisam de reajuste de preço".
- [ ] Alerta automático: se o custo de um insumo subir e a margem de um produto
      cair abaixo de um limite definido por você, o sistema avisa.

### 7. Backup / exportação dos dados
- [ ] Botão "Exportar tudo" que baixa os dados (vendas, caixa, clientes, insumos)
      em Excel/CSV, pra ter uma cópia local e pra enviar pro contador quando precisar.
- [ ] Relatório de exportação pronto pra contador: DRE do mês + lista de lançamentos
      formatada, num clique.
- [ ] Registro de **quando o último backup foi feito**, com aviso se passar muito tempo
      sem exportar.

### 8. Precificação inteligente
- [ ] Calculadora de preço por produto: informa o custo dos insumos, e o sistema
      calcula o preço sugerido considerando margem desejada + taxas de cada canal
      (venda direta, maquininha, Shopee, Mercado Livre — cada um tem taxa diferente).
- [ ] O sistema mostra **para cada canal de venda qual o preço mínimo** pra não sair
      no prejuízo, e qual o preço pra atingir a margem desejada.
- [ ] Quando o custo de um insumo mudar, o sistema recalcula automaticamente os
      produtos afetados e sinaliza quais precisam de reajuste de preço.

### 9. Painel do dono (visão única)
- [ ] Uma tela de **resumo executivo** que responde "como está a empresa agora?":
      - Quanto entrou hoje / no mês
      - Quanto saiu hoje / no mês
      - Lucro do mês (faturamento − custos − despesas)
      - A receber nos próximos 7 dias
      - A pagar nos próximos 7 dias
      - Insumos críticos (abaixo do estoque mínimo)
      - Pedidos em produção / atrasados
- [ ] Visual limpo, pensado pra abrir no celular de manhã e ter tudo em 10 segundos.
- [ ] Meta de faturamento mensal: barra de progresso mostrando quanto falta pra bater
      a meta.

### 10. Previsão de fluxo de caixa
- [ ] Tela com os **próximos 30 dias projetados**: junta cobranças a receber + contas
      a pagar por data de vencimento.
- [ ] Mostra dia a dia (ou semana a semana) o saldo projetado: se em alguma data o
      caixa fica negativo, sinaliza em vermelho com antecedência.
- [ ] Permite adicionar lançamentos futuros previstos (ex.: "parcela do fornecedor
      X que vence em tal data").
- [ ] Diferencia o que é **certo** (já faturado / já comprometido) do que é
      **previsto** (estimativas do dono).

---

## Metas — Ganhar tempo no dia a dia

### 11. Fila de produção inteligente
- [ ] Tela de produção ordenada por prazo: mostra o que precisa ser feito primeiro
      pra não atrasar nenhum cliente, considerando data de entrega de cada pedido.
- [ ] Status visual por pedido: aguardando → em produção → pronto → entregue.
- [ ] Alerta de pedido em risco de atraso (quando a data de entrega está chegando
      e o pedido ainda não saiu de produção).

### 12. Mensagem automática de status pro cliente
- [ ] Ao mudar o status de um pedido (ex.: "Pronto para retirada", "Saiu para entrega"),
      botão de **WhatsApp com mensagem pré-montada** pra avisar o cliente sem digitar nada.
- [ ] Templates de mensagem configuráveis pelo dono.

### 13. Lista de compras automática de insumos
- [ ] Quando insumo cai abaixo do mínimo, entra automaticamente numa
      **lista de compras pendentes** com quantidade sugerida pra repor.
- [ ] A lista pode ser exportada ou visualizada numa tela separada antes de ir ao fornecedor.

### 14. Histórico e perfil do cliente
- [ ] Na tela do cliente: total gasto, produtos que mais compra, última compra, cobranças
      em aberto — tudo num lugar só.
- [ ] Lista de **clientes inativos** (não compram há X dias que você define): oportunidade
      de retomar contato e vender mais.

### 15. Orçamento → Pedido em 1 clique
- [ ] Criar um orçamento pra um cliente, mandar pelo WhatsApp e, quando ele aprovar,
      converter em pedido sem digitar de novo.

---

## Princípios de segurança (não negociáveis)

- O token do Mercado Pago só vive no servidor (Apps Script Properties), nunca no
  navegador nem no repositório.
- Toda integração externa é **somente leitura**. O sistema lê pagamentos e
  extratos; nunca movimenta, transfere ou saca dinheiro.
- Saque/transferência só existe dentro do app do Mercado Pago, com login e 2FA —
  fora do alcance de qualquer token de API.

---
_Combinado entre o dono (Allif) e o assistente. Atualizar conforme cada meta for entregue._
