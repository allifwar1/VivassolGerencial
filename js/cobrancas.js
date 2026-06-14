"use strict";

/* ============================================================
   Módulo: Cobranças
   Duas seções separadas:
   - "Venda a prazo"  : pagamento === CONFIG.formaPrazo
   - "Outros em aberto": entregues com outro método mas ainda
     com saldo (dinheiro/pix/cartão não recebido integralmente)
   ============================================================ */

registrarModulo({
  id: "cobrancas",
  titulo: "Cobranças",
  rotulo: "Cobranças",
  icone: "cobrancas",
  financeiro: true,
  render(el) { renderCobrancas(el); },
});

function pedidosEmAberto() {
  return agruparVendas(App.db.vendas).filter((v) =>
    v.status_producao !== "Cancelado" &&
    v.cliente_id !== CLIENTE_AVISTA.id &&
    v.saldo > 0.005);
}

function ehAPrazo(v) { return v.pagamento === CONFIG.formaPrazo; }

function chaveCliente(v) {
  return v.cliente_id || ("nome:" + (v.cliente_nome || "—"));
}

/* Agrupa uma lista de pedidos por cliente e aplica a ordenação. */
function agruparEOrdenar(pedidos, ordenacao) {
  const grupos = new Map();
  pedidos.forEach((v) => {
    const chave = chaveCliente(v);
    if (!grupos.has(chave)) {
      grupos.set(chave, {
        chave,
        nome: v.cliente_nome || "Sem nome",
        cliente_id: v.cliente_id,
        pedidos: [],
        total: 0,
        atrasado: false,
        vencimentoMin: null,
      });
    }
    const g = grupos.get(chave);
    g.pedidos.push(v);
    g.total += v.saldo;
    if (v.data_vencimento) {
      const t = parseData(v.data_vencimento)?.getTime();
      if (t && (g.vencimentoMin === null || t < g.vencimentoMin)) g.vencimentoMin = t;
    }
    if (situacaoEntrega(v.data_vencimento, v.status_producao) === "atrasado") g.atrasado = true;
  });

  const lista = [...grupos.values()];
  if (ordenacao === "az") {
    lista.sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
  } else if (ordenacao === "vencimento") {
    lista.sort((a, b) => {
      if (a.atrasado !== b.atrasado) return a.atrasado ? -1 : 1;
      const va = a.vencimentoMin ?? Infinity;
      const vb = b.vencimentoMin ?? Infinity;
      return va - vb;
    });
  } else if (ordenacao === "recente") {
    lista.sort((a, b) => {
      const da = Math.max(...a.pedidos.map((v) => new Date(v.data).getTime()));
      const db = Math.max(...b.pedidos.map((v) => new Date(v.data).getTime()));
      return db - da;
    });
  } else {
    // Padrão: maior saldo primeiro, atrasados na frente.
    lista.sort((a, b) => {
      if (a.atrasado !== b.atrasado) return a.atrasado ? -1 : 1;
      return b.total - a.total;
    });
  }
  return lista;
}

/* Filtra grupos pelo texto de busca (nome ou código de pedido). */
function filtrarGrupos(grupos, busca) {
  if (!busca) return grupos;
  const q = semAcentos(busca).toLowerCase().trim();
  return grupos.filter((g) =>
    contemTexto(g.nome, q) ||
    g.pedidos.some((v) => String(v.id_venda).toLowerCase().includes(q))
  );
}

function renderCobrancas(el) {
  const refresh = () => renderCobrancas(el);

  const todos = pedidosEmAberto();
  const prazo = todos.filter(ehAPrazo);
  const outros = todos.filter((v) => !ehAPrazo(v));

  const totalPrazo = prazo.reduce((s, v) => s + v.saldo, 0);
  const totalOutros = outros.reduce((s, v) => s + v.saldo, 0);
  const totalGeral = totalPrazo + totalOutros;
  const totalAtrasado = prazo
    .filter((v) => situacaoEntrega(v.data_vencimento, v.status_producao) === "atrasado")
    .reduce((s, v) => s + v.saldo, 0);

  el.innerHTML = `
    <div class="pagina">
      <div class="grade-cartoes">
        <div class="cartao-stat">
          <small>Total em aberto</small>
          <strong>${dinheiro(totalGeral)}</strong>
          <span>${todos.length} pedido${todos.length === 1 ? "" : "s"}</span>
        </div>
        <div class="cartao-stat ${totalAtrasado > 0 ? "stat-alerta" : ""}">
          <small>A prazo vencido</small>
          <strong>${dinheiro(totalAtrasado)}</strong>
          <span>${totalAtrasado > 0 ? "cobrar com urgência" : "tudo em dia"}</span>
        </div>
      </div>

      <div class="cob-filtros">
        <input class="campo-busca" id="cob-busca" placeholder="Buscar por cliente ou #código…" autocomplete="off">
        <select class="campo campo-mini" id="cob-ordenar">
          <option value="saldo">Maior saldo primeiro</option>
          <option value="vencimento">Vencimento mais próximo</option>
          <option value="az">A → Z</option>
          <option value="recente">Mais recente</option>
        </select>
      </div>

      <div id="cob-conteudo"></div>
    </div>`;

  function atualizar() {
    const busca = $("#cob-busca", el).value.trim();
    const ord = $("#cob-ordenar", el).value;

    const gruposPrazo = filtrarGrupos(agruparEOrdenar(prazo, ord), busca);
    const gruposOutros = filtrarGrupos(agruparEOrdenar(outros, ord), busca);

    const secaoPrazo = gruposPrazo.length
      ? gruposPrazo.map((g) => grupoCobrancaHtml(g, true)).join("")
      : `<p class="vazio" style="margin:8px 0">Nenhum resultado.</p>`;

    const secaoOutros = gruposOutros.length
      ? gruposOutros.map((g) => grupoCobrancaHtml(g, false)).join("")
      : `<p class="vazio" style="margin:8px 0">Nenhum resultado.</p>`;

    $("#cob-conteudo", el).innerHTML = `
      <div class="cob-secao">
        <div class="cob-secao-titulo">
          <span>Venda a Prazo</span>
          <span class="cob-secao-total">${dinheiro(totalPrazo)}</span>
        </div>
        ${prazo.length ? secaoPrazo : `<p class="vazio">Nenhuma venda a prazo em aberto. 🎉</p>`}
      </div>

      <div class="cob-secao cob-secao-outros">
        <div class="cob-secao-titulo cob-secao-titulo-outros">
          <span>Entregues sem pagamento completo</span>
          <span class="cob-secao-total">${dinheiro(totalOutros)}</span>
        </div>
        <p class="cob-secao-aviso">Pedidos com outra forma de pagamento (Dinheiro, Pix, Cartão) que ainda têm saldo em aberto.</p>
        ${outros.length ? secaoOutros : `<p class="vazio">Nenhum. 🎉</p>`}
      </div>`;
  }

  $("#cob-busca", el).addEventListener("input", atualizar);
  $("#cob-ordenar", el).addEventListener("change", atualizar);

  el.addEventListener("click", (e) => {
    const receber = e.target.closest("[data-receber]");
    if (receber) { abrirReceberPagamento(receber.dataset.receber, refresh); return; }
    const wpp = e.target.closest("[data-whatsapp-grupo]");
    if (wpp) { enviarCobrancaWhatsapp(wpp.dataset.whatsappGrupo, wpp.dataset.prazo === "1"); return; }
    const abrir = e.target.closest("[data-abrir]");
    if (abrir) { abrirDetalheVenda(abrir.dataset.abrir, refresh); return; }
  });

  atualizar();
}

