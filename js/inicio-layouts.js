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

/* ════════════════════════════════════════════════════════════════
   HELPERS COMPARTILHADOS (layouts 6–10)
   ════════════════════════════════════════════════════════════════ */

/* Cor da logo atribuída a cada guia do app, usada nos lançadores. */
const _CORES_GUIA = {
  vendas: "var(--marca-1)", fluxo: "var(--marca-2)", estoque: "var(--marca-3)",
  clientes: "var(--marca-4)", produtos: "var(--marca-5)", caixa: "var(--marca-6)",
  cobrancas: "var(--marca-8)", config: "var(--marca-9)",
};

/* Guias navegáveis do projeto (exclui as telas de início). Respeita o
   perfil e o acesso financeiro do usuário via modulosPermitidos(). */
function _guiasApp() {
  return modulosPermitidos()
    .filter((m) => !String(m.id).startsWith("inicio"))
    .map((m) => ({ id: m.id, titulo: m.titulo, icone: m.icone, cor: _CORES_GUIA[m.id] || "var(--verde)" }));
}

/* Lançador colorido com botões para todas as guias. */
function _launcherHtml(titulo) {
  const guias = _guiasApp();
  return `
    ${titulo ? `<h3 class="titulo-secao">${esc(titulo)}</h3>` : ""}
    <div class="ini-launcher">
      ${guias.map((g, i) => `
        <button type="button" class="ini-app ini-rise" data-ir="${g.id}" style="--cor:${g.cor};--i:${i}">
          <span class="ini-app-ico">${ICONES[g.icone] || ""}</span>
          <span class="ini-app-nome">${esc(g.titulo)}</span>
        </button>`).join("")}
    </div>`;
}

/* Liga os botões data-ir (navegação) e data-venda (abrir pedido). */
function _wireInicio(el, rota) {
  el.querySelectorAll("[data-ir]").forEach((b) =>
    b.addEventListener("click", () => navegar(b.dataset.ir)));
  el.querySelectorAll("[data-venda]").forEach((b) =>
    b.addEventListener("click", () => abrirDetalheVenda(b.dataset.venda, () => navegar(rota))));
  _animarContadores(el);
}

/* Conta-regressiva/progressiva animada para números (faturamento, qtd). */
function _animarNumero(el) {
  const ate = parseFloat(el.dataset.countTo || "0") || 0;
  const moeda = el.dataset.countFmt === "money";
  const fmt = (v) => moeda ? dinheiro(v) : Math.round(v).toLocaleString("pt-BR");
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = fmt(ate); return; }
  const dur = 700, t0 = performance.now();
  (function passo(t) {
    const p = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(ate * e);
    if (p < 1) requestAnimationFrame(passo);
  })(t0);
}
function _animarContadores(el) {
  el.querySelectorAll("[data-count-to]").forEach(_animarNumero);
}

/* Bundle de dados do dia/mês usado pelos painéis. */
function _dadosInicio() {
  const pedidos = agruparVendas(App.db.vendas);
  const vendas  = pedidos.filter((v) => contaComoVenda(v.status_producao));
  const agora   = new Date();
  const hStr    = agora.toDateString();
  const vHoje = vendas.filter((v) => new Date(v.data).toDateString() === hStr);
  const vMes  = vendas.filter((v) => {
    const d = new Date(v.data);
    return d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear();
  });
  const totHoje = vHoje.reduce((s, v) => s + v.total, 0);
  const totMes  = vMes.reduce((s, v) => s + v.total, 0);
  const emAberto   = pedidos.filter((v) => v.status_producao !== "Entregue" && v.status_producao !== "Cancelado");
  const atrasados  = emAberto.filter((v) => situacaoEntrega(v.data_entrega, v.status_producao) === "atrasado");
  const entregaHoje= emAberto.filter((v) => situacaoEntrega(v.data_entrega, v.status_producao) === "hoje");
  const baixos     = App.db.insumos.filter((i) => numero(i.quantidade) <= numero(i.estoque_minimo));
  const fin = temAcessoFinanceiro();
  const aReceber = fin ? pedidos.filter((v) => v.status_producao !== "Cancelado" && v.cliente_id !== CLIENTE_AVISTA.id && v.saldo > 0.005) : [];
  const vencidos = aReceber.filter((v) => situacaoEntrega(v.data_vencimento, v.status_producao) === "atrasado");
  const totVencido = vencidos.reduce((s, v) => s + v.saldo, 0);
  return { pedidos, vendas, agora, vHoje, vMes, totHoje, totMes, emAberto, atrasados, entregaHoje, baixos, fin, aReceber, vencidos, totVencido };
}

