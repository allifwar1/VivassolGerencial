"use strict";

/* ============================================================
   Vivassol Gerencial V2 — núcleo do aplicativo
   Estado, sincronização com a planilha, navegação, login,
   modais e utilitários compartilhados pelos módulos.

   Regra de ouro da sincronização:
   - Tabelas com alterações locais pendentes NUNCA são
     sobrescritas pelos dados vindos da planilha.
   - A tela NUNCA é re-renderizada enquanto o usuário está
     digitando, com formulário aberto ou no meio de uma venda.
   ============================================================ */

const App = {
  db: null,               // dados locais (espelho da planilha)
  usuario: null,          // usuário logado
  rota: null,             // módulo atual
  parametrosRota: null,
  modulos: [],
  modaisAbertos: 0,
  editando: false,        // true durante PDV / conferência / telas de digitação
  syncOcupado: false,
  estadoConexao: "sem-config",
  estadoDetalhe: "",      // texto curto do que está acontecendo agora
  ultimaSync: null,
  tabelasPendentes: new Set(),
  timerSync: null,
  logSync: [],            // histórico de eventos desde que a página foi carregada
  logBufferPlanilha: [],  // eventos ainda não enviados para a aba de log da planilha
  logPlanilhaIndisponivel: false, // backend antigo sem a ação anexarLog
  sessaoId: null,         // identifica esta aba/sessão no log da planilha
  _logEl: null,           // terminal de log aberto (atualizado em tempo real)
  _statusEl: null,        // linha de estado do terminal aberto
};

const CHAVE_DB = "vivassol.v2.db";
const CHAVE_SESSAO = "vivassol.v2.sessao";
const CHAVE_PENDENTES = "vivassol.v2.pendentes";
const TABELAS = ["configuracoes", "usuarios", "clientes", "produtos", "insumos", "vendas", "pagamentos", "lancamentos"];

/* ---------------- utilitários ---------------- */

function $(seletor, raiz) { return (raiz || document).querySelector(seletor); }
function $$(seletor, raiz) { return Array.from((raiz || document).querySelectorAll(seletor)); }

function uid(prefixo) {
  return `${prefixo || "id"}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/* Os geradores consideram um "piso" guardado em configuracoes: o maior id já
   usado, incluindo registros ARQUIVADOS (que não estão carregados). Assim um
   id novo nunca colide com um arquivado, mesmo que a tabela ativa esteja vazia. */
function pisoId(tabela) {
  return parseInt(obterConfig("piso_id_" + tabela, 0), 10) || 0;
}

function gerarId(prefixo, tabela) {
  const maxAtivo = App.db[tabela].reduce((m, r) => {
    const n = parseInt(String(r.id).replace(prefixo, "")) || 0;
    return Math.max(m, n);
  }, 0);
  return `${prefixo}${Math.max(maxAtivo, pisoId(tabela)) + 1}`;
}

function gerarIdVenda() {
  const maxAtivo = App.db.vendas.reduce((m, v) => {
    const n = parseInt(String(v.id_venda).replace("VDA", "")) || 0;
    return Math.max(m, n);
  }, 0);
  return `VDA${Math.max(maxAtivo, pisoId("vendas")) + 1}`;
}

function esc(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function numero(valor) {
  if (typeof valor === "number") return isFinite(valor) ? valor : 0;
  const n = parseFloat(String(valor ?? "").trim().replace(",", "."));
  return isFinite(n) ? n : 0;
}

function dinheiro(valor) {
  return numero(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dataHora(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) +
    " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/* Interpreta "YYYY-MM-DD" no fuso local (evita o pulo de um dia que o
   new Date() causa ao tratar a data como UTC). Outros formatos passam direto. */
function parseData(iso) {
  if (!iso) return null;
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(iso);
  return isNaN(d) ? null : d;
}

/* Data curta "14/06" (mostra o ano só quando for diferente do atual). */
function dataCurta(iso) {
  const d = parseData(iso);
  if (!d) return "";
  const opc = { day: "2-digit", month: "2-digit" };
  if (d.getFullYear() !== new Date().getFullYear()) opc.year = "2-digit";
  return d.toLocaleDateString("pt-BR", opc);
}

/* Devolve "" (sem data), "hoje", "atrasado" ou "futuro" para uma data de
   entrega, considerando apenas o dia (ignora horário). */
function situacaoEntrega(iso, statusProducao) {
  const d = parseData(iso);
  if (!d) return "";
  // Pedidos já entregues ou cancelados não disparam alerta de prazo.
  if (statusProducao === "Entregue" || statusProducao === "Cancelado") return "";
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(d);
  alvo.setHours(0, 0, 0, 0);
  if (alvo.getTime() === hoje.getTime()) return "hoje";
  if (alvo.getTime() < hoje.getTime()) return "atrasado";
  return "futuro";
}

function semAcentos(texto) {
  // Remove acentos: "Açúcar" -> "acucar" (faixa ̀-ͯ = acentos combinantes)
  return String(texto ?? "").toLowerCase().normalize("NFD").replace(new RegExp("[\\u0300-\\u036f]", "g"), "");
}

function contemTexto(texto, busca) {
  if (!busca) return true;
  const haystack = semAcentos(String(texto || "")).toLowerCase();
  const fragmentos = semAcentos(String(busca)).toLowerCase().trim().split(/\s+/).filter(Boolean);
  return fragmentos.every(f => haystack.includes(f));
}

function parseComposicao(str, insumos) {
  if (!str) return [];
  return String(str).split(",").map(s => s.trim()).filter(Boolean).flatMap(parte => {
    // Formato atual: INS1[Farinha](200) — aceita também formato legado INS1(200)
    const m = parte.match(/^(\w+)(?:\[([^\]]*)\])?\(([^)]+)\)$/);
    if (!m) return [];
    const [, idInsumo, nomeCache, qtdStr] = m;
    const insumo = (insumos || []).find(i => i.id === idInsumo);
    const nome = insumo?.nome || nomeCache || idInsumo;
    const unidade = insumo?.unidade || "";
    return [{ id_insumo: idInsumo, nome_insumo: nome, quantidade: numero(qtdStr), unidade }];
  });
}

/* ---------------- configurações (tabela chave/valor) ---------------- */

function obterConfig(chave, padrao) {
  const c = (App.db.configuracoes || []).find((c) => c.chave === chave);
  return c && c.valor !== "" && c.valor != null ? c.valor : padrao;
}

function definirConfig(chave, valor) {
  const arr = App.db.configuracoes || (App.db.configuracoes = []);
  const i = arr.findIndex((c) => c.chave === chave);
  if (i >= 0) arr[i].valor = valor;
  else arr.push({ chave, valor });
  salvarTabela("configuracoes");
}

function ehAtivo(registro) {
  const v = registro?.ativo;
  return !(v === false || v === 0 || String(v).toLowerCase() === "false" || String(v).toLowerCase() === "não");
}

function toast(mensagem, tipo = "ok") {
  const area = $("#area-toasts");
  const el = document.createElement("div");
  el.className = `toast toast-${tipo}`;
  el.textContent = mensagem;
  area.appendChild(el);
  requestAnimationFrame(() => el.classList.add("visivel"));
  setTimeout(() => {
    el.classList.remove("visivel");
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

/* ---------------- tema (claro / escuro) ---------------- */

const CHAVE_TEMA = "vivassol.v2.tema";

function temaSalvo() {
  try { return localStorage.getItem(CHAVE_TEMA) === "escuro" ? "escuro" : "claro"; }
  catch { return "claro"; }
}

function aplicarTema(tema) {
  const t = tema === "escuro" ? "escuro" : "claro";
  document.documentElement.dataset.tema = t;
  try { localStorage.setItem(CHAVE_TEMA, t); } catch { /* ignora */ }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", t === "escuro" ? "#13171a" : "#2E7D32");
  const btn = document.getElementById("botao-tema");
  if (btn) {
    btn.innerHTML = t === "escuro" ? ICONES.sol : ICONES.lua;
    btn.setAttribute("aria-label", t === "escuro" ? "Mudar para tema claro" : "Mudar para tema escuro");
  }
}

function alternarTema() {
  aplicarTema(temaSalvo() === "escuro" ? "claro" : "escuro");
}

/* ---------------- ícones (SVG embutido) ---------------- */

function icone(caminho) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${caminho}</svg>`;
}

