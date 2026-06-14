"use strict";

/* ============================================================
   Módulo: Caixa (controle financeiro)
   - Saldos separados: dinheiro vivo x banco.
   - Movimentações (entradas, saídas, ajustes) com filtros.
   - Relatório por dia / semana / mês / período personalizado.
   - Saída manual (despesa, pró-labore, retirada...).
   - Ajuste de caixa (escondido, com justificativa obrigatória).
   Tudo lê e grava a tabela "lancamentos" da planilha.
   ============================================================ */

let caixaAba = "resumo";
let caixaMovPeriodo = "mes";
let caixaMovTipo = "todos";
let caixaRelTipo = "mes";
let caixaRelDe = "";
let caixaRelAte = "";

registrarModulo({
  id: "caixa",
  titulo: "Caixa",
  rotulo: "Caixa",
  icone: "caixa",
  financeiro: true,
  render(el) { renderCaixa(el); },
});

/* ---------------- períodos ---------------- */

function inicioDoDia(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function fimDoDia(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }

function intervaloPeriodo(tipo) {
  const hoje = new Date();
  if (tipo === "dia") return { ini: inicioDoDia(hoje), fim: fimDoDia(hoje) };
  if (tipo === "semana") {
    const dow = (hoje.getDay() + 6) % 7; // segunda = 0
    const ini = inicioDoDia(hoje); ini.setDate(ini.getDate() - dow);
    const fim = fimDoDia(ini); fim.setDate(fim.getDate() + 6);
    return { ini, fim };
  }
  if (tipo === "mes") {
    const ini = inicioDoDia(hoje); ini.setDate(1);
    const fim = new Date(ini); fim.setMonth(fim.getMonth() + 1, 0); fim.setHours(23, 59, 59, 999);
    return { ini, fim };
  }
  if (tipo === "personalizado") {
    const ini = caixaRelDe ? inicioDoDia(parseData(caixaRelDe)) : inicioDoDia(new Date(0));
    const fim = caixaRelAte ? fimDoDia(parseData(caixaRelAte)) : fimDoDia(new Date());
    return { ini, fim };
  }
  return { ini: new Date(0), fim: fimDoDia(new Date()) }; // tudo
}

function dentro(dataIso, ini, fim) {
  const d = new Date(dataIso);
  return !isNaN(d) && d >= ini && d <= fim;
}

function rotuloPeriodo(tipo) {
  return { dia: "Hoje", semana: "Esta semana", mes: "Este mês", tudo: "Tudo", personalizado: "Período" }[tipo] || tipo;
}

/* ---------------- tela principal ---------------- */

function renderCaixa(el) {
  const refresh = () => renderCaixa(el);
  const s = saldosCaixa();

  el.innerHTML = `
    <div class="pagina">
      <div class="caixa-saldos">
        <div class="saldo-card dinheiro">
          <small>Dinheiro vivo</small>
          <strong>${dinheiro(s.dinheiro)}</strong>
        </div>
        <div class="saldo-card banco">
          <small>Banco</small>
          <strong>${dinheiro(s.banco)}</strong>
        </div>
        <div class="saldo-card total">
          <small>Total em caixa</small>
          <strong>${dinheiro(s.total)}</strong>
        </div>
      </div>

      <div class="chips caixa-abas">
        <button type="button" class="chip ${caixaAba === "resumo" ? "ativo" : ""}" data-aba="resumo">Resumo</button>
        <button type="button" class="chip ${caixaAba === "mov" ? "ativo" : ""}" data-aba="mov">Movimentações</button>
        <button type="button" class="chip ${caixaAba === "rel" ? "ativo" : ""}" data-aba="rel">Relatório</button>
      </div>

      <div id="caixa-conteudo"></div>
    </div>`;

  $(".caixa-abas", el).addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    caixaAba = chip.dataset.aba;
    renderCaixa(el);
  });

  const cont = $("#caixa-conteudo", el);
  if (caixaAba === "resumo") renderResumo(cont, refresh);
  else if (caixaAba === "mov") renderMovimentacoes(cont, refresh);
  else renderRelatorio(cont, refresh);
}

/* ---------------- aba: resumo ---------------- */

