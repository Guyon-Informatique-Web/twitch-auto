// Helpers DOM + MutationObserver unique partage par tous les modules.
window.TA = window.TA || {};
TA.dom = (function () {
  // Element visible et cliquable ?
  function isClickable(el) {
    if (!el || el.disabled) return false;
    if (el.offsetParent === null) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  }

  // Premier element trouve parmi une liste de selecteurs candidats.
  function findFirst(candidates, root) {
    root = root || document;
    for (const sel of candidates) {
      try {
        const el = root.querySelector(sel);
        if (el) return el;
      } catch (e) { /* selecteur invalide -> on ignore */ }
    }
    return null;
  }

  // Recherche par texte/aria-label (fallback robuste).
  function findByText(tag, hints, root) {
    root = root || document;
    const low = hints.map((h) => h.toLowerCase());
    const els = Array.from(root.querySelectorAll(tag));
    return els.find((el) => {
      const t = (el.textContent || '').trim().toLowerCase();
      const a = (el.getAttribute('aria-label') || '').toLowerCase();
      return low.some((h) => t.includes(h) || a.includes(h));
    }) || null;
  }

  function click(el) {
    if (!isClickable(el)) return false;
    el.click();
    return true;
  }

  // Observation mutualisee avec debounce.
  let observer = null;
  let timer = null;
  const listeners = new Set();

  function schedule() {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      for (const cb of listeners) {
        try { cb(); } catch (e) { if (TA.log) TA.log.error('observer', e); }
      }
    }, 150);
  }

  function subscribe(cb) {
    listeners.add(cb);
    try { cb(); } catch (e) { if (TA.log) TA.log.error('observer', e); }
    return () => listeners.delete(cb);
  }

  function start() {
    if (observer) return;
    observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-label', 'disabled', 'class']
    });
  }

  function stop() {
    if (observer) { observer.disconnect(); observer = null; }
  }

  return { isClickable, findFirst, findByText, click, subscribe, start, stop };
})();
