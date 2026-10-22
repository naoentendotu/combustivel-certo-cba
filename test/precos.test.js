'use strict';
// Testes sem rede: usam planilhas geradas no layout da ANP e um fetch falso.   node --test test/precos.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const precos = require('../lib/anp-precos');
const { criarServidor, proximaExecucao } = require('../server');
const { planilhaAnp, pagina, urlPlanilha, fetchFalso, pastaTemp, CABECALHO, LPC_PAGE } = require('./helpers');

const S1 = 'revendas_lpc_2026-09-27_2026-10-03.xlsx', S2 = 'revendas_lpc_2026-10-04_2026-10-10.xlsx';
const quieto = { esperaMs: 0, log: () => {} };
const semana1 = () => planilhaAnp({ periodo: '27/09/2026 A 03/10/2026', linhas: [{ produto: 'GASOLINA COMUM', preco: 7.05, data: 46294 }, { produto: 'ETANOL', preco: 4.29, data: 46294 }] });
const semana2 = () => planilhaAnp({ linhas: [
  { produto: 'GASOLINA COMUM', preco: 7.17, data: 46300 }, { produto: 'ETANOL', preco: 4.37, data: 46300 },
  { cnpj: 6539780000129, razao: 'JGJ COMERCIO DE PETROLEO LTDA', bairro: 'ALVORADA', bandeira: 'VIBRA', produto: 'GASOLINA COMUM', preco: 7.19, data: 46301 }
] });
const lerBase = dir => JSON.parse(fs.readFileSync(path.join(dir, 'precos.json'), 'utf8'));

test('encontra a planilha mais recente pela semana de referência, não pela posição do link', () => {
  const S3 = 'revendas_lpc_2026_10_11-2026_10_17.xlsx'; // formato com "_" nas datas, usado pela ANP a partir de out/2026
  const lista = precos.listarPlanilhas(pagina(['revendas_lpc_2026-09-20_2026-09-26.xlsx', S2, S3, S1]));
  assert.deepEqual(lista.map(p => p.id), ['2026-10-11_2026-10-17', '2026-10-04_2026-10-10', '2026-09-27_2026-10-03', '2026-09-20_2026-09-26']);
  assert.equal(lista[0].url, urlPlanilha(S3));
  assert.ok(lista.every(p => !/resumo_semanal/.test(p.url)), 'não deve pegar a planilha de preços médios');
});

test('a semana vem do título na página quando o nome do arquivo não traz a data', async () => {
  const dir = pastaTemp(), S3 = 'revendas_lpc-5.xlsx';
  const html = pagina([S2]).replace('<html><body>', `<html><body><p><strong><span>11/10/2026</span> a 17/10/2026</strong></p>
    <ul><li><a href="${urlPlanilha(S3)}">Preços por posto revendedor (combustíveis automotivos e GLP P13)</a> <em>(Atualizado em 20/10/2026)</em></li></ul>`);
  assert.deepEqual(precos.listarPlanilhas(html).map(p => p.id), ['2026-10-11_2026-10-17', '2026-10-04_2026-10-10']);

  const nova = planilhaAnp({ periodo: '11/10/2026 A 17/10/2026', linhas: [{ produto: 'GASOLINA COMUM', preco: 7.2, data: 46310 }] });
  await precos.atualizar({ dataDir: dir, fetchImpl: fetchFalso({ [LPC_PAGE]: pagina([S2]), [urlPlanilha(S2)]: semana2() }), ...quieto });
  const f = fetchFalso({ [LPC_PAGE]: html, [urlPlanilha(S2)]: semana2(), [urlPlanilha(S3)]: nova });
  const r = await precos.atualizar({ dataDir: dir, fetchImpl: f, semanas: 1, ...quieto });
  assert.deepEqual(r.importadas.map(i => i.semana), ['2026-10-11_2026-10-17']);
  assert.equal((await precos.atualizar({ dataDir: dir, fetchImpl: f, semanas: 1, ...quieto })).resultado, 'sem-novidade', 'não baixa de novo');
});

