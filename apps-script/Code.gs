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
  produtos: ["id", "nome", "categoria", "preco", "unidade", "ativo", "criado_em", "composicao"],
  insumos: ["id", "nome", "categoria", "unidade", "quantidade", "estoque_minimo", "custo", "atualizado_em"],
  // IMPORTANTE: as 16 primeiras colunas são as originais e NÃO mudam de
  // posição (a planilha já tem dados nelas). As colunas de pedido/fluxo são
  // acrescentadas ao FINAL, para que reexecutar configurarPlanilha apenas
  // adicione cabeçalhos novos sem desalinhar os dados existentes.
  vendas: ["id", "id_venda", "data", "cliente_id", "cliente_nome", "produto_id", "produto_nome",
           "quantidade", "preco_unit", "subtotal", "pagamento", "status", "entrega",
           "observacoes", "criado_por", "criado_em",
           "tipo", "data_entrega", "item_pronto", "status_pagamento", "valor_pago",
           "status_producao", "arquivado", "data_vencimento", "ordem_fluxo"],
  // Histórico de recebimentos de cada venda (uma linha por pagamento).
  pagamentos: ["id", "id_venda", "cliente_nome", "data", "valor", "forma_pagamento",
               "criado_por", "criado_em"],
  // Livro caixa: toda entrada/saída de dinheiro, separada por destino.
  lancamentos: ["id", "data", "tipo", "categoria", "descricao", "valor", "destino",
                "id_referencia", "criado_por", "criado_em"],
};

// Abas que o site lê e grava (painel_BD é só informativa).
const ABAS_DE_DADOS = ["configuracoes", "usuarios", "clientes", "produtos", "insumos", "vendas", "pagamentos", "lancamentos"];

// Abas de ARQUIVO: para onde vão os dados antigos já finalizados, mantendo
// as abas "ativas" pequenas para o app continuar rápido. NÃO são lidas pelo
// site (não entram em ABAS_DE_DADOS) — servem só de histórico consultável.
// Têm exatamente as mesmas colunas das abas originais.
ABAS.vendas_arquivo = ABAS.vendas;
ABAS.pagamentos_arquivo = ABAS.pagamentos;
ABAS.lancamentos_arquivo = ABAS.lancamentos;

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

    if (corpo.acao === "arquivarAntigos") {
      var meses = Number(corpo.payload && corpo.payload.meses) || 12;
      if (meses < 1) meses = 1;
      return resposta({ ok: true, dados: arquivarAntigos(meses) });
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
    return escreverTabela_(SpreadsheetApp.getActive(), nome, linhas);
  } finally {
    trava.releaseLock();
  }
}

/* Reescreve uma aba inteira (cabeçalho + linhas). NÃO adquire trava — quem
   chamar precisa já estar dentro de uma trava (salvarTabela e arquivarAntigos). */
function escreverTabela_(planilha, nome, linhas) {
  let aba = planilha.getSheetByName(nome);
  if (!aba) aba = planilha.insertSheet(nome);
  const cabecalho = ABAS[nome];

  // Garante que a linha de cabeçalho tenha TODAS as colunas atuais
  // (inclusive as novas de pedido/fluxo). Sem isso, os dados gravados em
  // colunas sem cabeçalho não voltam na leitura — e o status muda no
  // aparelho mas "não atualiza" na planilha. Conserta-se sozinho, sem
  // precisar reexecutar configurarPlanilha.
  garantirCabecalho(aba, cabecalho);

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
}

/* ============================================================
   ARQUIVAMENTO DE DADOS ANTIGOS (janela deslizante)
   Move para abas *_arquivo:
   - lançamentos com data anterior ao corte (o saldo líquido deles é
     somado ao "saldo inicial" em configuracoes, preservando o caixa);
   - vendas já FINALIZADAS (Entregue+Pago ou Cancelado) e sem movimento
     recente, junto com seus pagamentos.
   Nada é apagado: tudo continua consultável nas abas de arquivo.
   ============================================================ */

