# Integração Site E-commerce ↔ Vivassol Gerencial

> Documento de referência para o **projeto do novo site (e-commerce da Vivassol)**.
> O site será desenvolvido em **outro repositório e outro chat**, mas precisa
> integrar com o Vivassol Gerencial (este sistema). Este arquivo explica COMO o
> Gerencial funciona hoje e as REGRAS para a integração funcionar sem quebrar nada.
>
> No chat do site, comece mandando: _"Leia o docs/INTEGRACAO-SITE.md do repositório
> Vivassol Gerencial para entender como integrar."_

---

## 1. O que é o Vivassol Gerencial

É o sistema de gestão interna da Vivassol (fábrica de produtos personalizados):
controla **produtos, insumos/estoque, clientes, pedidos, produção (fluxo) e caixa**.
É um PWA (HTML/CSS/JS puro, sem framework) que guarda os dados numa **planilha do
Google Sheets**, acessada por uma **API em Google Apps Script**.

- Front-end: arquivos estáticos (`index.html`, `js/`, `css/`).
- "Backend"/banco: **Google Apps Script** (`apps-script/Code.gs`) + planilha.
- O app nunca fala direto com a planilha — sempre pela API do Apps Script.

## 2. A regra de ouro da integração

> **O site NUNCA acessa a planilha diretamente. Toda comunicação passa pela mesma
> API do Apps Script (ou por uma API nova bem definida). Nada de banco paralelo.**

Se o site criar o próprio estoque/produtos por fora, vão existir duas verdades que
nunca batem (vende-se o que não tem, preço errado, etc.). O Vivassol Gerencial é o
**cérebro / fonte da verdade**. O site é mais um **canal de venda** (como Shopee e
Mercado Livre serão), que lê o catálogo e empurra pedidos de volta.

### Quem manda em cada dado

| Dado                | Fonte da verdade      | Papel do site                          |
|---------------------|-----------------------|----------------------------------------|
| Produtos / preços   | **Vivassol Gerencial**| Só LÊ (mostra a vitrine)               |
| Estoque / insumos   | **Vivassol Gerencial**| Só LÊ (não vende o que não tem)        |
| Clientes            | Ambos                 | Site cria cliente novo ao finalizar    |
| Pedido do site      | **Site cria → envia** | Vira venda + entra na produção e caixa |

## 3. Como a API atual funciona

Arquivo: `apps-script/Code.gs`. É um Web App publicado (URL termina em `/exec`).
Toda chamada é **POST** com JSON no corpo, e **todo corpo precisa do token**.

```
POST  <apiUrl>
Content-Type: application/json

{
  "token": "<TOKEN secreto, igual ao de js/config.js e Code.gs>",
  "acao":  "<nome da ação>",
  "payload": { ... }     // depende da ação
}
```

Resposta sempre em JSON: `{ "ok": true, "dados": ... }` ou `{ "ok": false, "erro": "..." }`.

### Ações disponíveis hoje

| Ação              | O que faz                                                            |
|-------------------|----------------------------------------------------------------------|
| `ping`            | Testa a conexão                                                      |
| `obterTudo`       | Retorna TODAS as tabelas de dados (catálogo, vendas, etc.)          |
| `salvarTabela`    | Reescreve uma tabela inteira (`payload: {tabela, linhas}`)          |
| `arquivarAntigos` | Manutenção interna (não usar no site)                               |
| `resumoArquivo` / `restaurarArquivo` | Manutenção interna (não usar no site)            |

> ⚠️ Hoje `salvarTabela` **reescreve a tabela inteira** — não é seguro pro site usar
> direto (dois pedidos ao mesmo tempo se sobrescreveriam). Ver seção 5.

## 4. Estrutura das tabelas (colunas principais)

Definidas em `apps-script/Code.gs` (constante `ABAS`):

- **produtos**: `id, nome, categoria, preco, unidade, ativo, criado_em, composicao`
  (`composicao` = receita de insumos; `ativo` define se aparece à venda)
- **insumos**: `id, nome, categoria, unidade, quantidade, estoque_minimo, custo, atualizado_em`
- **clientes**: `id, nome, telefone, endereco, observacoes, criado_em`
- **vendas**: `id, id_venda, data, cliente_id, cliente_nome, produto_id, produto_nome,
  quantidade, preco_unit, subtotal, pagamento, status, ..., status_producao,
  status_pagamento, valor_pago, data_entrega, ...`
  (uma venda com vários itens vira várias linhas com o mesmo `id_venda`)