function renderResumo(cont, refresh) {
  const mes = intervaloPeriodo("mes");
  const dia = intervaloPeriodo("dia");
  const ent = (ini, fim) => App.db.lancamentos
    .filter((l) => l.tipo === "entrada" && dentro(l.data, ini, fim))
    .reduce((acc, l) => acc + numero(l.valor), 0);
  const sai = (ini, fim) => App.db.lancamentos
    .filter((l) => l.tipo === "saida" && dentro(l.data, ini, fim))
    .reduce((acc, l) => acc + numero(l.valor), 0);

  cont.innerHTML = `
    <div class="linha-acoes">
      <button type="button" class="btn btn-primario btn-grande" id="caixa-nova-saida">− Registrar saída</button>
      <button type="button" class="btn btn-secundario btn-grande caixa-mais" id="caixa-mais" aria-label="Mais opções">⋯</button>
    </div>
    <div class="grade-cartoes">
      <div class="cartao-stat"><small>Entradas hoje</small><strong class="verde">${dinheiro(ent(dia.ini, dia.fim))}</strong></div>
      <div class="cartao-stat"><small>Saídas hoje</small><strong class="vermelho">${dinheiro(sai(dia.ini, dia.fim))}</strong></div>
      <div class="cartao-stat"><small>Entradas no mês</small><strong class="verde">${dinheiro(ent(mes.ini, mes.fim))}</strong></div>
      <div class="cartao-stat"><small>Saídas no mês</small><strong class="vermelho">${dinheiro(sai(mes.ini, mes.fim))}</strong></div>
    </div>
    <p class="caixa-dica">As vendas à vista entram automaticamente no caixa. Os recebimentos de vendas a prazo entram pela tela de Cobranças.</p>`;

  $("#caixa-nova-saida", cont).addEventListener("click", () => abrirNovaSaida(refresh));
  $("#caixa-mais", cont).addEventListener("click", () => abrirMenuCaixa(refresh));
}

function abrirMenuCaixa(refresh) {
  const corpo = document.createElement("div");
  corpo.innerHTML = `
    <button type="button" class="item-menu" data-acao="ajuste">${ICONES.config}<span>Ajuste de caixa</span></button>`;
  const modal = abrirModal("Mais opções", corpo, { classe: "modal-menu" });
  corpo.addEventListener("click", (e) => {
    const botao = e.target.closest(".item-menu");
    if (!botao) return;
    modal.fechar();
    if (botao.dataset.acao === "ajuste") abrirAjusteCaixa(refresh);
  });
}

/* ---------------- nova saída ---------------- */

function abrirNovaSaida(aoMudar) {
  const corpo = document.createElement("div");
  corpo.innerHTML = `
    <form class="formulario" id="form-saida">
      <label class="rotulo">Valor
        <input class="campo campo-grande" name="valor" type="number" min="0" step="any" inputmode="decimal" required>
      </label>
      <label class="rotulo">Saiu de
        <select class="campo" name="destino">
          <option value="dinheiro">Dinheiro vivo</option>
          <option value="banco">Banco</option>
        </select>
      </label>
      <label class="rotulo">Categoria
        <select class="campo" name="categoria">
          ${CONFIG.categoriasSaida.map((c) => `<option>${esc(c)}</option>`).join("")}
        </select>
      </label>
      <label class="rotulo">Descrição
        <input class="campo" name="descricao" placeholder="Ex.: compra de tinta, conta de luz…" required>
      </label>
      <button type="submit" class="btn btn-primario btn-cheio" style="margin-top:8px">Registrar saída</button>
    </form>`;
  const modal = abrirModal("Registrar saída", corpo, { classe: "modal-pequeno" });
  $("#form-saida", corpo).addEventListener("submit", (e) => {
    e.preventDefault();
    const dados = new FormData(e.target);
    const valor = numero(dados.get("valor"));
    if (valor <= 0) { toast("Informe um valor maior que zero.", "erro"); return; }
    const descricao = String(dados.get("descricao")).trim();
    if (!descricao) { toast("Descreva o motivo da saída.", "erro"); return; }
    registrarSaida({
      valor,
      destino: String(dados.get("destino")),
      categoria: String(dados.get("categoria")),
      descricao,
    });
    toast("Saída registrada.");
    modal.fechar();
    if (aoMudar) aoMudar();
  });
}

/* ---------------- ajuste de caixa (uso raro) ---------------- */

