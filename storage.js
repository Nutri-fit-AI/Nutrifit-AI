/* ==========================================================================
   STORAGE.JS
   Toute la logique de persistance locale (localStorage). Centraliser les
   clés ici évite les fautes de frappe ailleurs dans le code et facilite
   l'export / import / réinitialisation globale des données utilisateur.
   ========================================================================== */

const STORAGE_KEYS = {
  PROFILE: 'nutrifit_profile',              // profil + résultats calculés
  THEME: 'nutrifit_theme',                  // 'dark' | 'light'
  CART: 'nutrifit_cart',                    // liste de courses
  SAVED_SHAKERS: 'nutrifit_saved_shakers',  // shakers personnalisés enregistrés
  TRACKING: 'nutrifit_tracking',            // suivi du jour courant
  TRACKING_HISTORY: 'nutrifit_tracking_history', // historique (7 derniers jours glissants)
  WEIGHT_LOG: 'nutrifit_weight_log'         // historique du poids
};

/** Lit une clé du localStorage et la parse en JSON. Renvoie `fallback` si absente ou invalide. */
function storageGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('Lecture storage impossible pour', key, e);
    return fallback;
  }
}

/** Écrit une valeur (sérialisée en JSON) dans le localStorage. */
function storageSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn('Écriture storage impossible pour', key, e);
    return false;
  }
}

function storageRemove(key) {
  try { localStorage.removeItem(key); } catch (e) { /* silencieux */ }
}

/** Renvoie la date du jour au format ISO (YYYY-MM-DD), utilisée comme clé de journalier. */
function todayISO() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Formate une date ISO en français lisible : "vendredi 5 juillet 2026". */
function formatDateFR(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

/** Formate une date ISO en format court : "05/07". */
function formatDateShort(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

/** Exporte l'intégralité des données de l'app dans un objet unique (pour export JSON). */
function exportAllData() {
  const data = {};
  Object.values(STORAGE_KEYS).forEach(key => { data[key] = storageGet(key, null); });
  data._exportedAt = new Date().toISOString();
  data._app = 'NutriFit AI';
  return data;
}

/** Réimporte un objet précédemment généré par exportAllData(). */
function importAllData(obj) {
  if (!obj || typeof obj !== 'object') return false;
  Object.values(STORAGE_KEYS).forEach(key => {
    if (obj[key] !== undefined && obj[key] !== null) storageSet(key, obj[key]);
  });
  return true;
}

/** Supprime toutes les données NutriFit AI du navigateur (hors préférence de thème, optionnelle). */
function resetAllData(keepTheme) {
  Object.values(STORAGE_KEYS).forEach(key => {
    if (keepTheme && key === STORAGE_KEYS.THEME) return;
    storageRemove(key);
  });
}