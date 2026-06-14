"use strict";

/* ============================================================
   Módulo: Pedidos (antiga "Vendas")
   - Lista de pedidos (agrupados por id_venda) com filtros por
     etapa de produção; cada cartão tem botões clicáveis para
     mudar a etapa e o pagamento na hora.
   - Criação de "Pedido" ou "Orçamento" pelo mesmo fluxo (PDV).
   - Envio do pedido/orçamento pelo WhatsApp.
   O id do módulo continua "vendas" e a tabela continua "vendas"
   para não quebrar os dados já existentes na planilha.
   ============================================================ */

let pdvItens = [];

registrarModulo({
  id: "vendas",
  titulo: "Pedidos",
  rotulo: "Pedidos",
  icone: "vendas",
  render(el, parametros) {
    if (parametros?.abrirPdv) renderPdv(el, { tipo: parametros.tipo || "Pedido" });
    else renderListaPedidos(el);
  },
});

/* ---------------- cartão de pedido (lista e início) ---------------- */

/* Usado na lista de Pedidos e na tela inicial. As "badges" de etapa e
   pagamento têm data-acao para serem clicáveis onde houver handler. */
function cartaoVendaHtml(v) {
  const prod = v.status_producao;
  const pag = v.status_pagamento;
  const qtdItens = v.itens.length;
  const sit = situacaoEntrega(v.data_entrega, prod);
  const entregaHtml = v.data_entrega
    ? `<span class="pedido-entrega ${sit}">📅 ${dataCurta(v.data_entrega)}${sit === "hoje" ? " · hoje!" : sit === "atrasado" ? " · atrasado" : ""}</span>`
    : "";
  return `
    <div class="cartao-venda cartao-pedido" data-venda="${esc(v.id_venda)}">
      <div class="pedido-badges">
        <button type="button" class="badge-status prod-${slugStatus(prod)}" data-acao="status" data-venda="${esc(v.id_venda)}">${esc(prod)}</button>
        <button type="button" class="badge-status badge-pag pag-${slugStatus(pag)}" data-acao="pagamento" data-venda="${esc(v.id_venda)}">${esc(pag)}</button>
      </div>
      <div class="pedido-corpo" data-acao="abrir" data-venda="${esc(v.id_venda)}">
        <div class="cartao-info">
          <span class="venda-numero">#${esc(v.id_venda)}${v.tipo === "Orçamento" ? " · Orçamento" : ""}</span>
          <strong>${esc(v.cliente_nome || "Cliente não informado")}</strong>
          <small>${dataHora(v.data)} · ${qtdItens} ${qtdItens > 1 ? "itens" : "item"} ${entregaHtml}</small>
        </div>
        <div class="cartao-lado">
          <strong>${dinheiro(v.total)}</strong>
        </div>
      </div>
    </div>`;
}

function calcularCustoVenda(venda) {
  return (venda?.itens || []).reduce((total, item) => {
    const produto = App.db.produtos.find(p => p.id === item.produto_id);
    return total + (produto?.composicao || []).reduce((c, comp) => {
      const insumo = App.db.insumos.find(i => i.id === comp.id_insumo);
      return c + (insumo ? numero(insumo.custo) * numero(comp.quantidade) * numero(item.quantidade) : 0);
    }, 0);
  }, 0);
}

function revertirBaixaVenda(venda) {
  let mudou = false;
  (venda?.itens || []).forEach(item => {
    const produto = App.db.produtos.find(p => p.id === item.produto_id);
    (produto?.composicao || []).forEach(comp => {
      const insumo = App.db.insumos.find(i => i.id === comp.id_insumo);
      if (insumo) {
        insumo.quantidade = numero(insumo.quantidade) + numero(comp.quantidade) * numero(item.quantidade);
        insumo.atualizado_em = new Date().toISOString();
        mudou = true;
      }
    });
  });
  return mudou;
}

/* ---------------- lista de pedidos ---------------- */

function renderListaPedidos(el) {
  el.innerHTML = `
    <div class="pagina">
      <div class="linha-acoes">
        <button type="button" class="btn btn-primario" id="pedidos-novo">+ Novo pedido</button>
        <button type="button" class="btn btn-secundario" id="pedidos-orcamento">Orçamento</button>
      </div>
      <div class="chips" id="pedidos-filtros">
        <button type="button" class="chip ativo" data-filtro="ativos">Em aberto</button>
        <button type="button" class="chip" data-filtro="Orçamento">Orçamentos</button>
        <button type="button" class="chip" data-filtro="Entregue">Entregues</button>
        <button type="button" class="chip" data-filtro="Cancelado">Cancelados</button>
        <button type="button" class="chip" data-filtro="tudo">Tudo</button>
      </div>
      <input id="pedidos-busca" class="campo-busca" placeholder="Buscar por cliente…" autocomplete="off">
      <div class="lista" id="pedidos-lista"></div>
    </div>`;

  let filtro = "ativos";

  function pedidosFiltrados() {
    const busca = $("#pedidos-busca", el).value.trim();
    let pedidos = agruparVendas(App.db.vendas);
    if (filtro === "ativos") {
      pedidos = pedidos.filter(v => v.status_producao !== "Entregue" && v.status_producao !== "Cancelado");
    } else if (filtro !== "tudo") {
      pedidos = pedidos.filter(v => v.status_producao === filtro);
    }
    if (busca) pedidos = pedidos.filter(v => contemTexto(v.cliente_nome, busca));
    return pedidos;
  }

  function atualizarLista() {
    const pedidos = pedidosFiltrados();
    const totalPeriodo = pedidos.filter(v => contaComoVenda(v.status_producao)).reduce((s, v) => s + v.total, 0);
    $("#pedidos-lista", el).innerHTML = pedidos.length
      ? `<p class="titulo-secao">${pedidos.length} pedido${pedidos.length > 1 ? "s" : ""} · ${dinheiro(totalPeriodo)}</p>` +
        pedidos.map(cartaoVendaHtml).join("")
      : `<p class="vazio">Nenhum pedido aqui.</p>`;
  }

  $("#pedidos-novo", el).addEventListener("click", () => renderPdv(el, { tipo: "Pedido" }));
  $("#pedidos-orcamento", el).addEventListener("click", () => renderPdv(el, { tipo: "Orçamento" }));
  $("#pedidos-busca", el).addEventListener("input", atualizarLista);
  $("#pedidos-filtros", el).addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    filtro = chip.dataset.filtro;
    $$(".chip", $("#pedidos-filtros", el)).forEach(c => c.classList.toggle("ativo", c === chip));
    atualizarLista();
  });

  $("#pedidos-lista", el).addEventListener("click", async (e) => {
    const botao = e.target.closest("[data-acao]");
    if (!botao) return;
    const idVenda = botao.dataset.venda;
    const acao = botao.dataset.acao;
    if (acao === "abrir") {
      abrirDetalheVenda(idVenda, atualizarLista);
    } else if (acao === "pagamento") {
      abrirMiniPagamento(idVenda, atualizarLista);
    } else if (acao === "status") {
      abrirSeletorStatus(idVenda, atualizarLista);
    }
  });

  atualizarLista();
}