function abrirAjusteCaixa(aoMudar) {
  const s = saldosCaixa();
  const corpo = document.createElement("div");
  corpo.innerHTML = `
    <p class="aviso-ajuste">⚠️ O ajuste serve só para corrigir o caixa quando o valor real contado não bate com o sistema. Use raramente e explique o motivo.</p>
    <form class="formulario" id="form-ajuste">
      <label class="rotulo">Qual caixa?
        <select class="campo" name="destino">
          <option value="dinheiro">Dinheiro vivo (sistema: ${dinheiro(s.dinheiro)})</option>
          <option value="banco">Banco (sistema: ${dinheiro(s.banco)})</option>
        </select>
      </label>
      <label class="rotulo">Saldo real contado agora
        <input class="campo campo-grande" name="saldo" type="number" step="any" inputmode="decimal" required>
      </label>
      <label class="rotulo">Motivo do ajuste (obrigatório)
        <input class="campo" name="motivo" placeholder="Ex.: faltou troco, erro de digitação…" required>
      </label>
      <button type="submit" class="btn btn-perigo btn-cheio" style="margin-top:8px">Confirmar ajuste</button>
    </form>`;
  const modal = abrirModal("Ajuste de caixa", corpo, { classe: "modal-pequeno" });
  $("#form-ajuste", corpo).addEventListener("submit", (e) => {
    e.preventDefault();
    const dados = new FormData(e.target);
    const motivo = String(dados.get("motivo")).trim();
    if (!motivo) { toast("Explique o motivo do ajuste.", "erro"); return; }
    const lanc = ajustarCaixa(String(dados.get("destino")), numero(dados.get("saldo")), motivo, { aoMudar });
    toast(lanc ? "Caixa ajustado." : "O saldo já estava correto.");
    modal.fechar();
  });
}

/* ---------------- aba: movimentações ---------------- */

function renderMovimentacoes(cont, refresh) {
  const { ini, fim } = intervaloPeriodo(caixaMovPeriodo);
  let movs = App.db.lancamentos
    .filter((l) => dentro(l.data, ini, fim))
    .filter((l) => caixaMovTipo === "todos" || l.tipo === caixaMovTipo)
    .slice()
    .sort((a, b) => String(b.data).localeCompare(String(a.data)));

  cont.innerHTML = `
    <div class="caixa-filtros">
      <select class="campo" id="mov-periodo">
        ${["dia", "semana", "mes", "tudo"].map((t) => `<option value="${t}" ${caixaMovPeriodo === t ? "selected" : ""}>${rotuloPeriodo(t)}</option>`).join("")}
      </select>
      <select class="campo" id="mov-tipo">
        <option value="todos" ${caixaMovTipo === "todos" ? "selected" : ""}>Tudo</option>
        <option value="entrada" ${caixaMovTipo === "entrada" ? "selected" : ""}>Entradas</option>
        <option value="saida" ${caixaMovTipo === "saida" ? "selected" : ""}>Saídas</option>
        <option value="ajuste" ${caixaMovTipo === "ajuste" ? "selected" : ""}>Ajustes</option>
      </select>
    </div>
    <div class="lista mov-lista" id="mov-lista">
      ${movs.length ? movs.map(movItemHtml).join("") : `<p class="vazio">Nenhuma movimentação no período.</p>`}
    </div>`;

  $("#mov-periodo", cont).addEventListener("change", (e) => { caixaMovPeriodo = e.target.value; renderMovimentacoes(cont, refresh); });
  $("#mov-tipo", cont).addEventListener("change", (e) => { caixaMovTipo = e.target.value; renderMovimentacoes(cont, refresh); });
  $("#mov-lista", cont).addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-excluir]");
    if (!btn) return;
    const ok = await confirmar("Excluir esta movimentação do caixa?", { perigo: true, botao: "Excluir" });
    if (!ok) return;
    App.db.lancamentos = App.db.lancamentos.filter((l) => l.id !== btn.dataset.excluir);
    salvarTabela("lancamentos");
    toast("Movimentação excluída.");
    if (refresh) refresh();
  });
}

function movItemHtml(l) {
  const valor = efeitoLancamento(l);
  const sinal = valor > 0 ? "+" : valor < 0 ? "−" : "";
  const classe = l.tipo === "entrada" ? "mov-entrada" : l.tipo === "saida" ? "mov-saida" : "mov-ajuste";
  // Movimentações manuais (sem vínculo com venda) podem ser excluídas.
  const manual = !l.id_referencia;
  return `
    <div class="mov-item ${classe}">
      <div class="mov-info">
        <strong>${esc(l.descricao || l.categoria || "—")}</strong>
        <small>${dataHora(l.data)} · ${esc(l.categoria || "")} · ${l.destino === "dinheiro" ? "Dinheiro" : "Banco"}</small>
      </div>
      <div class="mov-lado">
        <strong class="mov-valor">${sinal}${dinheiro(Math.abs(valor))}</strong>
        ${manual ? `<button type="button" class="mov-excluir" data-excluir="${esc(l.id)}" aria-label="Excluir">&times;</button>` : ""}
      </div>
    </div>`;
}

/* ---------------- aba: relatório ---------------- */

