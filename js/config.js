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
  linkPlanilha: "",

  // Sincronização automática em segundo plano (em milissegundos):
  intervaloSyncMs: 60000,

  formasPagamento: ["Pix", "Dinheiro", "Cartão de débito", "Cartão de crédito", "Fiado"],
  statusVenda: ["Concluída", "Pendente", "Cancelada"],
  unidades: ["un", "kg", "g", "L", "ml", "cx", "pct"],
};

// Mesmos usuários e senhas do sistema antigo (hash SHA-256 da senha).
const USUARIOS_SISTEMA = [
  {
    usuario: "allif",
    nome: "Allif",
    perfil: "admin",
    senhaHash: "da567b5f09f055a646df0e74c6014785930a8d207b22964868153f872b9bf9cf",
  },
  {
    usuario: "karen",
    nome: "Karen",
    perfil: "operacional",
    senhaHash: "e8026bda3ea2eedc7dc7bce9daa640f8cc0f33e335bd73d986a872b3ba789c71",
  },
];