test('filtro retorna somente Cuiabá e Várzea Grande/MT, tolerando acento, caixa e espaços', () => {
  const { registros } = precos.lerPlanilha(planilhaAnp({ linhas: [
    { municipio: 'CUIABA', produto: 'GASOLINA COMUM' },
    { municipio: '  Cuiabá ', estado: 'Mato Grosso', produto: 'ETANOL' },
    { municipio: 'cuiaba', estado: 'MT', produto: 'DIESEL S10' },
    { municipio: ' Várzea Grande', estado: 'mt', produto: 'GLP' },
    { municipio: 'VARZEA GRANDE', estado: 'SAO PAULO', produto: 'GNV' },
    { municipio: 'SANTO ANTONIO DO LEVERGER', produto: 'GNV' },
    { municipio: 'CUIABA', estado: 'MATO GROSSO DO SUL', produto: 'DIESEL S500' },
    { municipio: 'CUIABA PAULISTA', estado: 'MATO GROSSO', produto: 'GASOLINA ADITIVADA' }
  ] }));
  assert.deepEqual(registros.map(r => r.produto).sort(), ['DIESEL S10', 'ETANOL', 'GASOLINA COMUM', 'GLP']);
  assert.ok(registros.every(r => r.uf === 'MT'));
});

test('interpreta período, preço, data da coleta e CNPJ', () => {
  const plan = precos.lerPlanilha(planilhaAnp({ linhas: [
    { produto: 'GASOLINA COMUM', preco: 7.17, data: 46300 },
    { produto: 'ETANOL', preco: '4,37', data: '06/10/2026' },
    { produto: 'DIESEL S10', preco: 4.6399999999999997, data: 46301 }
  ] }));
  assert.deepEqual(plan.periodo, { inicio: '2026-10-04', fim: '2026-10-10', texto: '04/10/2026 a 10/10/2026', id: '2026-10-04_2026-10-10' });
  const por = Object.fromEntries(plan.registros.map(r => [r.produto, r]));
  assert.equal(por['GASOLINA COMUM'].preco, 7.17);
  assert.equal(por['GASOLINA COMUM'].dataColeta, '2026-10-05');
  assert.equal(por['ETANOL'].preco, 4.37);
  assert.equal(por['ETANOL'].dataColeta, '2026-10-06');
  assert.equal(por['DIESEL S10'].preco, 4.64);
  assert.equal(por['GASOLINA COMUM'].cnpj, '07628437000113', 'CNPJ numérico recupera o zero à esquerda');
  assert.deepEqual([por['ETANOL'].razao, por['ETANOL'].bairro, por['ETANOL'].bandeira, por['ETANOL'].unidade], ['AUTO POSTO VITORIA LTDA', 'PRAEIRO', 'BRANCA', 'R$ / litro']);
});

test('identifica as colunas pelo cabeçalho, mesmo em outra ordem', () => {
  const ordem = [...CABECALHO].reverse();
  const dados = { 'CNPJ': 7628437000113, 'RAZÃO': 'POSTO X', 'MUNICÍPIO': 'CUIABA', 'ESTADO': 'MATO GROSSO', 'PRODUTO': 'ETANOL', 'PREÇO DE REVENDA': 4.5, 'DATA DA COLETA': 46300, 'BAIRRO': 'CENTRO' };
  const { xlsx } = require('./helpers');
  const buf = xlsx([['PERÍODO: 04/10/2026 A 10/10/2026'], ordem, ordem.map(c => dados[c] ?? '')]);
  const { registros } = precos.lerPlanilha(buf, { minLinhas: 1 });
  assert.equal(registros.length, 1);
  assert.deepEqual([registros[0].razao, registros[0].produto, registros[0].preco, registros[0].bairro], ['POSTO X', 'ETANOL', 4.5, 'CENTRO']);
});

test('mesmo posto com combustíveis ou datas diferentes gera registros distintos', () => {
  const { registros } = precos.lerPlanilha(planilhaAnp({ linhas: [
    { produto: 'GASOLINA COMUM', data: 46300 }, { produto: 'ETANOL', data: 46300 },
    { produto: 'GASOLINA COMUM', data: 46302, preco: 7.19 }, { produto: 'GASOLINA COMUM', data: 46300 } // última: linha repetida
  ] }));
  assert.equal(registros.length, 3);
});

