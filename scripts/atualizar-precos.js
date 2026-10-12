#!/usr/bin/env node
"use strict";
// Atualização manual (ou via agendador do sistema) dos preços da ANP para Cuiabá/MT.
//   node scripts/atualizar-precos.js              importa as semanas novas (até as 4 mais recentes)
//   node scripts/atualizar-precos.js --semanas=8  amplia o histórico buscado
//   node scripts/atualizar-precos.js --forcar     baixa de novo e substitui as semanas já importadas
//   node scripts/atualizar-precos.js --status     só mostra a situação da base
// Código de saída: 0 = ok (importou ou não havia novidade), 1 = falha.

const precos = require("../lib/anp-precos");

const args = process.argv.slice(2);
const opcao = (nome) =>
  args.find((a) => a.startsWith(`--${nome}=`))?.split("=")[1];

function status() {
  const s = precos.carregar();
  console.log("Base:              data/precos.json");
  console.log("Registros:        ", s.registros.length);
  console.log(
    "Última execução:  ",
    s.ultimaExecucao
      ? `${s.ultimaExecucao.em} — ${s.ultimaExecucao.resultado}: ${s.ultimaExecucao.mensagem}`
      : "nunca",
  );
  console.log(
    "Última importação:",
    s.ultimaImportacao
      ? `${s.ultimaImportacao.em} — semana ${s.ultimaImportacao.semana} (${s.ultimaImportacao.arquivo})`
      : "nenhuma",
  );
  console.log("Semanas na base:");
  for (const id of Object.keys(s.semanas).sort().reverse())
    console.log(
      `  ${s.semanas[id].periodo}  ${String(s.semanas[id].registros).padStart(4)} registros  ${s.semanas[id].arquivo}`,
    );
}

(async () => {
  if (args.includes("--status")) return status();
  const r = await precos.atualizar({
    semanas: Number(opcao("semanas")) || 4,
    forcar: args.includes("--forcar"),
  });
  status();
  process.exitCode =
    r.resultado === "erro" || r.resultado === "parcial" ? 1 : 0;
})().catch((err) => {
  console.error("Falha na atualização:", err.message);
  process.exitCode = 1;
});
