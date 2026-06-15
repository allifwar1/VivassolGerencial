"use strict";

/* ============================================================
   Módulo: Configurações (somente administrador)
   Estado da conexão com a planilha, teste e informações.
   ============================================================ */

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
            <div class="linha"><span class="suave">Sincronização automática</span><span>a cada ${Math.round((CONFIG.intervaloSyncMs || 60000) / 1000)}s</span></div>
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

    $("#cfg-janela", el)?.addEventListener("change", (e) => {
      definirConfig("janela_meses", String(e.target.value));
      renderizarRotaAtual();
    });

    $("#cfg-arquivar", el)?.addEventListener("click", async () => {
      const meses = janelaMeses();
      const arq = contarArquivaveis(meses);
      const total = arq.vendas + arq.pagamentos + arq.lancamentos;
      if (total === 0) { toast("Nenhum dado antigo a arquivar.", "erro"); return; }
      const ok = await confirmar(
        `Mover para o arquivo ${arq.vendas} item(ns) de vendas finalizadas, ${arq.pagamentos} pagamento(s) e ${arq.lancamentos} lançamento(s) com mais de ${meses} meses?\n\nOs dados continuam guardados na planilha (abas *_arquivo) e o saldo do caixa é preservado.`,
        { titulo: "Arquivar dados antigos", botao: "Arquivar agora" });
      if (!ok) return;
      const btn = $("#cfg-arquivar", el);
      if (btn) { btn.disabled = true; btn.textContent = "Arquivando…"; }
      const r = await arquivarAgora(meses);
      if (r) toast(`Arquivado: ${r.vendas} de venda, ${r.pagamentos} pagamento(s), ${r.lancamentos} lançamento(s).`);
      renderizarRotaAtual();
    });
  },
});

/* Bloco de "Arquivamento de dados" — janela deslizante configurável. */
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
        arquivo na planilha. <strong>Nada é apagado</strong> — fica guardado nas abas
        <em>vendas_arquivo</em>, <em>pagamentos_arquivo</em> e <em>lancamentos_arquivo</em>.
        O saldo do caixa é preservado integralmente.
      </p>
      <label class="rotulo">Manter ativos os últimos
        <select class="campo" id="cfg-janela">
          ${[3, 6, 12, 24].map((n) => `<option value="${n}" ${janela === n ? "selected" : ""}>${n} meses</option>`).join("")}
        </select>
      </label>
      <div class="resumo-venda">
        ${temSaldoInicial ? `
          <div class="linha"><span class="suave">Saldo inicial (dinheiro)</span><span>${dinheiro(sIniDin)}</span></div>
          <div class="linha"><span class="suave">Saldo inicial (banco)</span><span>${dinheiro(sIniBanco)}</span></div>` : ""}
        <div class="linha"><span class="suave">Último arquivamento</span><span>${ultimo ? dataHora(ultimo) : "nunca"}</span></div>
        <div class="linha"><span class="suave">Prontos para arquivar agora</span><span>${arq.vendas} de venda · ${arq.lancamentos} lançamento(s)</span></div>
      </div>
      ${total > 0
        ? `<p class="caixa-dica">Há ${total} registro(s) antigos que podem ser arquivados para acelerar o app.</p>`
        : `<p class="suave" style="font-size:13px">Nenhum dado antigo a arquivar no momento.</p>`}
      <div class="linha-acoes">
        <button type="button" class="btn btn-secundario" id="cfg-arquivar" ${apiConfigurada() && total > 0 ? "" : "disabled"}>Arquivar dados antigos agora</button>
      </div>
    </div>`;
}