/* Seletor rápido de etapa de produção (usado na lista e no detalhe). */
function abrirSeletorStatus(idVenda, aoMudar) {
  const venda = agruparVendas(App.db.vendas).find(v => v.id_venda === idVenda);
  if (!venda) return;
  const corpo = document.createElement("div");
  corpo.innerHTML = `
    <div class="seletor-status">
      ${CONFIG.statusProducao.map(s => `
        <button type="button" class="opcao-status prod-${slugStatus(s)} ${s === venda.status_producao ? "atual" : ""}" data-status="${esc(s)}">
          ${esc(s)}${s === venda.status_producao ? " ✓" : ""}
        </button>`).join("")}
    </div>`;
  const modal = abrirModal(`Etapa do pedido #${esc(idVenda)}`, corpo, { classe: "modal-pequeno" });
  corpo.addEventListener("click", async (e) => {
    const botao = e.target.closest(".opcao-status");
    if (!botao) return;
    modal.fechar();
    await mudarStatusProducao(idVenda, botao.dataset.status, { aoMudar });
  });
}

/* ---------------- detalhe do pedido ---------------- */

function abrirDetalheVenda(idVenda, aoMudar) {
  const venda = agruparVendas(App.db.vendas).find((v) => v.id_venda === idVenda);
  if (!venda) return;
  let mudou = false;

  const custo = calcularCustoVenda(venda);
  const lucro = venda.total - custo;
  const margem = venda.total > 0 ? Math.round((lucro / venda.total) * 100) : 0;

  const corpo = document.createElement("div");

  function render() {
    const v = agruparVendas(App.db.vendas).find((x) => x.id_venda === idVenda);
    if (!v) { return; }
    const sit = situacaoEntrega(v.data_entrega, v.status_producao);
    corpo.innerHTML = `
      <div class="detalhe-controles">
        <button type="button" class="badge-status grande prod-${slugStatus(v.status_producao)}" id="detalhe-status">${esc(v.status_producao)}</button>
        <button type="button" class="badge-status grande badge-pag pag-${slugStatus(v.status_pagamento)}" id="detalhe-pagamento">${esc(v.status_pagamento)}</button>
      </div>
      ${v.data_entrega ? `<p class="detalhe-entrega ${sit}">Entrega prevista: <strong>${dataCurta(v.data_entrega)}</strong>${sit === "hoje" ? " — é hoje!" : sit === "atrasado" ? " — atrasado!" : ""}</p>` : ""}
      ${v.saldo > 0.005 ? `<p class="detalhe-saldo ${v.data_vencimento && situacaoEntrega(v.data_vencimento, v.status_producao) === "atrasado" ? "vencido" : ""}">Falta receber <strong>${dinheiro(v.saldo)}</strong>${v.data_vencimento ? ` · vence ${dataCurta(v.data_vencimento)}` : ""}</p>` : ""}

      <div class="checklist" id="detalhe-itens">
        ${v.itens.map((i) => `
          <label class="checklist-item ${itemEstaPronto(i) ? "pronto" : ""}">
            <input type="checkbox" data-item="${esc(i.id)}" ${itemEstaPronto(i) ? "checked" : ""}>
            <span class="checklist-texto">${esc(numero(i.quantidade))}x ${esc(i.produto_nome)}</span>
            <span class="checklist-valor">${dinheiro(i.subtotal)}</span>
          </label>`).join("")}
      </div>

      <div class="resumo-venda">
        <div class="linha total"><span>Total</span><span>${dinheiro(v.total)}</span></div>
        <div class="linha"><span class="suave">Data</span><span>${dataHora(v.data)}</span></div>
        <div class="linha"><span class="suave">Registrado por</span><span>${esc(v.criado_por || "—")}</span></div>
        ${v.entrega ? `<div class="linha"><span class="suave">Observações</span><span>${esc(v.entrega)}</span></div>` : ""}
      </div>

      <div class="venda-stats">
        <div class="venda-stat-linha"><span>Custo dos insumos</span><span>${dinheiro(custo)}</span></div>
        <div class="venda-stat-linha lucro"><span>Lucro</span><span>${dinheiro(lucro)} (${margem}%)</span></div>
      </div>

      <button type="button" class="btn btn-whatsapp btn-cheio" id="detalhe-whatsapp">
        ${ICONES.whatsapp} Enviar pelo WhatsApp
      </button>

      <div class="linha-botoes" style="margin-top:12px">
        <button type="button" class="btn btn-perigo" id="detalhe-excluir">Excluir</button>
        <button type="button" class="btn btn-secundario" id="detalhe-editar">Editar</button>
      </div>`;

    // O clique na etapa abre o seletor de etapas.
    $("#detalhe-status", corpo).addEventListener("click", () =>
      abrirSeletorStatus(idVenda, () => { mudou = true; render(); if (aoMudar) aoMudar(); }));
    $("#detalhe-pagamento", corpo).addEventListener("click", () =>
      abrirMiniPagamento(idVenda, () => { mudou = true; render(); if (aoMudar) aoMudar(); }));
    $("#detalhe-itens", corpo).addEventListener("change", (e) => {
      const chk = e.target.closest("input[data-item]");
      if (!chk) return;
      alternarItemPronto(chk.dataset.item, { aoMudar: () => { mudou = true; render(); } });
    });
    $("#detalhe-whatsapp", corpo).addEventListener("click", () => abrirEnvioWhatsapp(idVenda));
    $("#detalhe-editar", corpo).addEventListener("click", () => {
      modal.fechar();
      abrirEditarVenda(idVenda, () => { mudou = true; if (aoMudar) aoMudar(); });
    });
    $("#detalhe-excluir", corpo).addEventListener("click", async () => {
      const ok = await confirmar("Excluir este pedido? Ele será removido da planilha.", { perigo: true, botao: "Excluir" });
      if (!ok) return;
      const vAtual = agruparVendas(App.db.vendas).find((x) => x.id_venda === idVenda);
      if (contaComoVenda(vAtual.status_producao) && revertirBaixaVenda(vAtual)) salvarTabela("insumos");
      App.db.vendas = App.db.vendas.filter((linha) => (linha.id_venda || linha.id) !== idVenda);
      salvarTabela("vendas");
      mudou = true;
      toast("Pedido excluído.");
      modal.fechar();
    });
  }

  const modal = abrirModal(`Pedido #${esc(venda.id_venda)} — ${esc(venda.cliente_nome || "cliente não informado")}`, corpo, {
    aoFechar: () => { if (mudou && aoMudar) aoMudar(); },
  });
  render();
}

