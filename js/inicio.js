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
    const vendas = agruparVendas(App.db.vendas).filter((v) => v.status !== "Cancelada");
    const agora = new Date();
    const hojeStr = agora.toDateString();

    const vendasHoje = vendas.filter((v) => new Date(v.data).toDateString() === hojeStr);
    const vendasMes = vendas.filter((v) => {
      const d = new Date(v.data);
      return d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear();
    });
    const totalHoje = vendasHoje.reduce((s, v) => s + v.total, 0);
    const totalMes = vendasMes.reduce((s, v) => s + v.total, 0);

    const baixos = App.db.insumos.filter((i) => numero(i.quantidade) <= numero(i.estoque_minimo));
    const ultimas = agruparVendas(App.db.vendas).slice(0, 5);

    el.innerHTML = `
      <div class="pagina">
        <p class="saudacao">${saudacao()}, <strong>${esc(App.usuario.nome)}</strong>!</p>
        <button type="button" class="btn btn-primario btn-grande btn-cheio" id="inicio-nova-venda">+ Nova venda</button>
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
        ${baixos.length ? `
          <button type="button" class="aviso-estoque" id="inicio-estoque-baixo">
            ${ICONES.estoque}
            <div>
              <strong>${baixos.length} ${baixos.length > 1 ? "itens" : "item"} com estoque baixo</strong>
              <small>${esc(baixos.slice(0, 3).map((i) => i.nome).join(", "))}${baixos.length > 3 ? "…" : ""}</small>
            </div>
          </button>` : ""}
        <h3 class="titulo-secao">Últimas vendas</h3>
        <div class="lista" id="inicio-ultimas">
          ${ultimas.length ? ultimas.map(cartaoVendaHtml).join("") : `<p class="vazio">Nenhuma venda registrada ainda.<br>Toque em “+ Nova venda” para começar.</p>`}
        </div>
      </div>`;

    $("#inicio-nova-venda", el).addEventListener("click", () => navegar("vendas", { abrirPdv: true }));
    $("#inicio-estoque-baixo", el)?.addEventListener("click", () => navegar("estoque"));
    $("#inicio-ultimas", el).addEventListener("click", (e) => {
      if (e.target.closest(".cartao-venda")) navegar("vendas");
    });
  },
});

function saudacao() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}
