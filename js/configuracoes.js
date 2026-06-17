"use strict";

/* ============================================================
   Módulo: Configurações (somente administrador)
   Estado da conexão com a planilha, teste, informações,
   intervalo de sincronização e gerenciamento de arquivamento.
   ============================================================ */

const OPCOES_JANELA = [3, 6, 9, 12, 24];
const OPCOES_SYNC = [15, 30, 60, 120, 300]; // segundos

registrarModulo({
  id: "config",
  titulo: "Configurações",
  rotulo: "Config",
  icone: "config",
  perfis: ["admin"],
  render(el) {
    const pendentes = [...App.tabelasPendentes];
    const contagens = TABELAS
      .filter((t) => !["configuracoes", "usuarios"].includes(t))
      .map((t) => `<div class="linha"><span class="suave">${esc(t)}</span><span>${App.db[t].length} registro${App.db[t].length === 1 ? "" : "s"}</span></div>`)
      .join("");

    const syncSeg = Math.round(intervaloSyncMs() / 1000);

    el.innerHTML = `
      <div class="pagina">
        <div class="bloco">
          <h3 class="titulo-secao" style="margin:0">Conexão com a planilha</h3>
          <div class="resumo-venda">
            <div class="linha"><span class="suave">Estado</span><span>${esc($("#status-texto").textContent)}</span></div>
            <div class="linha"><span class="suave">Última sincronização</span><span>${App.ultimaSync ? dataHora(App.ultimaSync.toISOString()) : "ainda não"}</span></div>
            <div class="linha"><span class="suave">Aguardando envio</span><span>${pendentes.length ? esc(pendentes.join(", ")) : "nada"}</span></div>
          </div>
          ${apiConfigurada() ? "" : `
            <p class="erro">A planilha ainda não foi conectada. Siga o README.md do projeto:
            crie a planilha, instale o Apps Script e cole a URL gerada em <strong>js/config.js</strong> (campo apiUrl).
            Enquanto isso, tudo é salvo apenas neste aparelho.</p>`}
          <label class="rotulo">Sincronizar automaticamente a cada
            <select class="campo" id="cfg-sync">
              ${OPCOES_SYNC.map((s) => `<option value="${s}" ${syncSeg === s ? "selected" : ""}>${rotuloSync(s)}</option>`).join("")}
            </select>
          </label>
          <p class="suave" style="font-size:12.5px">Intervalos curtos atualizam mais rápido entre aparelhos, mas gastam mais bateria e internet.</p>
          <div class="linha-acoes">
            <button type="button" class="btn btn-secundario" id="config-testar" ${apiConfigurada() ? "" : "disabled"}>Testar conexão</button>
            <button type="button" class="btn btn-primario" id="config-sincronizar" ${apiConfigurada() ? "" : "disabled"}>Sincronizar agora</button>
          </div>
          ${CONFIG.linkPlanilha ? `<a href="${esc(CONFIG.linkPlanilha)}" target="_blank" class="btn btn-secundario">Abrir planilha</a>` : ""}
        </div>

        <div class="bloco">
          <h3 class="titulo-secao" style="margin:0">Dados neste aparelho</h3>
          <div class="resumo-venda">${contagens}</div>
        </div>

        ${blocoArquivamento()}

        <div class="bloco">
          <h3 class="titulo-secao" style="margin:0">Sistema</h3>
          <div class="resumo-venda">
            <div class="linha"><span class="suave">Versão</span><span>${esc(CONFIG.versao)}</span></div>
            <div class="linha"><span class="suave">Usuário</span><span>${esc(App.usuario.nome)} (${App.usuario.perfil === "admin" ? "Administrador" : "Operacional"})</span></div>
            <div class="linha"><span class="suave">Sincronização automática</span><span>a cada ${syncSeg}s</span></div>
          </div>
        </div>

        <div class="bloco">
          <h3 class="titulo-secao" style="margin:0">Manutenção do app</h3>
          <p class="suave" style="font-size:13px;line-height:1.5">
            Se uma atualização não apareceu no celular, use este botão para limpar o
            cache e recarregar o app do zero. <strong>Os seus dados não são apagados.</strong>
          </p>
          <div class="linha-acoes">
            <button type="button" class="btn btn-secundario" id="cfg-limpar-cache">Limpar cache e recarregar</button>
          </div>
        </div>
      </div>`;

    $("#config-testar", el)?.addEventListener("click", async () => {
      try {
        await chamarApi("ping");
        toast("Conexão com a planilha funcionando!");
        atualizarStatus("online");
      } catch (erro) {
        toast("Falha: " + erro.message, "erro");
        atualizarStatus("offline");
      }
    });

    $("#config-sincronizar", el)?.addEventListener("click", async () => {
      const ok = await sincronizar({ forcar: true });
      toast(ok ? "Sincronizado com a planilha." : "Não foi possível sincronizar.", ok ? "ok" : "erro");
      if (ok) renderizarRotaAtual();
    });

    $("#cfg-sync", el)?.addEventListener("change", (e) => {
      const seg = parseInt(e.target.value, 10) || 60;
      definirConfig("intervalo_sync_seg", String(seg));
      reiniciarTimerSync();
      if (seg < 30) toast("Sincronização frequente: gasta mais bateria e internet.", "aviso");
      else toast(`Sincronização a cada ${rotuloSync(seg)}.`);
      renderizarRotaAtual();
    });

    $("#cfg-gerenciar-arquivo", el)?.addEventListener("click", () => abrirGerenciarArquivo());
    $("#cfg-limpar-cache", el)?.addEventListener("click", () => limparCacheApp());
  },
});

