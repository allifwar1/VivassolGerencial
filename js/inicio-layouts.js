"use strict";

/* ============================================================
   Layouts alternativos para a tela Início
   ============================================================ */

/* ── Helpers internos ──────────────────────────────────────── */

function _diasAnteriores(vendas, n) {
  const hoje = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(hoje);
    d.setDate(d.getDate() - (n - 1 - i));
    const ds = d.toDateString();
    const dv = vendas.filter((v) => new Date(v.data).toDateString() === ds);
    return { data: d, total: dv.reduce((s, v) => s + v.total, 0), count: dv.length };
  });
}

function _svgBars(dias) {
  const maxV = Math.max(...dias.map((d) => d.total), 1);
  const W = 38, GAP = 5, H = 60;
  const hojeStr = new Date().toDateString();
  const itens = dias.map((d, i) => {
    const bh = Math.max(4, (d.total / maxV) * H);
    const x = i * (W + GAP);
    const ehHoje = d.data.toDateString() === hojeStr;
    const dia = d.data.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "").slice(0, 3);
    return `<rect x="${x}" y="${H - bh}" width="${W}" height="${bh}" rx="5"
      fill="${ehHoje ? "var(--verde)" : "var(--verde-claro)"}"
      stroke="${ehHoje ? "var(--verde-escuro)" : "var(--borda)"}" stroke-width="1"/>
    <text x="${x + W / 2}" y="${H + 14}" text-anchor="middle" font-size="8.5" fill="var(--texto-suave)">${dia}</text>`;
  });
  const tw = dias.length * (W + GAP) - GAP;
  return `<svg viewBox="0 0 ${tw} ${H + 18}" style="width:100%;height:auto;display:block">${itens.join("")}</svg>`;
}

function _svgDonut(pct, sublabel, cor) {
  const R = 38, C = 2 * Math.PI * R;
  const dash = Math.min(Math.max(pct, 0), 100) / 100 * C;
  return `<svg viewBox="0 0 100 100" style="width:110px;height:110px">
    <circle cx="50" cy="50" r="${R}" fill="none" stroke="var(--borda)" stroke-width="12"/>
    <circle cx="50" cy="50" r="${R}" fill="none" stroke="${cor}" stroke-width="12"
      stroke-dasharray="${dash} ${C}" stroke-dashoffset="${C / 4}" stroke-linecap="round"/>
    <text x="50" y="47" text-anchor="middle" font-size="15" font-weight="700" fill="var(--texto)">${Math.round(pct)}%</text>
    <text x="50" y="60" text-anchor="middle" font-size="8" fill="var(--texto-suave)">${sublabel}</text>
  </svg>`;
}

/* ══════════════════════════════════════════════════════════════
   LAYOUT 2 — Painel Visual
   Gráfico de barras 7 dias + chips de resumo + lista compacta
   ══════════════════════════════════════════════════════════════ */