const ICONES = {
  inicio: icone('<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/>'),
  vendas: icone('<circle cx="9" cy="20" r="1.6"/><circle cx="17" cy="20" r="1.6"/><path d="M3 4h2l2.6 12h10.8L21 8H6"/>'),
  fluxo: icone('<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="11" rx="1"/><rect x="17" y="4" width="4" height="7" rx="1"/>'),
  whatsapp: icone('<path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.9-.9L3 21l1.9-5.6A8.5 8.5 0 1 1 21 11.5z"/>'),
  copiar: icone('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>'),
  estoque: icone('<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5"/><path d="M12 12v9"/>'),
  clientes: icone('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.7-3.4 3.4-5 6.5-5s5.8 1.6 6.5 5"/><path d="M16 5.3a3.5 3.5 0 0 1 0 5.4"/><path d="M18.5 15.4c1.7.8 2.8 2.3 3 4.6"/>'),
  produtos: icone('<path d="M3 11V4h7l10 10-7 7L3 11z"/><circle cx="7.5" cy="8.5" r="1.4"/>'),
  caixa: icone('<rect x="3" y="6.5" width="18" height="13" rx="2"/><path d="M3 10.5h18"/><circle cx="12" cy="15" r="1.6"/>'),
  cobrancas: icone('<path d="M4 5h16v12H4z"/><path d="M4 9h16"/><path d="M8 13h4"/><path d="M19 17v3l2-1.2"/>'),
  config: icone('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2.1 2.1M16.9 16.9 19 19M19 5l-2.1 2.1M7.1 16.9 5 19"/>'),
  mais: icone('<circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/>'),
  sair: icone('<path d="M9 4H4v16h5"/><path d="M16 8l4 4-4 4"/><path d="M9 12h11"/>'),
  sol: icone('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  lua: icone('<path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8z"/>'),
};

/* ---------------- banco local ---------------- */

function dbVazio() {
  const db = {};
  TABELAS.forEach((t) => (db[t] = []));
  return db;
}

function carregarDbLocal() {
  try {
    const bruto = localStorage.getItem(CHAVE_DB);
    App.db = Object.assign(dbVazio(), bruto ? JSON.parse(bruto) : null);
  } catch (e) {
    console.warn("Banco local ilegível, começando vazio.", e);
    App.db = dbVazio();
  }
}

function salvarDbLocal() {
  try {
    localStorage.setItem(CHAVE_DB, JSON.stringify(App.db));
  } catch (e) {
    console.warn("Não foi possível salvar no aparelho.", e);
  }
}

function carregarPendentesLocal() {
  try {
    App.tabelasPendentes = new Set(JSON.parse(localStorage.getItem(CHAVE_PENDENTES) || "[]"));
  } catch {
    App.tabelasPendentes = new Set();
  }
}

function salvarPendentesLocal() {
  localStorage.setItem(CHAVE_PENDENTES, JSON.stringify([...App.tabelasPendentes]));
}

/* ---------------- API da planilha ---------------- */

function apiConfigurada() {
  return /^https:\/\//.test(CONFIG.apiUrl || "");
}

// Tempo máximo (ms) que esperamos uma resposta do Apps Script antes de desistir.
// Sem isso, um pedido travado deixava a sincronização presa em "Sincronizando…"
// para sempre, mesmo com a internet funcionando.
const TEMPO_LIMITE_API = 45000;

async function chamarApi(acao, payload) {
  const controle = new AbortController();
  const estouro = setTimeout(() => controle.abort(), TEMPO_LIMITE_API);
  let resposta;
  try {
    // Corpo enviado como texto simples para evitar bloqueio de CORS no Apps Script.
    resposta = await fetch(CONFIG.apiUrl, {
      method: "POST",
      body: JSON.stringify({ token: CONFIG.token, acao, payload: payload || null }),
      signal: controle.signal,
    });
  } catch (e) {
    // Falha de rede (sem internet, DNS, CORS) ou tempo esgotado (abort).
    const err = new Error(
      e.name === "AbortError"
        ? `tempo esgotado (${Math.round(TEMPO_LIMITE_API / 1000)}s sem resposta)`
        : "sem conexão com a internet"
    );
    err.rede = true;
    throw err;
  } finally {
    clearTimeout(estouro);
  }
  let json;
  try {
    json = await resposta.json();
  } catch (e) {
    const err = new Error("resposta inválida da planilha");
    err.rede = true;
    throw err;
  }
  if (!json.ok) throw new Error(json.erro || "erro na planilha");
  return json.dados;
}

/* ---------------- log de sincronização (tempo real) ---------------- */

const NIVEIS_LOG = {
  info: { rotulo: "INFO", cor: "log-info" },
  conexao: { rotulo: "CONEXÃO", cor: "log-conexao" },
  envio: { rotulo: "ENVIO", cor: "log-envio" },
  busca: { rotulo: "BUSCA", cor: "log-busca" },
  ok: { rotulo: "OK", cor: "log-ok" },
  erro: { rotulo: "ERRO", cor: "log-erro" },
};

/* Registra um evento: guarda no histórico da sessão, espelha no console, atualiza
   o terminal aberto (se houver) e enfileira para a aba de log da planilha. */
function logar(nivel, msg) {
  const entrada = { ts: new Date(), nivel, msg };
  App.logSync.push(entrada);
  if (App.logSync.length > 600) App.logSync.shift();
  App.logBufferPlanilha.push(entrada);
  if (App.logBufferPlanilha.length > 200) App.logBufferPlanilha.shift();
  try {
    console.log(`[sync ${entrada.ts.toLocaleTimeString("pt-BR")}] ${nivel}: ${msg}`);
  } catch { /* ignora */ }
  if (App._logEl) {
    App._logEl.appendChild(linhaLogEl(entrada));
    App._logEl.scrollTop = App._logEl.scrollHeight;
  }
}

function horaLog(d) {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function linhaLogEl(entrada) {
  const def = NIVEIS_LOG[entrada.nivel] || NIVEIS_LOG.info;
  const linha = document.createElement("div");
  linha.className = "log-linha " + def.cor;
  linha.innerHTML = `<span class="log-hora">${esc(horaLog(entrada.ts))}</span>` +
    `<span class="log-nivel">${esc(def.rotulo)}</span>` +
    `<span class="log-msg">${esc(entrada.msg)}</span>`;
  return linha;
}

/* Envia o histórico acumulado para a aba "log_sincronizacao" da planilha.
   É best-effort: se a ação ainda não existir no Apps Script implantado, falha
   em silêncio e NUNCA atrapalha a sincronização de verdade. */
async function flushLogPlanilha(viaBeacon) {
  if (!apiConfigurada() || App.logPlanilhaIndisponivel || App.logBufferPlanilha.length === 0) return;
  const linhas = App.logBufferPlanilha.map((e) => ({
    data_hora: e.ts.toISOString(),
    nivel: e.nivel,
    evento: e.msg,
    usuario: App.usuario?.nome || "",
    sessao: App.sessaoId || "",
  }));
  App.logBufferPlanilha = []; // limpa otimisticamente (log não é dado crítico)
  const corpo = JSON.stringify({ token: CONFIG.token, acao: "anexarLog", payload: { linhas } });
  if (viaBeacon && navigator.sendBeacon) {
    try { navigator.sendBeacon(CONFIG.apiUrl, corpo); } catch { /* ignora */ }
    return;
  }
  try {
    await chamarApi("anexarLog", { linhas });
  } catch (e) {
    // Se a ação ainda não existe no Apps Script implantado, desliga o log da
    // planilha por esta sessão (não fica tentando à toa). Erros de rede não
    // desligam — voltam a tentar no próximo ciclo.
    if (!e.rede && /a..o desconhecida/i.test(e.message)) {
      App.logPlanilhaIndisponivel = true;
      console.warn("Log da planilha indisponível (atualize o Apps Script).");
    }
  }
}

function estaEditando() {
  if (App.editando || App.modaisAbertos > 0) return true;
  const ativo = document.activeElement;
  return !!(ativo && /^(INPUT|TEXTAREA|SELECT)$/.test(ativo.tagName) && ativo.closest("#conteudo"));
}

/* Salva uma tabela: grava no aparelho na hora e envia à planilha
   assim que possível. Se estiver sem internet, fica pendente. */
function salvarTabela(nomeTabela) {
  salvarDbLocal();
  App.tabelasPendentes.add(nomeTabela);
  salvarPendentesLocal();
  enviarPendentes();
}

/* Serializa as linhas de uma tabela para envio (produtos têm a composição
   convertida para texto; as demais vão como estão). */
function linhasParaEnvioDe(tabela) {
  if (tabela === "produtos") {
    return App.db.produtos.map(p => ({
      ...p,
      composicao: (p.composicao || []).map(c => `${c.id_insumo}[${c.nome_insumo}](${c.quantidade})`).join(", "),
    }));
  }
  return App.db[tabela];
}

async function enviarPendentes() {
  if (!apiConfigurada() || App.syncOcupado || App.tabelasPendentes.size === 0) return;
  App.syncOcupado = true;
  let erroRede = false, erroServidor = false;
  try {
    const lista = [...App.tabelasPendentes];
    logar("envio", `Enviando ${lista.length} tabela(s) alterada(s): ${lista.join(", ")}.`);
    for (const tabela of lista) {
      atualizarStatus("enviando", `Enviando "${tabela}"…`);
      try {
        const t0 = Date.now();
        const r = await chamarApi("salvarTabela", { tabela, linhas: linhasParaEnvioDe(tabela) });
        App.tabelasPendentes.delete(tabela);
        salvarPendentesLocal();
        logar("ok", `"${tabela}" enviada (${r?.linhas ?? "?"} linha(s), ${Date.now() - t0}ms).`);
      } catch (e) {
        if (e.rede) erroRede = true; else erroServidor = true;
        logar("erro", `Falha ao enviar "${tabela}": ${e.message}. Continua pendente.`);
      }
    }
    if (erroRede) atualizarStatus("offline");
    else if (erroServidor) atualizarStatus("erro");
    else { atualizarStatus("online"); logar("ok", "Tudo enviado para a planilha."); }
  } finally {
    App.syncOcupado = false;
    flushLogPlanilha();
  }
}

function migrarIds() {
  if (App.db.configuracoes.find(c => c.chave === "ids_migrados_v3")?.valor === "sim") return;

  const mapeamentos = {};

  [
    { nome: "insumos", prefixo: "INS" },
    { nome: "produtos", prefixo: "PRO" },
    { nome: "clientes", prefixo: "CLI" },
    { nome: "usuarios", prefixo: "USR" },
  ].forEach(({ nome, prefixo }) => {
    mapeamentos[nome] = {};
    App.db[nome].forEach((item, i) => {
      const novoId = `${prefixo}${i + 1}`;
      mapeamentos[nome][item.id] = novoId;
      item.id = novoId;
    });
  });

  // Vendas: id_venda → VDA1, VDA2... / id de item → "VDA1-1", "VDA1-2"...
  const grupos = {};
  App.db.vendas.forEach(v => {
    const chave = v.id_venda || v.id;
    if (!grupos[chave]) grupos[chave] = [];
    grupos[chave].push(v);
  });
  mapeamentos.vendas_grupo = {};
  let numVenda = 0;
  Object.keys(grupos).forEach(oldId => {
    numVenda++;
    const novoGrupoId = `VDA${numVenda}`;
    mapeamentos.vendas_grupo[oldId] = novoGrupoId;
    grupos[oldId].forEach((item, j) => {
      item.id_venda = novoGrupoId;
      item.id = `${novoGrupoId}-${j + 1}`;
    });
  });

  // Atualizar referências cruzadas
  App.db.produtos.forEach(p => {
    (p.composicao || []).forEach(c => {
      if (mapeamentos.insumos?.[c.id_insumo]) c.id_insumo = mapeamentos.insumos[c.id_insumo];
    });
  });
  App.db.vendas.forEach(v => {
    if (mapeamentos.produtos?.[v.produto_id]) v.produto_id = mapeamentos.produtos[v.produto_id];
    if (mapeamentos.clientes?.[v.cliente_id]) v.cliente_id = mapeamentos.clientes[v.cliente_id];
  });

  // Marcar migração concluída
  ["ids_migrados_v2", "ids_migrados_v3"].forEach(chave => {
    const idx = App.db.configuracoes.findIndex(c => c.chave === chave);
    if (idx >= 0) App.db.configuracoes[idx].valor = "sim";
    else App.db.configuracoes.push({ chave, valor: "sim" });
  });

  // Apenas marca todas as tabelas como pendentes de envio ao servidor
  // (não chama salvarTabela() para evitar sobrescrever localStorage com dados incompletos)
  TABELAS.forEach(t => App.tabelasPendentes.add(t));
  salvarPendentesLocal();
}

async function sincronizar(opcoes = {}) {
  if (!apiConfigurada()) { atualizarStatus("sem-config"); return false; }
  if (App.syncOcupado) {
    logar("info", "Sincronização ignorada: já existe uma em andamento.");
    return false;
  }
  if (!opcoes.forcar && estaEditando()) return false;
  App.syncOcupado = true;
  const tInicio = Date.now();
  atualizarStatus("conectando", "Conectando à planilha…");
  logar("conexao", opcoes.forcar ? "Sincronização manual iniciada." : "Sincronização automática iniciada.");
  let erroRede = false, erroServidor = false;
  try {
    // 1) Envia primeiro o que está pendente neste aparelho. Uma tabela que
    //    falhar (ex.: aba ainda não existe na planilha) fica pendente, mas
    //    não impede o envio das outras nem a leitura abaixo.
    const tabelasEnviadasAgora = new Set();
    const pendentesInicio = [...App.tabelasPendentes];
    if (pendentesInicio.length) {
      logar("envio", `Enviando ${pendentesInicio.length} tabela(s) alterada(s): ${pendentesInicio.join(", ")}.`);
    }
    for (const tabela of pendentesInicio) {
      atualizarStatus("enviando", `Enviando "${tabela}"…`);
      try {
        const t0 = Date.now();
        const r = await chamarApi("salvarTabela", { tabela, linhas: linhasParaEnvioDe(tabela) });
        App.tabelasPendentes.delete(tabela);
        tabelasEnviadasAgora.add(tabela);
        salvarPendentesLocal();
        logar("ok", `"${tabela}" enviada (${r?.linhas ?? "?"} linha(s), ${Date.now() - t0}ms).`);
      } catch (e) {
        if (e.rede) erroRede = true; else erroServidor = true;
        logar("erro", `Falha ao enviar "${tabela}": ${e.message}. Continua pendente.`);
      }
    }
    // Se já caiu a internet no envio, não tenta baixar — evita prender em "buscando".
    if (erroRede) throw Object.assign(new Error("sem conexão durante o envio"), { rede: true });
    // 2) Baixa tudo da planilha.
    atualizarStatus("buscando", "Buscando dados da planilha…");
    logar("busca", "Baixando dados atualizados da planilha…");
    const t0 = Date.now();
    const dados = await chamarApi("obterTudo");
    logar("ok", `Dados recebidos da planilha (${Date.now() - t0}ms).`);
    const antes = JSON.stringify(App.db);

    // Preservar composicao local antes de qualquer overwrite pela planilha
    const composicaoLocal = new Map(
      (App.db.produtos || [])
        .filter(p => Array.isArray(p.composicao) && p.composicao.length > 0)
        .map(p => [p.id, p.composicao])
    );

    // Preservar os campos novos de pedido/fluxo. Se a planilha ainda não tem
    // essas colunas (cabeçalho antigo), os valores voltam vazios e a etapa
    // do pedido se perderia — então guardamos por id de item e restauramos.
    const CAMPOS_PEDIDO = ["tipo", "data_entrega", "data_vencimento", "item_pronto", "status_pagamento", "valor_pago", "status_producao", "arquivado", "ordem_fluxo"];
    const pedidoLocal = new Map(
      (App.db.vendas || []).map(linha => [linha.id, linha])
    );

    TABELAS.forEach((t) => {
      // Tabela ainda pendente OU recém-enviada neste ciclo nunca é sobrescrita:
      // o dado local é o mais recente — qualquer leitura imediata do servidor
      // pode devolver versão desatualizada (race condition de propagação).
      if (Array.isArray(dados[t]) && !App.tabelasPendentes.has(t) && !tabelasEnviadasAgora.has(t)) {
        App.db[t] = dados[t];
      }
    });

    // Restaura campos de pedido que a planilha não devolveu (cabeçalho antigo).
    if (Array.isArray(App.db.vendas)) {
      App.db.vendas.forEach(linha => {
        const local = pedidoLocal.get(linha.id);
        if (!local) return;
        CAMPOS_PEDIDO.forEach(campo => {
          const daPlanilha = linha[campo];
          const vazio = daPlanilha === undefined || daPlanilha === null || daPlanilha === "";
          if (vazio && local[campo] !== undefined && local[campo] !== "") linha[campo] = local[campo];
        });
      });
    }
    // Desserializar composição dos produtos (string da planilha → array)
    // Se a planilha tiver composição usa ela; senão, preserva a versão local
    if (Array.isArray(App.db.produtos)) {
      App.db.produtos = App.db.produtos.map(p => {
        const daPlanilha = typeof p.composicao === "string" && p.composicao
          ? parseComposicao(p.composicao, App.db.insumos)
          : null;
        const comp = (daPlanilha && daPlanilha.length > 0) ? daPlanilha : (composicaoLocal.get(p.id) || []);
        return { ...p, composicao: comp };
      });
    }
    migrarIds();
    const mudou = JSON.stringify(App.db) !== antes;
    if (mudou) {
      salvarDbLocal();
      if (!estaEditando() || opcoes.forcar) renderizarRotaAtual();
    }
    App.ultimaSync = new Date();
    if (erroServidor) {
      atualizarStatus("erro", "Erro em uma das tabelas");
      logar("erro", `Sincronização concluída com erros do servidor (${Date.now() - tInicio}ms).`);
      return false;
    }
    atualizarStatus("online");
    logar("ok", `Sincronização concluída em ${Date.now() - tInicio}ms${mudou ? " (dados atualizados)" : " (nada mudou)"}.`);
    return true;
  } catch (erro) {
    if (erro.rede) {
      atualizarStatus("offline");
      logar("erro", `Sincronização falhou: ${erro.message}. Tentará de novo no próximo ciclo.`);
    } else {
      atualizarStatus("erro", erro.message);
      logar("erro", `Erro na sincronização: ${erro.message}.`);
    }
    return false;
  } finally {
    App.syncOcupado = false;
    flushLogPlanilha();
  }
}

// "Família" visual de cada estado (controla a cor da bolinha via CSS).
// Vários estados de trabalho compartilham a cor amarela "ocupado".
const FAMILIA_ESTADO = {
  online: "online",
  offline: "offline",
  erro: "erro",
  "sem-config": "sem-config",
  conectando: "ocupado",
  enviando: "ocupado",
  buscando: "ocupado",
  sincronizando: "ocupado",
};

const TEXTO_ESTADO = {
  online: "Conectado",
  offline: "Sem conexão",
  erro: "Erro",
  "sem-config": "Não conectado",
  conectando: "Conectando…",
  enviando: "Enviando dados…",
  buscando: "Buscando dados…",
  sincronizando: "Sincronizando…",
};

function atualizarStatus(estado, detalhe) {
  App.estadoConexao = estado;
  App.estadoDetalhe = detalhe || "";
  const botao = $("#botao-status");
  if (!botao) return;
  botao.dataset.estado = FAMILIA_ESTADO[estado] || "sem-config";
  const texto = detalhe || TEXTO_ESTADO[estado] || "—";
  $("#status-texto").textContent = texto;
  botao.title = "Sincronização: " + (TEXTO_ESTADO[estado] || estado) + (detalhe ? " — " + detalhe : "");
  // Atualiza o cabeçalho do terminal de log, se estiver aberto.
  if (App._statusEl) App._statusEl.textContent = texto;
}

function abrirDetalhesStatus() {
  const pendentes = [...App.tabelasPendentes];
  const corpo = document.createElement("div");
  corpo.innerHTML = `
    <div class="status-painel">
      <div class="status-linha">
        <span class="status-rotulo">Estado agora</span>
        <span class="status-valor" id="status-painel-estado">${esc(App.estadoDetalhe || TEXTO_ESTADO[App.estadoConexao] || "—")}</span>
      </div>
      <div class="status-linha">
        <span class="status-rotulo">Última sincronização</span>
        <span class="status-valor">${App.ultimaSync ? esc(dataHora(App.ultimaSync.toISOString())) : "ainda não"}</span>
      </div>
      <div class="status-linha">
        <span class="status-rotulo">Aguardando envio</span>
        <span class="status-valor">${pendentes.length ? esc(pendentes.join(", ")) : "nada pendente"}</span>
      </div>
      ${apiConfigurada() ? "" : `<p class="erro">A URL do Apps Script ainda não foi colada em js/config.js. Os dados estão sendo salvos apenas neste aparelho.</p>`}
    </div>
    <p class="status-legenda">Registro em tempo real desde que o app foi aberto:</p>
    <div class="log-terminal" id="log-terminal"></div>
    <div class="linha-acoes">
      <button type="button" class="btn btn-primario" id="status-sincronizar" ${apiConfigurada() ? "" : "disabled"}>Sincronizar agora</button>
      <button type="button" class="btn btn-secundario" id="status-copiar">Copiar log</button>
    </div>`;

  const modal = abrirModal("Sincronização", corpo, {
    classe: "modal-log",
    aoFechar: () => { App._logEl = null; App._statusEl = null; },
  });

  // Liga o terminal ao log ao vivo: preenche o histórico e passa a receber
  // novas linhas em tempo real (logar() escreve direto aqui).
  const terminal = $("#log-terminal", corpo);
  App.logSync.forEach((e) => terminal.appendChild(linhaLogEl(e)));
  if (!App.logSync.length) {
    const vazio = document.createElement("div");
    vazio.className = "log-linha log-info";
    vazio.innerHTML = `<span class="log-msg">Sem eventos ainda nesta sessão.</span>`;
    terminal.appendChild(vazio);
  }
  terminal.scrollTop = terminal.scrollHeight;
  App._logEl = terminal;
  App._statusEl = $("#status-painel-estado", corpo);

  $("#status-sincronizar", corpo)?.addEventListener("click", async () => {
    const ok = await sincronizar({ forcar: true });
    if (!ok && App.estadoConexao === "offline") toast("Sem conexão. Veja o log.", "erro");
  });
  $("#status-copiar", corpo)?.addEventListener("click", () => {
    const texto = App.logSync.map((e) =>
      `${e.ts.toLocaleString("pt-BR")} [${(NIVEIS_LOG[e.nivel] || NIVEIS_LOG.info).rotulo}] ${e.msg}`
    ).join("\n");
    copiarTexto(texto);
    toast("Log copiado.");
  });
}

/* ---------------- modais ---------------- */

function abrirModal(titulo, conteudo, opcoes = {}) {
  App.modaisAbertos++;
  const fundo = document.createElement("div");
  fundo.className = "modal-fundo";
  const caixa = document.createElement("div");
  caixa.className = "modal" + (opcoes.classe ? " " + opcoes.classe : "");
  caixa.innerHTML = `
    <div class="modal-topo">
      <h3>${esc(titulo)}</h3>
      <button type="button" class="modal-fechar" aria-label="Fechar">&times;</button>
    </div>
    <div class="modal-corpo"></div>`;
  const corpo = $(".modal-corpo", caixa);
  if (typeof conteudo === "string") corpo.innerHTML = conteudo;
  else corpo.appendChild(conteudo);
  fundo.appendChild(caixa);
  document.body.appendChild(fundo);

  let fechado = false;
  function fechar() {
    if (fechado) return;
    fechado = true;
    App.modaisAbertos = Math.max(0, App.modaisAbertos - 1);
    fundo.classList.remove("visivel");
    setTimeout(() => fundo.remove(), 200);
    if (opcoes.aoFechar) opcoes.aoFechar();
  }

  $(".modal-fechar", caixa).addEventListener("click", fechar);
  fundo.addEventListener("keydown", (e) => { if (e.key === "Escape") fechar(); });
  requestAnimationFrame(() => fundo.classList.add("visivel"));
  return { el: caixa, corpo, fechar };
}

function confirmar(mensagem, opcoes = {}) {
  return new Promise((resolver) => {
    const corpo = document.createElement("div");
    corpo.innerHTML = `
      <p class="confirmar-texto">${esc(mensagem)}</p>
      <div class="linha-botoes">
        <button type="button" class="btn btn-secundario" data-acao="nao">Cancelar</button>
        <button type="button" class="btn ${opcoes.perigo ? "btn-perigo" : "btn-primario"}" data-acao="sim">${esc(opcoes.botao || "Confirmar")}</button>
      </div>`;
    const modal = abrirModal(opcoes.titulo || "Confirmar", corpo, {
      classe: "modal-pequeno",
      aoFechar: () => resolver(false),
    });
    corpo.querySelector('[data-acao="sim"]').focus();
    corpo.addEventListener("click", (e) => {
      const acao = e.target.closest("button")?.dataset.acao;
      if (acao === "sim") { resolver(true); modal.fechar(); }
      if (acao === "nao") modal.fechar();
    });
  });
}

/* ---------------- vendas agrupadas (compartilhado) ---------------- */

/* Cada linha da tabela "vendas" é 1 item; itens da mesma venda
   compartilham id_venda. Esta função devolve as vendas agrupadas. */
function agruparVendas(linhas) {
  const mapa = new Map();
  (linhas || []).forEach((linha) => {
    const chave = linha.id_venda || linha.id;
    if (!mapa.has(chave)) {
      mapa.set(chave, {
        id_venda: chave,
        data: linha.data,
        cliente_nome: linha.cliente_nome,
        pagamento: linha.pagamento,
        status: linha.status,
        entrega: linha.entrega,
        observacoes: linha.observacoes,
        criado_por: linha.criado_por,
        itens: [],
        total: 0,
      });
    }
    const venda = mapa.get(chave);
    venda.itens.push(linha);
    venda.total += numero(linha.subtotal);
  });
  // Preenche os campos derivados de produção/pagamento a partir da 1ª linha.
  mapa.forEach((venda) => {
    const base = venda.itens[0] || {};
    venda.tipo = tipoDe(base);
    venda.data_entrega = base.data_entrega || "";
    venda.data_vencimento = base.data_vencimento || "";
    venda.cliente_id = base.cliente_id || "";
    venda.status_producao = statusProducaoDe(base);

    // Fonte da verdade do pagamento: a tabela "pagamentos". Se houver
    // recebimentos registrados, o valor pago e a situação vêm deles; senão,
    // usa o que está guardado na própria linha (registros antigos).
    const recebido = totalPagoVenda(venda.id_venda);
    if (temPagamentos(venda.id_venda)) {
      venda.valor_pago = recebido;
      venda.status_pagamento = derivarStatusPagamento(venda.total, recebido);
    } else {
      venda.status_pagamento = statusPagamentoDe(base);
      venda.valor_pago = numero(base.valor_pago);
    }
    venda.saldo = Math.max(0, venda.total - venda.valor_pago);
    venda.arquivado = String(base.arquivado || "").toLowerCase() === "sim";
    venda.ordem_fluxo = base.ordem_fluxo || "";
  });
  return [...mapa.values()].sort((a, b) => String(b.data).localeCompare(String(a.data)));
}

/* ---------------- status de produção e pagamento ---------------- */

/* Lê o status de produção de uma linha; se for um registro antigo (sem o
   campo), deriva do antigo "status" (Concluída/Pendente/Cancelada). */
function statusProducaoDe(linha) {
  const s = String(linha?.status_producao || "").trim();
  if (CONFIG.statusProducao.includes(s)) return s;
  const antigo = String(linha?.status || "").trim();
  if (antigo === "Cancelada") return "Cancelado";
  if (antigo === "Concluída") return "Entregue";
  return "Pedido feito";
}

function statusPagamentoDe(linha) {
  const s = String(linha?.status_pagamento || "").trim();
  if (CONFIG.statusPagamento.includes(s)) return s;
  // Registro antigo: fiado/prazo sem status = não pago; concluído = pago.
  const forma = String(linha?.pagamento || "");
  if (forma === "Fiado" || forma === "Venda a prazo") return "Não pago";
  return String(linha?.status || "") === "Concluída" ? "Pago" : "Não pago";
}

function tipoDe(linha) {
  const t = String(linha?.tipo || "").trim();
  if (t === "Orçamento" || t === "Pedido") return t;
  return statusProducaoDe(linha) === "Orçamento" ? "Orçamento" : "Pedido";
}

/* Slug usado nas classes de CSS: "Em produção" -> "em-producao". */
function slugStatus(status) {
  return semAcentos(status).replace(/\s+/g, "-");
}

/* Um pedido conta como venda (faturamento) quando não é orçamento nem
   cancelado. Orçamentos e cancelados ficam de fora das estatísticas. */
function contaComoVenda(statusProducao) {
  return statusProducao !== "Orçamento" && statusProducao !== "Cancelado";
}

/* ---------------- mensagem de WhatsApp ---------------- */

function textoMensagemPedido(venda) {
  const ehOrcamento = venda.status_producao === "Orçamento" || venda.tipo === "Orçamento";
  const nome = (venda.cliente_nome || "").trim().split(/\s+/)[0] || "tudo bem";
  const linhas = [];
  linhas.push(`Olá ${nome}! 😊`);
  linhas.push(ehOrcamento ? "Segue o orçamento solicitado:" : "Segue a confirmação do seu pedido:");
  linhas.push("");
  venda.itens.forEach((i) => {
    linhas.push(`• ${numero(i.quantidade)}x ${i.produto_nome} — ${dinheiro(i.subtotal)}`);
  });
  linhas.push("");
  linhas.push(`💰 Total: ${dinheiro(venda.total)}`);
  if (venda.data_entrega) linhas.push(`📅 Entrega prevista: ${dataCurta(venda.data_entrega)}`);
  linhas.push("");
  linhas.push("Qualquer dúvida estou à disposição!");
  return linhas.join("\n");
}

function linkWhatsapp(venda) {
  const texto = encodeURIComponent(textoMensagemPedido(venda));
  const cliente = App.db.clientes.find((c) => c.id === venda.cliente_id) ||
    App.db.clientes.find((c) => semAcentos(c.nome) === semAcentos(venda.cliente_nome || ""));
  const digitos = String(cliente?.telefone || "").replace(/\D/g, "");
  if (digitos.length >= 10) {
    const numeroWpp = digitos.startsWith(CONFIG.paisWhatsapp) ? digitos : CONFIG.paisWhatsapp + digitos;
    return `https://wa.me/${numeroWpp}?text=${texto}`;
  }
  return `https://wa.me/?text=${texto}`;
}

async function copiarTexto(texto) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(texto);
    } else {
      const ta = document.createElement("textarea");
      ta.value = texto;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    return true;
  } catch {
    return false;
  }
}