function rotuloSync(seg) {
  if (seg < 60) return `${seg}s`;
  const min = seg / 60;
  return `${min} ${min === 1 ? "minuto" : "minutos"}`;
}

/* Bloco-resumo de arquivamento na página (o gerenciamento completo abre em modal). */
function blocoArquivamento() {
  const janela = janelaMeses();
  const arq = contarArquivaveis(janela);
  const total = arq.vendas + arq.pagamentos + arq.lancamentos;
  const sIniDin = numero(obterConfig("saldo_inicial_dinheiro", 0));
  const sIniBanco = numero(obterConfig("saldo_inicial_banco", 0));
  const ultimo = obterConfig("ultimo_arquivamento", "");
  const temSaldoInicial = Math.abs(sIniDin) > 0.005 || Math.abs(sIniBanco) > 0.005;

  return `
    <div class="bloco">
      <h3 class="titulo-secao" style="margin:0">Arquivamento de dados (desempenho)</h3>
      <p class="suave" style="font-size:13px;line-height:1.5">
        Para o app continuar rápido com o passar dos anos, os pedidos antigos já
        finalizados e os lançamentos de caixa antigos podem ser movidos para abas de
        arquivo na planilha. <strong>Nada é apagado</strong> e o <strong>saldo do caixa é
        preservado</strong> — dá para restaurar quando quiser. Produtos, insumos e clientes
        <strong>nunca</strong> são arquivados.
      </p>
      <div class="resumo-venda">
        ${temSaldoInicial ? `
          <div class="linha"><span class="suave">Saldo inicial (dinheiro)</span><span>${dinheiro(sIniDin)}</span></div>
          <div class="linha"><span class="suave">Saldo inicial (banco)</span><span>${dinheiro(sIniBanco)}</span></div>` : ""}
        <div class="linha"><span class="suave">Último arquivamento</span><span>${ultimo ? dataHora(ultimo) : "nunca"}</span></div>
        <div class="linha"><span class="suave">Prontos para arquivar (${janela} meses)</span><span>${arq.vendas} de venda · ${arq.lancamentos} lançamento(s)</span></div>
      </div>
      ${total > 0 ? `<p class="caixa-dica">Há ${total} registro(s) antigos que podem ser arquivados para acelerar o app.</p>` : ""}
      <div class="linha-acoes">
        <button type="button" class="btn btn-secundario" id="cfg-gerenciar-arquivo" ${apiConfigurada() ? "" : "disabled"}>Arquivar / Restaurar dados…</button>
      </div>
    </div>`;
}

/* ---------------- modal: gerenciar arquivamento ---------------- */