registrarModulo({
  id: "inicio2",
  titulo: "Início 2",
  rotulo: "Início 2",
  icone: "inicio",
  render(el) {
    const pedidos = agruparVendas(App.db.vendas);
    const vendas  = pedidos.filter((v) => contaComoVenda(v.status_producao));
    const agora   = new Date();
    const hStr    = agora.toDateString();

    const vHoje = vendas.filter((v) => new Date(v.data).toDateString() === hStr);
    const vMes  = vendas.filter((v) => {
      const d = new Date(v.data);
      return d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear();
    });
    const thoje = vHoje.reduce((s, v) => s + v.total, 0);
    const tMes  = vMes.reduce((s, v) => s + v.total, 0);

    const emAberto  = pedidos.filter((v) => v.status_producao !== "Entregue" && v.status_producao !== "Cancelado");
    const atrasados = emAberto.filter((v) => situacaoEntrega(v.data_entrega, v.status_producao) === "atrasado");
    const baixos    = App.db.insumos.filter((i) => numero(i.quantidade) <= numero(i.estoque_minimo));
    const semana    = _diasAnteriores(vendas, 7);
    const ultimas   = pedidos.slice(0, 4);

    el.innerHTML = `
      <div class="pagina ini2-pag">
        <div class="ini2-hero">
          <div class="ini2-hero-txt">
            <p class="ini2-sauda">${saudacao()}, <strong>${esc(App.usuario.nome)}</strong></p>
            <p class="ini2-date">${agora.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</p>
          </div>
          <div class="ini2-hero-num">
            <small>Hoje</small>
            <strong>${dinheiro(thoje)}</strong>
          </div>
        </div>

        <div class="ini2-chips">
          <div class="ini2-chip"><strong>${vHoje.length}</strong><small>pedidos hoje</small></div>
          <div class="ini2-chip"><strong>${vMes.length}</strong><small>no mês</small></div>
          <div class="ini2-chip ${atrasados.length ? "ini2-chip-warn" : ""}">
            <strong>${atrasados.length}</strong><small>atrasados</small>
          </div>
          <div class="ini2-chip ${baixos.length ? "ini2-chip-warn" : ""}">
            <strong>${baixos.length}</strong><small>est. baixo</small>
          </div>
        </div>

        <div class="ini2-grafico">
          <div class="ini2-grafico-cab">
            <span class="ini2-grafico-label">Últimos 7 dias</span>
            <strong>${dinheiro(tMes)} / mês</strong>
          </div>
          ${_svgBars(semana)}
        </div>

        <div class="linha-acoes">
          <button type="button" class="btn btn-primario btn-grande" id="ini2-np">+ Novo pedido</button>
          <button type="button" class="btn btn-secundario btn-grande" id="ini2-orc">Orçamento</button>
        </div>

        <h3 class="titulo-secao">Últimos pedidos</h3>
        <div id="ini2-lista">
          ${ultimas.length ? ultimas.map((v) => {
            const sit = situacaoEntrega(v.data_entrega, v.status_producao);
            return `<button type="button" class="ini2-item" data-venda="${esc(v.id_venda)}">
              <div class="ini2-item-esq">
                <strong>${esc(v.cliente_nome || "Sem cliente")}</strong>
                <small>${esc(v.status_producao)}${v.data_entrega ? " · " + dataCurta(v.data_entrega) : ""}</small>
              </div>
              <span class="ini2-item-val${sit === "atrasado" ? " ini2-warn-txt" : ""}">${dinheiro(v.total)}</span>
            </button>`;
          }).join("") : `<p class="vazio">Nenhum pedido ainda.</p>`}
        </div>
      </div>`;

    $("#ini2-np",  el).addEventListener("click", () => navegar("vendas", { abrirPdv: true, tipo: "Pedido" }));
    $("#ini2-orc", el).addEventListener("click", () => navegar("vendas", { abrirPdv: true, tipo: "Orçamento" }));
    $$(".ini2-item", el).forEach((b) =>
      b.addEventListener("click", () => abrirDetalheVenda(b.dataset.venda, () => navegar("inicio2")))
    );
  },
});

/* ══════════════════════════════════════════════════════════════
   LAYOUT 3 — Pipeline de Produção
   Visualização das etapas + alertas + próximas entregas
   ══════════════════════════════════════════════════════════════ */
