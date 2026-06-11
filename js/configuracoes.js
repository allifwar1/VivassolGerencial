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
  },
});
