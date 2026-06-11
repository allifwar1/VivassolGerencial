"use strict";

/* ============================================================
   Módulo: Estoque (insumos)
   - Lista com busca e filtro por categoria
   - Cadastro/edição de itens
   - Conferência de estoque: conta tudo, uma categoria ou
     itens buscados; mostra as diferenças antes de aplicar.
   ============================================================ */

registrarModulo({
  id: "estoque",
  titulo: "Estoque",
  rotulo: "Estoque",
  icone: "estoque",
  render(el) {
    renderListaInsumos(el);
  },
});

function categoriasInsumos() {
  return [...new Set(App.db.insumos.map((i) => String(i.categoria || "").trim()).filter(Boolean))].sort();
}

/* ---------------- lista ---------------- */

function renderListaInsumos(el) {
  App.editando = false;
  el.innerHTML = `
    <div class="pagina">
      <div class="linha-acoes">
        <button type="button" class="btn btn-primario" id="insumo-novo">+ Novo item</button>
        <button type="button" class="btn btn-secundario" id="abrir-conferencia">Conferência</button>
      </div>
      <input id="insumos-busca" class="campo-busca" placeholder="Buscar item…" autocomplete="off">
      <div class="chips" id="insumos-categorias"></div>
      <div class="lista" id="insumos-lista"></div>
    </div>`;

  let categoria = "todas";

  function montarChips() {
    const area = $("#insumos-categorias", el);
    const cats = categoriasInsumos();
    if (!cats.length) { area.innerHTML = ""; return; }
    area.innerHTML =
      `<button type="button" class="chip ${categoria === "todas" ? "ativo" : ""}" data-cat="todas">Todas</button>` +
      cats.map((c) => `<button type="button" class="chip ${categoria === c ? "ativo" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`).join("");
  }

  function atualizarLista() {
    const busca = $("#insumos-busca", el).value.trim();
    let itens = [...App.db.insumos].sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
    if (categoria !== "todas") itens = itens.filter((i) => String(i.categoria || "").trim() === categoria);
    if (busca) itens = itens.filter((i) => contemTexto(i.nome, busca));
    $("#insumos-lista", el).innerHTML = itens.length
      ? itens.map((i) => {
          const baixo = numero(i.quantidade) <= numero(i.estoque_minimo);
          return `
            <button type="button" class="cartao-item" data-id="${esc(i.id)}">
              <div class="cartao-info">
                <strong>${esc(i.nome)}</strong>
                <small>${esc(i.categoria || "Sem categoria")}</small>
              </div>
              <div class="cartao-lado">
                <strong>${numero(i.quantidade).toLocaleString("pt-BR")} ${esc(i.unidade || "un")}</strong>
                ${baixo ? `<span class="selo selo-atencao">Baixo</span>` : ""}
              </div>
            </button>`;
        }).join("")
      : `<p class="vazio">Nenhum item de estoque${busca ? " encontrado" : " cadastrado ainda"}.</p>`;
  }

  $("#insumo-novo", el).addEventListener("click", () => formInsumo(null, () => { montarChips(); atualizarLista(); }));
  $("#abrir-conferencia", el).addEventListener("click", () => renderConferencia(el));
  $("#insumos-busca", el).addEventListener("input", atualizarLista);
  $("#insumos-categorias", el).addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    categoria = chip.dataset.cat;
    montarChips();
    atualizarLista();
  });
  $("#insumos-lista", el).addEventListener("click", (e) => {
    const cartao = e.target.closest(".cartao-item");
    if (!cartao) return;
    const item = App.db.insumos.find((i) => i.id === cartao.dataset.id);
    if (item) formInsumo(item, () => { montarChips(); atualizarLista(); });
  });

  montarChips();
  atualizarLista();
}

/* ---------------- formulário ---------------- */

