# Vivassol Gerencial V2

Sistema gerencial da Vivassol, refeito do zero: simples, organizado e feito
primeiro para o **celular** (a Karen usa só o celular). Funciona também no
computador, com menu lateral e venda guiada pela tecla **Enter**.

O projeto antigo continua intacto em `Documents\Programa Vivassol`.

## Estrutura

```
Vivassol Gerencial V2/
├── index.html            ← página única do sistema
├── manifest.json         ← deixa o site "instalável" no celular
├── css/styles.css        ← visual (mobile-first)
├── js/
│   ├── config.js         ← ÚNICO arquivo que precisa ser editado
│   ├── core.js           ← núcleo: sincronização, login, navegação
│   ├── inicio.js         ← painel do dia
│   ├── vendas.js         ← lista de pedidos + criação (pedido/orçamento)
│   ├── fluxo.js          ← quadro de fluxo (Kanban) dos pedidos
│   ├── caixa.js          ← controle de caixa (dinheiro x banco) e relatórios
│   ├── cobrancas.js      ← vendas a prazo em aberto (fiado)
│   ├── estoque.js        ← insumos + conferência de estoque
│   ├── clientes.js       ← clientes
│   ├── produtos.js       ← produtos vendidos
│   └── configuracoes.js  ← conexão e informações (só admin)
├── apps-script/Code.gs   ← código que vai dentro da planilha Google
├── agente/               ← projeto futuro: agente de IA no WhatsApp
└── images/               ← logo e ícones
```

## Como colocar no ar (passo a passo)

### 1. Criar a planilha nova