function abrirGerenciarArquivo() {
  const corpo = document.createElement("div");
  corpo.className = "arquivo-modal";
  const modal = abrirModal("Arquivamento de dados", corpo, { classe: "modal-medio" });

  const janelaInicial = janelaMeses();

  corpo.innerHTML = `
    <section class="arq-secao">
      <h4>Arquivar dados antigos</h4>
      <p class="suave" style="font-size:13px">Move para as abas de arquivo os pedidos finalizados e os lançamentos com mais de:</p>
      <label class="rotulo">Manter ativos os últimos
        <select class="campo" id="arq-janela">
          ${OPCOES_JANELA.map((n) => `<option value="${n}" ${janelaInicial === n ? "selected" : ""}>${n} meses</option>`).join("")}
        </select>
      </label>
      <div class="arq-preview" id="arq-preview-arquivar"></div>
      <p class="arq-nota">Serão movidas apenas <strong>vendas</strong>, <strong>pagamentos</strong> e <strong>lançamentos</strong> antigos.
      Produtos, insumos e clientes nunca são arquivados.</p>
      <button type="button" class="btn btn-primario btn-cheio" id="arq-btn-arquivar">Arquivar agora</button>
    </section>

    <section class="arq-secao" id="arq-secao-restaurar">
      <h4>Restaurar dados arquivados</h4>
      <div id="arq-resumo" class="suave" style="font-size:13px">Carregando informações do arquivo…</div>
    </section>`;

  // Preview de arquivamento (lado do app — dados ativos já carregados).
  function atualizarPreviewArquivar() {
    const meses = parseInt($("#arq-janela", corpo).value, 10) || 12;
    const arq = contarArquivaveis(meses);
    const total = arq.vendas + arq.pagamentos + arq.lancamentos;
    $("#arq-preview-arquivar", corpo).innerHTML = total > 0
      ? `<p>Serão movidos: <strong>${arq.vendas}</strong> de venda, <strong>${arq.pagamentos}</strong> pagamento(s) e <strong>${arq.lancamentos}</strong> lançamento(s).</p>`
      : `<p class="suave">Nenhum dado com mais de ${meses} meses para arquivar.</p>`;
    const btn = $("#arq-btn-arquivar", corpo);
    btn.disabled = total === 0;
  }
  $("#arq-janela", corpo).addEventListener("change", atualizarPreviewArquivar);
  atualizarPreviewArquivar();

  $("#arq-btn-arquivar", corpo).addEventListener("click", async () => {
    const meses = parseInt($("#arq-janela", corpo).value, 10) || 12;
    const arq = contarArquivaveis(meses);
    const total = arq.vendas + arq.pagamentos + arq.lancamentos;
    if (total === 0) return;
    const ok = await confirmar(
      `Mover para o arquivo ${arq.vendas} item(ns) de vendas finalizadas, ${arq.pagamentos} pagamento(s) e ${arq.lancamentos} lançamento(s) com mais de ${meses} meses?\n\nOs dados continuam guardados na planilha e o saldo do caixa é preservado. Você pode restaurar depois.`,
      { titulo: "Arquivar dados antigos", botao: "Arquivar agora" });
    if (!ok) return;
    const btn = $("#arq-btn-arquivar", corpo);
    btn.disabled = true; btn.textContent = "Arquivando…";
    const r = await arquivarAgora(meses);
    if (r) toast(`Arquivado: ${r.vendas} de venda, ${r.pagamentos} pagamento(s), ${r.lancamentos} lançamento(s).`);
    modal.fechar();
    renderizarRotaAtual();
  });

  // Carrega o resumo do arquivo (servidor) e monta a área de restauração.
  carregarRestauracao(corpo, modal);
}