/* ---------------- envio por WhatsApp ---------------- */

function abrirEnvioWhatsapp(idVenda) {
  const venda = agruparVendas(App.db.vendas).find((v) => v.id_venda === idVenda);
  if (!venda) return;
  const texto = textoMensagemPedido(venda);
  const corpo = document.createElement("div");
  corpo.innerHTML = `
    <pre class="previa-mensagem">${esc(texto)}</pre>
    <div class="linha-botoes" style="margin-top:14px; flex-direction:column">
      <a class="btn btn-whatsapp btn-cheio" id="wpp-enviar" href="${esc(linkWhatsapp(venda))}" target="_blank" rel="noopener">
        ${ICONES.whatsapp} Enviar no WhatsApp
      </a>
      <button type="button" class="btn btn-secundario btn-cheio" id="wpp-copiar">
        ${ICONES.copiar} Copiar mensagem
      </button>
    </div>`;
  abrirModal("Enviar para o cliente", corpo, { classe: "modal-pequeno" });
  $("#wpp-copiar", corpo).addEventListener("click", async () => {
    const ok = await copiarTexto(texto);
    toast(ok ? "Mensagem copiada!" : "Não foi possível copiar.", ok ? "ok" : "erro");
  });
}

/* ---------------- pagamento do pedido ---------------- */

/* Folha de pagamento: total, recebido, saldo e histórico (com estorno).
   É aberta ao tocar na "badge" de pagamento em qualquer lugar. */
function abrirPagamentoVenda(idVenda, aoMudar) {
  const corpo = document.createElement("div");
  function render() {
    const v = agruparVendas(App.db.vendas).find((x) => x.id_venda === idVenda);
    if (!v) return;
    const pagos = pagamentosDaVenda(idVenda).slice().sort((a, b) => String(a.data).localeCompare(String(b.data)));
    corpo.innerHTML = `
      <div class="badge-status grande badge-pag pag-${slugStatus(v.status_pagamento)} pag-folha-badge">${esc(v.status_pagamento)}</div>
      <div class="resumo-venda">
        <div class="linha total"><span>Total</span><span>${dinheiro(v.total)}</span></div>
        <div class="linha"><span class="suave">Recebido</span><span>${dinheiro(v.valor_pago)}</span></div>
        <div class="linha saldo-linha"><span>Saldo a receber</span><strong>${dinheiro(v.saldo)}</strong></div>
        ${v.data_vencimento && v.saldo > 0.005 ? `<div class="linha"><span class="suave">Pagar até</span><span>${dataCurta(v.data_vencimento)}</span></div>` : ""}
      </div>
      <h4 class="titulo-secao">Histórico de pagamentos</h4>
      <div class="pag-historico">
        ${pagos.length ? pagos.map((p) => `
          <div class="pag-item">
            <div class="pag-item-info"><strong>${dinheiro(p.valor)}</strong><small>${esc(p.forma_pagamento)} · ${dataCurta(p.data)}</small></div>
            <button type="button" class="pag-estornar" data-id="${esc(p.id)}">estornar</button>
          </div>`).join("") : `<p class="vazio">Nenhum recebimento ainda.</p>`}
      </div>
      ${v.saldo > 0.005
        ? `<button type="button" class="btn btn-primario btn-cheio" id="pag-receber" style="margin-top:12px">Registrar pagamento</button>`
        : `<p class="pag-quitado">✓ Pedido quitado</p>`}`;

    $("#pag-receber", corpo)?.addEventListener("click", () =>
      abrirReceberPagamento(idVenda, () => { render(); if (aoMudar) aoMudar(); }));
    $$(".pag-estornar", corpo).forEach((b) => b.addEventListener("click", async () => {
      const ok = await confirmar("Estornar este pagamento? O valor também sai do caixa.", { perigo: true, botao: "Estornar" });
      if (!ok) return;
      estornarPagamento(b.dataset.id, { aoMudar: () => { render(); if (aoMudar) aoMudar(); } });
      toast("Pagamento estornado.");
    }));
  }
  abrirModal(`Pagamento do pedido #${esc(idVenda)}`, corpo, { classe: "modal-pequeno" });
  render();
}

/* Mini popup de pagamento: aparece ao clicar na badge de pagamento.
   Mostra 3 opções (Não pago / Parcial / Pago). Dependendo da escolha,
   pede forma + valor e registra no caixa, ou estorna tudo. */
function abrirMiniPagamento(idVenda, aoMudar) {
  const corpo = document.createElement("div");

  function render() {
    const v = agruparVendas(App.db.vendas).find((x) => x.id_venda === idVenda);
    if (!v) return;
    corpo.innerHTML = `
      <p class="suave" style="margin:0 0 12px;font-size:13px">
        Total ${dinheiro(v.total)} · Recebido ${dinheiro(v.valor_pago)} · Saldo <strong>${dinheiro(v.saldo)}</strong>
      </p>
      <div class="mini-pag-opcoes">
        <button type="button" class="opcao-pag op-nao-pago ${v.status_pagamento === "Não pago" ? "atual" : ""}" data-op="nao-pago">
          Não pago${v.status_pagamento === "Não pago" ? " ✓" : ""}
        </button>
        <button type="button" class="opcao-pag op-parcial ${v.status_pagamento === "Parcial" ? "atual" : ""}" data-op="parcial">
          Parcial${v.status_pagamento === "Parcial" ? " ✓" : ""}
        </button>
        <button type="button" class="opcao-pag op-pago ${v.status_pagamento === "Pago" ? "atual" : ""}" data-op="pago">
          Pago${v.status_pagamento === "Pago" ? " ✓" : ""}
        </button>
      </div>
      <p style="margin-top:10px;text-align:center">
        <button type="button" class="btn btn-link" id="mini-ver-historico" style="font-size:13px;color:var(--texto-suave)">Ver histórico completo</button>
      </p>`;

    $("#mini-ver-historico", corpo).addEventListener("click", () => {
      modal.fechar();
      abrirPagamentoVenda(idVenda, aoMudar);
    });

    $$(".opcao-pag", corpo).forEach((btn) => btn.addEventListener("click", async () => {
      const op = btn.dataset.op;
      const vAtual = agruparVendas(App.db.vendas).find((x) => x.id_venda === idVenda);
      if (!vAtual) return;

      if (op === "nao-pago") {
        if (vAtual.valor_pago > 0.005) {
          const ok = await confirmar(
            `Estornar ${dinheiro(vAtual.valor_pago)} do caixa e marcar como não pago?`,
            { perigo: true, botao: "Estornar tudo" });
          if (!ok) return;
          pagamentosDaVenda(idVenda).forEach((p) => estornarPagamento(p.id));
          toast("Pagamentos estornados.");
        }
        modal.fechar();
        if (aoMudar) aoMudar();
        return;
      }

      if (op === "parcial" || op === "pago") {
        if (vAtual.saldo < 0.005) {
          toast("Pedido já está quitado. Para corrigir, estorne primeiro.", "erro");
          return;
        }
        modal.fechar();
        abrirReceberPagamento(idVenda, aoMudar, op === "pago" ? "pago" : "parcial");
      }
    }));
  }

  const modal = abrirModal(`Pagamento — pedido #${esc(idVenda)}`, corpo, { classe: "modal-pequeno" });
  render();
}