test('semana em que a ANP não pesquisou Cuiabá fica registrada sem preços e sem apagar nada', async () => {
  const dir = pastaTemp();
  const vazia = planilhaAnp({ linhas: [] }); // planilha nacional válida, sem nenhuma linha de Cuiabá
  await precos.atualizar({ dataDir: dir, fetchImpl: fetchFalso({ [LPC_PAGE]: pagina([S1]), [urlPlanilha(S1)]: semana1() }), ...quieto });
  const f = fetchFalso({ [LPC_PAGE]: pagina([S2, S1]), [urlPlanilha(S2)]: vazia });
  const r = await precos.atualizar({ dataDir: dir, fetchImpl: f, ...quieto });
  assert.equal(r.resultado, 'importado');
  assert.equal(lerBase(dir).semanas['2026-10-04_2026-10-10'].registros, 0);
  assert.equal(lerBase(dir).registros.length, 2, 'os preços da semana anterior continuam na base');
  assert.equal((await precos.atualizar({ dataDir: dir, fetchImpl: f, ...quieto })).resultado, 'sem-novidade', 'a semana vazia não é baixada de novo');
  const consulta = precos.consultar(precos.carregar(dir), {});
  assert.equal(consulta.semanaReferencia.id, '2026-09-27_2026-10-03', 'a referência é a última semana com preços de Cuiabá');
  assert.equal(consulta.total, 2);

  // Reimportação forçada que voltaria vazia não apaga uma semana que já tinha preços
  const r2 = await precos.atualizar({ dataDir: dir, forcar: true, semanas: 1, fetchImpl: fetchFalso({ [LPC_PAGE]: pagina([S1]), [urlPlanilha(S1)]: planilhaAnp({ periodo: '27/09/2026 A 03/10/2026', linhas: [] }) }), ...quieto });
  assert.equal(r2.resultado, 'erro');
  assert.equal(lerBase(dir).registros.length, 2);
});

test('planilha inválida ou incompleta é rejeitada', () => {
  assert.throws(() => precos.lerPlanilha(Buffer.from('<html>erro 503</html>')), /xlsx/);
  assert.throws(() => precos.lerPlanilha(planilhaAnp({ linhas: [{}], extras: 5 })), /incompleta/);
  assert.throws(() => precos.lerPlanilha(planilhaAnp({ linhas: [{}], cabecalho: CABECALHO.map(c => (c === 'PREÇO DE REVENDA' ? 'VALOR' : c)) })), /colunas obrigatórias: preco/);
  assert.throws(() => precos.lerPlanilha(planilhaAnp({ linhas: [{ preco: 'n/d' }, { produto: 'ETANOL', data: 'ontem' }] })), /inconsistente/);
});

test('importa a planilha nova; a mesma planilha não é baixada nem duplicada na segunda execução', async () => {
  const dir = pastaTemp();
  const f = fetchFalso({ [LPC_PAGE]: pagina([S2]), [urlPlanilha(S2)]: semana2() });
  const r1 = await precos.atualizar({ dataDir: dir, fetchImpl: f, ...quieto });
  assert.equal(r1.resultado, 'importado');
  assert.deepEqual(r1.importadas.map(i => [i.semana, i.registros]), [['2026-10-04_2026-10-10', 3]]);

  const r2 = await precos.atualizar({ dataDir: dir, fetchImpl: f, ...quieto });
  assert.equal(r2.resultado, 'sem-novidade');
  assert.equal(f.chamadas.filter(u => u === urlPlanilha(S2)).length, 1, 'planilha já processada não deve ser baixada de novo');
  const base = lerBase(dir);
  assert.equal(base.registros.length, 3);
  assert.equal(new Set(base.registros.map(x => x.chave)).size, 3);
  assert.equal(base.semanas['2026-10-04_2026-10-10'].arquivo, S2);
  assert.equal(base.ultimaImportacao.semana, '2026-10-04_2026-10-10');
  assert.deepEqual(base.log.map(l => l.resultado), ['sem-novidade', 'importado']);
});

