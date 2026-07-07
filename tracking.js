/* ==========================================================================
   TRACKING.JS
   Suivi quotidien : construit la liste des repas du jour à partir du plan
   calculé par le profil, permet d'y ajouter des recettes / shakers /
   calories brûlées, calcule ce qu'il reste à consommer par rapport aux
   objectifs, et archive chaque jour terminé dans un historique glissant
   (STORAGE_KEYS.TRACKING_HISTORY) exploité par la page Progression.
   ========================================================================== */

/** État du suivi pour la journée en cours (ou null tant qu'il n'a pas été initialisé). */
let trackingState = storageGet(STORAGE_KEYS.TRACKING, null);

/* ------------------------------------------------------------------ */
/* CONSTRUCTION / MAINTIEN DE L'ÉTAT DU JOUR                            */
/* ------------------------------------------------------------------ */

/** Construit la liste des repas planifiés du jour à partir du profil calculé. */
function buildTrackingItemsFromProfile(profile) {
  if (!profile) return [];
  return profile.mealBreakdown.map(m => ({
    id: 'plan-' + m.key,
    label: m.slot,
    kcal: m.kcal,
    protein: m.protein,
    carbs: m.carbs,
    fat: m.fat,
    source: 'plan',
    removable: false,
    checked: false
  }));
}

/** Totaux consommés (repas cochés uniquement) + calories brûlées additionnelles du jour. */
function computeTrackingTotals(state) {
  const consumed = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  state.items.forEach(it => {
    if (!it.checked) return;
    consumed.kcal += it.kcal;
    consumed.protein += it.protein;
    consumed.carbs += it.carbs;
    consumed.fat += it.fat;
  });
  return { consumed, burned: state.burnedExtra || 0 };
}

/** Archive un jour terminé dans l'historique glissant (conservé sur 30 jours). */
function archiveTrackingDay(state, profile) {
  if (!state) return;
  const history = storageGet(STORAGE_KEYS.TRACKING_HISTORY, []);
  const totals = computeTrackingTotals(state);
  const entry = {
    date: state.date,
    consumedKcal: Math.round(totals.consumed.kcal),
    burnedKcal: Math.round(totals.burned),
    targetKcal: profile ? profile.goalCalories : null
  };
  const existingIdx = history.findIndex(h => h.date === state.date);
  if (existingIdx >= 0) history[existingIdx] = entry; else history.push(entry);
  history.sort((a, b) => a.date.localeCompare(b.date));
  storageSet(STORAGE_KEYS.TRACKING_HISTORY, history.slice(-30));
}

/** Renvoie l'état du suivi du jour, en archivant automatiquement le jour précédent si besoin. */
function ensureTrackingForToday() {
  const profile = getCurrentProfile();
  const today = todayISO();

  if (trackingState && trackingState.date !== today) {
    archiveTrackingDay(trackingState, profile);
    trackingState = null;
  }

  if (!trackingState) {
    trackingState = { date: today, items: buildTrackingItemsFromProfile(profile), burnedExtra: 0 };
  }

  storageSet(STORAGE_KEYS.TRACKING, trackingState);
  return trackingState;
}

function saveTrackingState() { storageSet(STORAGE_KEYS.TRACKING, trackingState); }

/* ------------------------------------------------------------------ */
/* API UTILISÉE PAR LES AUTRES MODULES                                 */
/* ------------------------------------------------------------------ */

/** Ajoute une recette (calculateur de recettes) au suivi du jour, déjà cochée comme consommée. */
function addRecipeToTrackingToday(recipe) {
  const state = ensureTrackingForToday();
  state.items.push({
    id: 'recipe-' + recipe.id + '-' + Date.now(),
    label: recipe.name,
    kcal: recipe.kcal,
    protein: recipe.protein,
    carbs: recipe.carbs,
    fat: recipe.fat,
    source: 'recipe',
    removable: true,
    checked: true
  });
  saveTrackingState();
  renderTrackingPage();
}

/** Ajoute un élément personnalisé (ex. shaker composé) au suivi du jour. */
function addCustomItemToTrackingToday(name, totals) {
  const state = ensureTrackingForToday();
  state.items.push({
    id: 'custom-' + Date.now(),
    label: name,
    kcal: totals.kcal,
    protein: totals.protein,
    carbs: totals.carbs,
    fat: totals.fat,
    source: 'custom',
    removable: true,
    checked: true
  });
  saveTrackingState();
  renderTrackingPage();
}

/** Ajoute des calories brûlées (calculateur d'activité) au bonus du jour. */
function addBurnedCaloriesToToday(kcal) {
  const state = ensureTrackingForToday();
  state.burnedExtra = (state.burnedExtra || 0) + kcal;
  saveTrackingState();
  renderTrackingPage();
}

/** Instantané des totaux du jour courant, utilisé par la page Progression pour les graphiques. */
function getTodayTrackingSnapshot() {
  const state = ensureTrackingForToday();
  const profile = getCurrentProfile();
  const totals = computeTrackingTotals(state);
  return {
    date: state.date,
    consumedKcal: Math.round(totals.consumed.kcal),
    burnedKcal: Math.round(totals.burned),
    targetKcal: profile ? profile.goalCalories : null
  };
}

