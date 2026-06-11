/* ============================================================
   Vivassol Gerencial V2 — API da planilha (Google Apps Script)

   COMO INSTALAR (uma vez só):
   1. Crie uma planilha NOVA e vazia no Google Sheets.
   2. Menu Extensões > Apps Script. Apague o conteúdo e cole
      este arquivo inteiro.
   3. No editor do Apps Script, selecione a função
      "configurarPlanilha" e clique em Executar (autorize quando
      pedir). Isso cria todas as abas com os cabeçalhos.
   4. Clique em Implantar > Nova implantação > tipo "App da web":
        - Executar como: Eu
        - Quem pode acessar: Qualquer pessoa
   5. Copie a URL gerada (termina em /exec) e cole em
      js/config.js do site, no campo apiUrl.

   O TOKEN abaixo deve ser idêntico ao token de js/config.js.
   ============================================================ */

const TOKEN = "viva2_a47f19c3e8b2d5061f9c3a7e4d8b2f60c1a5e937";

// Estrutura das abas. A ordem das colunas é a ordem na planilha.
const ABAS = {
  painel_BD: ["chave", "valor"],
  configuracoes: ["chave", "valor"],
  usuarios: ["id", "usuario", "nome", "perfil", "status"],
  clientes: ["id", "nome", "telefone", "endereco", "observacoes", "criado_em"],
  produtos: ["id", "nome", "categoria", "preco", "unidade", "ativo", "criado_em"],
  insumos: ["id", "nome", "categoria", "unidade", "quantidade", "estoque_minimo", "custo", "atualizado_em"],
  vendas: ["id", "id_venda", "data", "cliente_id", "cliente_nome", "produto_id", "produto_nome",
           "quantidade", "preco_unit", "subtotal", "pagamento", "status", "entrega",
           "observacoes", "criado_por", "criado_em"],
};

// Abas que o site lê e grava (painel_BD é só informativa).
const ABAS_DE_DADOS = ["configuracoes", "usuarios", "clientes", "produtos", "insumos", "vendas"];

/* ---------------- instalação ---------------- */

function configurarPlanilha() {
  const planilha = SpreadsheetApp.getActive();

  Object.keys(ABAS).forEach(function (nome) {
    let aba = planilha.getSheetByName(nome);
    if (!aba) aba = planilha.insertSheet(nome);
    const cabecalho = ABAS[nome];
    aba.getRange(1, 1, 1, cabecalho.length)
      .setValues([cabecalho])
      .setFontWeight("bold")
      .setBackground("#2E7D32")
      .setFontColor("#FFFFFF");
    aba.setFrozenRows(1);
  });

  // Remove a aba padrão vazia, se existir.
  ["Página1", "Sheet1"].forEach(function (nome) {
    const aba = planilha.getSheetByName(nome);
    if (aba && aba.getLastRow() <= 1 && planilha.getSheets().length > 1) {
      planilha.deleteSheet(aba);
    }
  });

  // Usuários iniciais (a senha NÃO fica na planilha; o acesso é
  // verificado no site, em js/config.js).
  const abaUsuarios = planilha.getSheetByName("usuarios");
  if (abaUsuarios.getLastRow() < 2) {
    abaUsuarios.getRange(2, 1, 2, 5).setValues([
      ["usr_allif", "allif", "Allif", "admin", "Ativo"],
      ["usr_karen", "karen", "Karen", "operacional", "Ativo"],
    ]);
  }

  atualizarPainel(planilha);
}

/* ---------------- pontos de entrada ---------------- */