function renderRelatorio(cont, refresh) {
  const { ini, fim } = intervaloPeriodo(caixaRelTipo);

  // Faturamento: vendas (que contam como venda) com data no período.
  const vendas = agruparVendas(App.db.vendas)
    .filter((v) => contaComoVenda(v.status_producao) && dentro(v.data, ini, fim));
  const faturamento = vendas.reduce((s, v) => s + v.total, 0);
  const custo = vendas.reduce((s, v) => s + calcularCustoVenda(v), 0);
  const lucro = faturamento - custo;

  // Recebido no período (entradas de venda), separado por destino.
  const entradasVenda = App.db.lancamentos.filter((l) => l.tipo === "entrada" && l.categoria === "Venda" && dentro(l.data, ini, fim));
  const recDinheiro = entradasVenda.filter((l) => l.destino === "dinheiro").reduce((s, l) => s + numero(l.valor), 0);
  const recBanco = entradasVenda.filter((l) => l.destino === "banco").reduce((s, l) => s + numero(l.valor), 0);

  // Saídas por categoria no período.
  const saidas = App.db.lancamentos.filter((l) => l.tipo === "saida" && dentro(l.data, ini, fim));
  const totalSaidas = saidas.reduce((s, l) => s + numero(l.valor), 0);
  const porCategoria = {};
  saidas.forEach((l) => { porCategoria[l.categoria || "Outros"] = (porCategoria[l.categoria || "Outros"] || 0) + numero(l.valor); });

  // A receber: saldo em aberto atual (não depende do período).
  const aReceber = agruparVendas(App.db.vendas)
    .filter((v) => v.status_producao !== "Cancelado" && v.cliente_id !== CLIENTE_AVISTA.id && v.saldo > 0.005)
    .reduce((s, v) => s + v.saldo, 0);

  const margem = faturamento > 0 ? Math.round((lucro / faturamento) * 100) : 0;

  cont.innerHTML = `
    <div class="chips caixa-rel-periodo">
      ${["dia", "semana", "mes", "personalizado"].map((t) =>
        `<button type="button" class="chip ${caixaRelTipo === t ? "ativo" : ""}" data-rel="${t}">${t === "personalizado" ? "Personalizado" : rotuloPeriodo(t)}</button>`).join("")}
    </div>
    ${caixaRelTipo === "personalizado" ? `
      <div class="caixa-personalizado">
        <label class="rotulo">De <input class="campo" type="date" id="rel-de" value="${esc(caixaRelDe)}"></label>
        <label class="rotulo">Até <input class="campo" type="date" id="rel-ate" value="${esc(caixaRelAte)}"></label>
      </div>` : ""}
    <p class="rel-intervalo">${dataCurta(ini.toISOString().slice(0, 10))} a ${dataCurta(fim.toISOString().slice(0, 10))}</p>

    <div class="rel-bloco">
      <div class="rel-linha destaque"><span>Faturamento (vendas)</span><strong>${dinheiro(faturamento)}</strong></div>
      <div class="rel-linha"><span class="suave">${vendas.length} pedido(s) no período</span><span></span></div>
    </div>

    <div class="rel-bloco">
      <div class="rel-linha"><span>Recebido em dinheiro</span><strong class="verde">${dinheiro(recDinheiro)}</strong></div>
      <div class="rel-linha"><span>Recebido no banco</span><strong class="verde">${dinheiro(recBanco)}</strong></div>
      <div class="rel-linha total"><span>Total recebido</span><strong class="verde">${dinheiro(recDinheiro + recBanco)}</strong></div>
    </div>

    <div class="rel-bloco">
      <div class="rel-linha"><span>Saídas no período</span><strong class="vermelho">${dinheiro(totalSaidas)}</strong></div>
      ${Object.keys(porCategoria).length ? Object.entries(porCategoria).map(([cat, val]) =>
        `<div class="rel-linha sub"><span class="suave">${esc(cat)}</span><span>${dinheiro(val)}</span></div>`).join("") : ""}
    </div>

    <div class="rel-bloco">
      <div class="rel-linha"><span>Custo dos insumos</span><span>${dinheiro(custo)}</span></div>
      <div class="rel-linha destaque lucro"><span>Lucro bruto</span><strong>${dinheiro(lucro)} (${margem}%)</strong></div>
    </div>

    <div class="rel-bloco">
      <div class="rel-linha"><span>A receber (em aberto agora)</span><strong class="amarelo">${dinheiro(aReceber)}</strong></div>
    </div>`;

  $(".caixa-rel-periodo", cont).addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    caixaRelTipo = chip.dataset.rel;
    renderRelatorio(cont, refresh);
  });
  $("#rel-de", cont)?.addEventListener("change", (e) => { caixaRelDe = e.target.value; renderRelatorio(cont, refresh); });
  $("#rel-ate", cont)?.addEventListener("change", (e) => { caixaRelAte = e.target.value; renderRelatorio(cont, refresh); });
}
