"use strict";

/* ============================================================
   Módulo: Clientes
   ============================================================ */

registrarModulo({
  id: "clientes",
  titulo: "Clientes",
  rotulo: "Clientes",
  icone: "clientes",
  render(el) {
    el.innerHTML = `
      <div class="pagina">
        <button type="button" class="btn btn-primario btn-grande btn-cheio" id="cliente-novo">+ Novo cliente</button>
        <input id="clientes-busca" class="campo-busca" placeholder="Buscar cliente…" autocomplete="off">
        <div class="lista" id="clientes-lista"></div>
      </div>`;

    function atualizarLista() {
      const busca = $("#clientes-busca", el).value.trim();
      let clientes = [...App.db.clientes].sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
      if (busca) clientes = clientes.filter((c) => contemTexto(c.nome, busca) || String(c.telefone || "").includes(busca));
      $("#clientes-lista", el).innerHTML = clientes.length
        ? clientes.map((c) => `
            <button type="button" class="cartao-item" data-id="${esc(c.id)}">
              <div class="cartao-info">
                <strong>${esc(c.nome)}</strong>
                <small>${esc(c.telefone || "Sem telefone")}${c.endereco ? " · " + esc(c.endereco) : ""}</small>
              </div>
              ${c.telefone ? `<span class="acao-cartao" data-whatsapp="${esc(c.telefone)}">WhatsApp</span>` : ""}
            </button>`).join("")
        : `<p class="vazio">Nenhum cliente${busca ? " encontrado" : " cadastrado ainda"}.</p>`;
    }

    $("#cliente-novo", el).addEventListener("click", () => formCliente(null, atualizarLista));
    $("#clientes-busca", el).addEventListener("input", atualizarLista);
    $("#clientes-lista", el).addEventListener("click", (e) => {
      const whatsapp = e.target.closest("[data-whatsapp]");
      if (whatsapp) {
        e.stopPropagation();
        const digitos = String(whatsapp.dataset.whatsapp).replace(/\D/g, "");
        if (digitos) window.open(`https://wa.me/55${digitos}`, "_blank");
        return;
      }
      const cartao = e.target.closest(".cartao-item");
      if (!cartao) return;
      const cliente = App.db.clientes.find((c) => c.id === cartao.dataset.id);
      if (cliente) formCliente(cliente, atualizarLista);
    });

    atualizarLista();
  },
});

function formCliente(existente, aoMudar) {
  const corpo = document.createElement("div");
  corpo.innerHTML = `
    <form class="formulario" id="form-cliente">
      <label class="rotulo">Nome *
        <input class="campo" name="nome" required value="${esc(existente?.nome || "")}">
      </label>
      <label class="rotulo">Telefone
        <input class="campo" name="telefone" type="tel" inputmode="tel" placeholder="(61) 99999-9999" value="${esc(existente?.telefone || "")}">
      </label>
      <label class="rotulo">Endereço
        <input class="campo" name="endereco" value="${esc(existente?.endereco || "")}">
      </label>
      <label class="rotulo">Observações
        <input class="campo" name="observacoes" value="${esc(existente?.observacoes || "")}">
      </label>
      <div class="linha-botoes">
        ${existente ? `<button type="button" class="btn btn-perigo" id="cliente-excluir">Excluir</button>` : ""}
        <button type="submit" class="btn btn-primario">Salvar</button>
      </div>
    </form>`;

  const modal = abrirModal(existente ? "Editar cliente" : "Novo cliente", corpo);

  // Telefone aceita apenas números e símbolos de telefone (corrige bug da V1).
  const campoTelefone = corpo.querySelector('[name="telefone"]');
  campoTelefone.addEventListener("input", () => {
    campoTelefone.value = campoTelefone.value.replace(/[^\d()+\-\s]/g, "");
  });

  $("#form-cliente", corpo).addEventListener("submit", (e) => {
    e.preventDefault();
    const dados = new FormData(e.target);
    const registro = {
      id: existente?.id || uid("cli"),
      nome: String(dados.get("nome")).trim(),
      telefone: String(dados.get("telefone")).trim(),
      endereco: String(dados.get("endereco")).trim(),
      observacoes: String(dados.get("observacoes")).trim(),
      criado_em: existente?.criado_em || new Date().toISOString(),
    };
    if (!registro.nome) return;
    const indice = App.db.clientes.findIndex((c) => c.id === registro.id);
    if (indice >= 0) App.db.clientes[indice] = registro;
    else App.db.clientes.push(registro);
    salvarTabela("clientes");
    toast(existente ? "Cliente atualizado." : "Cliente cadastrado.");
    modal.fechar();
    if (aoMudar) aoMudar();
  });

  $("#cliente-excluir", corpo)?.addEventListener("click", async () => {
    const ok = await confirmar(`Excluir o cliente "${existente.nome}"?`, { perigo: true, botao: "Excluir" });
    if (!ok) return;
    App.db.clientes = App.db.clientes.filter((c) => c.id !== existente.id);
    salvarTabela("clientes");
    toast("Cliente excluído.");
    modal.fechar();
    if (aoMudar) aoMudar();
  });
}
