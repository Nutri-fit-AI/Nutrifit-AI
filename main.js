/* ==========================================================================
   MAIN.JS
   Point d'entrée de l'application : initialise tous les modules dans
   l'ordre de leurs dépendances, masque le préchargeur d'entrée, et gère
   les actions globales de la page Paramètres (export / import / reset
   des données stockées en localStorage).
   ========================================================================== */

function hidePreloader() {
  const preloader = document.getElementById('preloader');
  if (!preloader) return;
  preloader.classList.add('is-hidden');
  setTimeout(() => preloader.remove(), 500);
}

/* ------------------------------------------------------------------ */
/* PARAMÈTRES — EXPORT / IMPORT / RÉINITIALISATION DES DONNÉES          */
/* ------------------------------------------------------------------ */

function downloadJSON(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function initDataManagement() {
  document.getElementById('exportDataBtn').addEventListener('click', () => {
    downloadJSON(`nutrifit-export-${todayISO()}.json`, exportAllData());
    showToast('Export de vos données lancé.');
  });

  document.getElementById('importDataInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        if (!importAllData(obj)) throw new Error('format invalide');
        showToast('Données importées, rechargement de l\'application…');
        setTimeout(() => window.location.reload(), 800);
      } catch (err) {
        showToast('Le fichier importé est invalide.', 'warn');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  document.getElementById('resetAllBtn').addEventListener('click', () => {
    if (!window.confirm('Voulez-vous vraiment réinitialiser toutes vos données ? Cette action est irréversible.')) return;
    resetAllData(true);
    showToast('Données réinitialisées, rechargement de l\'application…');
    setTimeout(() => window.location.reload(), 800);
  });
}

/* ------------------------------------------------------------------ */
/* INITIALISATION GÉNÉRALE                                              */
/* ------------------------------------------------------------------ */

function initApp() {
  initTheme();
  initNavigation();
  initSidebarMobile();
  initModals();

  initProfilePage();
  initRecipesPage();
  initShakerPage();
  initTrackingPage();
  initProgressPage();
  initDataManagement();

  hidePreloader();
}

document.addEventListener('DOMContentLoaded', initApp);