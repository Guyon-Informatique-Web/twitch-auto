// Logger prefixe + remontee des erreurs et des claims au service worker.
window.TA = window.TA || {};

// Envoi "fire and forget" robuste : avale les rejets de promesse (SW endormi,
// contexte invalide) pour ne jamais polluer la console avec "Uncaught (in promise)".
function safeSend(msg) {
  try {
    const p = chrome.runtime.sendMessage(msg);
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch (e) { /* contexte de l'extension invalide */ }
}

TA.log = {
  info(module, ...a) { console.log(`[TwitchAuto][${module}]`, ...a); },
  warn(module, ...a) { console.warn(`[TwitchAuto][${module}]`, ...a); },
  error(module, err) {
    const message = err && err.message ? err.message : String(err);
    console.error(`[TwitchAuto][${module}]`, err);
    safeSend({ type: 'error', module, message });
  }
};

// Signale un claim au background (points ou drop).
TA.report = function (kind, payload) {
  safeSend({ type: 'claim', kind, ...(payload || {}) });
};

// Demande au background de recharger l'onglet inventaire des drops (throttle cote SW).
TA.reloadInventory = function () {
  safeSend({ type: 'inventoryReload' });
};