/* ---------------- baixa de estoque por transição ---------------- */

function aplicarBaixaVenda(venda) {
  let mudou = false;
  (venda?.itens || []).forEach((item) => {
    const produto = App.db.produtos.find((p) => p.id === item.produto_id);
    (produto?.composicao || []).forEach((comp) => {
      const insumo = App.db.insumos.find((i) => i.id === comp.id_insumo);
      if (insumo) {
        insumo.quantidade = numero(insumo.quantidade) - numero(comp.quantidade) * numero(item.quantidade);
        insumo.atualizado_em = new Date().toISOString();
        mudou = true;
      }
    });
  });
  return mudou;
}

/* Ajusta o estoque ao mudar a etapa de produção: dá baixa quando o pedido
   passa a valer como venda e devolve ao estoque quando deixa de valer. */
function ajustarEstoquePorTransicao(venda, statusAntigo, statusNovo) {
  const antesAtivo = contaComoVenda(statusAntigo);
  const agoraAtivo = contaComoVenda(statusNovo);
  if (!antesAtivo && agoraAtivo) return aplicarBaixaVenda(venda);
  if (antesAtivo && !agoraAtivo) return revertirBaixaVenda(venda);
  return false;
}

/* ---------------- ações sobre o pedido (compartilhadas) ---------------- */

