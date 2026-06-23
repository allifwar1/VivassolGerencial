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
           "status_producao", "arquivado", "data_vencimento", "ordem_fluxo", "estoque_baixado"],
  // Histórico de recebimentos de cada venda (uma linha por pagamento).
  pagamentos: ["id", "id_venda", "cliente_nome", "data", "valor", "forma_pagamento",
               "criado_por", "criado_em"],
  // Livro caixa: toda entrada/saída de dinheiro, separada por destino.
  lancamentos: ["id", "data", "tipo", "categoria", "descricao", "valor", "destino",
                "id_referencia", "criado_por", "criado_em"],
  // Diário de sincronização: histórico de tudo que o app fez ao conversar com a
  // planilha (abriu, enviou, buscou, erros). NÃO entra em ABAS_DE_DADOS — o app
  // só ESCREVE aqui (append), nunca baixa esta aba.
  log_sincronizacao: ["data_hora", "nivel", "evento", "usuario", "sessao"],
};

// Abas que o site lê e grava (painel_BD é só informativa).
const ABAS_DE_DADOS = ["configuracoes", "usuarios", "clientes", "produtos", "insumos", "vendas", "pagamentos", "lancamentos"];

// Abas de ARQUIVO: para onde vão os dados antigos já finalizados, mantendo
// as abas "ativas" pequenas para o app continuar rápido. NÃO são lidas pelo
// site (não entram em ABAS_DE_DADOS) — servem só de histórico consultável.
// Têm as mesmas colunas das abas originais + "data_arquivo" (carimbo de
// quando o registro foi movido, usado para desfazer um arquivamento).
ABAS.vendas_arquivo = ABAS.vendas.concat(["data_arquivo"]);
ABAS.pagamentos_arquivo = ABAS.pagamentos.concat(["data_arquivo"]);
ABAS.lancamentos_arquivo = ABAS.lancamentos.concat(["data_arquivo"]);

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

// Marca da versão do código. Atualize a cada deploy importante para conferir,
// abrindo a URL /exec no navegador, se a versão publicada é mesmo a mais nova.
var VERSAO_CODIGO = "2026-06-23-e";