test('semana nova entra sem apagar o histórico; reimportação forçada não duplica', async () => {
  const dir = pastaTemp();
  await precos.atualizar({ dataDir: dir, fetchImpl: fetchFalso({ [LPC_PAGE]: pagina([S1]), [urlPlanilha(S1)]: semana1() }), ...quieto });
  const f = fetchFalso({ [LPC_PAGE]: pagina([S2, S1]), [urlPlanilha(S1)]: semana1(), [urlPlanilha(S2)]: semana2() });
  const r = await precos.atualizar({ dataDir: dir, fetchImpl: f, ...quieto });
  assert.deepEqual(r.importadas.map(i => i.semana), ['2026-10-04_2026-10-10']);
  assert.ok(!f.chamadas.includes(urlPlanilha(S1)), 'semana anterior já importada não é baixada de novo');
  assert.deepEqual(Object.keys(lerBase(dir).semanas).sort(), ['2026-09-27_2026-10-03', '2026-10-04_2026-10-10']);
  assert.equal(lerBase(dir).registros.length, 5);

  await precos.atualizar({ dataDir: dir, fetchImpl: f, forcar: true, ...quieto });
  assert.equal(lerBase(dir).registros.length, 5);
});

test('falha de rede preserva os dados, registra o erro e tenta de novo antes de desistir', async () => {
  const dir = pastaTemp();
  await precos.atualizar({ dataDir: dir, fetchImpl: fetchFalso({ [LPC_PAGE]: pagina([S1]), [urlPlanilha(S1)]: semana1() }), ...quieto });
  const antes = lerBase(dir).registros;

  const fora = fetchFalso({ [LPC_PAGE]: new Error('ECONNRESET') });
  const r = await precos.atualizar({ dataDir: dir, fetchImpl: fora, ...quieto });
  assert.equal(r.resultado, 'erro');
  assert.equal(fora.chamadas.length, 3, 'três tentativas na página');
  assert.deepEqual(lerBase(dir).registros, antes);
  assert.equal(lerBase(dir).ultimaExecucao.resultado, 'erro');
  assert.match(lerBase(dir).log[0].mensagem, /ECONNRESET/);

  // Página ok, mas o download da planilha nova falha (HTTP 503 nas três tentativas)
  const semArquivo = fetchFalso({ [LPC_PAGE]: pagina([S2, S1]), [urlPlanilha(S2)]: 503 });
  const r2 = await precos.atualizar({ dataDir: dir, fetchImpl: semArquivo, ...quieto });
  assert.equal(r2.resultado, 'erro');
  assert.deepEqual(lerBase(dir).registros, antes);
  assert.ok(!fs.existsSync(path.join(dir, 'atualizacao.lock')), 'a trava é liberada mesmo com falha');
});

test('falha temporária de rede é recuperada na nova tentativa', async () => {
  const dir = pastaTemp();
  const f = fetchFalso({ [LPC_PAGE]: n => (n < 3 ? new Error('ETIMEDOUT') : pagina([S2])), [urlPlanilha(S2)]: n => (n < 2 ? 502 : semana2()) });
  const r = await precos.atualizar({ dataDir: dir, fetchImpl: f, ...quieto });
  assert.equal(r.resultado, 'importado');
  assert.equal(lerBase(dir).registros.length, 3);
});

test('planilha inválida ou incompleta não substitui dados válidos', async () => {
  const dir = pastaTemp();
  await precos.atualizar({ dataDir: dir, fetchImpl: fetchFalso({ [LPC_PAGE]: pagina([S1]), [urlPlanilha(S1)]: semana1() }), ...quieto });
  const antes = lerBase(dir).registros;
  for (const ruim of [Buffer.from('não é planilha'), planilhaAnp({ linhas: [{}], extras: 3 }), semana2().subarray(0, 900)]) {
    const r = await precos.atualizar({ dataDir: dir, fetchImpl: fetchFalso({ [LPC_PAGE]: pagina([S2, S1]), [urlPlanilha(S2)]: ruim }), ...quieto });
    assert.equal(r.resultado, 'erro');
    assert.deepEqual(lerBase(dir).registros, antes);
    assert.deepEqual(Object.keys(lerBase(dir).semanas), ['2026-09-27_2026-10-03']);
  }
  // Depois que a ANP corrige o arquivo, a semana entra normalmente
  const ok = await precos.atualizar({ dataDir: dir, fetchImpl: fetchFalso({ [LPC_PAGE]: pagina([S2, S1]), [urlPlanilha(S2)]: semana2() }), ...quieto });
  assert.equal(ok.resultado, 'importado');
  assert.equal(lerBase(dir).registros.length, 5);
});

