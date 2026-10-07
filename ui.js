/* Smartech Coifas — ui.js
 * Interações da página (sem dependências): header, menu mobile, scrollspy, barra de progresso,
 * comparador antes/depois, filtros e fichas dos projetos, diálogos e formulário de orçamento.
 */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var WA = (doc.body.dataset.wa || '5548991809488').replace(/\D/g, '');

  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }
  function waUrl(text) { return 'https://wa.me/' + WA + (text ? '?text=' + encodeURIComponent(text) : ''); }

  var state = { menuOpen: false };

  /* ------------------------------------------------------------------ */
  /* Links de WhatsApp (mensagem pré-preenchida)                         */
  /* ------------------------------------------------------------------ */
  function initWaLinks() {
    var hello = 'Olá! Vim pelo site da Smartech e gostaria de um orçamento.';
    $$('[data-wa-link]').forEach(function (a) {
      a.href = waUrl(hello);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    });
    var fab = $('#fab');
    if (fab) fab.href = waUrl(hello);
  }

  /* ------------------------------------------------------------------ */
  /* Header, barra de progresso e botão flutuante                        */
  /* ------------------------------------------------------------------ */
  function initScrollUi() {
    var header = $('#siteHeader');
    var bar = $('.scroll-progress span');
    var fab = $('#fab');
    var lastY = window.pageYOffset;
    var ticking = false;

    function update() {
      ticking = false;
      var y = window.pageYOffset;
      var max = Math.max(1, doc.documentElement.scrollHeight - window.innerHeight);

      if (bar) bar.style.transform = 'scaleX(' + Math.min(1, Math.max(0, y / max)).toFixed(4) + ')';
      if (header) {
        header.classList.toggle('is-solid', y > 24);
        if (!state.menuOpen) {
          if (y > lastY + 6 && y > 480) header.classList.add('is-hidden');
          else if (y < lastY - 6 || y < 120) header.classList.remove('is-hidden');
        }
      }
      if (fab) fab.classList.toggle('is-visible', y > 640);
      lastY = y;
    }

    function onScroll() {
      if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    if (header) {
      header.addEventListener('focusin', function () { header.classList.remove('is-hidden'); });
    }
    update();
  }

  /* ------------------------------------------------------------------ */
  /* Menu mobile (acessível: Esc, trava de foco, rolagem bloqueada)      */
  /* ------------------------------------------------------------------ */
  function initMenu() {
    var btn = $('#menuToggle');
    var menu = $('#mobileMenu');
    var header = $('#siteHeader');
    if (!btn || !menu) return;

    function focusables() {
      return [btn].concat($$('a[href], button:not([disabled])', menu));
    }

    function setOpen(open, returnFocus) {
      state.menuOpen = open;
      menu.classList.toggle('is-open', open);
      header.classList.toggle('is-menu-open', open);
      header.classList.remove('is-hidden');
      root.classList.toggle('is-locked', open);
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
      if (open) {
        var first = $('a', menu);
        if (first) first.focus({ preventScroll: true });
      } else if (returnFocus) {
        btn.focus({ preventScroll: true });
      }
    }

    btn.addEventListener('click', function () { setOpen(!state.menuOpen, true); });

    menu.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false, false);
    });

    doc.addEventListener('keydown', function (e) {
      if (!state.menuOpen) return;
      if (e.key === 'Escape') { setOpen(false, true); return; }
      if (e.key !== 'Tab') return;
      var items = focusables();
      var first = items[0];
      var last = items[items.length - 1];
      if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    window.matchMedia('(min-width: 1081px)').addEventListener('change', function (mq) {
      if (mq.matches && state.menuOpen) setOpen(false, false);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Scrollspy: marca no menu a seção visível                            */
  /* ------------------------------------------------------------------ */
  function initScrollspy() {
    if (!('IntersectionObserver' in window)) return;
    var links = $$('.nav a[href^="#"], .mobile-menu__nav a[href^="#"]');
    var sections = {};
    links.forEach(function (a) {
      var id = a.getAttribute('href').slice(1);
      var sec = doc.getElementById(id);
      if (sec) (sections[id] = sections[id] || { el: sec, links: [] }).links.push(a);
    });

    function setCurrent(id) {
      links.forEach(function (a) {
        if (id && a.getAttribute('href') === '#' + id) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
    }

    var visible = {};
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { visible[en.target.id] = en.isIntersecting; });
      var current = Object.keys(sections).filter(function (id) { return visible[id]; }).pop();
      setCurrent(current || null);
    }, { rootMargin: '-40% 0px -55% 0px' });
    Object.keys(sections).forEach(function (id) { io.observe(sections[id].el); });
  }

  /* ------------------------------------------------------------------ */
  /* Holofote que segue o cursor nos cartões                             */
  /* ------------------------------------------------------------------ */
  function initSpotlight() {
    if (!window.matchMedia('(hover: hover)').matches) return;
    doc.addEventListener('pointermove', function (e) {
      var card = e.target.closest && e.target.closest('.spot');
      if (!card) return;
      var r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top) + 'px');
    }, { passive: true });
  }

  /* ------------------------------------------------------------------ */
  /* Comparador antes/depois (pointer events + teclado + dica animada)   */
  /* ------------------------------------------------------------------ */
  function initCompare() {
    var cmp = $('#cmp');
    var handle = $('#cmpHandle');
    if (!cmp || !handle) return;

    var pos = 50;
    var dragging = false;
    var touched = false;      // o usuário já interagiu → cancela a dica automática
    var hintRaf = 0;

    function describePos(p) {
      if (p <= 2) return 'Mostrando apenas o duto com UV-C';
      if (p >= 98) return 'Mostrando apenas o duto convencional';
      return Math.round(p) + '% duto convencional, ' + Math.round(100 - p) + '% duto com UV-C';
    }
    function setPos(p) {
      pos = Math.max(0, Math.min(100, p));
      cmp.style.setProperty('--pos', pos.toFixed(2) + '%');
      handle.setAttribute('aria-valuenow', String(Math.round(pos)));
      handle.setAttribute('aria-valuetext', describePos(pos));
    }
    function fromEvent(e) {
      var r = cmp.getBoundingClientRect();
      return ((e.clientX - r.left) / r.width) * 100;
    }
    function stopHint() { touched = true; if (hintRaf) { cancelAnimationFrame(hintRaf); hintRaf = 0; } }

    cmp.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      stopHint();
      dragging = true;
      try { cmp.setPointerCapture(e.pointerId); } catch (err) { /* sem captura: segue funcionando */ }
      // No toque não "pula": quem só quer rolar a página na vertical não desloca o controle.
      if (e.pointerType !== 'touch') setPos(fromEvent(e));
    });
    cmp.addEventListener('pointermove', function (e) { if (dragging) setPos(fromEvent(e)); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (t) {
      cmp.addEventListener(t, function () { dragging = false; });
    });

    handle.addEventListener('keydown', function (e) {
      var step = e.shiftKey ? 10 : 5;
      var next = null;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = pos - step;
      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = pos + step;
      else if (e.key === 'PageDown') next = pos - 10;
      else if (e.key === 'PageUp') next = pos + 10;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = 100;
      if (next === null) return;
      e.preventDefault();
      stopHint();
      setPos(next);
    });

    // Dica: balança o controle uma vez quando a seção entra na tela (disparada por motion.js)
    doc.addEventListener('smartech:cmp-hint', function () {
      if (touched || reduceMotion.matches) return;
      var keys = [50, 26, 74, 50];
      var seg = 0;
      var from = keys[0];
      var start = performance.now();
      var DUR = 650;
      function step(now) {
        if (touched) return;
        var t = Math.min(1, (now - start) / DUR);
        var e = 0.5 - Math.cos(Math.PI * t) / 2;           // easeInOutSine
        setPos(from + (keys[seg + 1] - from) * e);
        if (t < 1) { hintRaf = requestAnimationFrame(step); return; }
        seg += 1;
        if (seg >= keys.length - 1) { hintRaf = 0; return; }
        from = keys[seg];
        start = now;
        hintRaf = requestAnimationFrame(step);
      }
      hintRaf = requestAnimationFrame(step);
    });

    setPos(50);
  }

  /* ------------------------------------------------------------------ */
  /* Projetos: filtro, fotos opcionais e ficha técnica                   */
  /* ------------------------------------------------------------------ */
  function initCases() {
    var grid = $('#casesGrid');
    if (!grid) return;
    var filters = $$('.filter');
    var items = $$('.case', grid);

    filters.forEach(function (btn) {
      btn.addEventListener('click', function () {
        filters.forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
        var f = btn.dataset.filter;
        var shown = [];
        items.forEach(function (li) {
          var show = f === 'all' || li.dataset.category === f;
          li.hidden = !show;
          if (show) shown.push(li);
        });
        if (window.gsap && !reduceMotion.matches) {
          window.gsap.fromTo(shown,
            { opacity: 0, y: 24, scale: 0.97 },
            { opacity: 1, y: 0, scale: 1, duration: 0.6, stagger: 0.07, ease: 'power3.out', overwrite: true });
        }
        // a altura da grade mudou: recalcula os gatilhos de rolagem das seções seguintes
        if (window.ScrollTrigger) window.requestAnimationFrame(function () { window.ScrollTrigger.refresh(); });
      });
    });

    // Fotos reais: preencha data-photo="assets/cases/arquivo.webp" no HTML (sem 404 enquanto vazio)
    $$('.case__media[data-photo]').forEach(function (media) {
      var src = (media.dataset.photo || '').trim();
      if (!src) return;
      var title = (media.closest('.case__card').querySelector('h3') || {}).textContent || 'projeto';
      var img = new Image();
      img.alt = 'Foto do projeto ' + title;
      img.decoding = 'async';
      img.loading = 'lazy';
      img.onload = function () { media.insertBefore(img, media.firstChild); media.classList.add('has-photo'); };
      img.src = src;
    });
  }

  /* ------------------------------------------------------------------ */
  /* Diálogos nativos (<dialog>)                                         */
  /* ------------------------------------------------------------------ */
  function initDialogs() {
    var caseDlg = $('#caseDialog');
    var privacyDlg = $('#privacidade');

    function open(dlg) {
      if (typeof dlg.showModal === 'function') { dlg.showModal(); root.classList.add('is-locked'); }
      else dlg.setAttribute('open', '');
    }
    [caseDlg, privacyDlg].forEach(function (dlg) {
      if (!dlg) return;
      function shut() { dlg.close(); root.classList.remove('is-locked'); }   // destrava já, sem esperar o evento "close"
      dlg.addEventListener('close', function () { root.classList.remove('is-locked'); });   // cobre o fechamento por Esc
      dlg.addEventListener('click', function (e) { if (e.target === dlg) shut(); });       // clique no fundo
      $$('[data-close]', dlg).forEach(function (b) { b.addEventListener('click', shut); });
    });

    $$('[data-case]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!caseDlg) return;
        $('#caseTitle').textContent = btn.dataset.title || '';
        $('#caseLocation').textContent = btn.dataset.location || '';
        $('#caseDesc').textContent = btn.dataset.desc || '';
        var list = $('#caseSpecs');
        list.textContent = '';
        (btn.dataset.specs || '').split('|').forEach(function (s) {
          s = s.trim();
          if (!s) return;
          var li = doc.createElement('li');
          li.textContent = s;
          list.appendChild(li);
        });
        open(caseDlg);
      });
    });

    $$('[data-open-privacy]').forEach(function (el) {
      el.addEventListener('click', function (e) { e.preventDefault(); if (privacyDlg) open(privacyDlg); });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Formulário de orçamento → WhatsApp / e-mail                         */
  /* ------------------------------------------------------------------ */
  function formatPhone(raw) {
    var d = String(raw).replace(/\D/g, '');
    if (d.length > 11 && d.indexOf('55') === 0) d = d.slice(2);        // cola "+55 48 …"
    d = d.slice(0, 11);
    if (d.length > 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
    if (d.length > 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    if (d.length > 2) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
    if (d.length > 0) return '(' + d;
    return '';
  }

  function initForm() {
    var form = $('#quoteForm');
    if (!form) return;
    var f = {
      name: $('#f-name'), company: $('#f-company'), phone: $('#f-phone'), city: $('#f-city'),
      type: $('#f-type'), airflow: $('#f-airflow'), notes: $('#f-notes'), calc: $('#f-calc'), consent: $('#f-consent')
    };
    var status = $('#formStatus');

    f.phone.addEventListener('input', function () { f.phone.value = formatPhone(f.phone.value); });

    function setError(input, msg) {
      var wrap = input.closest('.field');
      var err = wrap && wrap.querySelector('.field__error');
      if (wrap) wrap.classList.toggle('has-error', !!msg);
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
      if (err) {
        err.textContent = msg || '';
        if (err.id) input.setAttribute('aria-describedby', err.id);
      }
      return !msg;
    }

    function validate() {
      var bad = [];
      function check(input, msg) { if (!setError(input, msg)) bad.push(input); }
      check(f.name, f.name.value.trim().length < 2 ? 'Informe o seu nome.' : '');
      check(f.phone, /^\d{10,11}$/.test(f.phone.value.replace(/\D/g, '')) ? '' : 'Informe um telefone com DDD, ex.: (48) 99999-9999.');
      check(f.city, f.city.value.trim().length < 2 ? 'Informe a cidade e o estado.' : '');
      check(f.consent, f.consent.checked ? '' : 'Marque a caixa para autorizar o envio.');
      if (bad.length) bad[0].focus();
      return bad.length === 0;
    }
    [f.name, f.phone, f.city].forEach(function (inp) {
      inp.addEventListener('input', function () { if (inp.getAttribute('aria-invalid') === 'true') setError(inp, ''); });
    });
    f.consent.addEventListener('change', function () { setError(f.consent, ''); });

    function clean(v, max) { return String(v || '').replace(/[\u0000-\u0008\u000B-\u001F]/g, ' ').trim().slice(0, max); }

    function buildMessage() {
      var lines = [
        '*Solicitação de orçamento — Smartech Coifas*',
        '',
        '*Nome:* ' + clean(f.name.value, 80),
        '*Empresa:* ' + (clean(f.company.value, 80) || 'Não informada'),
        '*Telefone:* ' + clean(f.phone.value, 20),
        '*Cidade/UF:* ' + clean(f.city.value, 80),
        '*Tipo de projeto:* ' + clean(f.type.value, 60),
        '*Vazão estimada:* ' + (clean(f.airflow.value, 40) || 'A calcular')
      ];
      var calc = clean(f.calc.value, 400);
      if (calc) lines.push('*Pré-dimensionamento:* ' + calc);
      lines.push('*Detalhes:* ' + (clean(f.notes.value, 700) || 'Sem observações adicionais.'));
      return lines.join('\n');
    }

    function say(text, isError, linkHref, linkText) {
      status.className = 'form__status' + (isError ? ' is-error' : '');
      status.textContent = text;
      if (linkHref) {
        var a = doc.createElement('a');
        a.className = 'link';
        a.href = linkHref;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = linkText;
        status.appendChild(doc.createTextNode(' '));
        status.appendChild(a);
      }
    }

    function openExternal(url) {
      // Âncora temporária: não depende do valor de retorno de window.open (que é null com noopener)
      var a = doc.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      doc.body.appendChild(a);
      a.click();
      a.remove();
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!validate()) { say('Confira os campos destacados.', true); return; }
      var url = waUrl(buildMessage());
      openExternal(url);
      say('Abrindo o WhatsApp com a sua mensagem. Se nada abrir,', false, url, 'toque aqui para enviar.');
    });

    var mail = $('#quoteMail');
    if (mail) {
      mail.addEventListener('click', function () {
        if (!validate()) { say('Confira os campos destacados.', true); return; }
        var body = buildMessage().replace(/\*/g, '');
        window.location.href = 'mailto:contato@smartechcoifas.com?subject=' +
          encodeURIComponent('Solicitação de orçamento — ' + clean(f.name.value, 60)) +
          '&body=' + encodeURIComponent(body);
        say('Abrindo o seu aplicativo de e-mail…', false);
      });
    }
  }

  /* ------------------------------------------------------------------ */
  function initMisc() {
    $$('[data-year]').forEach(function (el) { el.textContent = String(new Date().getFullYear()); });
  }

  function init() {
    initWaLinks();
    initScrollUi();
    initMenu();
    initScrollspy();
    initSpotlight();
    initCompare();
    initCases();
    initDialogs();
    initForm();
    initMisc();
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
})();
