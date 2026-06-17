"use strict";

/* ============================================================
   Vivassol Gerencial V2 — configuração
   Este é o ÚNICO arquivo que precisa ser editado para
   conectar o sistema à planilha do Google.
   ============================================================ */

const CONFIG = {
  nome: "Vivassol Gerencial",
  versao: "2.0.0",

  // >>> PASSO ÚNICO DE CONFIGURAÇÃO <<<
  // Depois de implantar o Apps Script da nova planilha
  // (veja o README.md), cole aqui a URL gerada (termina em /exec):
  apiUrl: "https://script.google.com/macros/s/AKfycbzToP7-yPt40C_XUuqtOqZmG9pYmQIUC30D2Q2gph_4vZGqMX_6dvu7qcCi9ISyLQTt/exec",

  // Deve ser idêntico ao TOKEN dentro de apps-script/Code.gs:
  token: "viva2_a47f19c3e8b2d5061f9c3a7e4d8b2f60c1a5e937",

  // Link da planilha (opcional, aparece em Configurações):
  linkPlanilha: "https://docs.google.com/spreadsheets/d/103xJ7FgqBWqOABmZZfTaYbsJdgdNcgW8YW6j8cLdtgY/edit?usp=drivesdk",

  // Sincronização automática em segundo plano (em milissegundos):
  intervaloSyncMs: 60000,

  formasPagamento: ["Dinheiro", "Pix", "Cartão de débito", "Cartão de crédito", "Venda a prazo"],
  statusVenda: ["Concluída", "Pendente", "Cancelada"],
  unidades: ["un", "kg", "g", "L", "ml", "cx", "pct"],

  // Condição de venda em que o cliente leva agora e paga depois (fiado).
  // Exige cliente identificado e gera uma cobrança em aberto.
  formaPrazo: "Venda a prazo",

  // Categorias das SAÍDAS do caixa (dinheiro que sai do negócio).
  categoriasSaida: ["Compra de insumos", "Pró-labore", "Contas (água, luz, etc.)", "Retirada", "Outros"],

  // Etapas de produção do pedido (ordem do quadro de fluxo, da esquerda
  // para a direita). "Cancelado" fica à esquerda; "Entregue" é a última.
  statusProducao: ["Cancelado", "Orçamento", "Pedido feito", "Em produção", "Pronto", "Entregue"],

  // Situação do pagamento (o botão cicla nesta ordem).
  statusPagamento: ["Não pago", "Parcial", "Pago"],

  // Código do país para montar o link do WhatsApp (Brasil = 55).
  paisWhatsapp: "55",
};

// Cliente especial para vendas rápidas sem identificar a pessoa. Não fica
// na planilha de clientes; é sempre a primeira opção na hora de vender.
// Não pode ser usado em "Venda a prazo" (fiado exige cliente real).
const CLIENTE_AVISTA = { id: "CLI_AVISTA", nome: "Venda à vista", avista: true, telefone: "" };

// Mesmos usuários e senhas do sistema antigo (hash SHA-256 da senha).
const USUARIOS_SISTEMA = [
  // acessoFinanceiro: libera Caixa, Cobranças e Relatórios. Para um novo
  // usuário, defina true (vê o financeiro) ou false (não vê).
  {
    usuario: "allif",
    nome: "Allif",
    perfil: "admin",
    senhaHash: "da567b5f09f055a646df0e74c6014785930a8d207b22964868153f872b9bf9cf",
    acessoFinanceiro: true,
  },
  {
    usuario: "karen",
    nome: "Karen",
    perfil: "operacional",
    senhaHash: "e8026bda3ea2eedc7dc7bce9daa640f8cc0f33e335bd73d986a872b3ba789c71",
    acessoFinanceiro: true,
  },
];
