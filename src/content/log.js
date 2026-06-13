// Logger prefixe + remontee des erreurs et des claims au service worker.
window.TA = window.TA || {};
TA.log = {
  info(module, ...a) { console.log(`[TwitchAuto][${module}]`, ...a); },
  warn(module, ...a) { console.warn(`[TwitchAuto][${module}]`, ...a); },
  error(module, err) {
    const message = err && err.message ? err.message : String(err);
    console.error(`[TwitchAuto][${module}]`, err);
    try { chrome.runtime.sendMessage({ type: 'error', module, message }); } catch (e) { /* SW endormi */ }
  }
};

// Signale un claim au background (points ou drop).
TA.report = function (kind, payload) {
  try { chrome.runtime.sendMessage({ type: 'claim', kind, ...(payload || {}) }); } catch (e) { /* SW endormi */ }
};