function grupoCobrancaHtml(g, isPrazo) {
  const cliente = App.db.clientes.find((c) => c.id === g.cliente_id);
  const tel = cliente?.telefone || "";
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
        ${g.pedidos.map((v) => pedidoCobrancaHtml(v, isPrazo)).join("")}
      </div>
      <div class="cobranca-acoes">
        <button type="button" class="btn btn-whatsapp btn-cheio"
          data-whatsapp-grupo="${esc(g.chave)}"
          data-prazo="${isPrazo ? "1" : "0"}">
          ${ICONES.whatsapp} Cobrar pelo WhatsApp
        </button>
      </div>
    </div>`;
}

function pedidoCobrancaHtml(v, isPrazo) {
  const sit = isPrazo ? situacaoEntrega(v.data_vencimento, v.status_producao) : "";
  const classeSit = sit === "atrasado" ? "vencido" : sit === "hoje" ? "hoje" : "";
  const infoPagamento = isPrazo && v.data_vencimento
    ? ` · vence ${dataCurta(v.data_vencimento)}${sit === "atrasado" ? " (atrasado)" : sit === "hoje" ? " (hoje)" : ""}`
    : "";
  return `
    <div class="cobranca-pedido ${classeSit}">
      <button type="button" class="cobranca-pedido-info" data-abrir="${esc(v.id_venda)}">
        <span>#${esc(v.id_venda)}</span>
        <small>Em aberto: <strong>${dinheiro(v.saldo)}</strong> · Pago: ${dinheiro(v.valor_pago)}${infoPagamento}</small>
      </button>
      <button type="button" class="btn btn-primario btn-mini" data-receber="${esc(v.id_venda)}">Receber</button>
    </div>`;
}

function enviarCobrancaWhatsapp(chaveGrupo, isPrazo) {
  const pedidos = pedidosEmAberto().filter((v) =>
    chaveCliente(v) === chaveGrupo && ehAPrazo(v) === isPrazo
  );
  if (!pedidos.length) return;
  const nome = pedidos[0].cliente_nome || "";
  const primeiro = nome.trim().split(/\s+/)[0] || "olá";
  const total = pedidos.reduce((s, v) => s + v.saldo, 0);

  const linhas = [];
  linhas.push(`Olá ${primeiro}! 😊`);
  if (isPrazo) {
    linhas.push("Passando para lembrar do seu saldo em aberto com a Vivassol:");
  } else {
    linhas.push("Notamos que o pagamento do(s) seu(s) pedido(s) ainda não foi confirmado:");
  }
  linhas.push("");
  pedidos.forEach((v) => {
    const venc = (isPrazo && v.data_vencimento) ? ` (vence em ${dataCurta(v.data_vencimento)})` : "";
    linhas.push(`• Pedido #${v.id_venda}: ${dinheiro(v.saldo)}${venc}`);
  });
  linhas.push("");
  linhas.push(`💰 Total: ${dinheiro(total)}`);
  linhas.push("");
  linhas.push(isPrazo
    ? "Quando puder acertar, me avisa? Obrigado! 🙏"
    : "Poderia confirmar o pagamento? Obrigado! 🙏");
  const texto = linhas.join("\n");

  const cliente = App.db.clientes.find((c) => c.id === pedidos[0].cliente_id);
  const digitos = String(cliente?.telefone || "").replace(/\D/g, "");
  const numeroWpp = digitos.length >= 10 ? CONFIG.paisWhatsapp + digitos : "";
  const url = numeroWpp
    ? `https://wa.me/${numeroWpp}?text=${encodeURIComponent(texto)}`
    : `https://wa.me/?text=${encodeURIComponent(texto)}`;
  window.open(url, "_blank", "noopener");
}