/* Move o pedido para outra etapa de produção, tratando os avisos de
   "entregar sem pagar" e "cancelar pedido pago", e a baixa de estoque. */
async function mudarStatusProducao(idVenda, novoStatus, opcoes = {}) {
  const venda = agruparVendas(App.db.vendas).find((v) => v.id_venda === idVenda);
  if (!venda || venda.status_producao === novoStatus) return false;
  const atual = venda.status_producao;

  if (novoStatus === "Entregue" && venda.status_pagamento !== "Pago") {
    const ok = await confirmar(
      `Atenção: este pedido ainda não está pago (situação: ${venda.status_pagamento}). Marcar como entregue mesmo assim?`,
      { titulo: "Pedido não pago", botao: "Entregar mesmo assim" });
    if (!ok) return false;
  }
  let devolver = false;
  if (novoStatus === "Cancelado" && (venda.status_pagamento === "Pago" || venda.status_pagamento === "Parcial")) {
    const ok = await confirmar(
      `Este pedido já recebeu ${dinheiro(venda.valor_pago)}. Ao cancelar, esse valor será lançado como DEVOLUÇÃO (saída) no caixa. Deseja cancelar?`,
      { perigo: true, titulo: "Devolver ao cliente", botao: "Cancelar e devolver" });
    if (!ok) return false;
    devolver = true;
  }

  if (devolver) registrarDevolucaoVenda(idVenda);
  // Guarda de segurança extra: re-lê o status do banco local imediatamente antes
  // de ajustar o estoque, pra garantir que um sync concorrente não fez a transição
  // já acontecer (evita duplo revert de estoque em condição de corrida).
  const vendaAtual = agruparVendas(App.db.vendas).find((v) => v.id_venda === idVenda);
  if (!vendaAtual || vendaAtual.status_producao === novoStatus) return false;
  if (ajustarEstoquePorTransicao(vendaAtual, vendaAtual.status_producao, novoStatus)) salvarTabela("insumos");

  const statusCompat = novoStatus === "Cancelado" ? "Cancelada"
    : novoStatus === "Entregue" ? "Concluída" : "Pendente";
  App.db.vendas.forEach((linha) => {
    if ((linha.id_venda || linha.id) === idVenda) {
      linha.status_producao = novoStatus;
      linha.status = statusCompat;
      linha.tipo = novoStatus === "Orçamento" ? "Orçamento" : "Pedido";
    }
  });
  salvarTabela("vendas");
  if (!opcoes.silencioso) toast(`Pedido movido para "${novoStatus}".`);
  if (opcoes.aoMudar) opcoes.aoMudar();
  return true;
}

