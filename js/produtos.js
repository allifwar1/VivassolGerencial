"use strict";

/* ============================================================
   Módulo: Produtos (o que é vendido no PDV)
   ============================================================ */

registrarModulo({
  id: "produtos",
  titulo: "Produtos",
  rotulo: "Produtos",
  icone: "produtos",
  render(el) {
    el.innerHTML = `
      <div class="pagina">
        <button type="button" class="btn btn-primario btn-grande btn-cheio" id="produto-novo">+ Novo produto</button>
        <input id="produtos-busca" class="campo-busca" placeholder="Buscar produto…" autocomplete="off">
        <div class="lista" id="produtos-lista"></div>
      </div>`;

    function atualizarLista() {
      const busca = $("#produtos-busca", el).value.trim();
      let produtos = [...App.db.produtos].sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
      if (busca) produtos = produtos.filter((p) => contemTexto(p.nome, busca) || contemTexto(p.categoria, busca));
      $("#produtos-lista", el).innerHTML = produtos.length
        ? produtos.map((p) => `
            <button type="button" class="cartao-item" data-id="${esc(p.id)}">
              <div class="cartao-info">
                <strong>${esc(p.nome)}</strong>
                <small>${esc(p.categoria || "Sem categoria")}</small>
              </div>
              <div class="cartao-lado">
                <strong>${dinheiro(p.preco)}</strong>
                ${ehAtivo(p) ? "" : `<span class="selo selo-perigo">Inativo</span>`}
              </div>
            </button>`).join("")
        : `<p class="vazio">Nenhum produto${busca ? " encontrado" : " cadastrado ainda"}.<br>Cadastre os produtos para usá-los na venda.</p>`;
    }

    $("#produto-novo", el).addEventListener("click", () => formProduto(null, atualizarLista));
    $("#produtos-busca", el).addEventListener("input", atualizarLista);
    $("#produtos-lista", el).addEventListener("click", (e) => {
      const cartao = e.target.closest(".cartao-item");
      if (!cartao) return;
      const produto = App.db.produtos.find((p) => p.id === cartao.dataset.id);
      if (produto) formProduto(produto, atualizarLista);
    });

    atualizarLista();
  },
});

function formProduto(existente, aoMudar) {
  const categorias = [...new Set(App.db.produtos.map((p) => String(p.categoria || "").trim()).filter(Boolean))].sort();
  const corpo = document.createElement("div");
  corpo.innerHTML = `
    <form class="formulario" id="form-produto">
      <label class="rotulo">Nome *
        <input class="campo" name="nome" required value="${esc(existente?.nome || "")}">
      </label>
      <div class="meio">
        <label class="rotulo">Categoria
          <input class="campo" name="categoria" list="cats-produtos" value="${esc(existente?.categoria || "")}" autocomplete="off">
          <datalist id="cats-produtos">${categorias.map((c) => `<option value="${esc(c)}">`).join("")}</datalist>
        </label>
        <label class="rotulo">Unidade
          <select class="campo" name="unidade">
            ${CONFIG.unidades.map((u) => `<option ${u === (existente?.unidade || "un") ? "selected" : ""}>${esc(u)}</option>`).join("")}
          </select>
        </label>
      </div>
      <label class="rotulo">Preço de venda (R$) *
        <input class="campo" name="preco" type="number" min="0" step="any" inputmode="decimal" required value="${existente ? numero(existente.preco) : ""}" placeholder="0,00">
      </label>
      <label class="caixa-marcar">
        <input type="checkbox" name="ativo" ${!existente || ehAtivo(existente) ? "checked" : ""}>
        Produto ativo (aparece na venda)
      </label>
      <div class="linha-botoes">
        ${existente ? `<button type="button" class="btn btn-perigo" id="produto-excluir">Excluir</button>` : ""}
        <button type="submit" class="btn btn-primario">Salvar</button>
      </div>
    </form>`;

  const modal = abrirModal(existente ? "Editar produto" : "Novo produto", corpo);

  $("#form-produto", corpo).addEventListener("submit", (e) => {
    e.preventDefault();
    const dados = new FormData(e.target);
    const registro = {
      id: existente?.id || uid("pro"),
      nome: String(dados.get("nome")).trim(),
      categoria: String(dados.get("categoria")).trim(),
      preco: numero(dados.get("preco")),
      unidade: String(dados.get("unidade")),
      ativo: dados.get("ativo") === "on",
      criado_em: existente?.criado_em || new Date().toISOString(),
    };
    if (!registro.nome) return;
    const indice = App.db.produtos.findIndex((p) => p.id === registro.id);
    if (indice >= 0) App.db.produtos[indice] = registro;
    else App.db.produtos.push(registro);
    salvarTabela("produtos");
    toast(existente ? "Produto atualizado." : "Produto cadastrado.");
    modal.fechar();
    if (aoMudar) aoMudar();
  });

  $("#produto-excluir", corpo)?.addEventListener("click", async () => {
    const ok = await confirmar(`Excluir o produto "${existente.nome}"?`, { perigo: true, botao: "Excluir" });
    if (!ok) return;
    App.db.produtos = App.db.produtos.filter((p) => p.id !== existente.id);
    salvarTabela("produtos");
    toast("Produto excluído.");
    modal.fechar();
    if (aoMudar) aoMudar();
  });
}