registrarModulo({
  id: "inicio3",
  titulo: "Início 3",
  rotulo: "Início 3",
  icone: "inicio",
  render(el) {
    const pedidos = agruparVendas(App.db.vendas);
    const vendas  = pedidos.filter((v) => contaComoVenda(v.status_producao));
    const agora   = new Date();
    const vMes    = vendas.filter((v) => {
      const d = new Date(v.data);
      return d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear();
    });
    const tMes = vMes.reduce((s, v) => s + v.total, 0);

    const emAberto  = pedidos.filter((v) => v.status_producao !== "Entregue" && v.status_producao !== "Cancelado");
    const atrasados = emAberto.filter((v) => situacaoEntrega(v.data_entrega, v.status_producao) === "atrasado");
    const entreHoje = emAberto.filter((v) => situacaoEntrega(v.data_entrega, v.status_producao) === "hoje");
    const baixos    = App.db.insumos.filter((i) => numero(i.quantidade) <= numero(i.estoque_minimo));

    const COR = {
      "Cancelado":   "var(--st-cancelado)",
      "Orçamento":   "var(--st-orcamento)",
      "Pedido feito":"var(--st-pedido)",
      "Em produção": "var(--st-producao)",
      "Pronto":      "var(--st-pronto)",
      "Entregue":    "var(--st-entregue)",
    };

    const etapas = CONFIG.statusProducao.filter((s) => s !== "Cancelado" && s !== "Entregue");
    const contagem = {};
    CONFIG.statusProducao.forEach((s) => (contagem[s] = 0));
    emAberto.forEach((v) => { if (contagem[v.status_producao] !== undefined) contagem[v.status_producao]++; });

    const proximas = emAberto
      .filter((v) => v.data_entrega)
      .sort((a, b) => {
        const da = parseData(a.data_entrega)?.getTime() || Infinity;
        const db = parseData(b.data_entrega)?.getTime() || Infinity;
        return da - db;
      })
      .slice(0, 4);

    el.innerHTML = `
      <div class="pagina ini3-pag">
        <div class="ini3-topo">
          <div>
            <p class="ini3-sauda">${saudacao()}, <strong>${esc(App.usuario.nome)}</strong></p>
            <p class="ini3-date">${agora.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })}</p>
          </div>
          <div class="ini3-mes-box">
            <small>Mês</small>
            <strong>${dinheiro(tMes)}</strong>
            <span>${vMes.length} pedidos</span>
          </div>
        </div>

        <div class="ini3-pipeline-wrap">
          <div class="ini3-pipeline">
            ${etapas.map((s, i) => `
              ${i > 0 ? `<div class="ini3-seta">›</div>` : ""}
              <div class="ini3-etapa" style="--cor:${COR[s] || "var(--texto-suave)"}">
                <strong>${contagem[s] || 0}</strong>
                <small>${esc(s)}</small>
              </div>
            `).join("")}
          </div>
        </div>

        ${(atrasados.length || entreHoje.length || baixos.length) ? `
        <div class="ini3-alertas">
          ${atrasados.length ? `<button type="button" class="ini3-alerta ini3-al-verm" id="ini3-atr">⚠ ${atrasados.length} pedido(s) atrasado(s)</button>` : ""}
          ${entreHoje.length ? `<button type="button" class="ini3-alerta ini3-al-laran" id="ini3-hj">📅 ${entreHoje.length} entrega(s) para hoje</button>` : ""}
          ${baixos.length ? `<button type="button" class="ini3-alerta ini3-al-azul" id="ini3-bx">📦 ${baixos.length} insumo(s) com estoque baixo</button>` : ""}
        </div>` : `<div class="ini3-tudo-ok">✓ Tudo em dia!</div>`}

        <div class="linha-acoes">
          <button type="button" class="btn btn-primario btn-grande" id="ini3-np">+ Novo pedido</button>
          <button type="button" class="btn btn-secundario btn-grande" id="ini3-fluxo">Ver Fluxo</button>
        </div>

        ${proximas.length ? `
        <h3 class="titulo-secao">Próximas entregas</h3>
        <div class="ini3-entregas">
          ${proximas.map((v) => {
            const sit = situacaoEntrega(v.data_entrega, v.status_producao);
            return `<button type="button" class="ini3-entrega ini3-sit-${sit}" data-venda="${esc(v.id_venda)}">
              <div class="ini3-entrega-info">
                <strong>${esc(v.cliente_nome || "Sem cliente")}</strong>
                <small>${esc(v.status_producao)}</small>
              </div>
              <span class="ini3-entrega-data">${dataCurta(v.data_entrega)}</span>
            </button>`;
          }).join("")}
        </div>` : ""}
      </div>`;

    $("#ini3-np",    el).addEventListener("click", () => navegar("vendas", { abrirPdv: true, tipo: "Pedido" }));
    $("#ini3-fluxo", el).addEventListener("click", () => navegar("fluxo"));
    $("#ini3-atr",   el)?.addEventListener("click", () => navegar("fluxo"));
    $("#ini3-hj",    el)?.addEventListener("click", () => navegar("fluxo"));
    $("#ini3-bx",    el)?.addEventListener("click", () => navegar("estoque"));
    $$(".ini3-entrega", el).forEach((b) =>
      b.addEventListener("click", () => abrirDetalheVenda(b.dataset.venda, () => navegar("inicio3")))
    );
  },
});

/* ══════════════════════════════════════════════════════════════
   LAYOUT 4 — Foco Total
   Design minimalista: grande número central + gráficos donut
   ══════════════════════════════════════════════════════════════ */