/* Marca/desmarca um item do pedido como pronto (checklist do card). */
function alternarItemPronto(idItem, opcoes = {}) {
  const linha = App.db.vendas.find((l) => l.id === idItem);
  if (!linha) return false;
  const novo = String(linha.item_pronto || "").toLowerCase() === "sim" ? "" : "sim";
  linha.item_pronto = novo;
  salvarTabela("vendas");
  if (opcoes.aoMudar) opcoes.aoMudar();
  return novo === "sim";
}

function itemEstaPronto(linha) {
  return String(linha?.item_pronto || "").toLowerCase() === "sim";
}

/* Tira o pedido do quadro de fluxo (continua na lista de pedidos). */
function arquivarPedido(idVenda, opcoes = {}) {
  App.db.vendas.forEach((linha) => {
    if ((linha.id_venda || linha.id) === idVenda) linha.arquivado = "sim";
  });
  salvarTabela("vendas");
  if (!opcoes.silencioso) toast("Pedido removido do quadro.");
  if (opcoes.aoMudar) opcoes.aoMudar();
}

/* ============================================================
   PAGAMENTOS E CAIXA
   - "pagamentos": cada recebimento de uma venda (histórico).
   - "lancamentos": livro caixa — toda entrada/saída de dinheiro,
     separada por destino ("dinheiro" vivo ou "banco").
   O valor pago de uma venda é SEMPRE a soma dos seus pagamentos,
   então nada fica inconsistente.
   ============================================================ */

