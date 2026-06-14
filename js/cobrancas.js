"use strict";

/* ============================================================
   Módulo: Cobranças (vendas a prazo / fiado em aberto)
   - Lista quem está devendo, agrupado por cliente.
   - Cada pedido mostra saldo, vencimento e alerta de atraso.
   - Recebe pagamento (parcial ou total) e lembra de cobrar
     pelo WhatsApp. Tudo fica salvo na planilha.
   ============================================================ */

registrarModulo({
  id: "cobrancas",
  titulo: "Cobranças",
  rotulo: "Cobranças",
  icone: "cobrancas",
  financeiro: true,
  render(el) { renderCobrancas(el); },
});

/* Pedidos em aberto (com saldo a receber), sem contar cancelados nem o
   cliente "Venda à vista" (esse paga na hora, não fica devendo). */
function pedidosEmAberto() {
  return agruparVendas(App.db.vendas).filter((v) =>
    v.status_producao !== "Cancelado" &&
    v.cliente_id !== CLIENTE_AVISTA.id &&
    v.saldo > 0.005);
}

/* Chave de agrupamento por cliente (id quando há; senão pelo nome). */
function chaveCliente(v) {
  return v.cliente_id || ("nome:" + (v.cliente_nome || "—"));
}

function renderCobrancas(el) {
  const refresh = () => renderCobrancas(el);
  const pedidos = pedidosEmAberto();

  // Agrupa por cliente.
  const grupos = new Map();
  pedidos.forEach((v) => {
    const chave = chaveCliente(v);
    if (!grupos.has(chave)) {
      grupos.set(chave, { chave, nome: v.cliente_nome || "Sem nome", cliente_id: v.cliente_id, pedidos: [], total: 0, atrasado: false });
    }
    const g = grupos.get(chave);
    g.pedidos.push(v);
    g.total += v.saldo;
    if (situacaoEntrega(v.data_vencimento, v.status_producao) === "atrasado") g.atrasado = true;
  });

  const lista = [...grupos.values()].sort((a, b) => {
    if (a.atrasado !== b.atrasado) return a.atrasado ? -1 : 1;
    return b.total - a.total;
  });
  const totalGeral = lista.reduce((s, g) => s + g.total, 0);
  const totalAtrasado = pedidos
    .filter((v) => situacaoEntrega(v.data_vencimento, v.status_producao) === "atrasado")
    .reduce((s, v) => s + v.saldo, 0);

  el.innerHTML = `
    <div class="pagina">
      <div class="grade-cartoes">
        <div class="cartao-stat">
          <small>Total a receber</small>
          <strong>${dinheiro(totalGeral)}</strong>
          <span>${lista.length} cliente${lista.length === 1 ? "" : "s"}</span>
        </div>
        <div class="cartao-stat ${totalAtrasado > 0 ? "stat-alerta" : ""}">
          <small>Vencido</small>
          <strong>${dinheiro(totalAtrasado)}</strong>
          <span>${totalAtrasado > 0 ? "cobrar com urgência" : "tudo em dia"}</span>
        </div>
      </div>
      <div class="lista" id="cobrancas-lista">
        ${lista.length ? lista.map(grupoCobrancaHtml).join("") : `<p class="vazio">Ninguém devendo no momento. 🎉</p>`}
      </div>
    </div>`;

  $("#cobrancas-lista", el).addEventListener("click", (e) => {
    const receber = e.target.closest("[data-receber]");
    if (receber) { abrirReceberPagamento(receber.dataset.receber, refresh); return; }
    const wpp = e.target.closest("[data-whatsapp-grupo]");
    if (wpp) { enviarCobrancaWhatsapp(wpp.dataset.whatsappGrupo); return; }
    const abrir = e.target.closest("[data-abrir]");
    if (abrir) { abrirDetalheVenda(abrir.dataset.abrir, refresh); return; }
  });
}

function grupoCobrancaHtml(g) {
  const cliente = App.db.clientes.find((c) => c.id === g.cliente_id);
  const tel = cliente?.telefone || "";
  const chaveGrupo = g.chave;
  return `
    <div class="cobranca-cliente ${g.atrasado ? "tem-atraso" : ""}">
      <div class="cobranca-cab">
        <div class="cobranca-cab-info">
          <strong>${esc(g.nome)}</strong>
          <small>${esc(tel || "sem telefone")}</small>
        </div>
        <strong class="cobranca-total">${dinheiro(g.total)}</strong>
      </div>
      <div class="cobranca-pedidos">
        ${g.pedidos.map((v) => {
          const sit = situacaoEntrega(v.data_vencimento, v.status_producao);
          return `
          <div class="cobranca-pedido ${sit === "atrasado" ? "vencido" : sit === "hoje" ? "hoje" : ""}">
            <button type="button" class="cobranca-pedido-info" data-abrir="${esc(v.id_venda)}">
              <span>#${esc(v.id_venda)} · ${esc(v.cliente_nome || "")}</span>
              <small>Saldo ${dinheiro(v.saldo)} de ${dinheiro(v.total)}${v.data_vencimento ? ` · vence ${dataCurta(v.data_vencimento)}${sit === "atrasado" ? " (atrasado)" : sit === "hoje" ? " (hoje)" : ""}` : ""}</small>
            </button>
            <button type="button" class="btn btn-primario btn-mini" data-receber="${esc(v.id_venda)}">Receber</button>
          </div>`;
        }).join("")}
      </div>
      <div class="cobranca-acoes">
        <button type="button" class="btn btn-whatsapp btn-cheio" data-whatsapp-grupo="${esc(chaveGrupo)}">
          ${ICONES.whatsapp} Cobrar pelo WhatsApp
        </button>
      </div>
    </div>`;
}

/* Monta e abre a mensagem de cobrança do cliente no WhatsApp. */
function enviarCobrancaWhatsapp(chaveGrupo) {
  const pedidos = pedidosEmAberto().filter((v) => chaveCliente(v) === chaveGrupo);
  if (!pedidos.length) return;
  const nome = pedidos[0].cliente_nome || "";
  const primeiro = nome.trim().split(/\s+/)[0] || "tudo bem";
  const total = pedidos.reduce((s, v) => s + v.saldo, 0);

  const linhas = [];
  linhas.push(`Olá ${primeiro}! 😊`);
  linhas.push("Passando para lembrar do seu saldo em aberto com a Vivassol:");
  linhas.push("");
  pedidos.forEach((v) => {
    const venc = v.data_vencimento ? ` (vencimento ${dataCurta(v.data_vencimento)})` : "";
    linhas.push(`• Pedido #${v.id_venda}: ${dinheiro(v.saldo)}${venc}`);
  });
  linhas.push("");
  linhas.push(`💰 Total: ${dinheiro(total)}`);
  linhas.push("");
  linhas.push("Quando puder acertar, me avisa? Obrigado! 🙏");
  const texto = linhas.join("\n");

  const cliente = App.db.clientes.find((c) => c.id === pedidos[0].cliente_id);
  const digitos = String(cliente?.telefone || "").replace(/\D/g, "");
  const numeroWpp = digitos.length >= 10 ? CONFIG.paisWhatsapp + digitos : "";
  const url = numeroWpp
    ? `https://wa.me/${numeroWpp}?text=${encodeURIComponent(texto)}`
    : `https://wa.me/?text=${encodeURIComponent(texto)}`;
  window.open(url, "_blank", "noopener");
}
