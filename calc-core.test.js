/* Testes do núcleo de cálculo. Rode com:  node --test tests/ */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const calc = require('../js/calc-core.js');

const base = { equip: 'chapa', hood: 'parede', length: 2.5, width: 1.1, hours: 12 };

test('cenário padrão da página (valores iniciais do HTML)', () => {
  const r = calc.compute(base);
  assert.equal(r.ok, true);
  assert.equal(r.airflowM3h, 6050);
  assert.equal(r.airflowCfm, 3561);
  assert.equal(r.motorCv, 2);          // antes do conserto: 10 CV (unidade errada, ~9,8×)
  assert.equal(r.ductMm, 500);
  assert.equal(r.ductVelocity, 8.6);
  assert.equal(r.annualSavings, 7950);
});

test('potência do motor segue P = Q·Δp/η (e não passa de ~2× o valor físico)', () => {
  for (const equip of Object.keys(calc.EQUIPMENT)) {
    for (const hood of Object.keys(calc.HOOD)) {
      const r = calc.compute({ ...base, equip, hood });
      const physicalCv = (r.airflowM3h / 3600 * calc.SYSTEM.pressurePa / calc.SYSTEM.efficiency) / calc.SYSTEM.wattsPerCv;
      assert.ok(r.motorCv >= physicalCv, `${equip}/${hood}: motor menor que o necessário`);
      assert.ok(r.motorCv <= physicalCv * 2.2 + 0.5, `${equip}/${hood}: motor superdimensionado`);
    }
  }
});

test('motor e duto são sempre tamanhos comerciais', () => {
  for (const length of [1, 1.7, 2.5, 4.4, 6]) {
    for (const width of [0.8, 1.1, 1.9, 2.2]) {
      const r = calc.compute({ ...base, length, width });
      assert.ok(calc.CV_COMMERCIAL.includes(r.motorCv) || Number.isInteger(r.motorCv));
      assert.ok(r.ductMm >= r.ductTheoreticalMm, 'duto comercial nunca menor que o teórico');
      assert.ok(r.ductVelocity <= calc.SYSTEM.ductVelocity + 0.01, 'velocidade no duto dentro do limite de projeto');
    }
  }
});

test('ilha exige mais vazão que parede; coifa baixa, menos', () => {
  const parede = calc.compute(base).airflowM3h;
  assert.ok(calc.compute({ ...base, hood: 'ilha' }).airflowM3h > parede);
  assert.ok(calc.compute({ ...base, hood: 'baixa' }).airflowM3h < parede);
});

test('entradas fora do intervalo são limitadas, não quebram', () => {
  const r = calc.compute({ ...base, length: 999, width: -3, hours: 100 });
  assert.equal(r.ok, true);
  assert.equal(r.input.length, 6);
  assert.equal(r.input.width, 0.8);
  assert.equal(r.input.hours, 24);
});

test('aceita números como texto, inclusive com vírgula decimal', () => {
  const r = calc.compute({ ...base, length: '2,5', width: '1.1', hours: '12' });
  assert.equal(r.airflowM3h, 6050);
});

test('entradas inválidas retornam erro em vez de NaN', () => {
  assert.deepEqual(calc.compute({ ...base, equip: 'foguete' }), { ok: false, error: 'equip' });
  assert.deepEqual(calc.compute({ ...base, hood: 'x' }), { ok: false, error: 'hood' });
  assert.deepEqual(calc.compute({ ...base, length: 'abc' }), { ok: false, error: 'number' });
  assert.deepEqual(calc.compute(), { ok: false, error: 'equip' });
});

test('"constructor"/"__proto__" não passam como tipo de equipamento', () => {
  assert.equal(calc.compute({ ...base, equip: 'constructor' }).ok, false);
  assert.equal(calc.compute({ ...base, hood: '__proto__' }).ok, false);
});

test('describe() gera o resumo usado no orçamento', () => {
  const text = calc.describe(calc.compute(base));
  assert.match(text, /Chapa e fritadeiras/);
  assert.match(text, /6\.050 m³\/h/);
  assert.match(text, /motor ≈ 2 CV/);
  assert.equal(calc.describe({ ok: false }), '');
});
