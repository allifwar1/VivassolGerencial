# Agente de IA — Vendas pelo WhatsApp (projeto futuro)

Objetivo: a Karen manda uma mensagem num grupo/conversa do WhatsApp
("vendi 2 bolos de mel pra Maria, 80 reais no pix") e o agente entende,
pergunta o que faltar, confirma com um resumo e grava a venda na mesma
planilha que o site usa.

## Modelo escolhido

**`claude-haiku-4-5`** (API da Anthropic) — o mais rápido e barato
(US$ 1/M tokens de entrada, US$ 5/M de saída). Mensagens de WhatsApp são
curtas e o trabalho é repetitivo (extrair produto, quantidade, cliente,
valor, pagamento), então não precisa de um modelo maior. Se um dia ele
errar em casos ambíguos, basta trocar a string do modelo por
`claude-sonnet-4-6`.

## Arquitetura

```
WhatsApp (Karen escreve)
   ↓
Ponte WhatsApp → servidor
   (opções: WhatsApp Business Cloud API, Evolution API ou n8n)
   ↓
Servidor Node.js (este diretório, futuramente)
   - guarda o histórico da conversa em andamento
   - chama a API do Claude com o histórico + catálogo de produtos
   ↓
Claude (claude-haiku-4-5)
   - extrai os dados em JSON (saída estruturada garantida)
   - decide: perguntar o que falta OU confirmar o resumo
   ↓
Confirmou? → POST no Apps Script (mesma API do site, ação "salvarTabela")
   ↓
Venda aparece no site e na planilha
```

Pontos importantes do desenho:

1. **O agente usa a mesma API do site** (`apps-script/Code.gs`), com o
   mesmo token. Nenhuma estrutura paralela.
2. **Conversa em etapas**: o histórico da conversa é reenviado a cada
   mensagem, então o Claude sabe se está coletando dados, perguntando
   algo ou esperando a confirmação.
3. **Nada é gravado sem confirmação.** O agente sempre mostra o resumo
   ("✅ 2x Bolo de Mel · Maria · R$ 80 · Pix — confirma?") e só grava
   depois do "sim".

## O que falta para tirar do papel

| Item | O que é |
|---|---|
| Chave da API Anthropic | criar em console.anthropic.com (variável `ANTHROPIC_API_KEY`) |
| Ponte com o WhatsApp | a opção mais simples hoje: Evolution API ou n8n num servidor |
| Servidor | qualquer VPS pequena ou serviço tipo Railway/Render |
| Catálogo no prompt | o agente busca os produtos via ação `obterTudo` da API da planilha |

## Esqueleto da chamada ao Claude (Node.js)

```js
import Anthropic from "@anthropic-ai/sdk";

const claude = new Anthropic(); // lê ANTHROPIC_API_KEY do ambiente

const resposta = await claude.messages.create({
  model: "claude-haiku-4-5",
  max_tokens: 1024,
  system: SYSTEM_PROMPT, // regras + catálogo de produtos + campos obrigatórios
  messages: historicoDaConversa, // [{role:"user"|"assistant", content:"..."}]
  output_config: {
    format: {
      type: "json_schema",
      schema: {
        type: "object",
        properties: {
          fase: { type: "string", enum: ["coletando", "confirmando", "confirmada", "fora_de_assunto"] },
          mensagem_para_usuario: { type: "string" },
          venda: {
            type: "object",
            properties: {
              cliente: { type: "string" },
              pagamento: { type: "string" },
              itens: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    produto: { type: "string" },
                    quantidade: { type: "number" },
                    preco_unit: { type: "number" }
                  },
                  required: ["produto", "quantidade", "preco_unit"],
                  additionalProperties: false
                }
              }
            },
            required: ["cliente", "pagamento", "itens"],
            additionalProperties: false
          }
        },
        required: ["fase", "mensagem_para_usuario", "venda"],
        additionalProperties: false
      }
    }
  }
});
```

O servidor lê `fase`:
- `coletando` / `confirmando` → responde `mensagem_para_usuario` no WhatsApp;
- `confirmada` → grava na planilha (mesmo formato de linhas do site:
  1 linha por item, `id_venda` compartilhado, `criado_por: "agente-whatsapp"`)
  e responde o resumo final.

Quando decidirmos montar isso, o código do servidor entra nesta pasta.
