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
  ultimaSync: null,
  tabelasPendentes: new Set(),
  timerSync: null,
};

const CHAVE_DB = "vivassol.v2.db";
const CHAVE_SESSAO = "vivassol.v2.sessao";
const CHAVE_PENDENTES = "vivassol.v2.pendentes";
const TABELAS = ["configuracoes", "usuarios", "clientes", "produtos", "insumos", "vendas"];

/* ---------------- utilitários ---------------- */

function $(seletor, raiz) { return (raiz || document).querySelector(seletor); }
function $$(seletor, raiz) { return Array.from((raiz || document).querySelectorAll(seletor)); }

function uid(prefixo) {
  return `${prefixo || "id"}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function gerarId(prefixo, tabela) {
  const max = App.db[tabela].reduce((m, r) => {
    const n = parseInt(String(r.id).replace(prefixo, "")) || 0;
    return Math.max(m, n);
  }, 0);
  return `${prefixo}${max + 1}`;
}

function gerarIdVenda() {
  const max = App.db.vendas.reduce((m, v) => {
    const n = parseInt(String(v.id_venda).replace("VDA", "")) || 0;
    return Math.max(m, n);
  }, 0);
  return `VDA${max + 1}`;
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
  config: icone('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2.1 2.1M16.9 16.9 19 19M19 5l-2.1 2.1M7.1 16.9 5 19"/>'),
  mais: icone('<circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/>'),
  sair: icone('<path d="M9 4H4v16h5"/><path d="M16 8l4 4-4 4"/><path d="M9 12h11"/>'),
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

async function chamarApi(acao, payload) {
  // Corpo enviado como texto simples para evitar bloqueio de CORS no Apps Script.
  const resposta = await fetch(CONFIG.apiUrl, {
    method: "POST",
    body: JSON.stringify({ token: CONFIG.token, acao, payload: payload || null }),
  });
  const json = await resposta.json();
  if (!json.ok) throw new Error(json.erro || "Erro na planilha");
  return json.dados;
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

async function enviarPendentes() {
  if (!apiConfigurada() || App.syncOcupado || App.tabelasPendentes.size === 0) return;
  App.syncOcupado = true;
  atualizarStatus("sincronizando");
  try {
    for (const tabela of [...App.tabelasPendentes]) {
      const linhasParaEnvio = tabela === "produtos"
        ? App.db.produtos.map(p => ({
            ...p,
            composicao: (p.composicao || []).map(c => `${c.id_insumo}[${c.nome_insumo}](${c.quantidade})`).join(", ")
          }))
        : App.db[tabela];
      await chamarApi("salvarTabela", { tabela, linhas: linhasParaEnvio });
      App.tabelasPendentes.delete(tabela);
      salvarPendentesLocal();
    }
    atualizarStatus("online");
  } catch (erro) {
    console.warn("Falha ao enviar dados (ficam pendentes no aparelho):", erro);
    atualizarStatus("offline");
  } finally {
    App.syncOcupado = false;
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
  if (App.syncOcupado) return false;
  if (!opcoes.forcar && estaEditando()) return false;
  App.syncOcupado = true;
  atualizarStatus("sincronizando");
  try {
    // 1) Envia primeiro o que está pendente neste aparelho.
    for (const tabela of [...App.tabelasPendentes]) {
      const linhasParaEnvio = tabela === "produtos"
        ? App.db.produtos.map(p => ({
            ...p,
            composicao: (p.composicao || []).map(c => `${c.id_insumo}[${c.nome_insumo}](${c.quantidade})`).join(", ")
          }))
        : App.db[tabela];
      await chamarApi("salvarTabela", { tabela, linhas: linhasParaEnvio });
      App.tabelasPendentes.delete(tabela);
      salvarPendentesLocal();
    }
    // 2) Baixa tudo da planilha.
    const dados = await chamarApi("obterTudo");
    const antes = JSON.stringify(App.db);

    // Preservar composicao local antes de qualquer overwrite pela planilha
    const composicaoLocal = new Map(
      (App.db.produtos || [])
        .filter(p => Array.isArray(p.composicao) && p.composicao.length > 0)
        .map(p => [p.id, p.composicao])
    );

    TABELAS.forEach((t) => {
      // Tabela com alteração local pendente nunca é sobrescrita.
      if (Array.isArray(dados[t]) && !App.tabelasPendentes.has(t)) App.db[t] = dados[t];
    });
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
    if (JSON.stringify(App.db) !== antes) {
      salvarDbLocal();
      if (!estaEditando() || opcoes.forcar) renderizarRotaAtual();
    }
    App.ultimaSync = new Date();
    atualizarStatus("online");
    return true;
  } catch (erro) {
    console.warn("Falha na sincronização:", erro);
    atualizarStatus("offline");
    return false;
  } finally {
    App.syncOcupado = false;
  }
}

function atualizarStatus(estado) {
  App.estadoConexao = estado;
  const botao = $("#botao-status");
  if (!botao) return;
  const textos = {
    online: "Conectado",
    offline: "Sem conexão",
    sincronizando: "Sincronizando…",
    "sem-config": "Planilha não conectada",
  };
  botao.dataset.estado = estado;
  $("#status-texto").textContent = textos[estado] || "—";
}

function abrirDetalhesStatus() {
  const pendentes = [...App.tabelasPendentes];
  const corpo = document.createElement("div");
  corpo.innerHTML = `
    <div class="info-status">
      <p><strong>Estado:</strong> ${esc($("#status-texto").textContent)}</p>
      <p><strong>Última sincronização:</strong> ${App.ultimaSync ? dataHora(App.ultimaSync.toISOString()) : "ainda não sincronizou"}</p>
      <p><strong>Aguardando envio:</strong> ${pendentes.length ? esc(pendentes.join(", ")) : "nada pendente"}</p>
      ${apiConfigurada() ? "" : `<p class="erro">A URL do Apps Script ainda não foi colada em js/config.js. Os dados estão sendo salvos apenas neste aparelho.</p>`}
    </div>
    <div class="linha-botoes">
      <button type="button" class="btn btn-primario" id="status-sincronizar" ${apiConfigurada() ? "" : "disabled"}>Sincronizar agora</button>
    </div>`;
  const modal = abrirModal("Sincronização", corpo, { classe: "modal-pequeno" });
  $("#status-sincronizar", corpo)?.addEventListener("click", async () => {
    modal.fechar();
    const ok = await sincronizar({ forcar: true });
    toast(ok ? "Sincronizado com a planilha." : "Não foi possível sincronizar.", ok ? "ok" : "erro");
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
    venda.cliente_id = base.cliente_id || "";
    venda.status_producao = statusProducaoDe(base);
    venda.status_pagamento = statusPagamentoDe(base);
    venda.valor_pago = base.valor_pago || "";
    venda.arquivado = String(base.arquivado || "").toLowerCase() === "sim";
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
  // Registro antigo: "Fiado" sem status = não pago; concluído = pago.
  if (String(linha?.pagamento || "") === "Fiado") return "Não pago";
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
  if (novoStatus === "Cancelado" && (venda.status_pagamento === "Pago" || venda.status_pagamento === "Parcial")) {
    const ok = await confirmar(
      `Este pedido tem pagamento registrado (${venda.status_pagamento}). Lembre-se de devolver o valor ao cliente. Deseja cancelar?`,
      { perigo: true, titulo: "Devolver ao cliente", botao: "Cancelar pedido" });
    if (!ok) return false;
  }

  if (ajustarEstoquePorTransicao(venda, atual, novoStatus)) salvarTabela("insumos");

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

function mudarStatusPagamento(idVenda, novoStatus, opcoes = {}) {
  App.db.vendas.forEach((linha) => {
    if ((linha.id_venda || linha.id) === idVenda) linha.status_pagamento = novoStatus;
  });
  salvarTabela("vendas");
  if (!opcoes.silencioso) toast(`Pagamento: ${novoStatus}.`);
  if (opcoes.aoMudar) opcoes.aoMudar();
}

/* Avança o pagamento para o próximo estado (Não pago → Parcial → Pago). */
function ciclarPagamento(idVenda, atual, opcoes = {}) {
  const ordem = CONFIG.statusPagamento;
  const proximo = ordem[(ordem.indexOf(atual) + 1) % ordem.length];
  mudarStatusPagamento(idVenda, proximo, opcoes);
  return proximo;
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

/* ---------------- navegação ---------------- */

function registrarModulo(modulo) {
  App.modulos.push(modulo);
}

function modulosPermitidos() {
  const perfil = App.usuario?.perfil;
  return App.modulos.filter((m) => !m.perfis || m.perfis.includes(perfil));
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
  atualizarStatus(apiConfigurada() ? "sincronizando" : "sem-config");
  sincronizar();
  clearInterval(App.timerSync);
  App.timerSync = setInterval(() => sincronizar(), CONFIG.intervaloSyncMs || 60000);
}

async function sair() {
  const ok = await confirmar("Deseja sair do sistema?", { titulo: "Sair", botao: "Sair" });
  if (!ok) return;
  localStorage.removeItem(CHAVE_SESSAO);
  location.reload();
}

/* ---------------- inicialização ---------------- */

function iniciar() {
  carregarDbLocal();
  carregarPendentesLocal();
  $("#form-login").addEventListener("submit", aoEnviarLogin);
  $("#botao-status").addEventListener("click", abrirDetalhesStatus);
  window.addEventListener("online", () => sincronizar());
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) sincronizar();
  });

  let sessao = null;
  try { sessao = JSON.parse(localStorage.getItem(CHAVE_SESSAO) || "null"); } catch { /* ignora */ }
  const cadastro = sessao && USUARIOS_SISTEMA.find((u) => u.usuario === sessao.usuario);
  if (cadastro) entrar(cadastro);
  else $("#tela-login").classList.remove("oculto");
}

document.addEventListener("DOMContentLoaded", iniciar);