1. Acesse [sheets.new](https://sheets.new) e crie uma planilha vazia.
   Dê um nome, por exemplo: **Vivassol BD V2**.
2. Menu **Extensões → Apps Script**.
3. Apague o que estiver lá e cole TODO o conteúdo de `apps-script/Code.gs`.
4. Salve (Ctrl+S). Na barra de cima, escolha a função **configurarPlanilha**
   e clique em **Executar**. Autorize com sua conta Google quando pedir.
   → As abas serão criadas automaticamente com os cabeçalhos.
5. Clique em **Implantar → Nova implantação**:
   - Tipo: **App da web**
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
6. Copie a **URL** gerada (termina em `/exec`).

### 2. Conectar o site

1. Abra `js/config.js`.
2. Cole a URL no campo `apiUrl` (entre as aspas).
3. Pronto. Não precisa configurar nada em cada aparelho — a conexão
   já vai embutida no site.

### 3. Publicar o site

Qualquer hospedagem de arquivos estáticos funciona (GitHub Pages,
Netlify, Vercel…). Basta publicar esta pasta inteira. Para testar no
próprio computador, dá para abrir o `index.html` direto no navegador.

### 4. No celular da Karen

1. Abra o endereço do site no Chrome.
2. Menu ⋮ → **Adicionar à tela inicial**.
3. O sistema abre como um aplicativo, sem a barra do navegador.

### Atualização: caixa, cobranças e cliente no pedido

Esta versão acrescentou:
- duas abas novas na planilha: **pagamentos** (histórico de recebimentos)
  e **lancamentos** (livro caixa: entradas e saídas, dinheiro x banco);
- a coluna **data_vencimento** ao final da aba **vendas**.

Depois de colar o `apps-script/Code.gs` atualizado, **republique** (Implantar
→ Gerenciar implantações → editar → Nova versão) e, de preferência, rode
**configurarPlanilha** uma vez para já criar as abas novas. O caixa e as
cobranças só sincronizam entre aparelhos depois desse passo.

### Atualização: pedidos e fluxo de produção

Esta versão acrescentou colunas novas na aba **vendas** (tipo, data de
entrega, etapa de produção, situação de pagamento etc.). As colunas foram
adicionadas **ao final** da aba, então os dados antigos não saem do lugar.

Para que essas colunas sincronizem entre os aparelhos, abra a planilha em
**Extensões → Apps Script**, cole novamente o `apps-script/Code.gs`
atualizado e clique em **Implantar → Gerenciar implantações → editar
(lápis) → Versão: Nova versão → Implantar**. Isso publica o código novo no
mesmo endereço `/exec`.

A partir desta versão o Apps Script **conserta o cabeçalho sozinho**: na
primeira gravação ele acrescenta ao final da aba as colunas que faltarem,
sem apagar nenhum dado (executar **configurarPlanilha** uma vez deixa tudo
pronto de imediato). Enquanto a planilha não estiver atualizada, o próprio
aparelho preserva a etapa do pedido localmente para nada se perder.

## Pedidos e fluxo de produção

- Cada venda agora é um **pedido**, que pode nascer como **Orçamento** ou
  **Pedido**. O orçamento não dá baixa no estoque; vira pedido ao avançar.
- Cada pedido tem uma **etapa de produção** (Cancelado, Orçamento, Pedido
  feito, Em produção, Pronto, Entregue) e uma **situação de pagamento**
  (Não pago, Parcial, Pago).
- A tela **Fluxo** mostra o quadro Kanban: arraste o cartão pela alça,
  use as setas ‹ › ou abra o pedido para mudar de etapa. Pedidos
  entregues/cancelados podem sair do quadro (continuam na lista de Pedidos).
- Ao mover para **Entregue** sem estar pago, ou **Cancelar** um pedido já
  pago/parcial, o sistema avisa antes de confirmar.
- Pelo botão do **WhatsApp** dá para enviar (ou copiar) a mensagem do
  pedido/orçamento já formatada para o cliente.

## Cliente, cobranças e caixa

- **Cliente no pedido:** ao criar um pedido, primeiro escolhe-se o cliente
  (busca sólida, igual à de produtos) e depois os produtos. Dá para
  **cadastrar um cliente novo** ali mesmo, sem sair da tela. A opção
  **"Venda à vista"** é sempre a primeira da lista, para vendas rápidas sem
  identificar a pessoa.
- **Forma de pagamento:** as vendas **à vista** (Dinheiro, Pix, cartões)
  entram no caixa na hora — Dinheiro vai para o "dinheiro vivo"; Pix e
  cartões para o "banco". A **Venda a prazo** (fiado) exige um cliente
  identificado e uma data limite ("Pagar até"), e não entra no caixa até ser
  recebida.
- **Cobranças:** lista quem está devendo, agrupado por cliente, com saldo e
  vencimento (vencidos em vermelho). Dá para **receber** (total ou parcial,
  com nova data para o restante) e **cobrar pelo WhatsApp** com a mensagem
  pronta. Cada recebimento fica no histórico do pedido e pode ser estornado.
- **Caixa:** saldos de dinheiro e banco separados; movimentações com filtro;
  **saídas** (com categoria e descrição) e **ajuste de caixa** (escondido,
  com motivo obrigatório); e **relatório** por dia, semana, mês ou período
  personalizado (faturamento, recebido, saídas por categoria, lucro bruto e
  total a receber).
- **Acesso:** Caixa e Cobranças aparecem só para quem tem `acessoFinanceiro`
  em `js/config.js` (hoje: allif e karen). Para um usuário novo, defina
  `acessoFinanceiro: true` ou `false`.

## Login

Os usuários e senhas são **os mesmos do sistema antigo** (allif e karen).
A senha não fica na planilha — a verificação acontece no próprio site.

## Como funciona a sincronização

- Tudo é salvo **primeiro no aparelho** (funciona até sem internet) e
  enviado à planilha em seguida.
- O sistema baixa as novidades da planilha a cada 60 segundos e ao
  voltar para o aplicativo.
- **Proteções contra os problemas da V1:**
  - A tela nunca é atualizada enquanto alguém está digitando, com um
    formulário aberto ou no meio de uma venda.
  - Uma tabela com alterações ainda não enviadas nunca é sobrescrita
    pelos dados da planilha.
- A bolinha no topo mostra o estado: verde = conectado, amarela =
  sincronizando, vermelha = sem conexão, cinza = planilha não conectada.

## Decisões de simplicidade (de propósito)

- **7 abas** na planilha, nada além disso: `painel_BD`, `configuracoes`,
  `usuarios`, `clientes`, `produtos`, `insumos`, `vendas`.
- `vendas` é "achatada": cada linha = 1 item; itens da mesma venda
  compartilham o `id_venda`. Pagamento, status e entrega ficam na própria
  linha — sem abas separadas.
- **Sem baixa automática de estoque** ao vender. O estoque de insumos é
  mantido pela edição dos itens e pela **Conferência** (contagem por
  categoria, busca ou completa). Menos automação escondida = menos sustos.
- Sem aba de backup por enquanto (o Google Sheets guarda o histórico de
  versões em Arquivo → Histórico de versões).

## Agente de IA (futuro)

A pasta `agente/` contém o desenho do bot de WhatsApp que registrará
vendas por conversa. Ver `agente/README.md`.