/* Pix e cartões caem no banco; só "Dinheiro" é dinheiro vivo. */
function destinoDaForma(forma) {
  return semAcentos(forma).includes("dinheiro") ? "dinheiro" : "banco";
}

function derivarStatusPagamento(total, pago) {
  if (pago <= 0.005) return "Não pago";
  if (pago + 0.005 < numero(total)) return "Parcial";
  return "Pago";
}

function pagamentosDaVenda(idVenda) {
  return (App.db.pagamentos || []).filter((p) => p.id_venda === idVenda);
}

function temPagamentos(idVenda) {
  return (App.db.pagamentos || []).some((p) => p.id_venda === idVenda);
}

function totalPagoVenda(idVenda) {
  return pagamentosDaVenda(idVenda).reduce((s, p) => s + numero(p.valor), 0);
}

/* Registra um movimento no livro caixa. tipo: "entrada" | "saida" |
   "ajuste". valor é sempre positivo, exceto em "ajuste" (pode ser
   negativo para corrigir para baixo). Devolve o lançamento criado. */
function registrarLancamento(dados, opcoes = {}) {
  const agora = new Date().toISOString();
  const lanc = {
    id: gerarId("LAN", "lancamentos"),
    data: dados.data || agora,
    tipo: dados.tipo,
    categoria: dados.categoria || "",
    descricao: dados.descricao || "",
    valor: numero(dados.valor),
    destino: dados.destino === "banco" ? "banco" : "dinheiro",
    id_referencia: dados.id_referencia || "",
    criado_por: App.usuario?.usuario || "",
    criado_em: agora,
  };
  App.db.lancamentos.push(lanc);
  if (!opcoes.semSalvar) salvarTabela("lancamentos");
  return lanc;
}

/* Registra o recebimento de uma venda: cria o pagamento (histórico) e a
   entrada no caixa, e atualiza a situação de pagamento da venda. */
function registrarPagamento(idVenda, dados, opcoes = {}) {
  const venda = agruparVendas(App.db.vendas).find((v) => v.id_venda === idVenda);
  if (!venda) return null;
  const valor = numero(dados.valor);
  if (valor <= 0) return null;
  const forma = dados.forma || "Dinheiro";
  const agora = new Date().toISOString();

  const pagamento = {
    id: gerarId("PAG", "pagamentos"),
    id_venda: idVenda,
    cliente_nome: venda.cliente_nome || "",
    data: dados.data || agora,
    valor: valor,
    forma_pagamento: forma,
    criado_por: App.usuario?.usuario || "",
    criado_em: agora,
  };
  App.db.pagamentos.push(pagamento);

  registrarLancamento({
    data: pagamento.data,
    tipo: "entrada",
    categoria: "Venda",
    descricao: `Recebimento do pedido #${idVenda}${venda.cliente_nome ? " — " + venda.cliente_nome : ""}`,
    valor: valor,
    destino: destinoDaForma(forma),
    id_referencia: pagamento.id,
  }, { semSalvar: true });

  sincronizarPagamentoNaVenda(idVenda, { novoVencimento: dados.novoVencimento });

  salvarTabela("pagamentos");
  salvarTabela("lancamentos");
  salvarTabela("vendas");
  if (opcoes.aoMudar) opcoes.aoMudar();
  return pagamento;
}

/* Estorna (desfaz) um pagamento: remove o pagamento, tira a entrada do
   caixa correspondente e reacerta a situação da venda. */
function estornarPagamento(idPagamento, opcoes = {}) {
  const pag = (App.db.pagamentos || []).find((p) => p.id === idPagamento);
  if (!pag) return false;
  const idVenda = pag.id_venda;
  App.db.pagamentos = App.db.pagamentos.filter((p) => p.id !== idPagamento);
  App.db.lancamentos = App.db.lancamentos.filter((l) => l.id_referencia !== idPagamento);
  sincronizarPagamentoNaVenda(idVenda);
  salvarTabela("pagamentos");
  salvarTabela("lancamentos");
  salvarTabela("vendas");
  if (opcoes.aoMudar) opcoes.aoMudar();
  return true;
}

/* Reescreve nas linhas da venda o cache de valor pago, situação de
   pagamento e (opcional) nova data de vencimento. */
function sincronizarPagamentoNaVenda(idVenda, opcoes = {}) {
  const venda = agruparVendas(App.db.vendas).find((v) => v.id_venda === idVenda);
  const total = venda ? venda.total : 0;
  const pago = totalPagoVenda(idVenda);
  const situacao = derivarStatusPagamento(total, pago);
  App.db.vendas.forEach((linha) => {
    if ((linha.id_venda || linha.id) === idVenda) {
      linha.valor_pago = pago;
      linha.status_pagamento = situacao;
      if (opcoes.novoVencimento !== undefined) linha.data_vencimento = opcoes.novoVencimento || "";
    }
  });
}

/* Saída manual de dinheiro (despesa, pró-labore, retirada...). */
function registrarSaida(dados, opcoes = {}) {
  const lanc = registrarLancamento({
    tipo: "saida",
    categoria: dados.categoria || "Outros",
    descricao: dados.descricao || "",
    valor: Math.abs(numero(dados.valor)),
    destino: dados.destino,
  });
  if (opcoes.aoMudar) opcoes.aoMudar();
  return lanc;
}

/* Ajuste de caixa: acerta o saldo de um destino para um valor real
   contado, registrando a diferença e o motivo (uso raro). */
