"use strict";

/* ============================================================
   Módulo: Fluxo de pedidos (quadro estilo Kanban)
   - Uma coluna por etapa de produção, cada uma com sua cor.
   - Cartões movem-se por: arrastar (alça ⠿), setas ‹ › ou
     abrindo o pedido. Toque e mouse usam os mesmos eventos
     de ponteiro, com "fantasma" e "aura" durante o arrasto.
   - Pedidos entregues/cancelados podem sair do quadro (sem
     sair da lista de Pedidos).
   ============================================================ */

let fluxoEsc = 1; // escala (zoom) do quadro

registrarModulo({
  id: "fluxo",
  titulo: "Fluxo",
  rotulo: "Fluxo",
  icone: "fluxo",
  perfis: null,
  render(el) { renderFluxo(el); },
});

function renderFluxo(el) {
  // Guarda a rolagem atual (horizontal do quadro e vertical de cada coluna)
  // para restaurar depois de re-renderizar — assim a tela não "pula" para a
  // esquerda quando se mexe num cartão.
  const rolagem = capturarRolagem(el);

  const pedidos = agruparVendas(App.db.vendas).filter((v) => !v.arquivado);
  const porStatus = {};
  CONFIG.statusProducao.forEach((s) => (porStatus[s] = []));
  pedidos.forEach((v) => {
    (porStatus[v.status_producao] || (porStatus[v.status_producao] = [])).push(v);
  });
  // Dentro da coluna, os mais urgentes (entrega mais próxima) primeiro.
  Object.values(porStatus).forEach((lista) => lista.sort(ordenarPorEntrega));

  el.innerHTML = `
    <div class="pagina-fluxo">
      <div class="fluxo-barra">
        <div class="fluxo-zoom">
          <button type="button" class="btn-zoom" id="zoom-menos" aria-label="Diminuir">−</button>
          <button type="button" class="btn-zoom" id="zoom-mais" aria-label="Aumentar">+</button>
        </div>
        <div class="fluxo-acoes">
          <button type="button" class="btn btn-secundario btn-mini" id="limpar-entregues">Limpar entregues</button>
          <button type="button" class="btn btn-secundario btn-mini" id="limpar-cancelados">Limpar cancelados</button>
        </div>
      </div>
      <p class="fluxo-dica-girar">Gire o celular na horizontal para ver melhor o quadro 🔄</p>
      <div class="board" id="board" style="--esc:${fluxoEsc}">
        ${CONFIG.statusProducao.map((s) => colunaHtml(s, porStatus[s] || [])).join("")}
      </div>
    </div>`;

  const board = $("#board", el);
  restaurarRolagem(el, rolagem);
  const refresh = () => renderFluxo(el);

  /* ---- zoom ---- */
  const aplicarZoom = () => board.style.setProperty("--esc", String(fluxoEsc));
  $("#zoom-mais", el).addEventListener("click", () => { fluxoEsc = Math.min(1.8, fluxoEsc + 0.15); aplicarZoom(); });
  $("#zoom-menos", el).addEventListener("click", () => { fluxoEsc = Math.max(0.6, fluxoEsc - 0.15); aplicarZoom(); });
  board.addEventListener("wheel", (e) => {
    if (!e.ctrlKey) return; // zoom só com Ctrl + roda (não atrapalha o scroll normal)
    e.preventDefault();
    fluxoEsc = Math.min(1.8, Math.max(0.6, fluxoEsc - Math.sign(e.deltaY) * 0.1));
    aplicarZoom();
  }, { passive: false });

  /* ---- limpar colunas finais ---- */
  $("#limpar-entregues", el).addEventListener("click", () => limparColuna("Entregue", refresh));
  $("#limpar-cancelados", el).addEventListener("click", () => limparColuna("Cancelado", refresh));

  /* ---- arrastar (alça) ---- */
  board.addEventListener("pointerdown", (e) => {
    const handle = e.target.closest(".card-handle");
    if (!handle) return;
    const card = handle.closest(".card-fluxo");
    if (!card) return;
    iniciarArrasto(e, card, board, async (novoStatus) => {
      if (novoStatus && novoStatus !== card.dataset.statusAtual) {
        await mudarStatusProducao(card.dataset.venda, novoStatus, { aoMudar: refresh });
      }
    });
  });

  /* ---- cliques (setas, pagamento, arquivar, abrir) ---- */
  board.addEventListener("click", async (e) => {
    const card = e.target.closest(".card-fluxo");
    if (!card) return;
    const idVenda = card.dataset.venda;
    // Cliques no checklist são tratados pelo evento "change".
    if (e.target.closest(".card-itens")) return;
    const acaoEl = e.target.closest("[data-acao]");
    if (acaoEl) {
      const acao = acaoEl.dataset.acao;
      if (acao === "arrastar") return;
      if (acao === "pagamento") {
        abrirPagamentoVenda(idVenda, refresh);
        return;
      }
      if (acao === "anterior" || acao === "proximo") {
        const v = acharPedido(idVenda);
        if (!v) return;
        const idx = CONFIG.statusProducao.indexOf(v.status_producao);
        const novo = CONFIG.statusProducao[idx + (acao === "proximo" ? 1 : -1)];
        if (novo) await mudarStatusProducao(idVenda, novo, { aoMudar: refresh });
        return;
      }
      if (acao === "arquivar") { arquivarPedido(idVenda, { aoMudar: refresh }); return; }
    }
    abrirDetalheVenda(idVenda, refresh);
  });

  /* ---- checklist (sem re-renderizar tudo, preserva o scroll) ---- */
  board.addEventListener("change", (e) => {
    const chk = e.target.closest("input[data-item]");
    if (!chk) return;
    const pronto = alternarItemPronto(chk.dataset.item);
    const li = chk.closest(".card-item");
    if (li) li.classList.toggle("ok", pronto);
  });
}

