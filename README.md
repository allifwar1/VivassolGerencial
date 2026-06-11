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
│   ├── vendas.js         ← lista de vendas + PDV (nova venda)
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
