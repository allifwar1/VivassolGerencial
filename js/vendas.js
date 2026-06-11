"use strict";

/* ============================================================
   Módulo: Vendas
   - Lista de vendas (agrupadas por id_venda) com filtros
   - PDV "Nova venda": no computador o fluxo inteiro anda
     com a tecla Enter; no celular, com toques.
   O carrinho (pdvItens) sobrevive à navegação: se Karen sair
   no meio da venda e voltar, os itens continuam lá.
   ============================================================ */

let pdvItens = [];

registrarModulo({
  id: "vendas",
  titulo: "Vendas",
  rotulo: "Vendas",
  icone: "vendas",
  render(el, parametros) {
    if (parametros?.abrirPdv) renderPdv(el);
    else renderListaVendas(el);
  },
});

/* ---------------- lista de vendas ---------------- */

function cartaoVendaHtml(v) {
  const classeStatus = { "Concluída": "ok", "Pendente": "atencao", "Cancelada": "perigo" }[v.status] || "ok";
  const qtdItens = v.itens.length;
  return `
    <button type="button" class="cartao-venda" data-venda="${esc(v.id_venda)}">
      <div class="cartao-info">
        <strong>${esc(v.cliente_nome || "Cliente não informado")}</strong>
        <small>${dataHora(v.data)} · ${qtdItens} ${qtdItens > 1 ? "itens" : "item"}${v.pagamento ? " · " + esc(v.pagamento) : ""}</small>
      </div>
      <div class="cartao-lado">
        <strong>${dinheiro(v.total)}</strong>
        <span class="selo selo-${classeStatus}">${esc(v.status || "Concluída")}</span>
      </div>
    </button>`;
}

function renderListaVendas(el) {
  el.innerHTML = `
    <div class="pagina">
      <button type="button" class="btn btn-primario btn-grande btn-cheio" id="vendas-nova">+ Nova venda</button>
      <div class="chips" id="vendas-periodos">
        <button type="button" class="chip" data-periodo="hoje">Hoje</button>
        <button type="button" class="chip ativo" data-periodo="7">7 dias</button>
        <button type="button" class="chip" data-periodo="30">30 dias</button>
        <button type="button" class="chip" data-periodo="tudo">Tudo</button>
      </div>
      <input id="vendas-busca" class="campo-busca" placeholder="Buscar por cliente…" autocomplete="off">
      <div class="lista" id="vendas-lista"></div>
    </div>`;

  let periodo = "7";

  function vendasFiltradas() {
    const busca = $("#vendas-busca", el).value.trim();
    let vendas = agruparVendas(App.db.vendas);
    if (periodo === "hoje") {
      const hojeStr = new Date().toDateString();
      vendas = vendas.filter((v) => new Date(v.data).toDateString() === hojeStr);
    } else if (periodo !== "tudo") {
      const limite = Date.now() - Number(periodo) * 24 * 60 * 60 * 1000;
      vendas = vendas.filter((v) => new Date(v.data).getTime() >= limite);
    }
    if (busca) vendas = vendas.filter((v) => contemTexto(v.cliente_nome, busca));
    return vendas;
  }

  function atualizarLista() {
    const vendas = vendasFiltradas();
    const totalPeriodo = vendas.filter((v) => v.status !== "Cancelada").reduce((s, v) => s + v.total, 0);
    $("#vendas-lista", el).innerHTML = vendas.length
      ? `<p class="titulo-secao">${vendas.length} venda${vendas.length > 1 ? "s" : ""} · ${dinheiro(totalPeriodo)}</p>` +
        vendas.map(cartaoVendaHtml).join("")
      : `<p class="vazio">Nenhuma venda no período.</p>`;
  }

  $("#vendas-nova", el).addEventListener("click", () => renderPdv(el));
  $("#vendas-busca", el).addEventListener("input", atualizarLista);
  $("#vendas-periodos", el).addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    periodo = chip.dataset.periodo;
    $$(".chip", $("#vendas-periodos", el)).forEach((c) => c.classList.toggle("ativo", c === chip));
    atualizarLista();
  });
  $("#vendas-lista", el).addEventListener("click", (e) => {
    const cartao = e.target.closest(".cartao-venda");
    if (cartao) abrirDetalheVenda(cartao.dataset.venda, () => renderListaVendas(el));
  });

  atualizarLista();
}