/* Lê a posição de rolagem do quadro e de cada coluna (por status). */
function capturarRolagem(el) {
  const board = $("#board", el);
  if (!board) return null;
  const colunas = {};
  $$(".coluna-fluxo", board).forEach((sec) => {
    const corpo = $(".coluna-corpo", sec);
    if (corpo) colunas[sec.dataset.status] = corpo.scrollTop;
  });
  return { board: board.scrollLeft, colunas };
}

/* Devolve o quadro à posição guardada após uma re-renderização. */
function restaurarRolagem(el, rolagem) {
  if (!rolagem) return;
  const board = $("#board", el);
  if (!board) return;
  board.scrollLeft = rolagem.board;
  $$(".coluna-fluxo", board).forEach((sec) => {
    const corpo = $(".coluna-corpo", sec);
    const topo = rolagem.colunas[sec.dataset.status];
    if (corpo && topo) corpo.scrollTop = topo;
  });
}

function ordenarPorEntrega(a, b) {
  const da = a.data_entrega ? parseData(a.data_entrega)?.getTime() : Infinity;
  const db = b.data_entrega ? parseData(b.data_entrega)?.getTime() : Infinity;
  if (da !== db) return da - db;
  return String(b.data).localeCompare(String(a.data));
}

function acharPedido(idVenda) {
  return agruparVendas(App.db.vendas).find((v) => v.id_venda === idVenda);
}

function colunaHtml(status, lista) {
  return `
    <section class="coluna-fluxo col-${slugStatus(status)}" data-status="${esc(status)}">
      <header class="coluna-cab">
        <span class="coluna-nome">${esc(status)}</span>
        <span class="coluna-contagem">${lista.length}</span>
      </header>
      <div class="coluna-corpo">
        ${lista.length ? lista.map(cardFluxoHtml).join("") : `<p class="coluna-vazia">—</p>`}
      </div>
    </section>`;
}

