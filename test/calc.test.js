'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Calc = require('../public/js/calc.js');

test('etanol x gasolina: regra dos 70%', () => {
  assert.equal(Calc.flex(6, 3.9, 50).melhor, 'etanol'); // 65%
  assert.equal(Calc.flex(6, 4.8, 50).melhor, 'gasolina'); // 80%
  assert.equal(Calc.flex(6, 4.2, 50).melhor, 'empate'); // 70%
  // 50 L de gasolina a R$ 6 = R$ 300; o mesmo percurso com etanol a R$ 3,50 = 50 / 0,7 x 3,50 = R$ 250
  assert.ok(Math.abs(Calc.flex(6, 3.5, 50).economia - 50) < 1e-9);
  assert.ok(Math.abs(Calc.flex(6, 3.5, 50).noTanque - 125) < 1e-9); // encher com etanol custa R$ 125 a menos
  assert.equal(Calc.flex(6, null, 50), null);
  assert.equal(Calc.flex(undefined, 4, 50), null);
});

test('tendência da semana compara só os postos pesquisados nas duas semanas', () => {
  const reg = (semana, cnpj, preco, produto = 'ETANOL') => ({ semana, cnpj, preco, produto, dataColeta: semana.slice(0, 10) });
  const S1 = '2026-09-27_2026-10-03', S2 = '2026-10-04_2026-10-10';
  const registros = [
    reg(S1, 'a', 4.0), reg(S1, 'b', 4.2), reg(S1, 'so-antes', 9),
    reg(S2, 'a', 4.1), reg(S2, 'b', 4.5), reg(S2, 'so-agora', 1),
    reg(S2, 'a', 7, 'GASOLINA COMUM'),
    reg('2026-09-20_2026-09-26', 'a', 2), reg('2026-09-20_2026-09-26', 'b', 2)
  ];
  const t = Calc.tendenciaSemana(registros, 'ETANOL', 2);
  assert.equal(t.postos, 2);
  assert.ok(Math.abs(t.dif - 0.2) < 1e-9);
  assert.ok(Math.abs(t.media - 4.3) < 1e-9);

  assert.equal(Calc.tendenciaSemana(registros, 'ETANOL'), null); // menos de 5 postos em comum
  assert.equal(Calc.tendenciaSemana(registros.filter(r => r.semana === S2), 'ETANOL', 1), null); // só uma semana
});
