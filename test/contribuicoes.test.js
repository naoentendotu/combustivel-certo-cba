'use strict';
// Preços informados pelos usuários: validação, confirmação e leitura da foto.   node --test test/contribuicoes.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { validar, estado, criarServico } = require('../lib/contribuicoes');
const Calc = require('../public/js/calc.js');
const { pastaTemp } = require('./helpers');

// AUTO POSTO MAE BONIFACIA, do cadastro em public/js/data/stations-data.js
const POSTO = { cnpj: '58238092000122', lat: -15.576423, lng: -56.101279 };
const envio = (o = {}) => ({ ...POSTO, precos: { gasolina: 6.19 }, ...o });

test('validar: aceita quem está no posto com preço na faixa da ANP', () => {
  assert.deepEqual(validar(envio({ ocr: true }), { gasolina: 6.3 }), { cnpj: POSTO.cnpj, precos: { gasolina: 6.19 }, ocr: true });
});

test('validar: recusa posto desconhecido, sem localização, longe do posto, preço fora da faixa e envio vazio', () => {
  const recusa = (corpo, medias, msg) => assert.throws(() => validar(corpo, medias), e => e.status === 400 && msg.test(e.message));
  recusa(envio({ cnpj: '1' }), {}, /posto desconhecido/);
  recusa(envio({ lat: undefined }), {}, /localização/);
  recusa(envio({ lat: POSTO.lat + 0.01 }), {}, /estar no posto/); // ~1 km
  recusa(envio({ precos: { gasolina: 9.9 } }), { gasolina: 6.3 }, /fora da faixa/);
  recusa(envio({ precos: { gasolina: 'abc' } }), {}, /fora da faixa/);
  recusa(envio({ precos: { gasolina: 1 } }), {}, /fora da faixa/); // sem média da ANP vale 2 a 15
  recusa(envio({ precos: { querosene: 5 } }), {}, /combustível inválido/);
  recusa(envio({ precos: {} }), {}, /pelo menos um/);
});

test('estado: só confirma com dois aparelhos e duas redes informando o mesmo preço', () => {
  const e = (preco, disp, ip, ts = 1000) => ({ preco, disp, ip, ts });
  assert.equal(estado([]), null);
  assert.equal(estado([e(6.19, 'a', 'x')]).estado, 'pendente');
  assert.equal(estado([e(6.19, 'b', 'x'), e(6.19, 'a', 'x')]).estado, 'pendente'); // mesma rede
  assert.equal(estado([e(6.19, 'a', 'y'), e(6.19, 'a', 'x')]).estado, 'pendente'); // mesmo aparelho
  assert.equal(estado([e(6.2, 'b', 'y'), e(6.19, 'a', 'x')]).estado, 'confirmado'); // R$ 0,01 de diferença
  assert.equal(estado([e(6.29, 'b', 'y'), e(6.19, 'a', 'x')]).estado, 'pendente');
  assert.equal(estado([e(6.19, 'b', 'y', 49 * 3600e3), e(6.19, 'a', 'x', 0)]).estado, 'pendente'); // passou de 48 h
});

test('serviço: envio de duas redes confirma o preço e o limite por hora barra o excesso', async () => {
  const s = criarServico({ env: {}, dataDir: pastaTemp() });
  assert.equal((await s.enviar(envio({ disp: 'a' }), '1.1.1.1')).gasolina.estado, 'pendente');
  assert.equal((await s.enviar(envio({ disp: 'b' }), '2.2.2.2')).gasolina.estado, 'confirmado');
  const g = (await s.listar())[POSTO.cnpj].gasolina;
  assert.deepEqual([g.preco, g.estado, g.confirmacoes], [6.19, 'confirmado', 2]);
  for (let i = 0; i < 9; i++) await s.enviar(envio({ disp: 'a' }), '1.1.1.1');
  await assert.rejects(s.enviar(envio({ disp: 'a' }), '1.1.1.1'), e => e.status === 429);
});

test('leitura da foto: pega os preços da placa', () => {
  assert.deepEqual(Calc.precosDaFoto('GASOLINA 6,19\nETANOL 4.299\nDIESEL S10 6,09'), [6.19, 4.299, 6.09]);
  assert.deepEqual(Calc.precosDaFoto('R$ 6,19 6,19 1,00 99,99'), [6.19]); // repetido e fora de 2 a 15 saem
  assert.deepEqual(Calc.precosDaFoto(''), []);
});