function cardFluxoHtml(v) {
  const idx = CONFIG.statusProducao.indexOf(v.status_producao);
  const sit = situacaoEntrega(v.data_entrega, v.status_producao);
  const finalizado = v.status_producao === "Entregue" || v.status_producao === "Cancelado";
  const classeAlerta = sit === "atrasado" ? "card-atrasado" : sit === "hoje" ? "card-hoje" : "";
  return `
    <article class="card-fluxo ${classeAlerta}" data-venda="${esc(v.id_venda)}" data-status-atual="${esc(v.status_producao)}">
      <div class="card-cab">
        <button type="button" class="card-handle" data-acao="arrastar" aria-label="Arrastar pedido">⠿</button>
        <span class="card-id">#${esc(v.id_venda)}${v.tipo === "Orçamento" ? " · orç." : ""}</span>
        ${finalizado ? `<button type="button" class="card-arquivar" data-acao="arquivar" aria-label="Tirar do quadro">×</button>` : ""}
      </div>
      <strong class="card-cliente">${esc(v.cliente_nome || "Sem cliente")}</strong>
      ${v.data_entrega ? `<div class="card-entrega ${sit}">📅 ${dataCurta(v.data_entrega)}${sit === "hoje" ? " · hoje!" : sit === "atrasado" ? " · atrasado" : ""}</div>` : ""}
      <ul class="card-itens">
        ${v.itens.map((i) => `
          <li class="card-item ${itemEstaPronto(i) ? "ok" : ""}">
            <label>
              <input type="checkbox" data-item="${esc(i.id)}" ${itemEstaPronto(i) ? "checked" : ""}>
              <span class="card-item-texto">${esc(numero(i.quantidade))}x ${esc(i.produto_nome)}</span>
            </label>
          </li>`).join("")}
      </ul>
      <div class="card-rodape">
        <button type="button" class="card-seta" data-acao="anterior" ${idx <= 0 ? "disabled" : ""} aria-label="Etapa anterior">‹</button>
        <button type="button" class="badge-status badge-pag pag-${slugStatus(v.status_pagamento)}" data-acao="pagamento">${esc(v.status_pagamento)}</button>
        <button type="button" class="card-seta" data-acao="proximo" ${idx >= CONFIG.statusProducao.length - 1 ? "disabled" : ""} aria-label="Próxima etapa">›</button>
      </div>
    </article>`;
}

/* Tira do quadro todos os pedidos de uma etapa (entregues ou cancelados). */
async function limparColuna(status, aoMudar) {
  const alvos = agruparVendas(App.db.vendas).filter((v) => !v.arquivado && v.status_producao === status);
  if (!alvos.length) { toast("Nada para limpar nessa coluna."); return; }
  const ok = await confirmar(
    `Tirar ${alvos.length} pedido(s) de "${status}" do quadro? Eles continuam na lista de Pedidos.`,
    { botao: "Limpar" });
  if (!ok) return;
  const ids = new Set(alvos.map((v) => v.id_venda));
  App.db.vendas.forEach((linha) => {
    if (ids.has(linha.id_venda || linha.id)) linha.arquivado = "sim";
  });
  salvarTabela("vendas");
  toast("Quadro atualizado.");
  if (aoMudar) aoMudar();
}

/* ---------------- arrastar e soltar ---------------- */

function iniciarArrasto(e, card, board, aoSoltar) {
  e.preventDefault();
  const rect = card.getBoundingClientRect();
  const offsetX = e.clientX - rect.left;
  const offsetY = e.clientY - rect.top;

  const ghost = card.cloneNode(true);
  ghost.classList.add("card-ghost");
  ghost.style.width = rect.width + "px";
  ghost.style.left = rect.left + "px";
  ghost.style.top = rect.top + "px";
  ghost.style.pointerEvents = "none";
  document.body.appendChild(ghost);
  card.classList.add("card-arrastando");

  const aura = document.createElement("div");
  aura.className = "card-aura";
  aura.style.height = rect.height + "px";

  let colunaAlvo = null;

  function mover(ev) {
    ghost.style.left = (ev.clientX - offsetX) + "px";
    ghost.style.top = (ev.clientY - offsetY) + "px";
    const sob = document.elementFromPoint(ev.clientX, ev.clientY);
    const corpo = sob && sob.closest(".coluna-corpo");
    if (corpo) {
      colunaAlvo = corpo.closest(".coluna-fluxo");
      const cardSob = sob.closest(".card-fluxo");
      if (cardSob && cardSob !== card && cardSob.parentElement === corpo) {
        corpo.insertBefore(aura, cardSob);
      } else if (aura.parentElement !== corpo) {
        corpo.appendChild(aura);
      }
    } else {
      colunaAlvo = null;
      aura.remove();
    }
    $$(".coluna-fluxo", board).forEach((c) => c.classList.toggle("coluna-hover", c === colunaAlvo));
  }

  function soltar() {
    document.removeEventListener("pointermove", mover);
    document.removeEventListener("pointerup", soltar);
    document.removeEventListener("pointercancel", soltar);
    ghost.remove();
    aura.remove();
    card.classList.remove("card-arrastando");
    $$(".coluna-fluxo", board).forEach((c) => c.classList.remove("coluna-hover"));
    if (colunaAlvo) aoSoltar(colunaAlvo.dataset.status);
  }

  document.addEventListener("pointermove", mover);
  document.addEventListener("pointerup", soltar);
  document.addEventListener("pointercancel", soltar);
}