function doGet() {
  return resposta({
    ok: true,
    dados: { servico: "Vivassol Gerencial V2", hora: new Date().toISOString() },
  });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return resposta({ ok: false, erro: "Requisição vazia" });
    }
    const corpo = JSON.parse(e.postData.contents);
    if (!corpo || corpo.token !== TOKEN) {
      return resposta({ ok: false, erro: "Token inválido" });
    }

    if (corpo.acao === "ping") {
      return resposta({ ok: true, dados: { pong: true, hora: new Date().toISOString() } });
    }

    if (corpo.acao === "obterTudo") {
      return resposta({ ok: true, dados: obterTudo() });
    }

    if (corpo.acao === "salvarTabela") {
      const tabela = corpo.payload && corpo.payload.tabela;
      const linhas = (corpo.payload && corpo.payload.linhas) || [];
      if (ABAS_DE_DADOS.indexOf(tabela) === -1) {
        return resposta({ ok: false, erro: "Tabela desconhecida: " + tabela });
      }
      const quantidade = salvarTabela(tabela, linhas);
      return resposta({ ok: true, dados: { tabela: tabela, linhas: quantidade } });
    }

    return resposta({ ok: false, erro: "Ação desconhecida: " + corpo.acao });
  } catch (erro) {
    return resposta({ ok: false, erro: String(erro) });
  }
}

/* ---------------- leitura e gravação ---------------- */

function obterTudo() {
  const planilha = SpreadsheetApp.getActive();
  const dados = {};
  ABAS_DE_DADOS.forEach(function (nome) {
    dados[nome] = lerTabela(planilha, nome);
  });
  return dados;
}

function lerTabela(planilha, nome) {
  const aba = planilha.getSheetByName(nome);
  if (!aba) return [];
  const valores = aba.getDataRange().getValues();
  if (valores.length < 2) return [];
  const cabecalho = valores[0].map(String);
  return valores.slice(1)
    .filter(function (linha) {
      return linha.some(function (celula) { return celula !== "" && celula !== null; });
    })
    .map(function (linha) {
      const objeto = {};
      cabecalho.forEach(function (coluna, i) {
        let valor = linha[i];
        if (valor instanceof Date) valor = valor.toISOString();
        objeto[coluna] = valor;
      });
      return objeto;
    });
}

function salvarTabela(nome, linhas) {
  const trava = LockService.getScriptLock();
  trava.waitLock(15000);
  try {
    const planilha = SpreadsheetApp.getActive();
    let aba = planilha.getSheetByName(nome);
    if (!aba) {
      aba = planilha.insertSheet(nome);
      aba.getRange(1, 1, 1, ABAS[nome].length).setValues([ABAS[nome]]).setFontWeight("bold");
      aba.setFrozenRows(1);
    }
    const cabecalho = ABAS[nome];

    // Limpa os dados antigos (mantém o cabeçalho).
    const ultimaLinha = aba.getLastRow();
    if (ultimaLinha > 1) {
      aba.getRange(2, 1, ultimaLinha - 1, Math.max(cabecalho.length, aba.getLastColumn())).clearContent();
    }

    // Grava as linhas novas na ordem das colunas do cabeçalho.
    if (linhas.length) {
      const matriz = linhas.map(function (objeto) {
        return cabecalho.map(function (coluna) {
          const valor = objeto[coluna];
          return valor === undefined || valor === null ? "" : valor;
        });
      });
      aba.getRange(2, 1, matriz.length, cabecalho.length).setValues(matriz);
    }

    atualizarPainel(planilha);
    return linhas.length;
  } finally {
    trava.releaseLock();
  }
}

/* Aba painel_BD: resumo informativo para quem abre a planilha. */
function atualizarPainel(planilha) {
  const aba = planilha.getSheetByName("painel_BD");
  if (!aba) return;
  const linhas = [
    ["sistema", "Vivassol Gerencial V2"],
    ["ultima_alteracao", new Date()],
  ];
  ABAS_DE_DADOS.forEach(function (nome) {
    const abaDados = planilha.getSheetByName(nome);
    const registros = abaDados ? Math.max(abaDados.getLastRow() - 1, 0) : 0;
    linhas.push(["registros_" + nome, registros]);
  });
  const ultimaLinha = aba.getLastRow();
  if (ultimaLinha > 1) aba.getRange(2, 1, ultimaLinha - 1, 2).clearContent();
  aba.getRange(2, 1, linhas.length, 2).setValues(linhas);
}

/* ---------------- resposta JSON ---------------- */

function resposta(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}
