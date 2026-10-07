/*!
 * Smartech Coifas — calc-core.js
 * Regras do pré-dimensionamento de exaustão: funções puras, sem DOM.
 * UMD: no navegador expõe window.SmartechCalc; no Node (tests/) usa module.exports.
 *
 * ATENÇÃO: é uma estimativa comercial. O dimensionamento final precisa ser validado
 * pelo responsável técnico (vazão por área, perda de carga e rendimento são premissas).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SmartechCalc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Vazão de referência (m³/h por m² de área da coifa), por tipo de equipamento. */
  var EQUIPMENT = { parrilla: 2800, chapa: 2200, forno: 1600, caldeira: 1200 };
  /** Multiplicador por tipo de instalação (ilha = 4 faces abertas → mais vazão). */
  var HOOD = { parede: 1.0, ilha: 1.35, baixa: 0.85 };

  var LABELS = {
    equip: {
      parrilla: 'Grelha / churrasqueira',
      chapa: 'Chapa e fritadeiras',
      forno: 'Forno combinado / fogão industrial',
      caldeira: 'Caldeira / panela de cozimento'
    },
    hood: { parede: 'Coifa de parede', ilha: 'Coifa de ilha', baixa: 'Coifa prismática baixa' }
  };

  var LIMITS = { length: [1, 6], width: [0.8, 2.2], hours: [4, 24] };

  var SYSTEM = {
    pressurePa: 450,      // perda de carga do sistema (filtros + dutos + curvas)
    efficiency: 0.6,      // rendimento do conjunto motor + ventilador
    motorMargin: 1.15,    // folga sobre a potência de eixo
    wattsPerCv: 735.5,    // 1 CV = 735,5 W
    ductVelocity: 10,     // m/s de projeto para o duto
    m3hPerCfm: 1.699      // 1 CFM = 1,699 m³/h
  };

  /** Estimativa ILUSTRATIVA de economia em limpeza (R$/ano). Ajuste com dados reais. */
  var SAVINGS = { perHour: 350, perMeter: 1500 };

  var CV_COMMERCIAL = [0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 7.5, 10, 12.5, 15, 20];
  var DUCT_COMMERCIAL_MM = [150, 175, 200, 225, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 800, 900, 1000, 1200, 1400, 1600];

  function toNumber(v) {
    return typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  }
  function clamp(v, range) {
    return Math.min(range[1], Math.max(range[0], v));
  }
  function has(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  /**
   * @param {{equip:string, hood:string, length:number|string, width:number|string, hours:number|string}} input
   * @returns {{ok:false,error:string}|{ok:true, input:object, airflowM3h:number, airflowCfm:number,
   *   shaftKw:number, motorCv:number, ductMm:number, ductTheoreticalMm:number, ductVelocity:number, annualSavings:number}}
   */
  function compute(input) {
    input = input || {};
    if (!has(EQUIPMENT, input.equip)) return { ok: false, error: 'equip' };
    if (!has(HOOD, input.hood)) return { ok: false, error: 'hood' };

    var length = toNumber(input.length);
    var width = toNumber(input.width);
    var hours = toNumber(input.hours);
    if (!isFinite(length) || !isFinite(width) || !isFinite(hours)) return { ok: false, error: 'number' };

    length = clamp(length, LIMITS.length);
    width = clamp(width, LIMITS.width);
    hours = Math.round(clamp(hours, LIMITS.hours));

    var airflowM3h = Math.round(length * width * EQUIPMENT[input.equip] * HOOD[input.hood]);
    var airflowCfm = Math.round(airflowM3h / SYSTEM.m3hPerCfm);

    // P[W] = Q[m³/s] · Δp[Pa] / η
    var shaftW = (airflowM3h / 3600) * SYSTEM.pressurePa / SYSTEM.efficiency;
    var cvNeeded = (shaftW * SYSTEM.motorMargin) / SYSTEM.wattsPerCv;
    var motorCv = CV_COMMERCIAL.filter(function (c) { return c >= cvNeeded; })[0];
    if (motorCv === undefined) motorCv = Math.ceil(cvNeeded);

    var ductArea = airflowM3h / 3600 / SYSTEM.ductVelocity;
    var ductTheoreticalMm = Math.round(Math.sqrt((4 * ductArea) / Math.PI) * 1000);
    var ductMm = DUCT_COMMERCIAL_MM.filter(function (d) { return d >= ductTheoreticalMm; })[0];
    if (ductMm === undefined) ductMm = Math.ceil(ductTheoreticalMm / 50) * 50;
    var ductVelocity = airflowM3h / 3600 / (Math.PI * Math.pow(ductMm / 1000, 2) / 4);

    return {
      ok: true,
      input: { equip: input.equip, hood: input.hood, length: length, width: width, hours: hours },
      airflowM3h: airflowM3h,
      airflowCfm: airflowCfm,
      shaftKw: Math.round((shaftW / 1000) * 100) / 100,
      motorCv: motorCv,
      ductMm: ductMm,
      ductTheoreticalMm: ductTheoreticalMm,
      ductVelocity: Math.round(ductVelocity * 10) / 10,
      annualSavings: Math.round(hours * SAVINGS.perHour + length * SAVINGS.perMeter)
    };
  }

  /** Resumo em uma linha, usado na mensagem de orçamento. */
  function describe(result) {
    if (!result || !result.ok) return '';
    var i = result.input;
    var n = function (v) { return v.toLocaleString('pt-BR'); };
    return LABELS.equip[i.equip] + ' · ' + LABELS.hood[i.hood] + ' · ' +
      n(i.length) + ' m × ' + n(i.width) + ' m · ' + i.hours + ' h/dia · ' +
      n(result.airflowM3h) + ' m³/h (' + n(result.airflowCfm) + ' CFM) · motor ≈ ' +
      n(result.motorCv) + ' CV · duto Ø ' + result.ductMm + ' mm';
  }

  return {
    compute: compute,
    describe: describe,
    EQUIPMENT: EQUIPMENT,
    HOOD: HOOD,
    LABELS: LABELS,
    LIMITS: LIMITS,
    SYSTEM: SYSTEM,
    CV_COMMERCIAL: CV_COMMERCIAL,
    DUCT_COMMERCIAL_MM: DUCT_COMMERCIAL_MM
  };
});