function ajustarCaixa(destino, saldoReal, motivo, opcoes = {}) {
  const atual = saldoDestino(destino);
  const delta = numero(saldoReal) - atual;
  if (Math.abs(delta) < 0.005) return null;
  const lanc = registrarLancamento({
    tipo: "ajuste",
    categoria: "Ajuste de caixa",
    descricao: motivo || "Ajuste de caixa",
    valor: delta, // pode ser negativo
    destino: destino,
  });
  if (opcoes.aoMudar) opcoes.aoMudar();
  return lanc;
}

/* Efeito de um lançamento no saldo: entrada soma, saída subtrai, ajuste
   usa o próprio sinal do valor. */
function efeitoLancamento(l) {
  if (l.tipo === "saida") return -Math.abs(numero(l.valor));
  if (l.tipo === "ajuste") return numero(l.valor);
  return Math.abs(numero(l.valor)); // entrada
}

/* Saldo inicial de um destino: o líquido dos lançamentos já arquivados
   (períodos antigos movidos para fora das abas ativas). Mantém o caixa
   correto mesmo depois do arquivamento. */
function saldoInicialDe(destino) {
  return numero(obterConfig(destino === "banco" ? "saldo_inicial_banco" : "saldo_inicial_dinheiro", 0));
}

function saldoInicialTotal() {
  return saldoInicialDe("dinheiro") + saldoInicialDe("banco");
}

function saldoDestino(destino) {
  return saldoInicialDe(destino) + (App.db.lancamentos || [])
    .filter((l) => l.destino === destino)
    .reduce((s, l) => s + efeitoLancamento(l), 0);
}

function saldosCaixa() {
  const dinheiro = saldoDestino("dinheiro");
  const banco = saldoDestino("banco");
  return { dinheiro, banco, total: dinheiro + banco };
}

/* Devolve o dinheiro ao cliente quando um pedido pago/parcial é cancelado:
   uma saída por destino, mantendo o histórico de pagamentos intacto. Não
   duplica se já houver devolução registrada para a venda. */
function registrarDevolucaoVenda(idVenda) {
  const jaDevolvido = (App.db.lancamentos || []).some(
    (l) => l.categoria === "Devolução" && l.id_referencia === idVenda);
  if (jaDevolvido) return false;
  const porDestino = { dinheiro: 0, banco: 0 };
  pagamentosDaVenda(idVenda).forEach((p) => {
    porDestino[destinoDaForma(p.forma_pagamento)] += numero(p.valor);
  });
  let criou = false;
  ["dinheiro", "banco"].forEach((destino) => {
    if (porDestino[destino] > 0.005) {
      registrarLancamento({
        tipo: "saida",
        categoria: "Devolução",
        descricao: `Devolução do pedido #${idVenda} (cancelado)`,
        valor: porDestino[destino],
        destino: destino,
        id_referencia: idVenda,
      }, { semSalvar: true });
      criou = true;
    }
  });
  if (criou) salvarTabela("lancamentos");
  return criou;
}

/* ============================================================
   ARQUIVAMENTO (janela deslizante) — lado do app
   O usuário escolhe quantos meses manter ativos. Os pedidos antigos
   já finalizados e os lançamentos antigos são MOVIDOS (no servidor)
   para abas de arquivo; o saldo do caixa é preservado por um "saldo
   inicial". Nada é apagado.
   ============================================================ */

function janelaMeses() {
  const n = parseInt(obterConfig("janela_meses", 12), 10);
  return isFinite(n) && n >= 1 ? n : 12;
}

function dataCorteISO(meses) {
  const d = new Date();
  d.setMonth(d.getMonth() - meses);
  return d.toISOString().slice(0, 10);
}

/* Conta (a partir dos dados já carregados) quantos registros seriam
   arquivados com a janela atual. Espelha exatamente a lógica do servidor. */
function contarArquivaveis(meses) {
  const corte = dataCorteISO(meses);
  const dia = (v) => String(v || "").slice(0, 10);

  const lancamentos = (App.db.lancamentos || [])
    .filter((l) => dia(l.data) && dia(l.data) < corte).length;

  let vendas = 0, pagamentos = 0;
  agruparVendas(App.db.vendas).forEach((v) => {
    const resolvido = v.status_producao === "Cancelado" ||
      (v.status_producao === "Entregue" && v.status_pagamento === "Pago");
    if (!resolvido) return;
    let maxData = "";
    v.itens.forEach((it) => { const d = dia(it.data); if (d > maxData) maxData = d; });
    const pags = pagamentosDaVenda(v.id_venda);
    pags.forEach((p) => { const d = dia(p.data); if (d > maxData) maxData = d; });
    if (maxData && maxData < corte) {
      vendas += v.itens.length;
      pagamentos += pags.length;
    }
  });
  return { vendas, pagamentos, lancamentos };
}

/* Dispara o arquivamento no servidor e re-sincroniza. Exige que não haja
   nada pendente de envio (para não perder alterações locais). */
async function arquivarAgora(meses) {
  if (!apiConfigurada()) { toast("Conecte a planilha primeiro.", "erro"); return false; }
  if (App.tabelasPendentes.size > 0) {
    await sincronizar({ forcar: true });
    if (App.tabelasPendentes.size > 0) {
      toast("Há dados ainda não sincronizados. Tente de novo em instantes.", "erro");
      return false;
    }
  }
  try {
    const resultado = await chamarApi("arquivarAntigos", { meses });
    await sincronizar({ forcar: true });
    return resultado;
  } catch (e) {
    toast("Falha ao arquivar: " + e.message, "erro");
    return false;
  }
}

/* Resumo do que está arquivado no servidor (totais, último lote, intervalo). */
async function resumoArquivo() {
  return chamarApi("resumoArquivo");
}

/* Quantos registros seriam restaurados, sem mover nada (preview). */
async function contarRestauro(payload) {
  return chamarApi("restaurarArquivo", Object.assign({ apenasContar: true }, payload));
}

/* Restaura dados do arquivo de volta para as abas ativas e re-sincroniza.
   Exige que não haja nada pendente de envio (para não perder alterações). */
async function restaurarArquivoAgora(payload) {
  if (!apiConfigurada()) { toast("Conecte a planilha primeiro.", "erro"); return false; }
  if (App.tabelasPendentes.size > 0) {
    await sincronizar({ forcar: true });
    if (App.tabelasPendentes.size > 0) {
      toast("Há dados ainda não sincronizados. Tente de novo em instantes.", "erro");
      return false;
    }
  }
  try {
    const resultado = await chamarApi("restaurarArquivo", payload);
    await sincronizar({ forcar: true });
    return resultado;
  } catch (e) {
    toast("Falha ao restaurar: " + e.message, "erro");
    return false;
  }
}

/* ---------------- intervalo de sincronização ---------------- */

/* Intervalo de sincronização automática, em ms. Lê de configuracoes (em
   segundos); cai no padrão de config.js se não houver valor salvo. */
function intervaloSyncMs() {
  const seg = parseInt(obterConfig("intervalo_sync_seg", 0), 10) || 0;
  if (seg >= 5) return seg * 1000;
  return CONFIG.intervaloSyncMs || 60000;
}

function reiniciarTimerSync() {
  clearInterval(App.timerSync);
  App.timerSync = setInterval(() => sincronizar(), intervaloSyncMs());
}

/* ---------------- navegação ---------------- */

function registrarModulo(modulo) {
  App.modulos.push(modulo);
}

function modulosPermitidos() {
  const perfil = App.usuario?.perfil;
  return App.modulos.filter((m) => {
    if (m.perfis && !m.perfis.includes(perfil)) return false;
    // Módulos financeiros (Caixa, Cobranças) só para quem tem acesso liberado.
    if (m.financeiro && !App.usuario?.acessoFinanceiro) return false;
    return true;
  });
}

function temAcessoFinanceiro() {
  return !!App.usuario?.acessoFinanceiro;
}

function navegar(rota, parametros) {
  App.editando = false;
  App.parametrosRota = parametros || null;
  App.rota = rota;
  renderizarRotaAtual();
  atualizarNavAtiva();
  window.scrollTo(0, 0);
}

function renderizarRotaAtual() {
  const modulo = modulosPermitidos().find((m) => m.id === App.rota);
  if (!modulo) return;
  $("#topo-titulo").textContent = modulo.titulo;
  const conteudo = $("#conteudo");
  conteudo.dataset.rota = App.rota; // permite ao CSS dar layout próprio (ex.: Fluxo em tela cheia)
  conteudo.innerHTML = "";
  const parametros = App.parametrosRota;
  App.parametrosRota = null; // parâmetros valem só para a primeira renderização
  modulo.render(conteudo, parametros);
}

