"use strict";

/* ============================================================
   Módulo: Início (painel do dia)
   ============================================================ */

registrarModulo({
  id: "inicio",
  titulo: "Início",
  rotulo: "Início",
  icone: "inicio",
  render(el) {
    const pedidos = agruparVendas(App.db.vendas);
    const vendas = pedidos.filter((v) => contaComoVenda(v.status_producao));
    const agora = new Date();
    const hojeStr = agora.toDateString();

    const vendasHoje = vendas.filter((v) => new Date(v.data).toDateString() === hojeStr);
    const vendasMes = vendas.filter((v) => {
      const d = new Date(v.data);
      return d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear();
    });
    const totalHoje = vendasHoje.reduce((s, v) => s + v.total, 0);
    const totalMes = vendasMes.reduce((s, v) => s + v.total, 0);

    // Entregas: pedidos em aberto com entrega hoje ou atrasada.
    const emAberto = pedidos.filter((v) => v.status_producao !== "Entregue" && v.status_producao !== "Cancelado");
    const entregasHoje = emAberto.filter((v) => situacaoEntrega(v.data_entrega, v.status_producao) === "hoje");
    const atrasados = emAberto.filter((v) => situacaoEntrega(v.data_entrega, v.status_producao) === "atrasado");

    const baixos = App.db.insumos.filter((i) => numero(i.quantidade) <= numero(i.estoque_minimo));
    const ultimas = pedidos.slice(0, 5);

    el.innerHTML = `
      <div class="pagina">
        <p class="saudacao">${saudacao()}, <strong>${esc(App.usuario.nome)}</strong>!</p>
        <div class="linha-acoes">
          <button type="button" class="btn btn-primario btn-grande" id="inicio-novo-pedido">+ Novo pedido</button>
          <button type="button" class="btn btn-secundario btn-grande" id="inicio-orcamento">Orçamento</button>
        </div>
        <div class="grade-cartoes">
          <div class="cartao-stat">
            <small>Vendas hoje</small>
            <strong>${vendasHoje.length}</strong>
            <span>${dinheiro(totalHoje)}</span>
          </div>
          <div class="cartao-stat">
            <small>Vendas no mês</small>
            <strong>${vendasMes.length}</strong>
            <span>${dinheiro(totalMes)}</span>
          </div>
        </div>
        ${(entregasHoje.length || atrasados.length) ? `
          <button type="button" class="aviso-entrega ${atrasados.length ? "tem-atraso" : ""}" id="inicio-entregas">
            📅
            <div>
              <strong>${atrasados.length ? `${atrasados.length} pedido(s) atrasado(s)` : `${entregasHoje.length} entrega(s) para hoje`}</strong>
              <small>${atrasados.length && entregasHoje.length ? `e ${entregasHoje.length} para entregar hoje` : "Toque para abrir o fluxo"}</small>
            </div>
          </button>` : ""}
        ${baixos.length ? `
          <button type="button" class="aviso-estoque" id="inicio-estoque-baixo">
            ${ICONES.estoque}
            <div>
              <strong>${baixos.length} ${baixos.length > 1 ? "itens" : "item"} com estoque baixo</strong>
              <small>${esc(baixos.slice(0, 3).map((i) => i.nome).join(", "))}${baixos.length > 3 ? "…" : ""}</small>
            </div>
          </button>` : ""}
        <h3 class="titulo-secao">Últimos pedidos</h3>
        <div class="lista" id="inicio-ultimas">
          ${ultimas.length ? ultimas.map(cartaoVendaHtml).join("") : `<p class="vazio">Nenhum pedido registrado ainda.<br>Toque em "+ Novo pedido" para começar.</p>`}
        </div>
      </div>`;

    $("#inicio-novo-pedido", el).addEventListener("click", () => navegar("vendas", { abrirPdv: true, tipo: "Pedido" }));
    $("#inicio-orcamento", el).addEventListener("click", () => navegar("vendas", { abrirPdv: true, tipo: "Orçamento" }));
    $("#inicio-entregas", el)?.addEventListener("click", () => navegar("fluxo"));
    $("#inicio-estoque-baixo", el)?.addEventListener("click", () => navegar("estoque"));
    $("#inicio-ultimas", el).addEventListener("click", (e) => {
      const card = e.target.closest(".cartao-venda");
      if (card) abrirDetalheVenda(card.dataset.venda, () => navegar("inicio"));
    });
  },
});

function saudacao() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}
