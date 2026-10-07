/* Smartech Coifas — boot.js
 * Roda de forma síncrona no <head>, antes da primeira pintura.
 *  - html.js          → o JavaScript está ativo
 *  - html.has-motion  → o usuário NÃO pediu menos movimento (habilita os estados iniciais das animações)
 *  - html.no-gsap     → rede de segurança: se o GSAP não chegar em 4,5 s, todo o conteúdo é exibido
 */
(function () {
  'use strict';
  var root = document.documentElement;
  root.classList.add('js');

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce) root.classList.add('has-motion');

  window.setTimeout(function () {
    if (!window.__smartechMotion) root.classList.add('no-gsap');
  }, 4500);
})();
