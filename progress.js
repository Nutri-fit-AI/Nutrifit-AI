/* ==========================================================================
   PROGRESS.JS
   Page Progression : courbe d'évolution du poids, jauge d'objectif
   hebdomadaire, graphiques en barres des calories consommées / brûlées
   sur 7 jours (à partir de l'historique de suivi) et répartition cible
   des macronutriments.
   ========================================================================== */

/* ------------------------------------------------------------------ */
/* SUIVI DU POIDS                                                      */
/* ------------------------------------------------------------------ */

function getWeightLog() { return storageGet(STORAGE_KEYS.WEIGHT_LOG, []); }
function saveWeightLog(log) { storageSet(STORAGE_KEYS.WEIGHT_LOG, log); }

/** Ajoute (ou met à jour si la date existe déjà) une pesée dans l'historique. */
function addWeightEntry(dateISO, weightKg) {
  const log = getWeightLog();
  const idx = log.findIndex(e => e.date === dateISO);
  if (idx >= 0) log[idx].weight = weightKg; else log.push({ date: dateISO, weight: weightKg });
  log.sort((a, b) => a.date.localeCompare(b.date));
  saveWeightLog(log);
}

function removeWeightEntry(dateISO) {
  saveWeightLog(getWeightLog().filter(e => e.date !== dateISO));
}

function renderWeightChart() {
  const recent = getWeightLog().slice(-30);
  drawLineChart('chartWeight', recent.map(e => formatDateShort(e.date)), recent.map(e => e.weight));
}

function renderWeightHistoryList() {
  const container = document.getElementById('weightHistoryList');
  const log = getWeightLog().slice().reverse();
  if (!log.length) {
    container.innerHTML = '<p class="empty-inline">Aucune pesée enregistrée pour le moment.</p>';
    return;
  }
  container.innerHTML = log.map(e => `
    <div class="weight-history__row">
      <span>${formatDateFR(e.date)}</span>
      <strong>${fmtNum(e.weight, 1)} kg</strong>
      <button type="button" class="icon-btn delete-weight-btn" data-date="${e.date}" aria-label="Supprimer cette pesée"><svg class="icon"><use href="#icon-trash"/></svg></button>
    </div>`).join('');
}

function initWeightLogForm() {
  const dateInput = document.getElementById('weightDate');
  dateInput.value = todayISO();

  document.getElementById('weightLogForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const weight = Number(document.getElementById('weightValue').value);
    if (!weight) { showToast('Merci de renseigner un poids valide.', 'warn'); return; }
    addWeightEntry(dateInput.value || todayISO(), weight);
    document.getElementById('weightValue').value = '';
    dateInput.value = todayISO();
    renderWeightChart();
    renderWeightHistoryList();
    showToast('Pesée enregistrée.');
  });

  document.getElementById('weightHistoryList').addEventListener('click', (e) => {
    const btn = e.target.closest('.delete-weight-btn');
    if (!btn) return;
    removeWeightEntry(btn.dataset.date);
    renderWeightChart();
    renderWeightHistoryList();
  });
}

/* ------------------------------------------------------------------ */
/* HISTORIQUE CALORIQUE (7 DERNIERS JOURS)                              */
/* ------------------------------------------------------------------ */

/** Renvoie les 7 dernières dates ISO (aujourd'hui inclus), triées du plus ancien au plus récent. */
function getLastNDaysISO(n) {
  const pad = x => String(x).padStart(2, '0');
  const dates = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }
  return dates;
}

/**
 * Combine l'historique archivé (STORAGE_KEYS.TRACKING_HISTORY) avec
 * l'instantané du jour courant (pas encore archivé) pour une liste de dates.
 */
function buildEffectiveHistoryFor(days) {
  const history = storageGet(STORAGE_KEYS.TRACKING_HISTORY, []);
  const today = todayISO();
  return days.map(d => {
    if (d === today && typeof getTodayTrackingSnapshot === 'function') return getTodayTrackingSnapshot();
    return history.find(h => h.date === d) || { date: d, consumedKcal: 0, burnedKcal: 0, targetKcal: null };
  });
}

function renderCalorieHistoryCharts() {
  const days = getLastNDaysISO(7);
  const entries = buildEffectiveHistoryFor(days);
  const labels = entries.map(e => formatDateShort(e.date));
  const profile = getCurrentProfile();

  drawBarChart('chartCaloriesConsumed', labels, entries.map(e => e.consumedKcal), {
    color: cssVar('--brand-signal'),
    targetValue: profile ? profile.goalCalories : 0
  });
  drawBarChart('chartCaloriesBurned', labels, entries.map(e => e.burnedKcal), {
    color: cssVar('--brand-info')
  });
}

/* ------------------------------------------------------------------ */
/* OBJECTIF HEBDOMADAIRE                                                */
/* ------------------------------------------------------------------ */

/** Un jour est considéré "dans l'objectif" si l'apport net (consommé - brûlé) reste dans une marge de 10 %. */
function computeWeeklyObjectiveStats() {
  const entries = buildEffectiveHistoryFor(getLastNDaysISO(7));
  let daysWithData = 0, daysInObjective = 0;
  entries.forEach(entry => {
    if (!entry.targetKcal) return;
    daysWithData++;
    const netKcal = entry.consumedKcal - (entry.burnedKcal || 0);
    const tolerance = entry.targetKcal * 0.1;
    if (Math.abs(netKcal - entry.targetKcal) <= tolerance) daysInObjective++;
  });
  return { daysWithData, daysInObjective, totalDays: entries.length };
}

function renderWeeklyGauge() {
  const stats = computeWeeklyObjectiveStats();
  const pct = stats.totalDays ? Math.round((stats.daysInObjective / stats.totalDays) * 100) : 0;

  setGaugeProgress('weeklyGaugeValue', pct);
  document.getElementById('weeklyGaugeText').textContent = `${pct}%`;

  const detailEl = document.getElementById('weeklyGaugeDetail');
  detailEl.textContent = stats.daysWithData
    ? `${stats.daysInObjective} jour${stats.daysInObjective > 1 ? 's' : ''} sur ${stats.totalDays} dans l'objectif (±10 %).`
    : 'Aucune donnée cette semaine pour le moment.';
}

/* ------------------------------------------------------------------ */
/* RÉPARTITION CIBLE DES MACRONUTRIMENTS                                */
/* ------------------------------------------------------------------ */

function renderMacroProgressChart() {
  const profile = getCurrentProfile();
  drawDonutChart('chartMacroProgress', profile ? macroSegments(profile) : [], 'legendMacroProgress');
}

/* ------------------------------------------------------------------ */
/* INITIALISATION DE LA PAGE PROGRESSION                                */
/* ------------------------------------------------------------------ */

function renderProgressPage() {
  renderWeightChart();
  renderWeightHistoryList();
  renderWeeklyGauge();
  renderCalorieHistoryCharts();
  renderMacroProgressChart();
}

function initProgressPage() {
  initWeightLogForm();
  renderProgressPage();

  // Les graphiques Canvas nécessitent une largeur réelle : on les redessine
  // à chaque arrivée sur la page (le conteneur peut avoir été masqué avant).
  window.addEventListener('nutrifit:pagechange', (e) => {
    if (e.detail.page === 'progression') renderProgressPage();
  });
  window.addEventListener('nutrifit:profileupdated', renderProgressPage);
  window.addEventListener('nutrifit:themechange', renderProgressPage);
}