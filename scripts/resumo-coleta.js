#!/usr/bin/env node
"use strict";
// Compara a base de preços antes e depois de uma coleta e escreve o resumo (em Markdown) para o PR da rotina semanal.
//   node scripts/resumo-coleta.js <precos-antes.json> <precos-depois.json>
// No GitHub Actions, informa em GITHUB_OUTPUT: mudou (true/false), semana (id da mais recente com novidade) e titulo.

const fs = require("fs");

const [arqAntes, arqDepois] = process.argv.slice(2);
if (!arqAntes || !arqDepois) {
  console.error("Uso: node scripts/resumo-coleta.js <antes.json> <depois.json>");
  process.exit(2);
}

const ler = (arquivo) => {
  try {
    return JSON.parse(fs.readFileSync(arquivo, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return { semanas: {}, registros: [] };
    throw err;
  }
};
const antes = ler(arqAntes);
const depois = ler(arqDepois);

const CIDADES = { CUIABA: "Cuiabá", "VARZEA GRANDE": "Várzea Grande" };
const PRODUTOS = ["GASOLINA COMUM", "ETANOL", "DIESEL S10"];
const FAIXA_PLAUSIVEL = [2, 15]; // reais por litro; fora disso o preço merece conferência
const POR_LITRO = /GASOLINA|ETANOL|DIESEL/; // GLP (botijão) e GNV (m³) têm outra unidade e ficam fora da conferência

const assinatura = (r) => `${r.semana}|${r.chave}|${r.preco}`;
const jaTinha = new Set(antes.registros.map(assinatura));
const novos = depois.registros.filter((r) => !jaTinha.has(assinatura(r)));
const agora = new Set(depois.registros.map(assinatura));
const removidos = antes.registros.filter((r) => !agora.has(assinatura(r)));
const semanasNovas = Object.keys(depois.semanas).filter((id) => !antes.semanas[id]);
const mudou = novos.length > 0 || removidos.length > 0 || semanasNovas.length > 0;

const brl = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const media = (v) => v.reduce((a, b) => a + b, 0) / v.length;
const periodo = (id) => depois.semanas[id]?.periodo || antes.semanas[id]?.periodo || id;

const semanasAfetadas = [...new Set([...novos, ...removidos].map((r) => r.semana).concat(semanasNovas))].sort().reverse();
const maisRecente = semanasAfetadas[0] || "";

const linhas = [];
if (!mudou) {
  linhas.push("Nenhuma novidade: a base já tem a semana mais recente publicada pela ANP.");
} else {
  linhas.push("Coleta automática da pesquisa semanal de preços da ANP.", "");
  linhas.push("## Semanas com novidade", "");
  linhas.push("| Semana | Cuiabá | Várzea Grande | Registros novos | Removidos |", "|---|---:|---:|---:|---:|");
  for (const id of semanasAfetadas) {
    const daSemana = depois.registros.filter((r) => r.semana === id);
    const por = (m) => daSemana.filter((r) => r.municipio === m).length;
    const n = novos.filter((r) => r.semana === id).length;
    const x = removidos.filter((r) => r.semana === id).length;
    linhas.push(`| ${periodo(id)} | ${por("CUIABA")} | ${por("VARZEA GRANDE")} | ${n} | ${x} |`);
  }

  const semPreco = semanasAfetadas.filter((id) => !depois.registros.some((r) => r.semana === id));
  if (semPreco.length) {
    linhas.push("", `A ANP não pesquisou a região em: ${semPreco.map(periodo).join(", ")}. A semana fica registrada sem preços.`);
  }

  // Preços da semana mais recente com dados, comparados com a semana anterior da base
  const comDados = Object.keys(depois.semanas).filter((id) => depois.registros.some((r) => r.semana === id)).sort().reverse();
  const alvo = semanasAfetadas.find((id) => comDados.includes(id));
  if (alvo) {
    const anterior = comDados[comDados.indexOf(alvo) + 1];
    linhas.push("", `## Preços da semana de ${periodo(alvo)}`, "");
    linhas.push("| Cidade | Combustível | Postos | Menor | Média | Maior | Média da semana anterior |", "|---|---|---:|---:|---:|---:|---:|");
    for (const [m, cidade] of Object.entries(CIDADES)) {
      for (const produto of PRODUTOS) {
        const precos = (id) => depois.registros.filter((r) => r.semana === id && r.municipio === m && r.produto === produto).map((r) => r.preco);
        const v = precos(alvo);
        if (!v.length) continue;
        const ant = anterior ? precos(anterior) : [];
        linhas.push(`| ${cidade} | ${produto} | ${v.length} | ${brl(Math.min(...v))} | ${brl(media(v))} | ${brl(Math.max(...v))} | ${ant.length ? brl(media(ant)) : "—"} |`);
      }
    }
  }

  const estranhos = novos.filter((r) => POR_LITRO.test(r.produto) && (r.preco < FAIXA_PLAUSIVEL[0] || r.preco > FAIXA_PLAUSIVEL[1]));
  linhas.push("", "## Conferência", "");
  linhas.push(
    estranhos.length
      ? `**Atenção:** ${estranhos.length} preço(s) fora da faixa de ${brl(FAIXA_PLAUSIVEL[0])} a ${brl(FAIXA_PLAUSIVEL[1])}:`
      : `Todos os preços novos de gasolina, etanol e diesel estão entre ${brl(FAIXA_PLAUSIVEL[0])} e ${brl(FAIXA_PLAUSIVEL[1])} por litro.`,
  );
  for (const r of estranhos.slice(0, 20)) {
    linhas.push(`- ${r.razao} (${CIDADES[r.municipio] || r.municipio}) · ${r.produto} · ${brl(r.preco)} em ${r.dataColeta}`);
  }
  if (removidos.length) {
    linhas.push("", `**Atenção:** ${removidos.length} registro(s) que estavam na base saíram ou mudaram de preço. Isso só é esperado quando a ANP republica uma semana.`);
  }
  linhas.push("", `Total na base: ${antes.registros.length} → ${depois.registros.length} registros.`);
  linhas.push("", "Fonte: https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/levantamento-de-precos-de-combustiveis-ultimas-semanas-pesquisadas");
}

console.log(linhas.join("\n"));

if (process.env.GITHUB_OUTPUT) {
  const titulo = maisRecente ? `dados: preços da ANP, semana de ${periodo(maisRecente)}` : "";
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `mudou=${mudou}\nsemana=${maisRecente}\ntitulo=${titulo}\n`);
}
