'use strict';
// Testes contra o site real da ANP (precisam de internet).   node --test test/anp-ao-vivo.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const precos = require('../lib/anp-precos');
const { pastaTemp } = require('./helpers');

const UA = { 'User-Agent': 'Mozilla/5.0 (CombustivelCerto; teste)' };
let lista;

test('a página oficial da ANP continua acessível', async () => {
  const r = await fetch(precos.LPC_PAGE, { headers: UA, signal: AbortSignal.timeout(60000) });
  assert.equal(r.status, 200);
  lista = precos.listarPlanilhas(await r.text());
});

test('o sistema encontra a planilha de preços por posto mais recente', () => {
  assert.ok(lista?.length, 'nenhum link "Preços por posto revendedor" encontrado');
  assert.match(lista[0].url, /^https:\/\/www\.gov\.br\/anp\/.+\.xlsx$/);
  assert.ok(lista[0].fim, 'período de referência não identificado no nome do arquivo');
  assert.ok(lista.every((p, i) => !i || !p.fim || p.fim <= lista[i - 1].fim), 'lista fora de ordem');
  const dias = (Date.now() - Date.parse(lista[0].fim)) / 86400000;
  assert.ok(dias < 45, `a semana mais recente publicada terminou há ${Math.round(dias)} dias`);
  console.log(`  mais recente: ${lista[0].arquivo} (${lista.length} planilhas na página)`);
});

test('a planilha real é baixada, processada e só traz Cuiabá/MT', async () => {
  const dir = pastaTemp();
  const r = await precos.atualizar({ dataDir: dir, semanas: 1, log: () => {} });
  assert.equal(r.resultado, 'importado', r.mensagem);
  const base = precos.carregar(dir);
  const semana = base.semanas[r.importadas[0].semana];
  assert.ok(base.registros.length >= 10, `só ${base.registros.length} registros de Cuiabá`);
  assert.ok(semana.linhasPlanilha > 5000, 'planilha nacional menor que o esperado');
  for (const reg of base.registros) {
    assert.equal(precos.norm(reg.municipio), 'CUIABA');
    assert.equal(reg.uf, 'MT');
    assert.ok(reg.preco > 0 && reg.preco < 500, `preço fora do esperado: ${reg.preco}`);
    assert.ok(reg.dataColeta >= semana.inicio && reg.dataColeta <= semana.fim, `coleta ${reg.dataColeta} fora do período ${semana.periodo}`);
    assert.match(reg.cnpj, /^\d{14}$/);
    assert.ok(reg.razao && reg.produto && reg.unidade);
  }
  const gasolina = base.registros.filter(x => x.produto === 'GASOLINA COMUM').map(x => x.preco);
  assert.ok(gasolina.length && Math.min(...gasolina) > 3 && Math.max(...gasolina) < 15, 'preço da gasolina fora de faixa plausível');
  console.log(`  semana ${semana.periodo}: ${base.registros.length} registros de Cuiabá em ${semana.linhasPlanilha} linhas; gasolina de R$ ${Math.min(...gasolina)} a R$ ${Math.max(...gasolina)}`);

  const de_novo = await precos.atualizar({ dataDir: dir, semanas: 1, log: () => {} });
  assert.equal(de_novo.resultado, 'sem-novidade');
  assert.equal(precos.carregar(dir).registros.length, base.registros.length);
});