- **pagamentos**: `id, id_venda, cliente_nome, data, valor, forma_pagamento, ...`
- **lancamentos** (caixa): `id, data, tipo, categoria, descricao, valor, destino,
  id_referencia, ...`

Um pedido do site deve nascer como linhas em **vendas** (com um `id_venda` próprio,
ex.: prefixo `SITE-`), marcado como canal "site", e gerar o lançamento/entrada de
caixa do mesmo jeito que uma venda da Shopee fará.

## 5. O caminho recomendado para integrar (sem quebrar nada)

A integração tem dois sentidos:

**A) Catálogo (Gerencial → Site): só leitura.**
O site lê produtos + estoque para montar a vitrine. Pode ser via `obterTudo` (ou uma
ação nova `obterCatalogo` mais enxuta, que devolva só produtos ativos com preço/estoque).

**B) Pedido (Site → Gerencial): escrita segura.**
NÃO usar `salvarTabela` (que reescreve tudo). Criar no `Code.gs` uma **ação nova e
atômica**, ex.: `criarPedidoSite`, que:
1. Recebe os itens do carrinho + dados do cliente + opções de personalização.
2. Acrescenta as linhas em `vendas` (append, com trava — `LockService` já é usado).
3. Cria o cliente em `clientes` se for novo.
4. Lança a entrada no caixa (`lancamentos`) conforme a forma de pagamento.
5. Retorna o `id_venda` gerado.

Assim o pedido do site cai automaticamente na produção (Fluxo) e no Caixa do
Gerencial, sem digitação manual.

### Personalização / 3D

O site terá produtos personalizados com visualizador 3D. A **configuração escolhida
pelo cliente** (cor, texto, arte, etc.) precisa viajar junto com o pedido — sugestão:
um campo de texto JSON na venda (ex.: reaproveitar `observacoes` ou criar coluna
`personalizacao`) descrevendo exatamente o que produzir. O Gerencial não precisa
renderizar o 3D; só precisa receber a "ficha de produção" legível.

## 6. Segurança

- O **token** da API é secreto. No site, ele só pode viver no **servidor do site**
  (nunca no JavaScript que vai pro navegador do cliente). O navegador do cliente fala
  com o backend do site; o backend do site fala com o Apps Script.
- Mesma regra do Mercado Pago (ver `docs/METAS-FINANCEIRO.md`): segredo só no servidor.
- Considerar, no futuro, graduar de Apps Script para um backend/banco de verdade se o
  volume do site crescer — mas mantendo a MESMA ideia de "uma porta de API só".

## 7. Checklist para o chat do site seguir

- [ ] Ler este documento e o `README.md` do Vivassol Gerencial antes de codar.
- [ ] Tratar o Gerencial como fonte da verdade de produtos e estoque (site só lê).
- [ ] Implementar a leitura do catálogo (ação de leitura da API).
- [ ] Propor e implementar (no `Code.gs`) a ação atômica `criarPedidoSite`.
- [ ] Levar a personalização (3D) como ficha de produção legível junto ao pedido.
- [ ] Nunca expor o token no navegador; segredo só no servidor do site.
- [ ] Versionar TODO o código do site no GitHub desde o início (ver seção 8).

## 8. Por que o código fica no GitHub

O dono (Allif) trabalha **pelo celular**, usando o Claude Code. Para isso funcionar:

- Todo o código do site fica num **repositório no GitHub** desde o primeiro dia.
- Assim dá para abrir o Claude Code no celular, apontar pro repositório e pedir
  alterações de qualquer lugar — sem depender de computador.
- O chat do site deve **commitar e dar push a cada etapa** e, importante, **guiar o
  Allif passo a passo** nas configurações que ele precisa fazer manualmente (criar
  repositório, publicar o site, configurar a URL/segredos da API, etc.), de forma
  simples e sem pressupor conhecimento técnico.

---
_Documento de handoff entre o projeto Vivassol Gerencial e o futuro projeto do site.
Atualizar se a API do Apps Script mudar._