/* Modal de recebimento: valor (já sugere o saldo), forma e, se sobrar
   saldo, uma nova data de vencimento. */
function abrirReceberPagamento(idVenda, aoMudar, modo) {
  const v = agruparVendas(App.db.vendas).find((x) => x.id_venda === idVenda);
  if (!v) return;
  const valorDefault = modo === "parcial" ? "" : v.saldo.toFixed(2);
  const corpo = document.createElement("div");
  corpo.innerHTML = `
    <form class="formulario" id="form-receber">
      <p class="suave" style="margin:0 0 4px">Saldo a receber: <strong>${dinheiro(v.saldo)}</strong></p>
      <label class="rotulo">Valor recebido
        <input class="campo campo-grande" name="valor" type="number" min="0" step="any" inputmode="decimal" value="${valorDefault}" placeholder="${modo === "parcial" ? "Digite o valor recebido" : ""}" required>
      </label>
      <label class="rotulo">Forma de pagamento
        <select class="campo" name="forma">
          ${CONFIG.formasPagamento.filter((f) => f !== CONFIG.formaPrazo).map((f) => `<option>${esc(f)}</option>`).join("")}
        </select>
      </label>
      <label class="rotulo">Se sobrar saldo, pagar até
        <input class="campo" name="vencimento" type="date" value="${esc(v.data_vencimento || "")}">
      </label>
      <button type="submit" class="btn btn-primario btn-cheio" style="margin-top:8px">Confirmar recebimento</button>
    </form>`;
  const modal = abrirModal("Receber pagamento", corpo, { classe: "modal-pequeno" });
  $("#form-receber", corpo).addEventListener("submit", (e) => {
    e.preventDefault();
    const dados = new FormData(e.target);
    const atual = agruparVendas(App.db.vendas).find((x) => x.id_venda === idVenda);
    let valor = numero(dados.get("valor"));
    if (valor <= 0) { toast("Informe um valor maior que zero.", "erro"); return; }
    if (valor > atual.saldo + 0.005) valor = atual.saldo; // não recebe mais que o saldo
    const restante = atual.saldo - valor;
    const novoVenc = restante > 0.005 ? String(dados.get("vencimento") || "") : "";
    registrarPagamento(idVenda, { valor, forma: String(dados.get("forma")), novoVencimento: novoVenc });
    toast("Pagamento registrado!");
    modal.fechar();
    if (aoMudar) aoMudar();
  });
}

/* ---------------- editar pedido ---------------- */