registrarModulo({
  id: "inicio4",
  titulo: "Início 4",
  rotulo: "Início 4",
  icone: "inicio",
  render(el) {
    const pedidos = agruparVendas(App.db.vendas);
    const vendas  = pedidos.filter((v) => contaComoVenda(v.status_producao));
    const agora   = new Date();
    const hStr    = agora.toDateString();

    const vHoje = vendas.filter((v) => new Date(v.data).toDateString() === hStr);
    const vMes  = vendas.filter((v) => {
      const d = new Date(v.data);
      return d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear();
    });
    const thoje = vHoje.reduce((s, v) => s + v.total, 0);
    const tMes  = vMes.reduce((s, v) => s + v.total, 0);

    const emAberto  = pedidos.filter((v) => v.status_producao !== "Entregue" && v.status_producao !== "Cancelado");
    const atrasados = emAberto.filter((v) => situacaoEntrega(v.data_entrega, v.status_producao) === "atrasado");
    const entreHoje = emAberto.filter((v) => situacaoEntrega(v.data_entrega, v.status_producao) === "hoje");
    const baixos    = App.db.insumos.filter((i) => numero(i.quantidade) <= numero(i.estoque_minimo));

    const diasNoMes = agora.getDate();
    const totalDias = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate();
    const pctMes    = (diasNoMes / totalDias) * 100;
    const pctHojeVsMes = tMes > 0 ? Math.min((thoje / tMes) * 100, 100) : 0;

    const aReceber = temAcessoFinanceiro()
      ? pedidos.filter((v) => v.status_producao !== "Cancelado" && v.cliente_id !== CLIENTE_AVISTA.id && v.saldo > 0.005)
      : [];
    const vencidos = aReceber.filter((v) => situacaoEntrega(v.data_vencimento, v.status_producao) === "atrasado");
    const tVencido = vencidos.reduce((s, v) => s + v.saldo, 0);

    const temAlertas = atrasados.length || entreHoje.length || baixos.length || vencidos.length;

    el.innerHTML = `
      <div class="ini4-pag">
        <div class="ini4-center">
          <p class="ini4-label">${saudacao()}, <strong>${esc(App.usuario.nome)}</strong></p>
          <p class="ini4-sublabel">${agora.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</p>
          <p class="ini4-valor">${dinheiro(thoje)}</p>
          <p class="ini4-sub">${vHoje.length} venda(s) hoje · ${dinheiro(tMes)} no mês</p>

          <div class="ini4-donuts">
            <div class="ini4-donut-item">
              ${_svgDonut(pctMes, "do mês", "var(--verde)")}
              <small>Progresso<br>do mês</small>
            </div>
            <div class="ini4-donut-item">
              ${_svgDonut(pctHojeVsMes, "do mês", "var(--azul)")}
              <small>Hoje vs.<br>mês total</small>
            </div>
          </div>
        </div>

        ${temAlertas ? `
        <div class="ini4-alertas">
          <p class="ini4-alertas-tit">Atenção necessária</p>
          ${atrasados.length ? `<button type="button" class="ini4-alerta ini4-al-verm" id="ini4-atr">⚠ ${atrasados.length} pedido(s) atrasado(s)</button>` : ""}
          ${entreHoje.length ? `<button type="button" class="ini4-alerta ini4-al-laran" id="ini4-hj">📅 ${entreHoje.length} entrega(s) hoje</button>` : ""}
          ${vencidos.length ? `<button type="button" class="ini4-alerta ini4-al-verm" id="ini4-cob">💰 ${dinheiro(tVencido)} a receber em atraso</button>` : ""}
          ${baixos.length ? `<button type="button" class="ini4-alerta ini4-al-azul" id="ini4-bx">📦 ${baixos.length} insumo(s) em falta</button>` : ""}
        </div>` : `<div class="ini4-ok">✓ Tudo em dia!</div>`}

        <div class="ini4-acoes">
          <button type="button" class="btn btn-primario ini4-btn-np" id="ini4-np">＋ Novo pedido</button>
          <button type="button" class="btn btn-secundario" id="ini4-orc">Orçamento</button>
        </div>
      </div>`;

    $("#ini4-np",  el).addEventListener("click", () => navegar("vendas", { abrirPdv: true, tipo: "Pedido" }));
    $("#ini4-orc", el).addEventListener("click", () => navegar("vendas", { abrirPdv: true, tipo: "Orçamento" }));
    $("#ini4-atr", el)?.addEventListener("click", () => navegar("fluxo"));
    $("#ini4-hj",  el)?.addEventListener("click", () => navegar("fluxo"));
    $("#ini4-cob", el)?.addEventListener("click", () => navegar("cobrancas"));
    $("#ini4-bx",  el)?.addEventListener("click", () => navegar("estoque"));
  },
});

/* ══════════════════════════════════════════════════════════════
   LAYOUT 5 — Centro Financeiro
   Foco no caixa: saldo, entradas/saídas, lançamentos recentes
   ══════════════════════════════════════════════════════════════ */
