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

let fluxoEsc = 1;            // escala (zoom) do quadro
let fluxoZoomManual = false; // true quando o usuário ajustou o zoom pelos botões +/-
let fluxoCompacto = false;   // true = cartões sem checklist e data de entrega
let _mirrorBar = null;       // barra de scroll espelho fixada no rodapé (desktop)
let _mirrorObs = null;       // ResizeObserver da barra espelho
let _telaPaisagem = false;   // true quando orientação travada em paisagem

registrarModulo({
  id: "fluxo",
  titulo: "Fluxo",
  rotulo: "Fluxo",
  icone: "fluxo",
  perfis: null,
  render(el) { renderFluxo(el); },
});

function renderFluxo(el) {
  // Remove a barra espelho do render anterior (será recriada se for desktop)
  _destruirMirrorFluxo();

  const rolagem = capturarRolagem(el);

  const pedidos = agruparVendas(App.db.vendas).filter((v) => !v.arquivado);
  const porStatus = {};
  CONFIG.statusProducao.forEach((s) => (porStatus[s] = []));
  pedidos.forEach((v) => {
    (porStatus[v.status_producao] || (porStatus[v.status_producao] = [])).push(v);
  });
  Object.values(porStatus).forEach((lista) => lista.sort(ordenarPorEntrega));

  el.innerHTML = `
    <div class="pagina-fluxo">
      <div class="fluxo-barra">
        <div class="fluxo-zoom">
          <button type="button" class="btn-zoom" id="zoom-menos" aria-label="Diminuir">−</button>
          <button type="button" class="btn-zoom" id="zoom-mais" aria-label="Aumentar">+</button>
          <button type="button" class="btn-zoom btn-zoom-auto" id="zoom-auto" title="Ajustar ao tamanho da tela" aria-label="Auto-ajustar">⊡</button>
        </div>
        <div class="fluxo-acoes">
          <button type="button" class="btn btn-secundario btn-mini ${fluxoCompacto ? "ativo" : ""}" id="btn-compacto">⊟ Compacto</button>
          <button type="button" class="btn btn-secundario btn-mini fluxo-btn-girar" id="btn-girar">🔄 Girar tela</button>
          <button type="button" class="btn btn-secundario btn-mini" id="limpar-entregues">Limpar entregues</button>
          <button type="button" class="btn btn-secundario btn-mini" id="limpar-cancelados">Limpar cancelados</button>
        </div>
      </div>
      <div class="board" id="board" style="--esc:${fluxoEsc}">
        ${CONFIG.statusProducao.map((s) => colunaHtml(s, porStatus[s] || [])).join("")}
      </div>
    </div>`;

  const board = $("#board", el);

  // Auto-zoom para caber na tela (só se o usuário não ajustou manualmente)
  if (!fluxoZoomManual) {
    _autoZoomFluxo(el, board);
  } else {
    board.style.setProperty("--esc", String(fluxoEsc));
  }

  restaurarRolagem(el, rolagem);
  const refresh = () => renderFluxo(el);

  // Cria a barra de scroll espelho pregada no rodapé (apenas desktop/mouse)
  _criarMirrorFluxo(board);

  /* ---- zoom ---- */
  const aplicarZoom = () => {
    board.style.setProperty("--esc", String(fluxoEsc));
    _atualizarMirrorLargura(board);
  };

  $("#zoom-mais", el).addEventListener("click", () => {
    fluxoZoomManual = true;
    fluxoEsc = Math.min(1.8, fluxoEsc + 0.15);
    aplicarZoom();
  });
  $("#zoom-menos", el).addEventListener("click", () => {
    fluxoZoomManual = true;
    fluxoEsc = Math.max(0.4, fluxoEsc - 0.15);
    aplicarZoom();
  });
  $("#zoom-auto", el).addEventListener("click", () => {
    fluxoZoomManual = false;
    _autoZoomFluxo(el, board);
    _atualizarMirrorLargura(board);
  });
  board.addEventListener("wheel", (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    fluxoZoomManual = true;
    fluxoEsc = Math.min(1.8, Math.max(0.4, fluxoEsc - Math.sign(e.deltaY) * 0.1));
    aplicarZoom();
  }, { passive: false });

  /* ---- modo compacto ---- */
  $("#btn-compacto", el).addEventListener("click", () => {
    fluxoCompacto = !fluxoCompacto;
    refresh();
  });

  /* ---- girar tela ---- */
  $("#btn-girar", el).addEventListener("click", () => _toggleOrientacao($("#btn-girar", el)));

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
    if (e.target.closest(".card-itens")) return;
    const acaoEl = e.target.closest("[data-acao]");
    if (acaoEl) {
      const acao = acaoEl.dataset.acao;
      if (acao === "arrastar") return;
      if (acao === "pagamento") {
        abrirMiniPagamento(idVenda, refresh);
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

/* Calcula o zoom ideal para que todas as colunas caibam na largura disponível. */
function _autoZoomFluxo(el, board) {
  const disponivel = el.clientWidth - 24;
  if (disponivel < 100) return;
  const numCols = CONFIG.statusProducao.length;
  const gaps = (numCols - 1) * 12;
  // Largura efetiva de cada coluna = 17em * --esc; com 1em = 14px * --esc
  // → largura = 238 * esc². Resolvo: numCols * 238 * esc² + gaps = disponivel
  const esc = Math.sqrt(Math.max(0, disponivel - gaps) / (numCols * 238));
  fluxoEsc = Math.min(1.4, Math.max(0.4, esc));
  board.style.setProperty("--esc", String(fluxoEsc));
}

/* Cria uma barra de scroll horizontal fixada no rodapé da janela (desktop). */
function _criarMirrorFluxo(board) {
  if (!window.matchMedia("(pointer: fine)").matches) return;

  const bar = document.createElement("div");
  bar.className = "mirror-scroll-bar";
  bar.appendChild(Object.assign(document.createElement("div"), {
    className: "mirror-scroll-inner",
  }));
  document.body.appendChild(bar);
  _mirrorBar = bar;
  _atualizarMirrorLargura(board);

  let sync = false;
  board.addEventListener("scroll", () => {
    if (sync || !document.contains(board)) return;
    sync = true; bar.scrollLeft = board.scrollLeft; sync = false;
  });
  bar.addEventListener("scroll", () => {
    if (sync || !document.contains(board)) return;
    sync = true; board.scrollLeft = bar.scrollLeft; sync = false;
  });

  _mirrorObs = new ResizeObserver(() => _atualizarMirrorLargura(board));
  _mirrorObs.observe(board);
}

function _atualizarMirrorLargura(board) {
  if (!_mirrorBar) return;
  const inner = _mirrorBar.querySelector(".mirror-scroll-inner");
  if (inner) inner.style.width = board.scrollWidth + "px";
}

function _destruirMirrorFluxo() {
  if (_mirrorBar) { _mirrorBar.remove(); _mirrorBar = null; }
  if (_mirrorObs) { _mirrorObs.disconnect(); _mirrorObs = null; }
}

/* Trava / destrava orientação paisagem no celular. */
async function _toggleOrientacao(btn) {
  if (!screen.orientation?.lock) {
    toast("Gire o celular manualmente para ver o quadro melhor. 🔄");
    return;
  }
  try {
    if (_telaPaisagem) {
      screen.orientation.unlock();
      _telaPaisagem = false;
      btn.textContent = "🔄 Girar tela";
    } else {
      await screen.orientation.lock("landscape");
      _telaPaisagem = true;
      btn.textContent = "↩ Voltar retrato";
    }
  } catch (e) {
    toast("Gire o celular manualmente para ver o quadro melhor. 🔄");
  }
}

/* Lê a posição de rolagem horizontal do quadro. */
function capturarRolagem(el) {
  const board = $("#board", el);
  if (!board) return null;
  return { board: board.scrollLeft };
}

/* Devolve o quadro à posição horizontal guardada após uma re-renderização. */
function restaurarRolagem(el, rolagem) {
  if (!rolagem) return;
  const board = $("#board", el);
  if (!board) return;
  board.scrollLeft = rolagem.board;
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
    <article class="card-fluxo ${classeAlerta}${fluxoCompacto ? " card-compacto" : ""}" data-venda="${esc(v.id_venda)}" data-status-atual="${esc(v.status_producao)}">
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