function abrirEditarVenda(idVenda, aoMudar) {
  const vendaAgrupada = agruparVendas(App.db.vendas).find(v => v.id_venda === idVenda);
  if (!vendaAgrupada) return;

  let editItens = vendaAgrupada.itens.map(i => ({
    id: i.id,
    produto_id: i.produto_id,
    produto_nome: i.produto_nome,
    quantidade: numero(i.quantidade),
    preco_unit: numero(i.preco_unit),
    subtotal: numero(i.subtotal),
    item_pronto: i.item_pronto || "",
  }));

  const dataLocal = new Date(vendaAgrupada.data).toISOString().slice(0, 16);

  const corpo = document.createElement("div");
  corpo.innerHTML = `
    <form class="formulario" id="form-editar-venda">
      <label class="rotulo">Data
        <input class="campo" name="data" type="datetime-local" value="${esc(dataLocal)}" required>
      </label>
      <label class="rotulo">Data de entrega
        <input class="campo" name="data_entrega" type="date" value="${esc(vendaAgrupada.data_entrega || "")}">
      </label>
      <label class="rotulo">Cliente
        <input class="campo" name="cliente_nome" list="edit-lista-clientes" value="${esc(vendaAgrupada.cliente_nome || "")}" autocomplete="off">
        <datalist id="edit-lista-clientes">
          ${App.db.clientes.map(c => `<option value="${esc(c.nome)}">`).join("")}
        </datalist>
      </label>
      <label class="rotulo">Forma de pagamento
        <select class="campo" name="pagamento">
          ${CONFIG.formasPagamento.map(f => `<option ${f === vendaAgrupada.pagamento ? "selected" : ""}>${esc(f)}</option>`).join("")}
        </select>
      </label>
      <label class="rotulo">Pagar até (venda a prazo)
        <input class="campo" name="data_vencimento" type="date" value="${esc(vendaAgrupada.data_vencimento || "")}">
      </label>
      <label class="rotulo">Observações
        <input class="campo" name="entrega" value="${esc(vendaAgrupada.entrega || "")}">
      </label>
      <div class="posicao-relativa" style="margin-bottom:6px">
        <input class="campo-busca" id="edit-pdv-busca" placeholder="Adicionar produto…" autocomplete="off">
        <div id="edit-pdv-sugestoes" class="sugestoes oculto"></div>
      </div>
      <div id="edit-pdv-itens" class="pdv-itens" style="margin-bottom:10px"></div>
      <div class="pdv-total"><span>Total</span><strong id="edit-pdv-total">${dinheiro(vendaAgrupada.total)}</strong></div>
      <div class="venda-stats" id="edit-financeiro">
        <div class="venda-stat-linha"><span>Custo dos insumos</span><span id="edit-custo">—</span></div>
        <div class="venda-stat-linha lucro"><span>Lucro</span><span id="edit-lucro">—</span></div>
      </div>
      <div class="linha-botoes" style="margin-top:14px">
        <button type="submit" class="btn btn-primario">Salvar alterações</button>
      </div>
    </form>`;

  const modal = abrirModal(`Editar pedido #${esc(idVenda)}`, corpo);

  function atualizarFinanceiro() {
    const total = editItens.reduce((s, i) => s + i.subtotal, 0);
    $("#edit-pdv-total", corpo).textContent = dinheiro(total);
    const custo = editItens.reduce((c, item) => {
      const produto = App.db.produtos.find(p => p.id === item.produto_id);
      return c + (produto?.composicao || []).reduce((cc, comp) => {
        const insumo = App.db.insumos.find(i => i.id === comp.id_insumo);
        return cc + (insumo ? numero(insumo.custo) * numero(comp.quantidade) * numero(item.quantidade) : 0);
      }, 0);
    }, 0);
    const lucro = total - custo;
    const margem = total > 0 ? Math.round((lucro / total) * 100) : 0;
    $("#edit-custo", corpo).textContent = dinheiro(custo);
    $("#edit-lucro", corpo).textContent = `${dinheiro(lucro)} (${margem}%)`;
  }

  function renderEditItens() {
    const area = $("#edit-pdv-itens", corpo);
    area.innerHTML = editItens.length
      ? editItens.map((item, i) => `
          <div class="pdv-item" data-indice="${i}">
            <span class="pdv-item-nome">${esc(item.produto_nome)}</span>
            <input type="number" min="0" step="any" inputmode="decimal" value="${item.quantidade}" data-campo="quantidade" aria-label="Quantidade">
            <input type="number" min="0" step="any" inputmode="decimal" value="${item.preco_unit}" data-campo="preco_unit" aria-label="Preço">
            <span class="pdv-item-sub">${dinheiro(item.subtotal)}</span>
            <button type="button" class="pdv-remover" aria-label="Remover">&times;</button>
          </div>`).join("")
      : `<p class="vazio">Nenhum item.</p>`;
    atualizarFinanceiro();
  }
  renderEditItens();

  const editBusca = $("#edit-pdv-busca", corpo);
  const editSugestoes = $("#edit-pdv-sugestoes", corpo);
  editBusca.addEventListener("input", () => {
    const texto = editBusca.value.trim();
    if (!texto) { editSugestoes.classList.add("oculto"); return; }
    const matches = App.db.produtos.filter(p => ehAtivo(p) && contemTexto(p.nome, texto)).slice(0, 8);
    if (!matches.length) { editSugestoes.classList.add("oculto"); return; }
    editSugestoes.innerHTML = matches.map(p => `
      <button type="button" class="sugestao" data-id="${esc(p.id)}">
        <span>${esc(p.nome)}</span><small>${dinheiro(p.preco)}</small>
      </button>`).join("");
    editSugestoes.classList.remove("oculto");
  });
  editBusca.addEventListener("blur", () => setTimeout(() => editSugestoes.classList.add("oculto"), 150));
  editSugestoes.addEventListener("click", e => {
    const btn = e.target.closest(".sugestao[data-id]");
    if (!btn) return;
    const p = App.db.produtos.find(p => p.id === btn.dataset.id);
    if (!p) return;
    editItens.push({ produto_id: p.id, produto_nome: p.nome, quantidade: 1, preco_unit: numero(p.preco), subtotal: numero(p.preco), item_pronto: "" });
    editBusca.value = "";
    editSugestoes.classList.add("oculto");
    renderEditItens();
  });

  $("#edit-pdv-itens", corpo).addEventListener("input", e => {
    const linha = e.target.closest(".pdv-item");
    const campo = e.target.dataset.campo;
    if (!linha || !campo) return;
    const item = editItens[Number(linha.dataset.indice)];
    item[campo] = numero(e.target.value);
    item.subtotal = numero(item.quantidade) * numero(item.preco_unit);
    $(".pdv-item-sub", linha).textContent = dinheiro(item.subtotal);
    atualizarFinanceiro();
  });

  $("#edit-pdv-itens", corpo).addEventListener("click", e => {
    if (!e.target.closest(".pdv-remover")) return;
    const linha = e.target.closest(".pdv-item");
    editItens.splice(Number(linha.dataset.indice), 1);
    renderEditItens();
  });

  $("#form-editar-venda", corpo).addEventListener("submit", e => {
    e.preventDefault();
    if (!editItens.length) { toast("Adicione ao menos um item.", "erro"); return; }
    const dados = new FormData(e.target);
    const novaData = new Date(dados.get("data")).toISOString();
    const nomeCliente = String(dados.get("cliente_nome")).trim();
    const clienteCadastrado = App.db.clientes.find(c => semAcentos(c.nome) === semAcentos(nomeCliente));
    const ativoAgora = contaComoVenda(vendaAgrupada.status_producao);

    // Reverter baixa original (só se o pedido contava como venda)
    if (ativoAgora && revertirBaixaVenda(vendaAgrupada)) salvarTabela("insumos");

    // Substituir linhas da venda preservando etapa/pagamento/tipo
    App.db.vendas = App.db.vendas.filter(v => (v.id_venda || v.id) !== idVenda);
    editItens.forEach((item, idx) => {
      App.db.vendas.push({
        id: `${idVenda}-${idx + 1}`,
        id_venda: idVenda,
        tipo: vendaAgrupada.tipo,
        data: novaData,
        data_entrega: String(dados.get("data_entrega") || ""),
        data_vencimento: String(dados.get("data_vencimento") || ""),
        cliente_id: clienteCadastrado?.id || "",
        cliente_nome: nomeCliente,
        produto_id: item.produto_id,
        produto_nome: item.produto_nome,
        quantidade: numero(item.quantidade),
        preco_unit: numero(item.preco_unit),
        subtotal: numero(item.subtotal),
        item_pronto: item.item_pronto || "",
        pagamento: String(dados.get("pagamento")),
        status_pagamento: vendaAgrupada.status_pagamento,
        valor_pago: vendaAgrupada.valor_pago || "",
        status_producao: vendaAgrupada.status_producao,
        status: vendaAgrupada.itens[0]?.status || "Pendente",
        arquivado: vendaAgrupada.arquivado ? "sim" : "",
        entrega: String(dados.get("entrega")).trim(),
        observacoes: "",
        criado_por: vendaAgrupada.criado_por || App.usuario.usuario,
        criado_em: vendaAgrupada.itens[0]?.criado_em || novaData,
      });
    });

    // Aplicar nova baixa (só se contava como venda)
    if (ativoAgora) {
      const vNova = agruparVendas(App.db.vendas).find(v => v.id_venda === idVenda);
      if (aplicarBaixaVenda(vNova)) salvarTabela("insumos");
    }
    // Recalcula a situação de pagamento (o total pode ter mudado).
    sincronizarPagamentoNaVenda(idVenda);
    salvarTabela("vendas");
    toast("Pedido atualizado.");
    modal.fechar();
    if (aoMudar) aoMudar();
  });
}