function formInsumo(existente, aoMudar) {
  const corpo = document.createElement("div");
  corpo.innerHTML = `
    <form class="formulario" id="form-insumo">
      <label class="rotulo">Nome *
        <input class="campo" name="nome" required value="${esc(existente?.nome || "")}">
      </label>
      <div class="meio">
        <label class="rotulo">Categoria
          <input class="campo" name="categoria" list="cats-insumos" value="${esc(existente?.categoria || "")}" autocomplete="off">
          <datalist id="cats-insumos">${categoriasInsumos().map((c) => `<option value="${esc(c)}">`).join("")}</datalist>
        </label>
        <label class="rotulo">Unidade
          <select class="campo" name="unidade">
            ${CONFIG.unidades.map((u) => `<option ${u === (existente?.unidade || "un") ? "selected" : ""}>${esc(u)}</option>`).join("")}
          </select>
        </label>
      </div>
      <div class="meio">
        <label class="rotulo">Quantidade atual
          <input class="campo" name="quantidade" type="number" min="0" step="any" inputmode="decimal" value="${existente ? numero(existente.quantidade) : ""}" placeholder="0">
        </label>
        <label class="rotulo">Estoque mínimo
          <input class="campo" name="estoque_minimo" type="number" min="0" step="any" inputmode="decimal" value="${existente ? numero(existente.estoque_minimo) : ""}" placeholder="0">
        </label>
      </div>
      <label class="rotulo">Custo por unidade (R$)
        <input class="campo" name="custo" type="number" min="0" step="any" inputmode="decimal" value="${existente ? numero(existente.custo) : ""}" placeholder="0,00">
      </label>
      <div class="linha-botoes">
        ${existente ? `<button type="button" class="btn btn-perigo" id="insumo-excluir">Excluir</button>` : ""}
        <button type="submit" class="btn btn-primario">Salvar</button>
      </div>
    </form>`;

  const modal = abrirModal(existente ? "Editar item" : "Novo item de estoque", corpo);

  $("#form-insumo", corpo).addEventListener("submit", (e) => {
    e.preventDefault();
    const dados = new FormData(e.target);
    const registro = {
      id: existente?.id || uid("ins"),
      nome: String(dados.get("nome")).trim(),
      categoria: String(dados.get("categoria")).trim(),
      unidade: String(dados.get("unidade")),
      quantidade: numero(dados.get("quantidade")),
      estoque_minimo: numero(dados.get("estoque_minimo")),
      custo: numero(dados.get("custo")),
      atualizado_em: new Date().toISOString(),
    };
    if (!registro.nome) return;
    const indice = App.db.insumos.findIndex((i) => i.id === registro.id);
    if (indice >= 0) App.db.insumos[indice] = registro;
    else App.db.insumos.push(registro);
    salvarTabela("insumos");
    toast(existente ? "Item atualizado." : "Item cadastrado.");
    modal.fechar();
    if (aoMudar) aoMudar();
  });

  $("#insumo-excluir", corpo)?.addEventListener("click", async () => {
    const ok = await confirmar(`Excluir "${existente.nome}" do estoque?`, { perigo: true, botao: "Excluir" });
    if (!ok) return;
    App.db.insumos = App.db.insumos.filter((i) => i.id !== existente.id);
    salvarTabela("insumos");
    toast("Item excluído.");
    modal.fechar();
    if (aoMudar) aoMudar();
  });
}

/* ---------------- conferência ---------------- */

