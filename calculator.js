/* Smartech Coifas — calculator.js
 * Liga a calculadora da página ao núcleo de cálculo (calc-core.js): valores animados,
 * slider com preenchimento, resumo acessível e envio do dimensionamento ao formulário.
 */
(function () {
  'use strict';

  var core = window.SmartechCalc;
  var doc = document;
  if (!core) return;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  function $(id) { return doc.getElementById(id); }

  var el = {
    equip: $('c-equip'), hood: $('c-hood'),
    length: $('c-length'), width: $('c-width'), hours: $('c-hours'),
    lengthOut: $('c-length-out'), widthOut: $('c-width-out'), hoursOut: $('c-hours-out'),
    m3: $('r-m3'), cfm: $('r-cfm'), cv: $('r-cv'), duct: $('r-duct'), vel: $('r-vel'),
    savings: $('r-savings'), gauge: $('r-gauge'), live: $('calcLive'), toQuote: $('calcToQuote')
  };
  if (!el.equip || !el.m3) return;

  var current = null;
  var liveTimer = 0;

  var fmtInt = function (n) { return Math.round(n).toLocaleString('pt-BR'); };
  var fmtDec1 = function (n) { return n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); };
  var fmtCv = function (n) { return n.toLocaleString('pt-BR', { maximumFractionDigits: 2 }); };

  /** Anima o número até o novo valor (ou troca direto se houver preferência por menos movimento). */
  function setNum(node, value, fmt, animate) {
    var from = parseFloat(node.dataset.value);
    node.dataset.value = String(value);
    if (node._raf) cancelAnimationFrame(node._raf);
    if (!animate || reduceMotion.matches || !isFinite(from) || from === value) { node.textContent = fmt(value); return; }
    var start = performance.now();
    var DUR = 480;
    (function step(now) {
      var t = Math.min(1, (now - start) / DUR);
      var eased = 1 - Math.pow(1 - t, 3);
      node.textContent = fmt(from + (value - from) * eased);
      if (t < 1) node._raf = requestAnimationFrame(step);
      else node.textContent = fmt(value);
    })(start);
  }

  function paintRange(input) {
    var min = parseFloat(input.min), max = parseFloat(input.max), v = parseFloat(input.value);
    input.style.setProperty('--pct', (((v - min) / (max - min)) * 100).toFixed(1) + '%');
  }

  function read() {
    return { equip: el.equip.value, hood: el.hood.value, length: el.length.value, width: el.width.value, hours: el.hours.value };
  }

  function render(animate) {
    var r = core.compute(read());
    if (!r.ok) return;
    current = r;

    el.lengthOut.textContent = fmtDec1(r.input.length) + ' m';
    el.widthOut.textContent = fmtDec1(r.input.width) + ' m';
    el.hoursOut.textContent = r.input.hours + ' h/dia';
    [el.length, el.width, el.hours].forEach(paintRange);

    setNum(el.m3, r.airflowM3h, fmtInt, animate);
    setNum(el.cfm, r.airflowCfm, fmtInt, animate);
    setNum(el.cv, r.motorCv, fmtCv, animate);
    setNum(el.duct, r.ductMm, fmtInt, animate);
    setNum(el.vel, r.ductVelocity, fmtDec1, animate);
    el.savings.textContent = 'R$ ' + fmtInt(r.annualSavings) + ' / ano';
    el.gauge.style.width = Math.max(6, Math.min(100, (r.airflowM3h / 50000) * 100)).toFixed(1) + '%';

    // Anúncio único (sem narrar cada passo da animação) para leitores de tela
    clearTimeout(liveTimer);
    liveTimer = setTimeout(function () {
      el.live.textContent = 'Vazão recomendada ' + fmtInt(r.airflowM3h) + ' metros cúbicos por hora, motor estimado ' +
        fmtCv(r.motorCv) + ' CV, duto de ' + r.ductMm + ' milímetros.';
    }, 700);
  }

  ['input', 'change'].forEach(function (evt) {
    [el.equip, el.hood, el.length, el.width, el.hours].forEach(function (input) {
      input.addEventListener(evt, function () { render(true); });
    });
  });

  // Enviar para o formulário de orçamento
  if (el.toQuote) {
    el.toQuote.addEventListener('click', function () {
      if (!current) return;
      var airflow = doc.getElementById('f-airflow');
      var calc = doc.getElementById('f-calc');
      var status = doc.getElementById('formStatus');
      if (airflow) airflow.value = fmtInt(current.airflowM3h) + ' m³/h';
      if (calc) calc.value = core.describe(current);
      if (status) { status.className = 'form__status'; status.textContent = 'Dimensionamento anexado ao formulário.'; }

      var contact = doc.getElementById('contact');
      if (contact) contact.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
      window.setTimeout(function () {
        var name = doc.getElementById('f-name');
        if (name) name.focus({ preventScroll: true });
      }, reduceMotion.matches ? 0 : 700);
    });
  }

  render(false);
})();