/* ------------------------------------------------------------------ */
/* RENDU DE LA PAGE                                                    */
/* ------------------------------------------------------------------ */

function trackingItemIcon(source) {
  if (source === 'recipe') return 'icon-recipes';
  if (source === 'custom') return 'icon-shaker';
  return 'icon-nutrition';
}

function renderTrackingSummary(profile, state) {
  const { consumed, burned } = computeTrackingTotals(state);
  const remainingKcal = Math.round(profile.goalCalories - consumed.kcal + burned);
  const remainingProtein = round1(profile.macros.protein.g - consumed.protein);
  const remainingCarbs = round1(profile.macros.carbs.g - consumed.carbs);
  const remainingFat = round1(profile.macros.fat.g - consumed.fat);

  const rows = [
    { label: 'Consommé', value: `${fmtNum(consumed.kcal)} kcal` },
    { label: 'Brûlé (sport)', value: `${fmtNum(burned)} kcal` },
    { label: 'Restant à consommer', value: `${fmtNum(remainingKcal)} kcal` },
    { label: 'Protéines restantes', value: `${fmtNum(remainingProtein, 1)} g` },
    { label: 'Glucides restants', value: `${fmtNum(remainingCarbs, 1)} g` },
    { label: 'Lipides restants', value: `${fmtNum(remainingFat, 1)} g` }
  ];

  document.getElementById('trackingSummary').innerHTML = rows.map(r => `
    <div class="result-item">
      <span class="result-value">${r.value}</span>
      <span class="result-label">${r.label}</span>
    </div>`).join('');
}

function renderTrackingMealList(state) {
  const container = document.getElementById('trackingMealList');
  if (!state.items.length) {
    container.innerHTML = '<p class="empty-inline">Aucun repas prévu pour aujourd\'hui.</p>';
    return;
  }
  container.innerHTML = state.items.map(it => `
    <div class="tracking-meal-row ${it.checked ? 'checked' : ''}">
      <label class="tracking-meal-row__check">
        <input type="checkbox" data-tracking-id="${it.id}" ${it.checked ? 'checked' : ''}>
        <svg class="icon"><use href="#${trackingItemIcon(it.source)}"/></svg>
        <span class="tracking-meal-row__name">${it.label}</span>
      </label>
      <span class="tracking-meal-row__macros">${fmtNum(it.kcal)} kcal · P ${fmtNum(it.protein, 1)}g · G ${fmtNum(it.carbs, 1)}g · L ${fmtNum(it.fat, 1)}g</span>
      ${it.removable ? `<button type="button" class="icon-btn tracking-remove-btn" data-tracking-id="${it.id}" aria-label="Retirer cet élément"><svg class="icon"><use href="#icon-trash"/></svg></button>` : ''}
    </div>`).join('');
}

function renderTrackingPage() {
  const profile = getCurrentProfile();
  const state = ensureTrackingForToday();

  document.getElementById('trackingDate').textContent = formatDateFR(state.date);

  if (!profile) {
    document.getElementById('trackingEmpty').hidden = false;
    document.getElementById('trackingResults').hidden = true;
    return;
  }

  document.getElementById('trackingEmpty').hidden = true;
  document.getElementById('trackingResults').hidden = false;

  renderTrackingSummary(profile, state);
  renderTrackingMealList(state);
}

/* ------------------------------------------------------------------ */
/* INITIALISATION DE LA PAGE SUIVI                                     */
/* ------------------------------------------------------------------ */

function initTrackingPage() {
  document.getElementById('trackingMealList').addEventListener('change', (e) => {
    const cb = e.target.closest('input[type="checkbox"][data-tracking-id]');
    if (!cb) return;
    const item = trackingState.items.find(i => i.id === cb.dataset.trackingId);
    if (item) { item.checked = cb.checked; saveTrackingState(); renderTrackingPage(); }
  });

  document.getElementById('trackingMealList').addEventListener('click', (e) => {
    const btn = e.target.closest('.tracking-remove-btn');
    if (!btn) return;
    trackingState.items = trackingState.items.filter(i => i.id !== btn.dataset.trackingId);
    saveTrackingState();
    renderTrackingPage();
  });

  document.getElementById('resetDayBtn').addEventListener('click', () => {
    const profile = getCurrentProfile();
    trackingState.items = buildTrackingItemsFromProfile(profile);
    trackingState.burnedExtra = 0;
    saveTrackingState();
    renderTrackingPage();
    showToast('Journée réinitialisée.');
  });

  // Quand le profil est recalculé, le plan de repas est régénéré mais les
  // recettes / shakers / éléments personnalisés déjà ajoutés sont conservés.
  window.addEventListener('nutrifit:profileupdated', (e) => {
    const state = ensureTrackingForToday();
    const nonPlanItems = state.items.filter(i => i.source !== 'plan');
    state.items = buildTrackingItemsFromProfile(e.detail.profile).concat(nonPlanItems);
    saveTrackingState();
    renderTrackingPage();
  });

  renderTrackingPage();
}