function doGet() {
  return resposta({
    ok: true,
    dados: { servico: "Vivassol Gerencial V2", versao: VERSAO_CODIGO, hora: new Date().toISOString() },
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

    if (corpo.acao === "anexarLog") {
      var linhasLog = (corpo.payload && corpo.payload.linhas) || [];
      return resposta({ ok: true, dados: anexarLog_(linhasLog) });
    }

    if (corpo.acao === "resumoArquivo") {
      return resposta({ ok: true, dados: resumoArquivo() });
    }

    if (corpo.acao === "restaurarArquivo") {
      return resposta({ ok: true, dados: restaurarArquivo(corpo.payload || {}) });
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

  // NÃO atualiza o painel aqui de propósito: isso re-escaneia todas as abas
  // e tornava cada envio lento (e "vendas" estourava o tempo-limite). O painel
  // é atualizado na leitura (obterTudo).
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
    const corte = dataCorte_(meses);           // "YYYY-MM-DD"
    const lote = new Date().toISOString();      // carimbo deste arquivamento

    // ---------- LANÇAMENTOS ----------
    const lancs = lerTabela(ss, "lancamentos");
    const lancAntigos = [], lancRecentes = [];
    lancs.forEach(function (l) {
      if (diaDe_(l.data) && diaDe_(l.data) < corte) lancAntigos.push(l);
      else lancRecentes.push(l);
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

    // Nada a fazer? Sai sem mexer em nada.
    if (!lancAntigos.length && !vendasAntigas.length && !pagAntigos.length) {
      return { vendas: 0, pagamentos: 0, lancamentos: 0, lote: "" };
    }

    // Carimba o lote em cada linha movida.
    lancAntigos.forEach(function (l) { l.data_arquivo = lote; });
    vendasAntigas.forEach(function (v) { v.data_arquivo = lote; });
    pagAntigos.forEach(function (p) { p.data_arquivo = lote; });

    // ---------- Grava arquivos (anexa ao que já existir) ----------
    if (lancAntigos.length) anexarArquivo_(ss, "lancamentos_arquivo", lancAntigos);
    if (vendasAntigas.length) anexarArquivo_(ss, "vendas_arquivo", vendasAntigas);
    if (pagAntigos.length) anexarArquivo_(ss, "pagamentos_arquivo", pagAntigos);

    // ---------- Reescreve as abas ativas sem os antigos ----------
    if (lancAntigos.length) escreverTabela_(ss, "lancamentos", lancRecentes);
    if (vendasAntigas.length) escreverTabela_(ss, "vendas", vendasRecentes);
    if (pagAntigos.length) escreverTabela_(ss, "pagamentos", pagRecentes);

    // ---------- Atualiza configuracoes (saldo inicial, pisos, carimbos) ----------
    const cfg = lerTabela(ss, "configuracoes");
    recomputarSaldoInicial_(ss, cfg);  // recalcula do zero a partir de lancamentos_arquivo
    atualizarPisosIds_(cfg, vendas, lancs, pagamentos); // antes da remoção: têm os maiores ids
    setConfig_(cfg, "ultimo_arquivamento", lote);
    setConfig_(cfg, "janela_meses", String(meses));
    escreverTabela_(ss, "configuracoes", cfg);

    return { vendas: vendasAntigas.length, pagamentos: pagAntigos.length, lancamentos: lancAntigos.length, lote: lote };
  } finally {
    trava.releaseLock();
  }
}

/* Recalcula o saldo inicial de cada destino a partir do NET de TODOS os
   lançamentos que estão no arquivo. Invariante: o saldo do caixa é sempre
   saldo_inicial + soma(lançamentos ativos), independente de onde está o
   corte — vale tanto ao arquivar quanto ao restaurar. */
function recomputarSaldoInicial_(ss, cfg) {
  const arq = lerTabela(ss, "lancamentos_arquivo");
  let din = 0, banco = 0;
  arq.forEach(function (l) {
    const ef = efeitoLanc_(l);
    if (String(l.destino) === "banco") banco += ef; else din += ef;
  });
  setConfig_(cfg, "saldo_inicial_dinheiro", arred2_(din));
  setConfig_(cfg, "saldo_inicial_banco", arred2_(banco));
}

/* Guarda o maior número de id já usado (ativo + arquivado) por tabela, para
   o app NUNCA gerar um id que colida com um registro arquivado. */
function atualizarPisosIds_(cfg, vendas, lancs, pagamentos) {
  const maxNum = function (linhas, campo, prefixo) {
    let m = 0;
    linhas.forEach(function (r) {
      const n = parseInt(String(r[campo] || "").replace(prefixo, ""), 10) || 0;
      if (n > m) m = n;
    });
    return m;
  };
  const subir = function (chave, valor) {
    const atual = parseInt(lerConfig_(cfg, chave), 10) || 0;
    setConfig_(cfg, chave, Math.max(atual, valor));
  };
  subir("piso_id_vendas", maxNum(vendas, "id_venda", "VDA"));
  subir("piso_id_lancamentos", maxNum(lancs, "id", "LAN"));
  subir("piso_id_pagamentos", maxNum(pagamentos, "id", "PAG"));
}

/* ============================================================
   RESTAURAÇÃO DE DADOS ARQUIVADOS
   Devolve registros das abas *_arquivo para as abas ativas.
   - modo "ultimo": desfaz o arquivamento mais recente (mesmo carimbo).
   - modo "periodo": devolve registros cuja DATA ORIGINAL esteja no
     intervalo [de, ate].
   Com apenasContar=true, só calcula quantos seriam restaurados.
   O saldo inicial é sempre recalculado do zero ao final.
   ============================================================ */

function restaurarArquivo(p) {
  const modo = p && p.modo === "periodo" ? "periodo" : "ultimo";
  const de = diaDe_(p && p.de);
  const ate = diaDe_(p && p.ate);
  const apenasContar = !!(p && p.apenasContar);

  const trava = LockService.getScriptLock();
  trava.waitLock(30000);
  try {
    const ss = SpreadsheetApp.getActive();
    const vendasArq = lerTabela(ss, "vendas_arquivo");
    const pagArq = lerTabela(ss, "pagamentos_arquivo");
    const lancArq = lerTabela(ss, "lancamentos_arquivo");

    // Define o critério de seleção.
    let loteAlvo = "";
    if (modo === "ultimo") {
      [vendasArq, pagArq, lancArq].forEach(function (lista) {
        lista.forEach(function (r) { if (String(r.data_arquivo) > loteAlvo) loteAlvo = String(r.data_arquivo); });
      });
    }
    const selVenda = function (v) {
      return modo === "ultimo" ? String(v.data_arquivo) === loteAlvo
        : (diaDe_(v.data) >= de && diaDe_(v.data) <= ate);
    };
    const selLanc = function (l) {
      return modo === "ultimo" ? String(l.data_arquivo) === loteAlvo
        : (diaDe_(l.data) >= de && diaDe_(l.data) <= ate);
    };

    // Vendas a restaurar e o conjunto de id_venda (os pagamentos seguem a venda).
    const vendasRestaurar = [], vendasManter = [];
    const idsRestaurar = {};
    vendasArq.forEach(function (v) {
      if (selVenda(v)) { vendasRestaurar.push(v); idsRestaurar[v.id_venda || v.id] = true; }
      else vendasManter.push(v);
    });
    const pagRestaurar = [], pagManter = [];
    pagArq.forEach(function (p) {
      if (idsRestaurar[p.id_venda]) pagRestaurar.push(p); else pagManter.push(p);
    });
    const lancRestaurar = [], lancManter = [];
    lancArq.forEach(function (l) {
      if (selLanc(l)) lancRestaurar.push(l); else lancManter.push(l);
    });

    const resultado = { vendas: vendasRestaurar.length, pagamentos: pagRestaurar.length, lancamentos: lancRestaurar.length, lote: loteAlvo };
    if (apenasContar) return resultado;
    if (!vendasRestaurar.length && !pagRestaurar.length && !lancRestaurar.length) return resultado;

    // Remove o carimbo antes de devolver às abas ativas (ignorado de qualquer
    // forma, pois as abas ativas não têm a coluna data_arquivo).
    [vendasRestaurar, pagRestaurar, lancRestaurar].forEach(function (lista) {
      lista.forEach(function (r) { delete r.data_arquivo; });
    });

    // Junta com o que já está ativo e reescreve.
    if (vendasRestaurar.length) escreverTabela_(ss, "vendas", lerTabela(ss, "vendas").concat(vendasRestaurar));
    if (pagRestaurar.length) escreverTabela_(ss, "pagamentos", lerTabela(ss, "pagamentos").concat(pagRestaurar));
    if (lancRestaurar.length) escreverTabela_(ss, "lancamentos", lerTabela(ss, "lancamentos").concat(lancRestaurar));

    // Reescreve as abas de arquivo sem os restaurados.
    if (vendasRestaurar.length) escreverTabela_(ss, "vendas_arquivo", vendasManter);
    if (pagRestaurar.length) escreverTabela_(ss, "pagamentos_arquivo", pagManter);
    if (lancRestaurar.length) escreverTabela_(ss, "lancamentos_arquivo", lancManter);

    // Recalcula o saldo inicial a partir do que SOBROU no arquivo.
    const cfg = lerTabela(ss, "configuracoes");
    recomputarSaldoInicial_(ss, cfg);
    escreverTabela_(ss, "configuracoes", cfg);

    return resultado;
  } finally {
    trava.releaseLock();
  }
}

/* Resumo do que está arquivado (para a tela de gerenciamento). */
function resumoArquivo() {
  const ss = SpreadsheetApp.getActive();
  const vendasArq = lerTabela(ss, "vendas_arquivo");
  const pagArq = lerTabela(ss, "pagamentos_arquivo");
  const lancArq = lerTabela(ss, "lancamentos_arquivo");

  // Último lote (carimbo mais recente) e suas contagens.
  let lote = "";
  [vendasArq, pagArq, lancArq].forEach(function (lista) {
    lista.forEach(function (r) { if (String(r.data_arquivo) > lote) lote = String(r.data_arquivo); });
  });
  const contarLote = function (lista) {
    return lista.filter(function (r) { return String(r.data_arquivo) === lote; }).length;
  };

  // Intervalo de datas ORIGINAIS no arquivo (para orientar a restauração por período).
  let min = "", max = "";
  [vendasArq, lancArq].forEach(function (lista) {
    lista.forEach(function (r) {
      const d = diaDe_(r.data);
      if (!d) return;
      if (!min || d < min) min = d;
      if (!max || d > max) max = d;
    });
  });

  return {
    totais: { vendas: vendasArq.length, pagamentos: pagArq.length, lancamentos: lancArq.length },
    ultimoLote: { data: lote, vendas: contarLote(vendasArq), pagamentos: contarLote(pagArq), lancamentos: contarLote(lancArq) },
    intervalo: { min: min, max: max },
  };
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

/* Anexa linhas ao diário de sincronização (append-only, enxuto). É chamado com
   muita frequência, então: trava curta (tryLock) para não atrasar — se não pegar
   a trava, desiste sem erro (log não é dado crítico); e poda a aba para no máximo
   MAX_LOG linhas, removendo as mais antigas. */
function anexarLog_(linhas) {
  if (!linhas || !linhas.length) return { gravados: 0 };
  var trava = LockService.getScriptLock();
  if (!trava.tryLock(4000)) return { gravados: 0, pulado: true };
  try {
    var ss = SpreadsheetApp.getActive();
    var nome = "log_sincronizacao";
    var aba = ss.getSheetByName(nome);
    if (!aba) aba = ss.insertSheet(nome);
    var cabecalho = ABAS.log_sincronizacao;
    garantirCabecalho(aba, cabecalho);
    var inicio = Math.max(aba.getLastRow(), 1) + 1;
    var matriz = linhas.map(function (o) {
      return cabecalho.map(function (c) {
        var v = o[c];
        return v === undefined || v === null ? "" : v;
      });
    });
    aba.getRange(inicio, 1, matriz.length, cabecalho.length).setValues(matriz);

    var MAX_LOG = 3000;
    var total = aba.getLastRow() - 1;
    if (total > MAX_LOG) aba.deleteRows(2, total - MAX_LOG);

    return { gravados: linhas.length };
  } finally {
    trava.releaseLock();
  }
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
   barato chamar a cada gravação. Usa SOMENTE a API do Sheets (mesmo escopo
   de autorização das leituras) — não usa PropertiesService nem nada que
   exija autorização extra. Os dados existentes não saem do lugar porque as
   colunas novas entram sempre ao FINAL (ver ABAS.vendas). */
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