function renderConferencia(el) {
  App.editando = true; // bloqueia atualização automática durante a contagem
  const contagens = new Map(); // id do insumo -> valor digitado (texto)
  let categoria = "todas";

  el.innerHTML = `
    <div class="pagina com-barra-fixa">
      <div class="pdv-topo">
        <button type="button" class="btn btn-secundario" id="conf-voltar">‹ Estoque</button>
        <strong>Conferência</strong>
      </div>
      <p class="pdv-dica">Conte os itens e digite a quantidade encontrada. Itens em branco não são alterados.</p>
      <div class="chips" id="conf-chips"></div>
      <input id="conf-busca" class="campo-busca" placeholder="Ou busque um item específico…" autocomplete="off">
      <div class="lista" id="conf-lista"></div>
    </div>
    <div class="barra-fixa">
      <button type="button" class="btn btn-primario btn-grande btn-cheio" id="conf-revisar">Revisar e aplicar contagem</button>
    </div>`;

  function montarChips() {
    const cats = categoriasInsumos();
    $("#conf-chips", el).innerHTML =
      `<button type="button" class="chip ${categoria === "todas" ? "ativo" : ""}" data-cat="todas">Tudo</button>` +
      cats.map((c) => `<button type="button" class="chip ${categoria === c ? "ativo" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`).join("");
  }

  function itensDoEscopo() {
    const busca = $("#conf-busca", el).value.trim();
    let itens = [...App.db.insumos].sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
    if (busca) return itens.filter((i) => contemTexto(i.nome, busca));
    if (categoria !== "todas") itens = itens.filter((i) => String(i.categoria || "").trim() === categoria);
    return itens;
  }

  function listar() {
    const itens = itensDoEscopo();
    $("#conf-lista", el).innerHTML = itens.length
      ? itens.map((i) => `
          <div class="conf-item">
            <div>
              <strong>${esc(i.nome)}</strong>
              <small>${esc(i.categoria || "Sem categoria")} · sistema: ${numero(i.quantidade).toLocaleString("pt-BR")} ${esc(i.unidade || "un")}</small>
            </div>
            <input type="number" min="0" step="any" inputmode="decimal" placeholder="Contado"
              data-id="${esc(i.id)}" value="${contagens.has(i.id) ? esc(contagens.get(i.id)) : ""}">
          </div>`).join("")
      : `<p class="vazio">Nenhum item neste filtro.</p>`;
  }

  $("#conf-chips", el).addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    categoria = chip.dataset.cat;
    $("#conf-busca", el).value = "";
    montarChips();
    listar();
  });

  $("#conf-busca", el).addEventListener("input", listar);

  $("#conf-lista", el).addEventListener("input", (e) => {
    const id = e.target.dataset.id;
    if (!id) return;
    if (e.target.value === "") contagens.delete(id);
    else contagens.set(id, e.target.value);
  });

  $("#conf-voltar", el).addEventListener("click", async () => {
    if (contagens.size) {
      const ok = await confirmar("Sair da conferência? A contagem digitada será descartada.", { perigo: true, botao: "Sair" });
      if (!ok) return;
    }
    renderListaInsumos(el);
  });

  $("#conf-revisar", el).addEventListener("click", () => {
    if (!contagens.size) {
      toast("Nenhum item contado ainda.", "erro");
      return;
    }
    const linhas = [...contagens.entries()].map(([id, valor]) => {
      const item = App.db.insumos.find((i) => i.id === id);
      if (!item) return null;
      const sistema = numero(item.quantidade);
      const contado = numero(valor);
      return { item, sistema, contado, delta: contado - sistema };
    }).filter(Boolean);

    const comDiferenca = linhas.filter((l) => l.delta !== 0);

    const corpo = document.createElement("div");
    corpo.innerHTML = `
      <p class="confirmar-texto">${linhas.length} ${linhas.length > 1 ? "itens contados" : "item contado"} · ${comDiferenca.length} com diferença</p>
      <div class="resumo-venda">
        ${linhas.map((l) => `
          <div class="linha">
            <span>${esc(l.item.nome)}</span>
            <span>
              ${l.sistema.toLocaleString("pt-BR")} → ${l.contado.toLocaleString("pt-BR")}
              <span class="conf-diferenca ${l.delta > 0 ? "mais" : l.delta < 0 ? "menos" : "igual"}">
                ${l.delta === 0 ? "ok" : (l.delta > 0 ? "+" : "") + l.delta.toLocaleString("pt-BR")}
              </span>
            </span>
          </div>`).join("")}
      </div>
      <div class="linha-botoes">
        <button type="button" class="btn btn-secundario" data-acao="voltar">Voltar</button>
        <button type="button" class="btn btn-primario" data-acao="aplicar">Aplicar contagem</button>
      </div>`;

    const modal = abrirModal("Revisão da contagem", corpo);
    corpo.addEventListener("click", (e) => {
      const acao = e.target.closest("button")?.dataset.acao;
      if (acao === "voltar") modal.fechar();
      if (acao === "aplicar") {
        const agora = new Date().toISOString();
        linhas.forEach((l) => {
          l.item.quantidade = l.contado;
          l.item.atualizado_em = agora;
        });
        salvarTabela("insumos");
        modal.fechar();
        toast(`Estoque atualizado (${linhas.length} ${linhas.length > 1 ? "itens" : "item"}).`);
        renderListaInsumos(el);
      }
    });
  });

  montarChips();
  listar();
}