async function carregarRestauracao(corpo, modal) {
  const area = $("#arq-resumo", corpo);
  let resumo;
  try {
    resumo = await resumoArquivo();
  } catch (e) {
    area.innerHTML = `<p class="erro">Não foi possível ler o arquivo: ${esc(e.message)}</p>`;
    return;
  }

  const totalArq = resumo.totais.vendas + resumo.totais.pagamentos + resumo.totais.lancamentos;
  if (totalArq === 0) {
    $("#arq-secao-restaurar", corpo).innerHTML = `
      <h4>Restaurar dados arquivados</h4>
      <p class="suave" style="font-size:13px">Não há dados arquivados ainda.</p>`;
    return;
  }

  const ul = resumo.ultimoLote;
  const ulTotal = ul.vendas + ul.pagamentos + ul.lancamentos;
  const intervalo = resumo.intervalo;

  area.innerHTML = `
    <div class="resumo-venda" style="margin-bottom:10px">
      <div class="linha"><span class="suave">Em arquivo</span><span>${resumo.totais.vendas} de venda · ${resumo.totais.pagamentos} pag. · ${resumo.totais.lancamentos} lanç.</span></div>
      <div class="linha"><span class="suave">Datas no arquivo</span><span>${intervalo.min ? dataCurta(intervalo.min) + " a " + dataCurta(intervalo.max) : "—"}</span></div>
    </div>

    ${ul.data ? `
      <div class="arq-restauro-opcao">
        <strong>Desfazer último arquivamento</strong>
        <small class="suave">${dataHora(ul.data)} · ${ul.vendas} de venda, ${ul.pagamentos} pag., ${ul.lancamentos} lanç.</small>
        <button type="button" class="btn btn-secundario btn-cheio" id="arq-undo">Desfazer último (${ulTotal} registros)</button>
      </div>` : ""}

    <div class="arq-restauro-opcao">
      <strong>Restaurar por período</strong>
      <small class="suave">Devolve tudo cuja data original esteja entre:</small>
      <div class="arq-datas">
        <label class="rotulo">De <input class="campo" type="date" id="arq-de" value="${esc(intervalo.min || "")}"></label>
        <label class="rotulo">Até <input class="campo" type="date" id="arq-ate" value="${esc(intervalo.max || "")}"></label>
      </div>
      <div class="arq-preview" id="arq-preview-periodo"></div>
      <button type="button" class="btn btn-secundario btn-cheio" id="arq-restaurar-periodo">Calcular período</button>
    </div>`;

  // Desfazer último arquivamento.
  $("#arq-undo", corpo)?.addEventListener("click", async () => {
    const ok = await confirmar(
      `Desfazer o último arquivamento (${dataHora(ul.data)})? Isso devolve ${ulTotal} registro(s) para as abas ativas.`,
      { titulo: "Desfazer arquivamento", botao: "Desfazer" });
    if (!ok) return;
    const btn = $("#arq-undo", corpo);
    btn.disabled = true; btn.textContent = "Restaurando…";
    const r = await restaurarArquivoAgora({ modo: "ultimo" });
    if (r) toast(`Restaurado: ${r.vendas} de venda, ${r.pagamentos} pag., ${r.lancamentos} lanç.`);
    modal.fechar();
    renderizarRotaAtual();
  });

  // Restaurar por período: primeiro calcula (preview), depois confirma.
  let previewPeriodo = null;
  const btnPeriodo = $("#arq-restaurar-periodo", corpo);
  function resetarPeriodo() {
    previewPeriodo = null;
    btnPeriodo.textContent = "Calcular período";
    $("#arq-preview-periodo", corpo).innerHTML = "";
  }
  $("#arq-de", corpo)?.addEventListener("change", resetarPeriodo);
  $("#arq-ate", corpo)?.addEventListener("change", resetarPeriodo);

  btnPeriodo?.addEventListener("click", async () => {
    const de = $("#arq-de", corpo).value;
    const ate = $("#arq-ate", corpo).value;
    if (!de || !ate) { toast("Escolha as duas datas.", "erro"); return; }
    if (de > ate) { toast("A data inicial não pode ser maior que a final.", "erro"); return; }

    // 1ª etapa: calcular quantos seriam restaurados.
    if (previewPeriodo === null) {
      btnPeriodo.disabled = true; btnPeriodo.textContent = "Calculando…";
      try {
        previewPeriodo = await contarRestauro({ modo: "periodo", de, ate });
      } catch (e) {
        toast("Falha ao calcular: " + e.message, "erro");
        btnPeriodo.disabled = false; btnPeriodo.textContent = "Calcular período";
        return;
      }
      const total = previewPeriodo.vendas + previewPeriodo.pagamentos + previewPeriodo.lancamentos;
      $("#arq-preview-periodo", corpo).innerHTML = total > 0
        ? `<p>Serão restaurados: <strong>${previewPeriodo.vendas}</strong> de venda, <strong>${previewPeriodo.pagamentos}</strong> pag. e <strong>${previewPeriodo.lancamentos}</strong> lanç.</p>`
        : `<p class="suave">Nenhum registro arquivado nesse período.</p>`;
      btnPeriodo.disabled = total === 0;
      btnPeriodo.textContent = total > 0 ? `Restaurar ${total} registro(s)` : "Calcular período";
      if (total === 0) previewPeriodo = null;
      return;
    }

    // 2ª etapa: confirmar e restaurar.
    const total = previewPeriodo.vendas + previewPeriodo.pagamentos + previewPeriodo.lancamentos;
    const ok = await confirmar(
      `Restaurar ${total} registro(s) com data entre ${dataCurta(de)} e ${dataCurta(ate)} de volta para as abas ativas?`,
      { titulo: "Restaurar período", botao: "Restaurar" });
    if (!ok) return;
    btnPeriodo.disabled = true; btnPeriodo.textContent = "Restaurando…";
    const r = await restaurarArquivoAgora({ modo: "periodo", de, ate });
    if (r) toast(`Restaurado: ${r.vendas} de venda, ${r.pagamentos} pag., ${r.lancamentos} lanç.`);
    modal.fechar();
    renderizarRotaAtual();
  });
}

/* ---------------- limpar cache do PWA ---------------- */

async function limparCacheApp() {
  toast("Limpando cache…");
  try {
    if ("caches" in window) {
      const chaves = await caches.keys();
      await Promise.all(chaves.map((k) => caches.delete(k)));
    }
    if ("serviceWorker" in navigator) {
      const registros = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registros.map((r) => r.unregister()));
    }
  } catch (_) { /* ignora se o browser não suportar */ }
  window.location.reload(true);
}
