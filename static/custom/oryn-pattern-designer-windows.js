(() => {
  'use strict';

  const ID = 'oryn-pattern-designer-launch';
  const BUILD = 'PD-WIN-V1-20260831-1';
  const DESIGNER_URL = '/pattern-designer';
  let scheduled = false;

  function isBrowseView() {
    if (location.pathname !== '/' && !location.pathname.toLowerCase().includes('browse')) return false;
    return Array.from(document.querySelectorAll('h1,h2'))
      .some((el) => (el.textContent || '').trim() === 'Browse Patterns');
  }

  function installStyle() {
    if (document.getElementById('oryn-pattern-designer-launch-style')) return;
    const style = document.createElement('style');
    style.id = 'oryn-pattern-designer-launch-style';
    style.textContent = `
      #${ID}{display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:8px!important;white-space:nowrap!important}
      #${ID} .oryn-pd-icon{font-size:17px;line-height:1}
    `;
    document.head.appendChild(style);
  }

  function findForgeButton() {
    return Array.from(document.querySelectorAll('button'))
      .find((button) => (button.textContent || '').trim().includes('Pattern Forge')) || null;
  }

  function addLauncher() {
    scheduled = false;
    if (!isBrowseView()) return;
    if (document.getElementById(ID)) return;

    const forge = findForgeButton();
    if (!forge || !forge.parentElement) return;

    installStyle();
    const launcher = document.createElement('button');
    launcher.id = ID;
    launcher.type = 'button';
    launcher.className = forge.className;
    launcher.dataset.orynBuild = BUILD;
    launcher.setAttribute('aria-label', 'Open ORYN Pattern Designer');
    launcher.title = 'Open ORYN Pattern Designer';
    launcher.innerHTML = '<span class="oryn-pd-icon" aria-hidden="true">✦</span><span>Pattern Designer</span>';
    launcher.addEventListener('click', () => window.location.assign(DESIGNER_URL));
    forge.parentElement.insertBefore(launcher, forge);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(addLauncher);
  }

  schedule();
  window.addEventListener('load', schedule, { once: true });
  window.addEventListener('popstate', schedule);
  const observer = new MutationObserver(() => {
    const launcher = document.getElementById(ID);
    if (!launcher || !document.documentElement.contains(launcher)) schedule();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
