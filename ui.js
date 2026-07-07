/* ==========================================================================
   UI.JS
   Comportements transverses de l'interface : navigation entre pages,
   thème clair/sombre, sidebar mobile, notifications (toasts), modales
   génériques et déclenchement de l'impression (export PDF navigateur).
   ========================================================================== */

/* ---- Petits raccourcis DOM ------------------------------------------ */
function qs(sel, ctx) { return (ctx || document).querySelector(sel); }
function qsa(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }

/** Anti-rebond générique, utilisé pour les recalculs au redimensionnement. */
function debounce(fn, wait) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

/** Formate un nombre à la française, avec un nombre de décimales fixé. */
function fmtNum(n, decimals) {
  decimals = decimals || 0;
  const num = Number(n);
  if (Number.isNaN(num)) return '--';
  return num.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/* ------------------------------------------------------------------ */
/* NAVIGATION ENTRE PAGES                                              */
/* ------------------------------------------------------------------ */
const PAGE_META = {
  dashboard:   { title: 'Tableau de bord', subtitle: 'Votre synthèse nutrition & performance' },
  calculateur: { title: 'Calculateur', subtitle: 'Renseignez votre profil pour générer vos besoins' },
  nutrition:   { title: 'Nutrition', subtitle: 'Vos besoins journaliers en détail' },
  recettes:    { title: 'Recettes', subtitle: 'Des idées de repas adaptées à votre objectif' },
  shakers:     { title: 'Shakers', subtitle: 'Composez et calculez vos boissons protéinées' },
  suivi:       { title: 'Suivi quotidien', subtitle: 'Cochez vos repas et suivez ce qu\'il vous reste' },
  progression: { title: 'Progression', subtitle: 'Poids, calories et objectifs dans le temps' },
  parametres:  { title: 'Paramètres', subtitle: 'Apparence, export et gestion des données' }
};

/** Bascule l'affichage vers la page demandée et notifie les modules concernés. */
function navigateTo(pageKey) {
  if (!PAGE_META[pageKey]) return;

  qsa('.page-section').forEach(sec => sec.classList.remove('active'));
  const target = document.getElementById('page-' + pageKey);
  if (target) target.classList.add('active');

  qsa('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.target === pageKey));

  const meta = PAGE_META[pageKey];
  const titleEl = document.getElementById('pageTitle');
  const subtitleEl = document.getElementById('pageSubtitle');
  if (titleEl) titleEl.textContent = meta.title;
  if (subtitleEl) subtitleEl.textContent = meta.subtitle;

  // Ferme la sidebar sur mobile après un choix de page
  closeMobileSidebar();

  window.scrollTo({ top: 0, behavior: 'smooth' });
  window.dispatchEvent(new CustomEvent('nutrifit:pagechange', { detail: { page: pageKey } }));
}

/** Attache le comportement de navigation à tous les éléments [data-target]. */
function initNavigation() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-target]');
    if (!btn) return;
    e.preventDefault();
    navigateTo(btn.dataset.target);
  });
}

/* ------------------------------------------------------------------ */
/* SIDEBAR MOBILE                                                      */
/* ------------------------------------------------------------------ */
function openMobileSidebar() {
  document.getElementById('sidebar').classList.add('is-open');
  document.getElementById('sidebarOverlay').classList.add('is-open');
}
function closeMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar) sidebar.classList.remove('is-open');
  if (overlay) overlay.classList.remove('is-open');
}
function initSidebarMobile() {
  const menuToggle = document.getElementById('menuToggle');
  const closeBtn = document.getElementById('sidebarCloseBtn');
  const overlay = document.getElementById('sidebarOverlay');
  if (menuToggle) menuToggle.addEventListener('click', openMobileSidebar);
  if (closeBtn) closeBtn.addEventListener('click', closeMobileSidebar);
  if (overlay) overlay.addEventListener('click', closeMobileSidebar);
}

/* ------------------------------------------------------------------ */
/* THÈME CLAIR / SOMBRE                                                */
/* ------------------------------------------------------------------ */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  storageSet(STORAGE_KEYS.THEME, theme);
  window.dispatchEvent(new CustomEvent('nutrifit:themechange', { detail: { theme } }));
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

function initTheme() {
  const saved = storageGet(STORAGE_KEYS.THEME, 'dark');
  applyTheme(saved);
  ['themeToggleSidebar', 'themeToggleSettings'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', toggleTheme);
  });
}

/* ------------------------------------------------------------------ */
/* TOASTS (notifications légères)                                      */
/* ------------------------------------------------------------------ */
function showToast(message, variant) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast' + (variant === 'warn' ? ' toast--warn' : '');
  const icon = variant === 'warn' ? 'icon-info' : 'icon-check';
  toast.innerHTML = `<svg class="icon"><use href="#${icon}"/></svg><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity .3s ease, transform .3s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(12px)';
    setTimeout(() => toast.remove(), 320);
  }, 3000);
}

/* ------------------------------------------------------------------ */
/* MODALES GÉNÉRIQUES                                                  */
/* ------------------------------------------------------------------ */
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.hidden = false;
}
function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.hidden = true;
}
function initModals() {
  qsa('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) backdrop.hidden = true;
    });
  });
  qsa('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => { btn.closest('.modal-backdrop').hidden = true; });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') qsa('.modal-backdrop').forEach(m => { m.hidden = true; });
  });
}

/* ------------------------------------------------------------------ */
/* IMPRESSION / EXPORT PDF (via la boîte de dialogue d'impression)     */
/* ------------------------------------------------------------------ */

/** Injecte le HTML fourni dans la zone imprimable puis ouvre l'impression. */
function triggerPrint(bodyHtml) {
  const area = document.getElementById('printArea');
  if (!area) return;
  const dateStr = new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  area.innerHTML = `<h1>NutriFit AI</h1><p class="print-meta">Document généré le ${dateStr}</p>` + bodyHtml;
  window.print();
}