function abrirDetalheVenda(idVenda, aoMudar) {
  const venda = agruparVendas(App.db.vendas).find((v) => v.id_venda === idVenda);
  if (!venda) return;
  let mudou = false;

  const corpo = document.createElement("div");
  corpo.innerHTML = `
    <div class="resumo-venda">
      ${venda.itens.map((i) => `
        <div class="linha">
          <span>${esc(i.quantidade)}x ${esc(i.produto_nome)}</span>
          <span>${dinheiro(i.subtotal)}</span>
        </div>`).join("")}
      <div class="linha total"><span>Total</span><span>${dinheiro(venda.total)}</span></div>
      <div class="linha"><span class="suave">Data</span><span>${dataHora(venda.data)}</span></div>
      <div class="linha"><span class="suave">Registrada por</span><span>${esc(venda.criado_por || "—")}</span></div>
      ${venda.entrega ? `<div class="linha"><span class="suave">Entrega/obs.</span><span>${esc(venda.entrega)}</span></div>` : ""}
    </div>
    <div class="formulario" style="margin-top:14px">
      <div class="meio">
        <label class="rotulo">Status
          <select class="campo" id="detalhe-status">
            ${CONFIG.statusVenda.map((s) => `<option ${s === venda.status ? "selected" : ""}>${esc(s)}</option>`).join("")}
          </select>
        </label>
        <label class="rotulo">Pagamento
          <select class="campo" id="detalhe-pagamento">
            ${CONFIG.formasPagamento.map((f) => `<option ${f === venda.pagamento ? "selected" : ""}>${esc(f)}</option>`).join("")}
          </select>
        </label>
      </div>
      <button type="button" class="btn btn-perigo" id="detalhe-excluir">Excluir venda</button>
    </div>`;

  const modal = abrirModal(`Venda de ${venda.cliente_nome || "cliente não informado"}`, corpo, {
    aoFechar: () => { if (mudou && aoMudar) aoMudar(); },
  });

  function aplicarMudanca(campo, valor) {
    App.db.vendas.forEach((linha) => {
      if ((linha.id_venda || linha.id) === idVenda) linha[campo] = valor;
    });
    salvarTabela("vendas");
    mudou = true;
    toast("Venda atualizada.");
  }

  $("#detalhe-status", corpo).addEventListener("change", (e) => aplicarMudanca("status", e.target.value));
  $("#detalhe-pagamento", corpo).addEventListener("change", (e) => aplicarMudanca("pagamento", e.target.value));
  $("#detalhe-excluir", corpo).addEventListener("click", async () => {
    const ok = await confirmar("Excluir esta venda? Os itens serão removidos da planilha.", { perigo: true, botao: "Excluir" });
    if (!ok) return;
    App.db.vendas = App.db.vendas.filter((linha) => (linha.id_venda || linha.id) !== idVenda);
    salvarTabela("vendas");
    mudou = true;
    toast("Venda excluída.");
    modal.fechar();
  });
}

/* ---------------- PDV (nova venda) ---------------- */

