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
- [ ] Módulo de **compras/contas a pagar** (fornecedores, vencimentos, status).
- [ ] **Contas a receber** consolidadas (já existe parcialmente via vendas a prazo
      / cobranças — integrar ao painel financeiro).

### 4. Relatórios contábeis automáticos (todo mês)
- [ ] **DRE completa** (Demonstração do Resultado do Exercício) gerada
      automaticamente a cada mês: receita, custos, despesas, lucro.
- [ ] **Balanço Patrimonial** mensal automático: ativos (caixa, MP, a receber,
      estoque), passivos (a pagar), patrimônio líquido.
- [ ] Fechamento mensal: o sistema "fecha o mês" sozinho e guarda o histórico.

## Princípios de segurança (não negociáveis)

- O token do Mercado Pago só vive no servidor (Apps Script Properties), nunca no
  navegador nem no repositório.
- Toda integração externa é **somente leitura**. O sistema lê pagamentos e
  extratos; nunca movimenta, transfere ou saca dinheiro.
- Saque/transferência só existe dentro do app do Mercado Pago, com login e 2FA —
  fora do alcance de qualquer token de API.

---
_Combinado entre o dono (Allif) e o assistente. Atualizar conforme cada meta for
entregue._
