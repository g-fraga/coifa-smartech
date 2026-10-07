/* Smartech Coifas — motion.js
 * Animações de rolagem (GSAP + ScrollTrigger).
 *
 * Princípios:
 *  - Progressive enhancement: sem JS / sem GSAP / com "reduzir movimento", todo o conteúdo aparece.
 *    (Os estados iniciais ocultos só existem sob html.has-motion e são desfeitos por html.no-gsap.)
 *  - Nunca usar clearProps em elementos com estado oculto no CSS (eles sumiriam de volta).
 *  - Os efeitos pesados (parallax) só rodam em telas largas e são desfeitos pelo gsap.matchMedia().
 */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;

  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!window.gsap || !window.ScrollTrigger) {
    root.classList.add('no-gsap');          // falha de CDN: mostra tudo
    initProcessFallback();
    return;
  }

  var gsap = window.gsap;
  var ScrollTrigger = window.ScrollTrigger;
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });
  window.__smartechMotion = true;

  /* ---------------- utilitários ---------------- */

  /** Envolve cada palavra em <span class="w"><span>palavra</span></span> (máscara de revelação). */
  function splitWords(el) {
    var walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      if (!node.nodeValue.trim()) return;
      var brand = node.parentElement && node.parentElement.closest('.text-brand');
      var frag = doc.createDocumentFragment();
      node.nodeValue.split(/(\s+)/).forEach(function (part) {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.appendChild(doc.createTextNode(' ')); return; }
        var outer = doc.createElement('span');
        var inner = doc.createElement('span');
        outer.className = 'w';
        // background-clip:text não atravessa filhos transformados → o degradê vai em cada palavra
        if (brand) inner.className = 'text-brand';
        inner.textContent = part;
        outer.appendChild(inner);
        frag.appendChild(outer);
      });
      node.parentNode.replaceChild(frag, node);
    });
    el.classList.add('is-split');
    return $$('.w > span', el);
  }

  /* ---------------- processo UV-C (estado funcional, vale também sem animação) ---------------- */

  function initProcessFallback() {
    var steps = $$('.step');
    var flow = $('#flow');
    if (!steps.length || !flow || !('IntersectionObserver' in window)) return;
    var zones = $$('.flow__zone');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var n = Number(en.target.dataset.step);
        flow.dataset.stage = String(n);
        zones.forEach(function (z) { z.classList.toggle('is-active', Number(z.dataset.zone) === n); });
        steps.forEach(function (s) { s.classList.toggle('is-active', s === en.target); });
      });
    }, { rootMargin: '-40% 0px -50% 0px' });
    steps.forEach(function (s) { io.observe(s); });
    zones.forEach(function (z, i) { z.classList.toggle('is-active', i === 0); });
  }

  function initProcess() {
    var steps = $$('.step');
    var flow = $('#flow');
    var fill = $('.process__fill');
    var list = $('.process__list');
    if (!steps.length || !flow) return;
    var zones = $$('.flow__zone');

    function setStage(n) {
      flow.dataset.stage = String(n);
      zones.forEach(function (z) { z.classList.toggle('is-active', Number(z.dataset.zone) === n); });
      steps.forEach(function (s, i) { s.classList.toggle('is-active', i + 1 === n); });
    }
    setStage(1);

    steps.forEach(function (step, i) {
      ScrollTrigger.create({
        trigger: step,
        start: 'top 60%',
        end: 'bottom 60%',
        onToggle: function (self) { if (self.isActive) setStage(i + 1); }
      });
    });

    if (fill && list) {
      gsap.fromTo(fill, { scaleY: 0 }, {
        scaleY: 1, ease: 'none',
        scrollTrigger: { trigger: list, start: 'top 55%', end: 'bottom 55%', scrub: true }
      });
    }

    // SMIL das partículas respeita "reduzir movimento"
    var svg = $('#flow svg');
    if (reduce && svg && svg.pauseAnimations) svg.pauseAnimations();
  }

  /* ---------------- reduzir movimento: só o essencial ---------------- */
  if (reduce) {
    initProcessFallback();
    var svgRm = $('#flow svg');
    if (svgRm && svgRm.pauseAnimations) svgRm.pauseAnimations();
    return;
  }

  /* ---------------- hero ---------------- */

  function initHero() {
    var title = $('.hero__title');
    var words = title ? splitWords(title) : [];
    var items = $$('[data-hero]');
    var started = false;

    function play() {
      if (started) return;
      started = true;
      var tl = gsap.timeline({ defaults: { ease: 'power3.out' }, delay: 0.1 });
      if (words.length) tl.fromTo(words, { yPercent: 115, opacity: 1 }, { yPercent: 0, opacity: 1, duration: 1.05, stagger: 0.055 }, 0.12);
      items.forEach(function (el, i) {
        var fadeOnly = el.dataset.hero === 'fade';
        tl.fromTo(el,
          fadeOnly ? { opacity: 0 } : { opacity: 0, y: 26 },
          fadeOnly ? { opacity: 1, duration: 1 } : { opacity: 1, y: 0, duration: 0.9 },
          0.15 + i * 0.09);
      });
    }

    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(play);
    window.setTimeout(play, 1400);   // rede de segurança se a fonte demorar
  }

  /* ---------------- parallax (somente telas largas) ---------------- */

  function initParallax(mm) {
    mm.add('(min-width: 900px)', function () {
      $$('[data-parallax]').forEach(function (el) {
        var speed = parseFloat(el.dataset.parallax) || 0.2;
        var trigger = el.closest('section') || el.parentElement;
        gsap.fromTo(el, { y: -speed * 130 }, {
          y: speed * 130, ease: 'none',
          scrollTrigger: { trigger: trigger, start: 'top bottom', end: 'bottom top', scrub: 0.6 }
        });
      });

      // Texto e palco do hero se afastam em velocidades diferentes
      var heroTrigger = { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true };
      gsap.to('.hero__copy', { yPercent: -9, opacity: 0.35, ease: 'none', scrollTrigger: heroTrigger });
      gsap.to('.hero__stage', { yPercent: 7, ease: 'none', scrollTrigger: heroTrigger });
    });
  }

  /* ---------------- reveals genéricos ---------------- */

  function initReveals() {
    // Elementos soltos: data-reveal = up (padrão) | left | right | scale | fade | wipe
    $$('[data-reveal]').forEach(function (el) {
      var kind = el.dataset.reveal;
      var st = { trigger: el, start: 'top 88%', once: true };
      var delay = parseFloat(el.dataset.delay) || 0;

      if (kind === 'wipe') {
        gsap.fromTo(el,
          { clipPath: 'inset(0 0 100% 0 round 24px)' },
          { clipPath: 'inset(0 0 0% 0 round 24px)', duration: 1.15, delay: delay, ease: 'power4.inOut', scrollTrigger: st,
            onComplete: function () { el.style.clipPath = 'none'; } });   // libera sombras e overflow
        return;
      }
      var from = { opacity: 0 };
      if (kind === 'left') from.x = -36;
      else if (kind === 'right') from.x = 36;
      else if (kind === 'scale') from.scale = 0.94;
      else if (kind !== 'fade') from.y = 28;
      gsap.fromTo(el, from, { opacity: 1, x: 0, y: 0, scale: 1, duration: 0.95, delay: delay, ease: 'power3.out', scrollTrigger: st });
    });

    // Grupos: filhos diretos entram em sequência; <h2> ganha revelação por palavras
    $$('[data-stagger]').forEach(function (group) {
      var kids = Array.prototype.slice.call(group.children);
      var tl = gsap.timeline({ defaults: { ease: 'power3.out' }, scrollTrigger: { trigger: group, start: 'top 86%', once: true } });
      kids.forEach(function (kid, i) {
        if (kid.tagName === 'H2') {
          var words = splitWords(kid);
          gsap.set(words, { yPercent: 115 });
          gsap.set(kid, { opacity: 1, y: 0 });
          tl.fromTo(words, { yPercent: 115 }, { yPercent: 0, duration: 0.95, stagger: 0.045 }, i * 0.1);
        } else {
          tl.fromTo(kid, { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: 0.85 }, i * 0.1);
        }
      });
    });
  }

  /* ---------------- faixa que acelera com a rolagem ---------------- */

  function initMarquee() {
    var marquee = $('.marquee');
    var track = $('.marquee__track');
    if (!marquee || !track) return;
    marquee.classList.add('is-gsap');
    var tween = gsap.to(track, { xPercent: -50, ease: 'none', duration: 42, repeat: -1 });
    ScrollTrigger.create({
      onUpdate: function (self) {
        var boost = 1 + Math.min(Math.abs(self.getVelocity()) / 260, 9);
        tween.timeScale(boost * (self.direction === -1 ? -1 : 1));
      }
    });
    ScrollTrigger.addEventListener('scrollEnd', function () {
      gsap.to(tween, { timeScale: 1, duration: 1, ease: 'power2.out', overwrite: true });
    });
    // Pausa quando fora da tela
    ScrollTrigger.create({
      trigger: marquee, start: 'top bottom', end: 'bottom top',
      onToggle: function (self) { self.isActive ? tween.resume() : tween.pause(); }
    });
  }

  /* ---------------- sobre, comparador ---------------- */

  function initAbout() {
    var img = $('.about__frame img');
    if (!img) return;
    gsap.fromTo(img, { yPercent: -7, scale: 1.14 }, {
      yPercent: 7, scale: 1.14, ease: 'none',
      scrollTrigger: { trigger: '.about__frame', start: 'top bottom', end: 'bottom top', scrub: true }
    });
  }

  function initCompareHint() {
    var cmp = $('#cmp');
    if (!cmp) return;
    ScrollTrigger.create({
      trigger: cmp, start: 'top 70%', once: true,
      onEnter: function () { doc.dispatchEvent(new CustomEvent('smartech:cmp-hint')); }
    });
  }

  /* ---------------- start ---------------- */

  var mm = gsap.matchMedia();
  initHero();
  initReveals();
  initParallax(mm);
  initMarquee();
  initProcess();
  initAbout();
  initCompareHint();

  window.addEventListener('load', function () { ScrollTrigger.refresh(); });
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { ScrollTrigger.refresh(); });
})();