registrarModulo({
  id: "inicio5",
  titulo: "Início 5",
  rotulo: "Início 5",
  icone: "caixa",
  render(el) {
    if (!temAcessoFinanceiro()) {
      el.innerHTML = `<div class="pagina"><p class="vazio">Esta visualização requer acesso financeiro.</p></div>`;
      return;
    }

    const pedidos = agruparVendas(App.db.vendas);
    const agora   = new Date();
    const lancs   = App.db.lancamentos || [];

    const lancMes = lancs.filter((l) => {
      const d = new Date(l.data);
      return d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear();
    });
    const entradas = lancMes.filter((l) => efeitoLancamento(l) > 0).reduce((s, l) => s + efeitoLancamento(l), 0);
    const saidas   = lancMes.filter((l) => efeitoLancamento(l) < 0).reduce((s, l) => s + Math.abs(efeitoLancamento(l)), 0);
    const saldoDin = saldoDestino("dinheiro");
    const saldoBan = saldoDestino("banco");
    const saldoTot = saldoDin + saldoBan;

    const ultLancs  = lancs.slice().reverse().slice(0, 6);
    const aReceber  = pedidos.filter((v) => v.status_producao !== "Cancelado" && v.cliente_id !== CLIENTE_AVISTA.id && v.saldo > 0.005);
    const vencidos  = aReceber.filter((v) => situacaoEntrega(v.data_vencimento, v.status_producao) === "atrasado");
    const tVencido  = vencidos.reduce((s, v) => s + v.saldo, 0);
    const total     = entradas + saidas;
    const pctEnt    = total > 0 ? (entradas / total) * 100 : 50;

    const vHoje = agruparVendas(App.db.vendas)
      .filter((v) => contaComoVenda(v.status_producao) && new Date(v.data).toDateString() === agora.toDateString());
    const thoje = vHoje.reduce((s, v) => s + v.total, 0);

    el.innerHTML = `
      <div class="pagina ini5-pag">
        <div class="ini5-saldo-hero">
          <small>Saldo em caixa</small>
          <strong class="ini5-saldo-total ${saldoTot < 0 ? "ini5-neg" : ""}">${dinheiro(saldoTot)}</strong>
          <div class="ini5-saldo-split">
            <div class="ini5-saldo-dest">
              <span class="ini5-saldo-ico">💵</span>
              <div>
                <small>Dinheiro</small>
                <strong>${dinheiro(saldoDin)}</strong>
              </div>
            </div>
            <div class="ini5-saldo-sep"></div>
            <div class="ini5-saldo-dest">
              <span class="ini5-saldo-ico">🏦</span>
              <div>
                <small>Banco</small>
                <strong>${dinheiro(saldoBan)}</strong>
              </div>
            </div>
          </div>
        </div>

        <div class="ini5-mes">
          <div class="ini5-mes-titulo">Este mês</div>
          <div class="ini5-mes-linha">
            <span class="ini5-ent-txt">↑ Entradas</span>
            <strong class="ini5-ent-txt">${dinheiro(entradas)}</strong>
          </div>
          <div class="ini5-barra-container">
            <div class="ini5-barra-ent" style="flex:${pctEnt.toFixed(1)}"></div>
            <div class="ini5-barra-sai" style="flex:${(100 - pctEnt).toFixed(1)}"></div>
          </div>
          <div class="ini5-mes-linha">
            <span class="ini5-sai-txt">↓ Saídas</span>
            <strong class="ini5-sai-txt">${dinheiro(saidas)}</strong>
          </div>
        </div>

        <div class="ini5-hoje">
          <span>Vendas hoje</span><strong>${dinheiro(thoje)}</strong>
        </div>

        ${vencidos.length ? `
        <button type="button" class="ini5-cobr-alerta" id="ini5-cobr">
          <span>💰 ${vencidos.length} cobrança(s) vencida(s)</span>
          <strong>${dinheiro(tVencido)}</strong>
        </button>` : ""}

        <div class="linha-acoes">
          <button type="button" class="btn btn-primario btn-grande" id="ini5-caixa">Abrir Caixa</button>
          <button type="button" class="btn btn-secundario btn-grande" id="ini5-cobr2">Cobranças</button>
        </div>

        ${ultLancs.length ? `
        <h3 class="titulo-secao">Últimos lançamentos</h3>
        <div class="ini5-lancs">
          ${ultLancs.map((l) => {
            const ef = efeitoLancamento(l);
            return `<div class="ini5-lanc">
              <div class="ini5-lanc-info">
                <strong>${esc(l.descricao || l.categoria || "Sem descrição")}</strong>
                <small>${l.data ? dataCurta(l.data) : ""} · ${esc(l.destino || "")}</small>
              </div>
              <span class="ini5-lanc-val ${ef < 0 ? "ini5-sai-txt" : "ini5-ent-txt"}">${ef < 0 ? "−" : "+"}${dinheiro(Math.abs(ef))}</span>
            </div>`;
          }).join("")}
        </div>` : `<p class="vazio">Nenhum lançamento ainda.</p>`}
      </div>`;

    $("#ini5-caixa",  el).addEventListener("click", () => navegar("caixa"));
    $("#ini5-cobr2",  el).addEventListener("click", () => navegar("cobrancas"));
    $("#ini5-cobr",   el)?.addEventListener("click", () => navegar("cobrancas"));
  },
});