test('API /api/precos devolve os dados e aplica os filtros', async t => {
  const dir = pastaTemp();
  const f = fetchFalso({ [LPC_PAGE]: pagina([S2, S1]), [urlPlanilha(S1)]: semana1(), [urlPlanilha(S2)]: semana2() });
  await precos.atualizar({ dataDir: dir, fetchImpl: f, ...quieto });
  const { server } = criarServidor({ dataDir: dir, fetchImpl: f, log: () => {} });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  t.after(() => server.close());
  const api = async caminho => { const r = await fetch(`http://127.0.0.1:${server.address().port}${caminho}`); return { status: r.status, body: await r.json() }; };

  const padrao = await api('/api/precos?municipio=CUIABA&uf=MT');
  assert.equal(padrao.status, 200);
  assert.equal(padrao.body.total, 3, 'por padrão, só a semana mais recente');
  assert.equal(padrao.body.semanaReferencia.periodo, '04/10/2026 a 10/10/2026');
  assert.ok(padrao.body.ultimaAtualizacao && padrao.body.aviso);
  assert.deepEqual(padrao.body.filtros.combustiveis, ['ETANOL', 'GASOLINA COMUM']);
  assert.deepEqual(Object.keys(padrao.body.registros[0]).sort(), ['bairro', 'bandeira', 'cep', 'chave', 'cnpj', 'complemento', 'dataColeta', 'endereco', 'fantasia', 'municipio', 'numero', 'preco', 'produto', 'razao', 'semana', 'uf', 'unidade']);

  assert.equal((await api('/api/precos?semanas=todas')).body.total, 5);
  assert.deepEqual((await api('/api/precos?combustivel=etanol')).body.registros.map(r => r.preco), [4.37]);
  assert.deepEqual((await api('/api/precos?bairro=Alvorada')).body.registros.map(r => r.razao), ['JGJ COMERCIO DE PETROLEO LTDA']);
  assert.equal((await api('/api/precos?bandeira=vibra')).body.total, 1);
  assert.deepEqual((await api('/api/precos?precoMin=7.18&precoMax=8')).body.registros.map(r => r.preco), [7.19]);
  assert.deepEqual((await api('/api/precos?semanas=todas&coletaDe=2026-09-01&coletaAte=2026-09-30')).body.registros.map(r => r.dataColeta), ['2026-09-29', '2026-09-29']);
  assert.equal((await api('/api/precos?combustivel=GLP')).body.total, 0);

  const vg = await api('/api/precos?municipio=VARZEA%20GRANDE&uf=MT');
  assert.equal(vg.status, 200);
  assert.equal(vg.body.total, 0, 'a base de teste só tem Cuiabá');
  assert.equal((await api('/api/precos?semanas=todas&municipio=CUIABA,VARZEA%20GRANDE')).body.total, 5);
  assert.equal((await api('/api/precos?municipio=SINOP&uf=MT')).status, 400);
  assert.equal((await api('/api/precos?precoMin=abc')).status, 400);
  assert.equal((await api('/api/precos?coletaDe=10/10/2026')).status, 400);

  const status = await api('/api/precos/status');
  assert.equal(status.body.registros, 5);
  assert.deepEqual(status.body.semanas.map(s => s.id), ['2026-10-04_2026-10-10', '2026-09-27_2026-10-03']);
});

test('agenda semanal calcula a próxima execução', () => {
  const seg10 = (ano, mes, dia, h) => new Date(ano, mes - 1, dia, h);
  assert.deepEqual(proximaExecucao(seg10(2026, 10, 12, 9), 1, 10), seg10(2026, 10, 12, 10));  // segunda antes das 10h -> hoje
  assert.deepEqual(proximaExecucao(seg10(2026, 10, 12, 10), 1, 10), seg10(2026, 10, 19, 10)); // segunda às 10h -> próxima semana
  assert.deepEqual(proximaExecucao(seg10(2026, 10, 14, 15), 1, 10), seg10(2026, 10, 19, 10)); // quarta -> segunda seguinte
});