/* ---------------- PDV (novo pedido / orçamento) ---------------- */

function renderPdv(el, opcoes = {}) {
  App.editando = true; // bloqueia atualização automática da tela durante o pedido
  const tipo = opcoes.tipo === "Orçamento" ? "Orçamento" : "Pedido";
  const ehOrcamento = tipo === "Orçamento";

  const recuperada = pdvItens.length > 0;

  el.innerHTML = `
    <div class="pagina pdv">
      <div class="pdv-topo">
        <button type="button" class="btn btn-secundario" id="pdv-voltar">‹ Pedidos</button>
        <span class="pdv-dica">${ehOrcamento ? "Novo orçamento" : "Novo pedido"}</span>
      </div>

      <div class="bloco">
        <div class="bloco-passo"><span class="passo-num">1</span> Cliente</div>
        <div id="pdv-cliente-area"></div>
      </div>

      <div class="bloco" id="pdv-bloco-produtos">
        <div class="bloco-passo"><span class="passo-num">2</span> Produtos</div>
        <div class="posicao-relativa">
          <input id="pdv-busca" class="campo campo-grande" placeholder="Digite o nome do produto…" autocomplete="off">
          <div id="pdv-sugestoes" class="sugestoes oculto"></div>
        </div>
        <div class="linha-qtd">
          <div>
            <label class="rotulo" for="pdv-qtd">Quantidade</label>
            <input id="pdv-qtd" class="campo campo-grande" type="number" min="0" step="any" value="1" inputmode="decimal">
          </div>
          <button type="button" class="btn btn-primario" id="pdv-adicionar">Adicionar</button>
        </div>
        <div id="pdv-itens" class="pdv-itens"></div>
        <div class="pdv-total"><span>Total</span><strong id="pdv-total">R$ 0,00</strong></div>
      </div>

      <div class="bloco">
        <div class="bloco-passo"><span class="passo-num">3</span> Pagamento e entrega</div>
        <label class="rotulo" for="pdv-pagamento">Forma de pagamento</label>
        <select id="pdv-pagamento" class="campo">
          ${CONFIG.formasPagamento.map((f) => `<option>${esc(f)}</option>`).join("")}
        </select>
        <label class="rotulo oculto" id="pdv-prazo-area" for="pdv-vencimento">Pagar até
          <input id="pdv-vencimento" class="campo" type="date">
        </label>
        <div id="pdv-recebido-area">
          <label class="rotulo" for="pdv-recebido">Valor já recebido <span class="suave">(opcional)</span>
            <input id="pdv-recebido" class="campo" type="number" min="0" step="any" inputmode="decimal" placeholder="0,00">
          </label>
          <label class="rotulo oculto" id="pdv-recebido-forma-area">Recebido via
            <select id="pdv-recebido-forma" class="campo">
              ${CONFIG.formasPagamento.filter((f) => f !== CONFIG.formaPrazo).map((f) => `<option>${esc(f)}</option>`).join("")}
            </select>
          </label>
        </div>
        <label class="rotulo" for="pdv-entrega-data">Data de entrega
          <input id="pdv-entrega-data" class="campo" type="date">
        </label>
        <label class="rotulo" for="pdv-obs">Observações</label>
        <input id="pdv-obs" class="campo" placeholder="Opcional" autocomplete="off">
        <button type="button" class="btn btn-primario btn-grande btn-cheio" id="pdv-finalizar" style="margin-top:6px">
          ${ehOrcamento ? "Salvar orçamento" : "Salvar pedido"}
        </button>
      </div>
    </div>`;

  const busca = $("#pdv-busca", el);
  const qtd = $("#pdv-qtd", el);
  const sugestoesEl = $("#pdv-sugestoes", el);
  const pagamento = $("#pdv-pagamento", el);

  /* ---- seletor de cliente (busca sólida + cadastro rápido) ---- */
  let clienteSel = null; // null = nenhum; pode ser CLIENTE_AVISTA ou um cliente real

  function renderClienteArea() {
    const area = $("#pdv-cliente-area", el);
    if (clienteSel) {
      const tel = clienteSel.telefone ? ` · ${esc(clienteSel.telefone)}` : "";
      area.innerHTML = `
        <div class="cliente-chip ${clienteSel.avista ? "avista" : ""}">
          <span class="cliente-chip-nome">✓ ${esc(clienteSel.nome)}${tel}</span>
          <button type="button" class="cliente-chip-x" id="pdv-cliente-trocar" aria-label="Trocar cliente">&times;</button>
        </div>`;
      $("#pdv-cliente-trocar", el).addEventListener("click", () => { clienteSel = null; renderClienteArea(); atualizarAvisoPagamento(); });
      return;
    }
    area.innerHTML = `
      <input id="pdv-cliente-busca" class="campo campo-grande" placeholder="Buscar cliente…" autocomplete="off">
      <div id="pdv-cliente-sugestoes" class="sugestoes-inline"></div>
      <button type="button" class="btn btn-secundario btn-cheio" id="pdv-cliente-novo" style="margin-top:8px">+ Cadastrar novo cliente</button>`;
    const cbusca = $("#pdv-cliente-busca", el);
    const csug = $("#pdv-cliente-sugestoes", el);
    function listar() {
      const texto = cbusca.value.trim();
      const reais = App.db.clientes
        .filter((c) => contemTexto(c.nome, texto) || String(c.telefone || "").includes(texto))
        .sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
      // "Venda à vista" é sempre a primeira opção da lista.
      const itens = [CLIENTE_AVISTA, ...reais];
      csug.innerHTML = itens.map((c) => `
        <button type="button" class="sugestao ${c.avista ? "sugestao-avista" : ""}" data-id="${esc(c.id)}">
          <span>${esc(c.nome)}</span><small>${c.avista ? "sem identificar" : esc(c.telefone || "sem telefone")}</small>
        </button>`).join("");
    }
    cbusca.addEventListener("input", listar);
    csug.addEventListener("click", (e) => {
      const btn = e.target.closest(".sugestao[data-id]");
      if (!btn) return;
      clienteSel = btn.dataset.id === CLIENTE_AVISTA.id
        ? CLIENTE_AVISTA
        : App.db.clientes.find((c) => c.id === btn.dataset.id);
      renderClienteArea();
      atualizarAvisoPagamento();
    });
    $("#pdv-cliente-novo", el).addEventListener("click", () => {
      formCliente(null, (novo) => {
        if (novo) { clienteSel = novo; renderClienteArea(); atualizarAvisoPagamento(); }
      });
    });
    listar();
    cbusca.focus();
  }

  /* ---- forma de pagamento: prazo mostra vencimento; recebi já recebido mostra forma ---- */
  function ehPrazo() { return pagamento.value === CONFIG.formaPrazo; }
  function atualizarAvisoPagamento() {
    $("#pdv-prazo-area", el).classList.toggle("oculto", !ehPrazo());
    // Para orçamentos não há recebimento; para à-vista a forma já está selecionada acima.
    const recebidoArea = $("#pdv-recebido-area", el);
    if (recebidoArea) recebidoArea.classList.toggle("oculto", ehOrcamento);
    atualizarRecebidoForma();
  }
  function atualizarRecebidoForma() {
    const val = numero($("#pdv-recebido", el)?.value || "0");
    const formaArea = $("#pdv-recebido-forma-area", el);
    // Forma separada só é necessária em vendas a prazo (a forma principal é "Venda a prazo")
    if (formaArea) formaArea.classList.toggle("oculto", val <= 0 || !ehPrazo());
  }
  pagamento.addEventListener("change", atualizarAvisoPagamento);
  $("#pdv-recebido", el)?.addEventListener("input", atualizarRecebidoForma);
  renderClienteArea();
  atualizarAvisoPagamento();
  atualizarRecebidoForma();

  let sugestoes = [];
  let selecionada = 0;
  let produtoEscolhido = null;

  function produtosAtivos() {
    return App.db.produtos.filter(ehAtivo);
  }

  function atualizarSugestoes() {
    const texto = busca.value.trim();
    produtoEscolhido = null;
    if (!texto) {
      sugestoes = [];
      sugestoesEl.classList.add("oculto");
      return;
    }
    sugestoes = produtosAtivos().filter((p) => contemTexto(p.nome, texto)).slice(0, 8);
    selecionada = 0;
    if (!sugestoes.length) {
      sugestoesEl.innerHTML = `<div class="sugestao"><small>Nenhum produto encontrado. Cadastre em "Produtos".</small></div>`;
      sugestoesEl.classList.remove("oculto");
      return;
    }
    sugestoesEl.innerHTML = sugestoes.map((p, i) => `
      <button type="button" class="sugestao ${i === selecionada ? "selecionada" : ""}" data-indice="${i}">
        <span>${esc(p.nome)}</span><small>${dinheiro(p.preco)}</small>
      </button>`).join("");
    sugestoesEl.classList.remove("oculto");
  }

  function marcarSelecionada() {
    $$(".sugestao", sugestoesEl).forEach((b, i) => b.classList.toggle("selecionada", i === selecionada));
  }

  function escolherProduto(p) {
    produtoEscolhido = p;
    busca.value = p.nome;
    sugestoesEl.classList.add("oculto");
    qtd.focus();
    qtd.select();
  }

  function atualizarItens() {
    const area = $("#pdv-itens", el);
    area.innerHTML = pdvItens.length
      ? pdvItens.map((item, i) => `
          <div class="pdv-item" data-indice="${i}">
            <span class="pdv-item-nome">${esc(item.produto_nome)}</span>
            <input type="number" min="0" step="any" inputmode="decimal" value="${item.quantidade}" data-campo="quantidade" aria-label="Quantidade">
            <input type="number" min="0" step="any" inputmode="decimal" value="${item.preco_unit}" data-campo="preco_unit" aria-label="Preço unitário">
            <span class="pdv-item-sub">${dinheiro(item.subtotal)}</span>
            <button type="button" class="pdv-remover" aria-label="Remover">&times;</button>
          </div>`).join("")
      : `<p class="vazio">Nenhum item ainda. Busque um produto acima.</p>`;
    $("#pdv-total", el).textContent = dinheiro(pdvItens.reduce((s, i) => s + i.subtotal, 0));
  }

  function adicionarItem() {
    let produto = produtoEscolhido;
    if (!produto && sugestoes.length) produto = sugestoes[selecionada];
    if (!produto) {
      toast("Escolha um produto da lista.", "erro");
      busca.focus();
      return;
    }
    const quantidade = numero(qtd.value) > 0 ? numero(qtd.value) : 1;
    const preco = numero(produto.preco);
    pdvItens.push({
      produto_id: produto.id,
      produto_nome: produto.nome,
      quantidade,
      preco_unit: preco,
      subtotal: quantidade * preco,
    });
    produtoEscolhido = null;
    busca.value = "";
    qtd.value = "1";
    sugestoesEl.classList.add("oculto");
    atualizarItens();
    busca.focus();
  }

  /* --- eventos do fluxo --- */

  busca.addEventListener("input", atualizarSugestoes);
  busca.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && sugestoes.length) {
      e.preventDefault();
      selecionada = (selecionada + 1) % sugestoes.length;
      marcarSelecionada();
    } else if (e.key === "ArrowUp" && sugestoes.length) {
      e.preventDefault();
      selecionada = (selecionada - 1 + sugestoes.length) % sugestoes.length;
      marcarSelecionada();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (busca.value.trim() === "" && pdvItens.length) {
        pagamento.focus();
      } else if (sugestoes.length) {
        escolherProduto(sugestoes[selecionada]);
      }
    }
  });

  sugestoesEl.addEventListener("click", (e) => {
    const botao = e.target.closest(".sugestao[data-indice]");
    if (botao) escolherProduto(sugestoes[Number(botao.dataset.indice)]);
  });

  qtd.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); adicionarItem(); }
  });
  $("#pdv-adicionar", el).addEventListener("click", adicionarItem);

  $("#pdv-itens", el).addEventListener("input", (e) => {
    const linha = e.target.closest(".pdv-item");
    const campo = e.target.dataset.campo;
    if (!linha || !campo) return;
    const item = pdvItens[Number(linha.dataset.indice)];
    item[campo] = numero(e.target.value);
    item.subtotal = numero(item.quantidade) * numero(item.preco_unit);
    $(".pdv-item-sub", linha).textContent = dinheiro(item.subtotal);
    $("#pdv-total", el).textContent = dinheiro(pdvItens.reduce((s, i) => s + i.subtotal, 0));
  });

  $("#pdv-itens", el).addEventListener("click", (e) => {
    if (!e.target.closest(".pdv-remover")) return;
    const linha = e.target.closest(".pdv-item");
    pdvItens.splice(Number(linha.dataset.indice), 1);
    atualizarItens();
  });

  $("#pdv-finalizar", el).addEventListener("click", finalizar);

  $("#pdv-voltar", el).addEventListener("click", async () => {
    if (pdvItens.length) {
      const ok = await confirmar("Descartar o que está em andamento?", { perigo: true, botao: "Descartar" });
      if (!ok) return;
      pdvItens = [];
    }
    App.editando = false;
    renderListaPedidos(el);
  });

  function finalizar() {
    if (!pdvItens.length) {
      toast("Adicione ao menos um produto.", "erro");
      busca.focus();
      return;
    }
    if (!clienteSel) {
      toast("Escolha um cliente (ou \"Venda à vista\").", "erro");
      $("#pdv-cliente-busca", el)?.focus();
      return;
    }
    const formaPagamento = pagamento.value;
    const aPrazo = ehPrazo() && !ehOrcamento;
    const dataEntrega = $("#pdv-entrega-data", el).value;
    const vencimento = $("#pdv-vencimento", el).value;
    const obs = $("#pdv-obs", el).value.trim();
    const total = pdvItens.reduce((s, i) => s + i.subtotal, 0);
    const recebidoInput = numero($("#pdv-recebido", el)?.value || "0");
    const recebido = Math.min(recebidoInput, total);
    const formaRecebido = ehPrazo()
      ? ($("#pdv-recebido-forma", el)?.value || "Dinheiro")
      : formaPagamento;

    // Regras do fiado: exige cliente real e data de vencimento.
    if (aPrazo && clienteSel.avista) {
      toast("Venda a prazo exige um cliente identificado.", "erro");
      return;
    }
    if (aPrazo && !vencimento) {
      toast("Informe a data limite para o pagamento (Pagar até).", "erro");
      $("#pdv-vencimento", el)?.focus();
      return;
    }

    const corpo = document.createElement("div");
    corpo.innerHTML = `
      <div class="resumo-venda">
        ${pdvItens.map((i) => `
          <div class="linha"><span>${esc(i.quantidade)}x ${esc(i.produto_nome)}</span><span>${dinheiro(i.subtotal)}</span></div>`).join("")}
        <div class="linha total"><span>Total</span><span>${dinheiro(total)}</span></div>
        <div class="linha"><span class="suave">Tipo</span><span>${ehOrcamento ? "Orçamento" : "Pedido"}</span></div>
        <div class="linha"><span class="suave">Cliente</span><span>${esc(clienteSel.nome)}</span></div>
        ${dataEntrega ? `<div class="linha"><span class="suave">Entrega</span><span>${dataCurta(dataEntrega)}</span></div>` : ""}
        <div class="linha"><span class="suave">Pagamento</span><span>${esc(formaPagamento)}</span></div>
        ${aPrazo ? `<div class="linha"><span class="suave">Pagar até</span><span>${dataCurta(vencimento)}</span></div>` : ""}
        ${!ehOrcamento && recebido > 0 ? `<div class="linha"><span class="suave">Já recebido</span><span>${dinheiro(recebido)} via ${esc(formaRecebido)} → caixa</span></div>` : ""}
        ${!ehOrcamento && recebido <= 0 ? `<div class="linha"><span class="suave">Caixa</span><span>nada recebido ainda</span></div>` : ""}
      </div>
      <div class="linha-botoes">
        <button type="button" class="btn btn-secundario" data-acao="voltar">Voltar</button>
        <button type="button" class="btn btn-primario" data-acao="confirmar">${ehOrcamento ? "Salvar orçamento" : "Salvar pedido"}</button>
      </div>`;

    const modal = abrirModal(ehOrcamento ? "Confirmar orçamento" : "Confirmar pedido", corpo, { classe: "modal-pequeno" });
    corpo.querySelector('[data-acao="confirmar"]').focus();

    corpo.addEventListener("click", (e) => {
      const acao = e.target.closest("button")?.dataset.acao;
      if (acao === "voltar") modal.fechar();
      if (acao === "confirmar") {
        const idVenda = gerarIdVenda();
        const agora = new Date().toISOString();
        const statusProducao = ehOrcamento ? "Orçamento" : "Pedido feito";
        const statusCompat = "Pendente";
        pdvItens.forEach((item, idx) => {
          App.db.vendas.push({
            id: `${idVenda}-${idx + 1}`,
            id_venda: idVenda,
            tipo: tipo,
            data: agora,
            data_entrega: dataEntrega || "",
            data_vencimento: aPrazo ? vencimento : "",
            cliente_id: clienteSel.id,
            cliente_nome: clienteSel.nome,
            produto_id: item.produto_id,
            produto_nome: item.produto_nome,
            quantidade: numero(item.quantidade),
            preco_unit: numero(item.preco_unit),
            subtotal: numero(item.subtotal),
            item_pronto: "",
            pagamento: formaPagamento,
            status_pagamento: "Não pago",
            valor_pago: "",
            status_producao: statusProducao,
            status: statusCompat,
            arquivado: "",
            entrega: obs,
            observacoes: "",
            criado_por: App.usuario.usuario,
            criado_em: agora,
          });
        });
        salvarTabela("vendas");

        // Baixa de estoque só quando o pedido já vale como venda (não orçamento).
        if (contaComoVenda(statusProducao)) {
          const vNova = agruparVendas(App.db.vendas).find(v => v.id_venda === idVenda);
          if (aplicarBaixaVenda(vNova)) salvarTabela("insumos");
        }

        // Registra o valor já recebido (se informado), independente de ser prazo ou à vista.
        if (!ehOrcamento && recebido > 0) {
          registrarPagamento(idVenda, { valor: recebido, forma: formaRecebido });
        }

        pdvItens = [];
        modal.fechar();
        toast(ehOrcamento ? "Orçamento salvo!" : "Pedido salvo!");
        App.editando = false;
        // Oferece envio pelo WhatsApp logo após salvar.
        abrirEnvioWhatsapp(idVenda);
        renderListaPedidos(el);
      }
    });
  }

  /* --- estado inicial --- */
  atualizarItens();
  if (recuperada) toast("Itens em andamento recuperados.");
  // Começa pelo cliente (passo 1); se já houver cliente, vai ao produto.
  const clienteBuscaEl = $("#pdv-cliente-busca", el);
  if (clienteBuscaEl) clienteBuscaEl.focus(); else busca.focus();
}