function montarNavegacao() {
  const mods = modulosPermitidos();
  const principais = mods.slice(0, 4);
  const extras = mods.slice(4);

  // Barra inferior (celular)
  const nav = $("#nav-inferior");
  nav.innerHTML =
    principais.map((m) =>
      `<button type="button" class="nav-item" data-rota="${m.id}">${ICONES[m.icone] || ""}<span>${esc(m.rotulo || m.titulo)}</span></button>`
    ).join("") +
    `<button type="button" class="nav-item" data-rota="__mais">${ICONES.mais}<span>Mais</span></button>`;

  // Menu lateral (computador)
  const lateral = $("#nav-lateral");
  lateral.innerHTML =
    `<div class="lateral-marca"><img src="images/icone.svg" alt=""><div><strong>Vivassol</strong><small>Gerencial V2</small></div></div>` +
    mods.map((m) =>
      `<button type="button" class="nav-item" data-rota="${m.id}">${ICONES[m.icone] || ""}<span>${esc(m.titulo)}</span></button>`
    ).join("") +
    `<div class="lateral-rodape">
       <div class="lateral-usuario">${esc(App.usuario.nome)} · ${App.usuario.perfil === "admin" ? "Administrador" : "Operacional"}</div>
       <button type="button" class="nav-item" data-rota="__sair">${ICONES.sair}<span>Sair</span></button>
     </div>`;

  [nav, lateral].forEach((area) =>
    area.addEventListener("click", (e) => {
      const botao = e.target.closest(".nav-item");
      if (!botao) return;
      const rota = botao.dataset.rota;
      if (rota === "__mais") return abrirMenuMais(extras);
      if (rota === "__sair") return sair();
      navegar(rota);
    })
  );
}

function abrirMenuMais(extras) {
  const corpo = document.createElement("div");
  corpo.innerHTML =
    extras.map((m) =>
      `<button type="button" class="item-menu" data-rota="${m.id}">${ICONES[m.icone] || ""}<span>${esc(m.titulo)}</span></button>`
    ).join("") +
    `<button type="button" class="item-menu" data-rota="__sair">${ICONES.sair}<span>Sair</span></button>`;
  const modal = abrirModal("Menu", corpo, { classe: "modal-menu" });
  corpo.addEventListener("click", (e) => {
    const botao = e.target.closest(".item-menu");
    if (!botao) return;
    modal.fechar();
    if (botao.dataset.rota === "__sair") sair();
    else navegar(botao.dataset.rota);
  });
}

function atualizarNavAtiva() {
  $$(".nav-item").forEach((b) => b.classList.toggle("ativo", b.dataset.rota === App.rota));
}

/* ---------------- login ---------------- */

async function hashTexto(texto) {
  if (window.crypto && crypto.subtle) {
    const dados = new TextEncoder().encode(texto);
    const buffer = await crypto.subtle.digest("SHA-256", dados);
    return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return sha256Js(texto);
}

/* SHA-256 reserva para navegadores sem crypto.subtle (apenas ASCII). */
function sha256Js(ascii) {
  function girar(valor, qtd) { return (valor >>> qtd) | (valor << (32 - qtd)); }
  const maxPalavra = Math.pow(2, 32);
  let resultado = "";
  const palavras = [];
  const bitsTotais = ascii.length * 8;
  let hash = (sha256Js.h = sha256Js.h || []);
  const k = (sha256Js.k = sha256Js.k || []);
  let primos = k.length;
  const composto = {};
  for (let candidato = 2; primos < 64; candidato++) {
    if (!composto[candidato]) {
      for (let i = 0; i < 313; i += candidato) composto[i] = candidato;
      hash[primos] = (Math.pow(candidato, 0.5) * maxPalavra) | 0;
      k[primos++] = (Math.pow(candidato, 1 / 3) * maxPalavra) | 0;
    }
  }
  ascii += "\x80";
  while ((ascii.length % 64) - 56) ascii += "\x00";
  for (let i = 0; i < ascii.length; i++) {
    const j = ascii.charCodeAt(i);
    if (j >> 8) return "";
    palavras[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  palavras[palavras.length] = (bitsTotais / maxPalavra) | 0;
  palavras[palavras.length] = bitsTotais;
  for (let j = 0; j < palavras.length;) {
    const w = palavras.slice(j, (j += 16));
    const hashAntigo = hash;
    hash = hash.slice(0, 8);
    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const a = hash[0], e = hash[4];
      const temp1 = hash[7] +
        (girar(e, 6) ^ girar(e, 11) ^ girar(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) + k[i] +
        (w[i] = i < 16 ? w[i] : (w[i - 16] + (girar(w15, 7) ^ girar(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (girar(w2, 17) ^ girar(w2, 19) ^ (w2 >>> 10))) | 0);
      const temp2 = (girar(a, 2) ^ girar(a, 13) ^ girar(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
    }
    for (let i = 0; i < 8; i++) hash[i] = (hash[i] + hashAntigo[i]) | 0;
  }
  for (let i = 0; i < 8; i++) {
    for (let j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      resultado += (b < 16 ? "0" : "") + b.toString(16);
    }
  }
  return resultado;
}

async function aoEnviarLogin(evento) {
  evento.preventDefault();
  const usuarioDigitado = $("#login-usuario").value.trim().toLowerCase();
  const senha = $("#login-senha").value;
  const erroEl = $("#login-erro");
  erroEl.classList.add("oculto");
  const cadastro = USUARIOS_SISTEMA.find((u) => u.usuario === usuarioDigitado);
  const hash = await hashTexto(senha);
  if (!cadastro || cadastro.senhaHash !== hash) {
    erroEl.textContent = "Usuário ou senha incorretos.";
    erroEl.classList.remove("oculto");
    return;
  }
  localStorage.setItem(CHAVE_SESSAO, JSON.stringify({ usuario: cadastro.usuario, desde: new Date().toISOString() }));
  entrar(cadastro);
}

function entrar(cadastro) {
  App.usuario = cadastro;
  $("#tela-login").classList.add("oculto");
  $("#app").classList.remove("oculto");
  montarNavegacao();
  navegar("inicio");
  logar("conexao", `Sessão iniciada por ${cadastro.nome}. ${apiConfigurada() ? "Planilha conectada." : "Planilha NÃO conectada (só este aparelho)."}`);
  atualizarStatus(apiConfigurada() ? "conectando" : "sem-config");
  sincronizar();
  reiniciarTimerSync();
}

async function sair() {
  const ok = await confirmar("Deseja sair do sistema?", { titulo: "Sair", botao: "Sair" });
  if (!ok) return;
  localStorage.removeItem(CHAVE_SESSAO);
  location.reload();
}

/* ---------------- inicialização ---------------- */

function iniciar() {
  App.sessaoId = uid("ses");
  carregarDbLocal();
  carregarPendentesLocal();
  aplicarTema(temaSalvo());
  logar("info", `App aberto (sessão ${App.sessaoId}). Dados carregados deste aparelho.`);
  $("#form-login").addEventListener("submit", aoEnviarLogin);
  $("#botao-status").addEventListener("click", abrirDetalhesStatus);
  $("#botao-tema")?.addEventListener("click", alternarTema);
  if (CONFIG.linkPlanilha) {
    const btnPlanilha = $("#botao-planilha");
    if (btnPlanilha) { btnPlanilha.href = CONFIG.linkPlanilha; btnPlanilha.classList.remove("oculto"); }
  }
  window.addEventListener("online", () => { logar("conexao", "Internet voltou. Sincronizando…"); sincronizar(); });
  window.addEventListener("offline", () => { logar("erro", "Internet caiu (aviso do navegador)."); atualizarStatus("offline"); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      logar("info", "App foi para segundo plano.");
      flushLogPlanilha(true); // envia o log antes de o aparelho possivelmente suspender
    } else {
      logar("info", "App voltou ao primeiro plano. Sincronizando…");
      sincronizar();
    }
  });
  // Última tentativa de salvar o log ao fechar a aba/app.
  window.addEventListener("pagehide", () => { logar("info", "App fechado."); flushLogPlanilha(true); });

  let sessao = null;
  try { sessao = JSON.parse(localStorage.getItem(CHAVE_SESSAO) || "null"); } catch { /* ignora */ }
  const cadastro = sessao && USUARIOS_SISTEMA.find((u) => u.usuario === sessao.usuario);
  if (cadastro) entrar(cadastro);
  else $("#tela-login").classList.remove("oculto");
}

document.addEventListener("DOMContentLoaded", iniciar);