function renderPdv(el) {
  App.editando = true; // bloqueia atualização automática da tela durante a venda

  const recuperada = pdvItens.length > 0;

  el.innerHTML = `
    <div class="pagina pdv">
      <div class="pdv-topo">
        <button type="button" class="btn btn-secundario" id="pdv-voltar">‹ Vendas</button>
        <span class="pdv-dica">Enter avança o fluxo</span>
      </div>

      <div class="bloco">
        <div class="posicao-relativa">
          <label class="rotulo" for="pdv-busca">Produto</label>
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
      </div>

      <div class="bloco">
        <div id="pdv-itens" class="pdv-itens"></div>
        <div class="pdv-total"><span>Total</span><strong id="pdv-total">R$ 0,00</strong></div>
      </div>

      <div class="bloco">
        <label class="rotulo" for="pdv-cliente">Cliente</label>
        <input id="pdv-cliente" class="campo" list="lista-clientes" placeholder="Nome do cliente (opcional)" autocomplete="off">
        <datalist id="lista-clientes">
          ${App.db.clientes.map((c) => `<option value="${esc(c.nome)}">`).join("")}
        </datalist>
        <label class="rotulo" for="pdv-pagamento">Pagamento</label>
        <select id="pdv-pagamento" class="campo">
          ${CONFIG.formasPagamento.map((f) => `<option>${esc(f)}</option>`).join("")}
        </select>
        <label class="rotulo" for="pdv-obs">Entrega / observações</label>
        <input id="pdv-obs" class="campo" placeholder="Opcional" autocomplete="off">
        <button type="button" class="btn btn-primario btn-grande btn-cheio" id="pdv-finalizar" style="margin-top:6px">Finalizar venda</button>
      </div>
    </div>`;

  const busca = $("#pdv-busca", el);
  const qtd = $("#pdv-qtd", el);
  const sugestoesEl = $("#pdv-sugestoes", el);
  const cliente = $("#pdv-cliente", el);
  const pagamento = $("#pdv-pagamento", el);

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
      sugestoesEl.innerHTML = `<div class="sugestao"><small>Nenhum produto encontrado. Cadastre em “Produtos”.</small></div>`;
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
        cliente.focus(); // campo vazio + Enter = ir para o fechamento
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

  cliente.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); pagamento.focus(); }
  });
  pagamento.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); finalizar(); }
  });
  $("#pdv-obs", el).addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); finalizar(); }
  });

  $("#pdv-finalizar", el).addEventListener("click", finalizar);

  $("#pdv-voltar", el).addEventListener("click", async () => {
    if (pdvItens.length) {
      const ok = await confirmar("Descartar a venda em andamento?", { perigo: true, botao: "Descartar" });
      if (!ok) return;
      pdvItens = [];
    }
    App.editando = false;
    renderListaVendas(el);
  });

  function finalizar() {
    if (!pdvItens.length) {
      toast("Adicione ao menos um produto.", "erro");
      busca.focus();
      return;
    }
    const nomeCliente = cliente.value.trim();
    const formaPagamento = pagamento.value;
    const obs = $("#pdv-obs", el).value.trim();
    const total = pdvItens.reduce((s, i) => s + i.subtotal, 0);

    const corpo = document.createElement("div");
    corpo.innerHTML = `
      <div class="resumo-venda">
        ${pdvItens.map((i) => `
          <div class="linha"><span>${esc(i.quantidade)}x ${esc(i.produto_nome)}</span><span>${dinheiro(i.subtotal)}</span></div>`).join("")}
        <div class="linha total"><span>Total</span><span>${dinheiro(total)}</span></div>
        <div class="linha"><span class="suave">Cliente</span><span>${esc(nomeCliente || "Não informado")}</span></div>
        <div class="linha"><span class="suave">Pagamento</span><span>${esc(formaPagamento)}</span></div>
        ${obs ? `<div class="linha"><span class="suave">Entrega/obs.</span><span>${esc(obs)}</span></div>` : ""}
      </div>
      <div class="linha-botoes">
        <button type="button" class="btn btn-secundario" data-acao="voltar">Voltar</button>
        <button type="button" class="btn btn-primario" data-acao="confirmar">Confirmar venda</button>
      </div>`;

    const modal = abrirModal("Confirmar venda", corpo, { classe: "modal-pequeno" });
    corpo.querySelector('[data-acao="confirmar"]').focus();

    corpo.addEventListener("click", (e) => {
      const acao = e.target.closest("button")?.dataset.acao;
      if (acao === "voltar") modal.fechar();
      if (acao === "confirmar") {
        const idVenda = uid("vd");
        const agora = new Date().toISOString();
        const clienteCadastrado = App.db.clientes.find((c) => semAcentos(c.nome) === semAcentos(nomeCliente));
        pdvItens.forEach((item) => {
          App.db.vendas.push({
            id: uid("vi"),
            id_venda: idVenda,
            data: agora,
            cliente_id: clienteCadastrado?.id || "",
            cliente_nome: nomeCliente,
            produto_id: item.produto_id,
            produto_nome: item.produto_nome,
            quantidade: numero(item.quantidade),
            preco_unit: numero(item.preco_unit),
            subtotal: numero(item.subtotal),
            pagamento: formaPagamento,
            status: "Concluída",
            entrega: obs,
            observacoes: "",
            criado_por: App.usuario.usuario,
            criado_em: agora,
          });
        });
        salvarTabela("vendas");
        pdvItens = [];
        modal.fechar();
        toast("Venda registrada!");
        renderPdv(el); // pronto para a próxima venda
      }
    });
  }

  /* --- estado inicial --- */
  atualizarItens();
  if (recuperada) toast("Venda em andamento recuperada.");
  busca.focus();
}