function arquivarAntigos(meses) {
  const trava = LockService.getScriptLock();
  trava.waitLock(30000);
  try {
    const ss = SpreadsheetApp.getActive();
    const corte = dataCorte_(meses); // "YYYY-MM-DD"

    // ---------- LANÇAMENTOS ----------
    const lancs = lerTabela(ss, "lancamentos");
    const lancAntigos = [], lancRecentes = [];
    let addDin = 0, addBanco = 0;
    lancs.forEach(function (l) {
      if (diaDe_(l.data) && diaDe_(l.data) < corte) {
        lancAntigos.push(l);
        const ef = efeitoLanc_(l);
        if (String(l.destino) === "banco") addBanco += ef; else addDin += ef;
      } else {
        lancRecentes.push(l);
      }
    });

    // ---------- VENDAS + PAGAMENTOS ----------
    const vendas = lerTabela(ss, "vendas");
    const pagamentos = lerTabela(ss, "pagamentos");

    const grupos = {};
    vendas.forEach(function (v) {
      const ch = v.id_venda || v.id;
      (grupos[ch] = grupos[ch] || []).push(v);
    });
    const ultPag = {};
    pagamentos.forEach(function (p) {
      const d = diaDe_(p.data);
      if (d && (!ultPag[p.id_venda] || d > ultPag[p.id_venda])) ultPag[p.id_venda] = d;
    });

    const arquivarVenda = {};
    Object.keys(grupos).forEach(function (ch) {
      const base = grupos[ch][0];
      const sp = String(base.status_producao || "");
      const spg = String(base.status_pagamento || "");
      const resolvido = (sp === "Cancelado") || (sp === "Entregue" && spg === "Pago");
      if (!resolvido) return;
      let maxData = "";
      grupos[ch].forEach(function (r) { const d = diaDe_(r.data); if (d > maxData) maxData = d; });
      if (ultPag[ch] && ultPag[ch] > maxData) maxData = ultPag[ch];
      if (maxData && maxData < corte) arquivarVenda[ch] = true;
    });

    const vendasAntigas = [], vendasRecentes = [];
    vendas.forEach(function (v) {
      if (arquivarVenda[v.id_venda || v.id]) vendasAntigas.push(v); else vendasRecentes.push(v);
    });
    const pagAntigos = [], pagRecentes = [];
    pagamentos.forEach(function (p) {
      if (arquivarVenda[p.id_venda]) pagAntigos.push(p); else pagRecentes.push(p);
    });

    // ---------- Grava arquivos (anexa ao que já existir) ----------
    if (lancAntigos.length) anexarArquivo_(ss, "lancamentos_arquivo", lancAntigos);
    if (vendasAntigas.length) anexarArquivo_(ss, "vendas_arquivo", vendasAntigas);
    if (pagAntigos.length) anexarArquivo_(ss, "pagamentos_arquivo", pagAntigos);

    // ---------- Atualiza saldo inicial + carimbo em configuracoes ----------
    const cfg = lerTabela(ss, "configuracoes");
    if (addDin !== 0) setConfig_(cfg, "saldo_inicial_dinheiro", arred2_((Number(lerConfig_(cfg, "saldo_inicial_dinheiro")) || 0) + addDin));
    if (addBanco !== 0) setConfig_(cfg, "saldo_inicial_banco", arred2_((Number(lerConfig_(cfg, "saldo_inicial_banco")) || 0) + addBanco));
    setConfig_(cfg, "ultimo_arquivamento", new Date().toISOString());
    escreverTabela_(ss, "configuracoes", cfg);

    // ---------- Reescreve as abas ativas sem os antigos ----------
    if (lancAntigos.length) escreverTabela_(ss, "lancamentos", lancRecentes);
    if (vendasAntigas.length) escreverTabela_(ss, "vendas", vendasRecentes);
    if (pagAntigos.length) escreverTabela_(ss, "pagamentos", pagRecentes);

    return { vendas: vendasAntigas.length, pagamentos: pagAntigos.length, lancamentos: lancAntigos.length };
  } finally {
    trava.releaseLock();
  }
}

/* Anexa linhas ao final de uma aba de arquivo (sem apagar o que já tem). */
function anexarArquivo_(ss, nome, linhas) {
  let aba = ss.getSheetByName(nome);
  if (!aba) aba = ss.insertSheet(nome);
  const cabecalho = ABAS[nome];
  garantirCabecalho(aba, cabecalho);
  const inicio = Math.max(aba.getLastRow(), 1) + 1;
  const matriz = linhas.map(function (objeto) {
    return cabecalho.map(function (coluna) {
      const valor = objeto[coluna];
      return valor === undefined || valor === null ? "" : valor;
    });
  });
  aba.getRange(inicio, 1, matriz.length, cabecalho.length).setValues(matriz);
}

/* Efeito de um lançamento no saldo (igual ao app): entrada soma, saída
   subtrai, ajuste usa o próprio sinal. */
function efeitoLanc_(l) {
  const v = Number(l.valor) || 0;
  if (String(l.tipo) === "saida") return -Math.abs(v);
  if (String(l.tipo) === "ajuste") return v;
  return Math.abs(v);
}

function dataCorte_(meses) {
  const d = new Date();
  d.setMonth(d.getMonth() - meses);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function diaDe_(valor) { return String(valor || "").slice(0, 10); }
function arred2_(n) { return Math.round(n * 100) / 100; }

function lerConfig_(cfg, chave) {
  for (let i = 0; i < cfg.length; i++) if (cfg[i].chave === chave) return cfg[i].valor;
  return "";
}
function setConfig_(cfg, chave, valor) {
  for (let i = 0; i < cfg.length; i++) if (cfg[i].chave === chave) { cfg[i].valor = valor; return; }
  cfg.push({ chave: chave, valor: valor });
}

/* Garante que a linha 1 da aba tenha exatamente as colunas esperadas,
   na ordem certa. Reescreve o cabeçalho só quando há diferença, então é
   barato chamar a cada gravação. Os dados existentes não saem do lugar
   porque as colunas novas entram sempre ao FINAL (ver ABAS.vendas). */
function garantirCabecalho(aba, cabecalho) {
  const colunasAtuais = Math.max(aba.getLastColumn(), cabecalho.length);
  const atual = aba.getLastColumn() >= 1
    ? aba.getRange(1, 1, 1, colunasAtuais).getValues()[0].map(String)
    : [];
  let precisa = false;
  for (let i = 0; i < cabecalho.length; i++) {
    if (atual[i] !== cabecalho[i]) { precisa = true; break; }
  }
  if (!precisa) return;
  aba.getRange(1, 1, 1, cabecalho.length)
    .setValues([cabecalho])
    .setFontWeight("bold")
    .setBackground("#2E7D32")
    .setFontColor("#FFFFFF");
  aba.setFrozenRows(1);
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
  // Quantos registros estão guardados nas abas de arquivo (histórico antigo).
  ["vendas_arquivo", "pagamentos_arquivo", "lancamentos_arquivo"].forEach(function (nome) {
    const abaArq = planilha.getSheetByName(nome);
    if (abaArq) linhas.push(["arquivados_" + nome, Math.max(abaArq.getLastRow() - 1, 0)]);
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