/* Contagem de pedidos em aberto por etapa de produção. */
function _contagemEtapas(emAberto) {
  const c = {};
  CONFIG.statusProducao.forEach((s) => (c[s] = 0));
  emAberto.forEach((v) => { if (c[v.status_producao] !== undefined) c[v.status_producao]++; });
  return c;
}

/* Produtos mais vendidos (por quantidade) a partir dos itens das vendas. */
function _topProdutos(vendas, n) {
  const m = new Map();
  vendas.forEach((v) => v.itens.forEach((it) => {
    const k = it.produto_nome || "—";
    m.set(k, (m.get(k) || 0) + numero(it.quantidade));
  }));
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

/* Próximas entregas (em aberto, com data) ordenadas por urgência. */
function _proximasEntregas(emAberto, n) {
  return emAberto
    .filter((v) => v.data_entrega)
    .sort((a, b) => (parseData(a.data_entrega)?.getTime() || Infinity) - (parseData(b.data_entrega)?.getTime() || Infinity))
    .slice(0, n);
}

/* Gráfico de área com preenchimento gradiente e traço animado. */
function _svgArea(dias, cor) {
  const W = 300, H = 96, pad = 8;
  const maxV = Math.max(...dias.map((d) => d.total), 1);
  const n = dias.length;
  const x = (i) => pad + (n === 1 ? 0 : (i / (n - 1)) * (W - 2 * pad));
  const y = (v) => H - pad - (v / maxV) * (H - 2 * pad - 8);
  const pts = dias.map((d, i) => [x(i), y(d.total)]);
  const linha = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = `${linha} L ${x(n - 1).toFixed(1)} ${H - pad} L ${x(0).toFixed(1)} ${H - pad} Z`;
  const gid = "grad-area-" + Math.random().toString(36).slice(2, 7);
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" preserveAspectRatio="none">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${cor}" stop-opacity="0.32"/>
      <stop offset="100%" stop-color="${cor}" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${area}" fill="url(#${gid})"/>
    <path d="${linha}" fill="none" stroke="${cor}" stroke-width="2.5"
      vector-effect="non-scaling-stroke" pathLength="1" class="ini-area-line"/>
  </svg>`;
}

/* Anel (rosca) multi-segmento para distribuição por etapa. */
function _svgAnel(segs, centroNum, centroTxt) {
  const R = 42, C = 2 * Math.PI * R;
  let acc = 0;
  const total = segs.reduce((s, x) => s + x.valor, 0) || 1;
  const arcos = segs.filter((s) => s.valor > 0).map((s) => {
    const dash = (s.valor / total) * C;
    const arco = `<circle cx="50" cy="50" r="${R}" fill="none" stroke="${s.cor}" stroke-width="13"
      stroke-dasharray="${dash.toFixed(2)} ${(C - dash).toFixed(2)}"
      stroke-dashoffset="${(-acc).toFixed(2)}" transform="rotate(-90 50 50)"/>`;
    acc += dash;
    return arco;
  }).join("");
  return `<svg viewBox="0 0 100 100" style="width:128px;height:128px">
    <circle cx="50" cy="50" r="${R}" fill="none" stroke="var(--borda)" stroke-width="13"/>
    ${arcos}
    <text x="50" y="48" text-anchor="middle" font-size="19" font-weight="800" fill="var(--texto)">${centroNum}</text>
    <text x="50" y="61" text-anchor="middle" font-size="7" fill="var(--texto-suave)">${esc(centroTxt)}</text>
  </svg>`;
}

/* ══════════════════════════════════════════════════════════════
   LAYOUT 6 — Central (hub colorido com lançador de apps)
   ══════════════════════════════════════════════════════════════ */
registrarModulo({
  id: "inicio6",
  titulo: "Início 6",
  rotulo: "Início 6",
  icone: "inicio",
  render(el) {
    const d = _dadosInicio();
    const alertas = d.atrasados.length + d.baixos.length + d.vencidos.length;

    el.innerHTML = `
      <div class="pagina ini6-pag">
        <div class="ini6-hero ini-rise">
          <div class="ini6-hero-top">
            <div>
              <p class="ini6-sauda">${saudacao()},</p>
              <p class="ini6-nome">${esc(App.usuario.nome)}</p>
            </div>
            <span class="ini6-data">${d.agora.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</span>
          </div>
          <div class="ini6-fat">
            <small>Faturamento de hoje</small>
            <strong data-count-to="${d.totHoje}" data-count-fmt="money">${dinheiro(0)}</strong>
          </div>
          <div class="ini6-mini">
            <div><strong data-count-to="${d.vHoje.length}">0</strong><span>hoje</span></div>
            <div><strong data-count-to="${d.vMes.length}">0</strong><span>no mês</span></div>
            <div><strong data-count-to="${d.emAberto.length}">0</strong><span>em aberto</span></div>
          </div>
        </div>

        ${alertas ? `
        <button type="button" class="ini6-alerta ini-rise" data-ir="fluxo" style="--i:1">
          <span class="ini6-alerta-ico">🔔</span>
          <span class="ini6-alerta-txt">${[
            d.atrasados.length ? `${d.atrasados.length} atrasado(s)` : "",
            d.entregaHoje.length ? `${d.entregaHoje.length} entrega(s) hoje` : "",
            d.baixos.length ? `${d.baixos.length} insumo(s) em falta` : "",
            d.vencidos.length ? `${dinheiro(d.totVencido)} a receber` : "",
          ].filter(Boolean).join(" · ")}</span>
          <span class="ini6-alerta-seta">›</span>
        </button>` : `<div class="ini6-ok ini-rise" style="--i:1">✓ Está tudo em dia, ótimo trabalho!</div>`}

        <div class="ini6-acoes ini-rise" style="--i:2">
          <button type="button" class="btn btn-primario btn-grande" id="ini6-np">＋ Novo pedido</button>
          <button type="button" class="btn btn-secundario btn-grande" id="ini6-orc">Orçamento</button>
        </div>

        ${_launcherHtml("Acesso rápido")}
      </div>`;

    $("#ini6-np",  el).addEventListener("click", () => navegar("vendas", { abrirPdv: true, tipo: "Pedido" }));
    $("#ini6-orc", el).addEventListener("click", () => navegar("vendas", { abrirPdv: true, tipo: "Orçamento" }));
    _wireInicio(el, "inicio6");
  },
});

/* ══════════════════════════════════════════════════════════════
   LAYOUT 7 — Painel Pro (KPIs + gráfico de área 14 dias)
   ══════════════════════════════════════════════════════════════ */
registrarModulo({
  id: "inicio7",
  titulo: "Início 7",
  rotulo: "Início 7",
  icone: "inicio",
  render(el) {
    const d = _dadosInicio();
    const dias14 = _diasAnteriores(d.vendas, 14);
    const ticket = d.vMes.length ? d.totMes / d.vMes.length : 0;
    const cont = _contagemEtapas(d.emAberto);
    const etapas = CONFIG.statusProducao.filter((s) => s !== "Cancelado" && s !== "Entregue");
    const CORE = { "Orçamento": "var(--marca-7)", "Pedido feito": "var(--marca-6)", "Em produção": "var(--marca-2)", "Pronto": "var(--marca-4)" };

    el.innerHTML = `
      <div class="pagina ini7-pag">
        <div class="ini7-topo ini-rise">
          <div>
            <p class="ini7-sauda">${saudacao()}, <strong>${esc(App.usuario.nome)}</strong></p>
            <p class="ini7-date">${d.agora.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</p>
          </div>
          <button type="button" class="btn btn-primario ini7-np" id="ini7-np">＋ Pedido</button>
        </div>

        <div class="ini7-kpis">
          <div class="ini7-kpi ini-rise" style="--c:var(--marca-1);--i:0">
            <small>Hoje</small>
            <strong data-count-to="${d.totHoje}" data-count-fmt="money">${dinheiro(0)}</strong>
            <span>${d.vHoje.length} pedido(s)</span>
          </div>
          <div class="ini7-kpi ini-rise" style="--c:var(--marca-4);--i:1">
            <small>No mês</small>
            <strong data-count-to="${d.totMes}" data-count-fmt="money">${dinheiro(0)}</strong>
            <span>${d.vMes.length} pedido(s)</span>
          </div>
          <div class="ini7-kpi ini-rise" style="--c:var(--marca-6);--i:2">
            <small>Ticket médio</small>
            <strong data-count-to="${ticket}" data-count-fmt="money">${dinheiro(0)}</strong>
            <span>por pedido</span>
          </div>
          <div class="ini7-kpi ini-rise" style="--c:var(--marca-2);--i:3">
            <small>Em aberto</small>
            <strong data-count-to="${d.emAberto.length}">0</strong>
            <span>${d.atrasados.length} atrasado(s)</span>
          </div>
        </div>

        <div class="ini7-grafico ini-rise" style="--i:4">
          <div class="ini7-grafico-cab">
            <span>Faturamento · últimos 14 dias</span>
            <strong>${dinheiro(d.totMes)} / mês</strong>
          </div>
          ${_svgArea(dias14, "var(--marca-4)")}
        </div>

        <div class="ini7-pipe ini-rise" style="--i:5">
          ${etapas.map((s) => `
            <div class="ini7-pipe-item" style="--c:${CORE[s] || "var(--texto-suave)"}">
              <strong>${cont[s] || 0}</strong>
              <small>${esc(s)}</small>
            </div>`).join("")}
        </div>

        ${_launcherHtml("Ir para")}
      </div>`;

    $("#ini7-np", el).addEventListener("click", () => navegar("vendas", { abrirPdv: true, tipo: "Pedido" }));
    _wireInicio(el, "inicio7");
  },
});

/* ══════════════════════════════════════════════════════════════
   LAYOUT 8 — Radar (anel de produção + central de pendências)
   ══════════════════════════════════════════════════════════════ */
registrarModulo({
  id: "inicio8",
  titulo: "Início 8",
  rotulo: "Início 8",
  icone: "inicio",
  render(el) {
    const d = _dadosInicio();
    const cont = _contagemEtapas(d.emAberto);
    const segs = [
      { valor: cont["Orçamento"] || 0,    cor: "var(--marca-7)", label: "Orçamento" },
      { valor: cont["Pedido feito"] || 0, cor: "var(--marca-6)", label: "Pedido feito" },
      { valor: cont["Em produção"] || 0,  cor: "var(--marca-2)", label: "Em produção" },
      { valor: cont["Pronto"] || 0,       cor: "var(--marca-4)", label: "Pronto" },
    ];

    const pend = [];
    if (d.atrasados.length)   pend.push({ ico: "⚠", cls: "verm", txt: `${d.atrasados.length} pedido(s) atrasado(s)`, ir: "fluxo" });
    if (d.entregaHoje.length) pend.push({ ico: "📅", cls: "laran", txt: `${d.entregaHoje.length} entrega(s) para hoje`, ir: "fluxo" });
    if (d.vencidos.length)    pend.push({ ico: "💰", cls: "verm", txt: `${dinheiro(d.totVencido)} a receber em atraso`, ir: "cobrancas" });
    if (d.baixos.length)      pend.push({ ico: "📦", cls: "azul", txt: `${d.baixos.length} insumo(s) com estoque baixo`, ir: "estoque" });

    el.innerHTML = `
      <div class="pagina ini8-pag">
        <div class="ini8-topo ini-rise">
          <p class="ini8-sauda">${saudacao()}, <strong>${esc(App.usuario.nome)}</strong></p>
          <button type="button" class="btn btn-primario ini8-np" id="ini8-np">＋ Pedido</button>
        </div>

        <div class="ini8-radar ini-rise" style="--i:1">
          <div class="ini8-anel">${_svgAnel(segs, d.emAberto.length, "em aberto")}</div>
          <div class="ini8-legenda">
            ${segs.map((s) => `
              <div class="ini8-leg-item">
                <span class="ini8-leg-cor" style="background:${s.cor}"></span>
                <span class="ini8-leg-nome">${esc(s.label)}</span>
                <strong>${s.valor}</strong>
              </div>`).join("")}
          </div>
        </div>

        <h3 class="titulo-secao">Precisa de atenção</h3>
        ${pend.length ? `
        <div class="ini8-pend">
          ${pend.map((p, i) => `
            <button type="button" class="ini8-pend-item ini8-${p.cls} ini-rise" data-ir="${p.ir}" style="--i:${i}">
              <span class="ini8-pend-ico">${p.ico}</span>
              <span class="ini8-pend-txt">${p.txt}</span>
              <span class="ini8-pend-seta">›</span>
            </button>`).join("")}
        </div>` : `<div class="ini8-ok ini-rise">✓ Nenhuma pendência. Tudo sob controle!</div>`}

        <div class="ini8-resumo ini-rise">
          <div><small>Hoje</small><strong>${dinheiro(d.totHoje)}</strong></div>
          <div><small>No mês</small><strong>${dinheiro(d.totMes)}</strong></div>
        </div>

        ${_launcherHtml("Abrir")}
      </div>`;

    $("#ini8-np", el).addEventListener("click", () => navegar("vendas", { abrirPdv: true, tipo: "Pedido" }));
    _wireInicio(el, "inicio8");
  },
});

/* ══════════════════════════════════════════════════════════════
   LAYOUT 9 — Bento (grade de cartões variados)
   ══════════════════════════════════════════════════════════════ */
registrarModulo({
  id: "inicio9",
  titulo: "Início 9",
  rotulo: "Início 9",
  icone: "inicio",
  render(el) {
    const d = _dadosInicio();
    const semana = _diasAnteriores(d.vendas, 7);
    const top = _topProdutos(d.vendas, 4);
    const proximas = _proximasEntregas(d.emAberto, 3);
    const maxTop = Math.max(...top.map((t) => t[1]), 1);

    el.innerHTML = `
      <div class="ini9-pag">
        <div class="ini9-saud ini-rise">
          <p>${saudacao()}, <strong>${esc(App.usuario.nome)}</strong> 👋</p>
        </div>

        <div class="ini9-bento">
          <div class="ini9-card ini9-fat ini-rise" style="--i:0">
            <small>Faturamento hoje</small>
            <strong data-count-to="${d.totHoje}" data-count-fmt="money">${dinheiro(0)}</strong>
            <span>${d.vHoje.length} venda(s) · ${dinheiro(d.totMes)} no mês</span>
          </div>

          <button type="button" class="ini9-card ini9-acao ini-rise" id="ini9-np" style="--i:1">
            <span class="ini9-acao-ico">＋</span>
            <span>Novo pedido</span>
          </button>

          <div class="ini9-card ini9-num ini-rise" style="--i:2">
            <strong data-count-to="${d.emAberto.length}">0</strong>
            <small>em aberto</small>
          </div>
          <div class="ini9-card ini9-num ${d.atrasados.length ? "ini9-num-warn" : ""} ini-rise" style="--i:3">
            <strong data-count-to="${d.atrasados.length}">0</strong>
            <small>atrasados</small>
          </div>
          <div class="ini9-card ini9-num ${d.baixos.length ? "ini9-num-warn" : ""} ini-rise" style="--i:4">
            <strong data-count-to="${d.baixos.length}">0</strong>
            <small>est. baixo</small>
          </div>

          <div class="ini9-card ini9-chart ini-rise" style="--i:5">
            <small>Vendas · 7 dias</small>
            ${_svgBars(semana)}
          </div>

          <div class="ini9-card ini9-top ini-rise" style="--i:6">
            <small>Mais vendidos</small>
            ${top.length ? `<div class="ini9-top-lista">
              ${top.map((t) => `
                <div class="ini9-top-item">
                  <span class="ini9-top-nome">${esc(t[0])}</span>
                  <span class="ini9-top-barra"><span style="width:${Math.round((t[1] / maxTop) * 100)}%"></span></span>
                  <span class="ini9-top-qtd">${t[1]}</span>
                </div>`).join("")}
            </div>` : `<p class="ini9-vazio">Sem vendas ainda.</p>`}
          </div>

          <div class="ini9-card ini9-entregas ini-rise" style="--i:7">
            <small>Próximas entregas</small>
            ${proximas.length ? proximas.map((v) => {
              const sit = situacaoEntrega(v.data_entrega, v.status_producao);
              return `<button type="button" class="ini9-ent-item ini9-sit-${sit}" data-venda="${esc(v.id_venda)}">
                <span class="ini9-ent-nome">${esc(v.cliente_nome || "Sem cliente")}</span>
                <span class="ini9-ent-data">${dataCurta(v.data_entrega)}</span>
              </button>`;
            }).join("") : `<p class="ini9-vazio">Nada agendado.</p>`}
          </div>
        </div>

        ${_launcherHtml("Todas as telas")}
      </div>`;

    $("#ini9-np", el).addEventListener("click", () => navegar("vendas", { abrirPdv: true, tipo: "Pedido" }));
    _wireInicio(el, "inicio9");
  },
});

/* ══════════════════════════════════════════════════════════════
   LAYOUT 10 — Agenda (linha do tempo + anel de progresso)
   ══════════════════════════════════════════════════════════════ */
registrarModulo({
  id: "inicio10",
  titulo: "Início 10",
  rotulo: "Início 10",
  icone: "inicio",
  render(el) {
    const d = _dadosInicio();
    const totalDias = new Date(d.agora.getFullYear(), d.agora.getMonth() + 1, 0).getDate();
    const pctMes = (d.agora.getDate() / totalDias) * 100;
    const proximas = _proximasEntregas(d.emAberto, 6);

    el.innerHTML = `
      <div class="pagina ini10-pag">
        <div class="ini10-hero ini-rise">
          <div class="ini10-hero-info">
            <p class="ini10-sauda">${saudacao()}, <strong>${esc(App.usuario.nome)}</strong></p>
            <p class="ini10-fat" data-count-to="${d.totHoje}" data-count-fmt="money">${dinheiro(0)}</p>
            <p class="ini10-sub">${d.vHoje.length} venda(s) hoje · ${dinheiro(d.totMes)} no mês</p>
          </div>
          <div class="ini10-ring">${_svgDonut(pctMes, "do mês", "var(--marca-3)")}</div>
        </div>

        <div class="ini10-kpis ini-rise" style="--i:1">
          <div><strong>${d.emAberto.length}</strong><small>em aberto</small></div>
          <div class="${d.atrasados.length ? "ini10-warn" : ""}"><strong>${d.atrasados.length}</strong><small>atrasados</small></div>
          <div class="${d.entregaHoje.length ? "ini10-warn" : ""}"><strong>${d.entregaHoje.length}</strong><small>hoje</small></div>
          <div class="${d.baixos.length ? "ini10-warn" : ""}"><strong>${d.baixos.length}</strong><small>est. baixo</small></div>
        </div>

        <div class="ini10-acoes ini-rise" style="--i:2">
          <button type="button" class="btn btn-primario btn-grande" id="ini10-np">＋ Novo pedido</button>
          <button type="button" class="btn btn-secundario btn-grande" id="ini10-fluxo">Ver Fluxo</button>
        </div>

        <h3 class="titulo-secao">Agenda de entregas</h3>
        ${proximas.length ? `
        <div class="ini10-timeline">
          ${proximas.map((v, i) => {
            const sit = situacaoEntrega(v.data_entrega, v.status_producao);
            const rotulo = sit === "atrasado" ? "atrasado" : sit === "hoje" ? "hoje" : dataCurta(v.data_entrega);
            return `<button type="button" class="ini10-tl-item ini-rise" data-venda="${esc(v.id_venda)}" style="--i:${i + 3}">
              <div class="ini10-tl-marca ini10-sit-${sit}"></div>
              <div class="ini10-tl-data ini10-sit-${sit}">${rotulo}</div>
              <div class="ini10-tl-info">
                <strong>${esc(v.cliente_nome || "Sem cliente")}</strong>
                <small>${esc(v.status_producao)} · ${v.itens.length} item(ns)</small>
              </div>
            </button>`;
          }).join("")}
        </div>` : `<div class="ini10-vazio ini-rise">Nenhuma entrega agendada.</div>`}

        ${_launcherHtml("Atalhos")}
      </div>`;

    $("#ini10-np",    el).addEventListener("click", () => navegar("vendas", { abrirPdv: true, tipo: "Pedido" }));
    $("#ini10-fluxo", el).addEventListener("click", () => navegar("fluxo"));
    _wireInicio(el, "inicio10");
  },
});
