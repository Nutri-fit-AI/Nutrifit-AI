/* ==========================================================================
   PROFILE.JS
   Gère le formulaire de profil (Calculateur), déclenche les calculs via
   calculations.js, persiste le résultat et pilote le rendu du Tableau de
   bord et de la page Nutrition. Contient aussi le calculateur de
   calories brûlées et l'export PDF du bilan (impression navigateur).
   ========================================================================== */

/** Profil actuellement calculé (objet renvoyé par computeFullProfile), ou null. */
let currentProfile = storageGet(STORAGE_KEYS.PROFILE, null);
let lastBurnResult = null;

/** Accesseur global utilisé par les autres modules (recettes, suivi, progression…). */
function getCurrentProfile() { return currentProfile; }

/** Bornes utilisées uniquement pour la longueur visuelle des barres/anneaux. */
function clampPct(val, min, max) {
  return Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
}

/** Description commune à la fois au tableau Nutrition et aux cartes macro du dashboard. */
const NUTRIENT_ROWS = [
  { key: 'calories', label: 'Calories',  icon: 'icon-flame',    unit: 'kcal', max: 4000, get: p => p.goalCalories },
  { key: 'protein',  label: 'Protéines', icon: 'icon-egg',      unit: 'g',    max: 250,  get: p => p.macros.protein.g },
  { key: 'carbs',    label: 'Glucides',  icon: 'icon-wheat',    unit: 'g',    max: 500,  get: p => p.macros.carbs.g },
  { key: 'fat',      label: 'Lipides',   icon: 'icon-droplet',  unit: 'g',    max: 150,  get: p => p.macros.fat.g },
  { key: 'fiber',    label: 'Fibres',    icon: 'icon-nutrition',unit: 'g',    max: 50,   get: p => p.macros.fiber.g },
  { key: 'water',    label: 'Eau',       icon: 'icon-droplet',  unit: 'ml',   max: 4000, get: p => p.macros.water.ml }
];

/** Construit les segments (kcal) pour le donut des macronutriments. */
function macroSegments(profile) {
  return [
    { label: 'Protéines', value: profile.macros.protein.kcal, color: cssVar('--brand-signal') },
    { label: 'Glucides',  value: profile.macros.carbs.kcal,   color: cssVar('--brand-gold') },
    { label: 'Lipides',   value: profile.macros.fat.kcal,     color: cssVar('--brand-info') }
  ];
}

/* ------------------------------------------------------------------ */
/* CONTRÔLES PERSONNALISÉS DU FORMULAIRE                               */
/* ------------------------------------------------------------------ */

function initSegmented(containerId, hiddenInputId) {
  const container = document.getElementById(containerId);
  qsa('.segmented__opt', container).forEach(btn => {
    btn.addEventListener('click', () => {
      qsa('.segmented__opt', container).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(hiddenInputId).value = btn.dataset.value;
    });
  });
}

function initGoalGrid() {
  const container = document.getElementById('goalGrid');
  qsa('.goal-opt', container).forEach(btn => {
    btn.addEventListener('click', () => {
      qsa('.goal-opt', container).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('goal').value = btn.dataset.value;
    });
  });
}

/** Recalcule et affiche l'IMC en direct tant que le calcul automatique est actif. */
function updateBmiPreview() {
  if (!document.getElementById('bmiAuto').checked) return;
  const h = Number(document.getElementById('height').value);
  const w = Number(document.getElementById('weight').value);
  if (h && w) document.getElementById('bmiManual').value = round1(calcBMI(w, h));
}

/* ------------------------------------------------------------------ */
/* LECTURE / ÉCRITURE DU FORMULAIRE                                    */
/* ------------------------------------------------------------------ */

function collectFormInput() {
  const allergies = qsa('#allergyChecks input[type="checkbox"]:checked').map(cb => cb.value);
  const otherRaw = document.getElementById('allergyOther').value.trim();
  if (otherRaw) {
    otherRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean).forEach(a => allergies.push(a));
  }
  return {
    age: document.getElementById('age').value,
    gender: document.getElementById('gender').value,
    height: document.getElementById('height').value,
    weight: document.getElementById('weight').value,
    bmiAuto: document.getElementById('bmiAuto').checked,
    bmiManual: document.getElementById('bmiManual').value,
    activityLevel: document.getElementById('activityLevel').value,
    strengthSessions: document.getElementById('strengthSessions').value,
    sessionDuration: document.getElementById('sessionDuration').value,
    cardioSessions: document.getElementById('cardioSessions').value,
    goal: document.getElementById('goal').value,
    diet: document.getElementById('diet').value,
    mealsPerDay: document.getElementById('mealsPerDay').value,
    allergies,
    allergyOther: otherRaw
  };
}

function populateForm(profile) {
  const input = profile.input;
  document.getElementById('age').value = input.age;
  document.getElementById('height').value = input.height;
  document.getElementById('weight').value = input.weight;
  document.getElementById('bmiAuto').checked = input.bmiAuto;
  document.getElementById('bmiManual').disabled = input.bmiAuto;
  document.getElementById('bmiManual').value = profile.bmi;
  document.getElementById('activityLevel').value = input.activityLevel;
  document.getElementById('strengthSessions').value = input.strengthSessions;
  document.getElementById('sessionDuration').value = input.sessionDuration;
  document.getElementById('cardioSessions').value = input.cardioSessions;
  document.getElementById('diet').value = input.diet;
  document.getElementById('mealsPerDay').value = input.mealsPerDay;
  document.getElementById('allergyOther').value = input.allergyOther || '';

  qsa('#genderSegmented .segmented__opt').forEach(b => b.classList.toggle('active', b.dataset.value === input.gender));
  document.getElementById('gender').value = input.gender;

  qsa('#goalGrid .goal-opt').forEach(b => b.classList.toggle('active', b.dataset.value === input.goal));
  document.getElementById('goal').value = input.goal;

  qsa('#allergyChecks input[type="checkbox"]').forEach(cb => { cb.checked = (input.allergies || []).includes(cb.value); });

  document.getElementById('burnWeight').placeholder = String(input.weight);
}

/* ------------------------------------------------------------------ */
/* SOUMISSION DU FORMULAIRE                                            */
/* ------------------------------------------------------------------ */

function handleFormSubmit(e) {
  e.preventDefault();
  const age = document.getElementById('age').value;
  const height = document.getElementById('height').value;
  const weight = document.getElementById('weight').value;
  if (!age || !height || !weight) {
    showToast('Merci de renseigner au moins l\'âge, la taille et le poids.', 'warn');
    return;
  }

  const input = collectFormInput();
  const profile = computeFullProfile(input);
  currentProfile = profile;
  storageSet(STORAGE_KEYS.PROFILE, profile);

  renderCalcResultsCard(profile);
  renderDashboard(profile);
  renderNutritionPage(profile);
  document.getElementById('burnWeight').placeholder = String(profile.input.weight);

  showToast('Profil enregistré : vos besoins ont été recalculés.');
  window.dispatchEvent(new CustomEvent('nutrifit:profileupdated', { detail: { profile } }));
}

/* ------------------------------------------------------------------ */
/* RENDU — CARTE RÉSULTATS DU CALCULATEUR                              */
/* ------------------------------------------------------------------ */

function renderCalcResultsCard(profile) {
  document.getElementById('calcResultsCard').hidden = false;
  const items = [
    { label: `IMC · ${profile.bmiCategory.label}`, value: fmtNum(profile.bmi, 1) },
    { label: 'Métabolisme de base', value: fmtNum(profile.bmr) + ' kcal' },
    { label: 'Dépense journalière (TDEE)', value: fmtNum(profile.tdee) + ' kcal' },
    { label: 'Calories cibles', value: fmtNum(profile.goalCalories) + ' kcal' },
    { label: 'Protéines', value: fmtNum(profile.macros.protein.g, 1) + ' g' },
    { label: 'Glucides', value: fmtNum(profile.macros.carbs.g, 1) + ' g' },
    { label: 'Lipides', value: fmtNum(profile.macros.fat.g, 1) + ' g' },
    { label: 'Fibres', value: fmtNum(profile.macros.fiber.g) + ' g' },
    { label: 'Eau', value: fmtNum(profile.macros.water.ml) + ' ml' }
  ];
  document.getElementById('calcResultGrid').innerHTML = items.map(it => `
    <div class="result-item">
      <span class="result-value">${it.value}</span>
      <span class="result-label">${it.label}</span>
    </div>`).join('');
}

/* ------------------------------------------------------------------ */
/* RENDU — TABLEAU DE BORD                                             */
/* ------------------------------------------------------------------ */

function renderDashboard(profile) {
  document.getElementById('dashboardEmpty').hidden = true;
  document.getElementById('dashboardResults').hidden = false;

  const goalLabel = GOALS[profile.input.goal].label;
  const dietLabel = DIET_LABELS[profile.input.diet];
  document.getElementById('dashboardSummary').innerHTML = `
    <span>Objectif : <strong>${goalLabel}</strong></span>
    <span>IMC : <strong>${fmtNum(profile.bmi, 1)}</strong> (${profile.bmiCategory.label})</span>
    <span>Régime : <strong>${dietLabel}</strong></span>
    <span>Entraînement : <strong>${fmtNum(profile.trainingBurnPerDay)} kcal/j</strong> (estimation)</span>
  `;

  document.getElementById('ringImcValue').textContent = fmtNum(profile.bmi, 1);
  document.getElementById('ringImcStatus').textContent = profile.bmiCategory.label;
  setRingProgress('ringImc', clampPct(profile.bmi, 15, 35));

  document.getElementById('ringBmrValue').textContent = fmtNum(profile.bmr);
  setRingProgress('ringBmr', clampPct(profile.bmr, 800, 2800));

  document.getElementById('ringTdeeValue').textContent = fmtNum(profile.tdee);
  setRingProgress('ringTdee', clampPct(profile.tdee, 1200, 3800));

  document.getElementById('ringGoalValue').textContent = fmtNum(profile.goalCalories);
  setRingProgress('ringGoal', clampPct(profile.goalCalories, 1200, 3800));
  const delta = profile.goalCalories - profile.tdee;
  document.getElementById('ringGoalDelta').textContent = delta === 0
    ? 'Égal à votre entretien'
    : (delta > 0 ? `+${fmtNum(delta)} kcal vs entretien` : `${fmtNum(delta)} kcal vs entretien`);

  document.getElementById('dashboardMacroGrid').innerHTML = NUTRIENT_ROWS.slice(1).map(row => {
    const val = row.get(profile);
    const pct = clampPct(val, 0, row.max);
    return `
      <div class="card macro-card">
        <div class="macro-card__head"><svg class="icon"><use href="#${row.icon}"/></svg> ${row.label}</div>
        <div class="macro-card__value">${fmtNum(val, row.unit === 'g' ? 1 : 0)} <small>${row.unit}</small></div>
        <div class="progress-bar"><div class="progress-bar__fill" style="width:${pct}%"></div></div>
      </div>`;
  }).join('');

  drawDonutChart('chartMacroDashboard', macroSegments(profile), 'legendMacroDashboard');

  document.getElementById('mealsCountBadge').textContent = `${profile.input.mealsPerDay} repas`;
  document.getElementById('mealBreakdownList').innerHTML = profile.mealBreakdown.map(m => `
    <div class="meal-list__row">
      <span class="meal-list__name">${m.slot}</span>
      <div class="meal-list__bar"><div class="progress-bar"><div class="progress-bar__fill" style="width:${Math.round(m.pct * 100)}%"></div></div></div>
      <span class="meal-list__kcal">${m.kcal} kcal</span>
    </div>`).join('');

  const topbarStats = document.getElementById('topbarStats');
  topbarStats.hidden = false;
  document.getElementById('chipCalories').textContent = fmtNum(profile.goalCalories);
  document.getElementById('chipProtein').textContent = fmtNum(profile.macros.protein.g, 1);
  document.getElementById('chipCarbs').textContent = fmtNum(profile.macros.carbs.g, 1);
  document.getElementById('chipFat').textContent = fmtNum(profile.macros.fat.g, 1);
}

/* ------------------------------------------------------------------ */
/* RENDU — PAGE NUTRITION                                              */
/* ------------------------------------------------------------------ */

function renderNutritionPage(profile) {
  document.getElementById('nutritionEmpty').hidden = true;
  document.getElementById('nutritionResults').hidden = false;

  document.getElementById('nutritionTableBody').innerHTML = NUTRIENT_ROWS.map(row => {
    const val = row.get(profile);
    const pct = clampPct(val, 0, row.max);
    let note = '';
    if (row.key === 'calories') note = GOALS[profile.input.goal].label;
    if (row.key === 'protein') note = `${GOALS[profile.input.goal].proteinPerKg} g / kg de poids`;
    if (row.key === 'water') note = 'Base + bonus entraînement';
    if (row.key === 'fiber') note = '≈ 14 g / 1000 kcal';
    return `<tr>
      <td class="nutrient-name"><svg class="icon"><use href="#${row.icon}"/></svg>${row.label}</td>
      <td class="value-mono">${fmtNum(val, row.unit === 'g' ? 1 : 0)} ${row.unit}</td>
      <td class="indicator-bar"><div class="progress-bar"><div class="progress-bar__fill" style="width:${pct}%"></div></div></td>
      <td class="muted">${note}</td>
    </tr>`;
  }).join('');

  drawDonutChart('chartMacroNutrition', macroSegments(profile), 'legendMacroNutrition');

  document.getElementById('mealBreakdownTableBody').innerHTML = profile.mealBreakdown.map(m => `
    <tr><td>${m.slot}</td><td class="value-mono">${m.kcal}</td><td class="value-mono">${m.protein} g</td><td class="value-mono">${m.carbs} g</td><td class="value-mono">${m.fat} g</td></tr>
  `).join('');
}

/* ------------------------------------------------------------------ */
/* CALCULATEUR DE CALORIES BRÛLÉES                                     */
/* ------------------------------------------------------------------ */

function initBurnCalculator() {
  document.getElementById('computeBurnBtn').addEventListener('click', () => {
    const activity = document.getElementById('burnActivity').value;
    const intensity = document.getElementById('burnIntensity').value;
    const duration = Number(document.getElementById('burnDuration').value) || 0;
    let weight = Number(document.getElementById('burnWeight').value);
    if (!weight) weight = currentProfile ? Number(currentProfile.input.weight) : 75;

    const kcal = calcCaloriesBurned(activity, intensity, duration, weight);
    document.getElementById('burnResultValue').textContent = fmtNum(kcal);
    document.getElementById('burnResult').hidden = false;
    lastBurnResult = { activity, intensity, duration, weight, kcal };
  });

  document.getElementById('addBurnToLog').addEventListener('click', () => {
    if (!lastBurnResult) return;
    if (typeof addBurnedCaloriesToToday === 'function') {
      addBurnedCaloriesToToday(lastBurnResult.kcal);
      showToast(`${lastBurnResult.kcal} kcal ajoutées au journal du jour.`);
    }
  });
}

/* ------------------------------------------------------------------ */
/* EXPORT PDF / IMPRESSION                                             */
/* ------------------------------------------------------------------ */

function exportBilanPdf() {
  if (!currentProfile) { showToast('Complétez votre profil avant d\'exporter.', 'warn'); return; }
  const p = currentProfile;
  const html = `
    <div class="print-grid">
      <div class="print-stat"><b>${fmtNum(p.bmi, 1)}</b><span>IMC — ${p.bmiCategory.label}</span></div>
      <div class="print-stat"><b>${fmtNum(p.bmr)}</b><span>Métabolisme de base (kcal)</span></div>
      <div class="print-stat"><b>${fmtNum(p.tdee)}</b><span>Dépense journalière (kcal)</span></div>
      <div class="print-stat"><b>${fmtNum(p.goalCalories)}</b><span>Calories cibles (kcal)</span></div>
    </div>
    <h2>Macronutriments recommandés</h2>
    <table><thead><tr><th>Nutriment</th><th>Quantité</th></tr></thead><tbody>
      <tr><td>Protéines</td><td>${fmtNum(p.macros.protein.g, 1)} g</td></tr>
      <tr><td>Glucides</td><td>${fmtNum(p.macros.carbs.g, 1)} g</td></tr>
      <tr><td>Lipides</td><td>${fmtNum(p.macros.fat.g, 1)} g</td></tr>
      <tr><td>Fibres</td><td>${fmtNum(p.macros.fiber.g)} g</td></tr>
      <tr><td>Eau</td><td>${fmtNum(p.macros.water.ml)} ml</td></tr>
    </tbody></table>
    <h2>Répartition par repas</h2>
    <table><thead><tr><th>Repas</th><th>Kcal</th><th>Protéines</th><th>Glucides</th><th>Lipides</th></tr></thead><tbody>
      ${p.mealBreakdown.map(m => `<tr><td>${m.slot}</td><td>${m.kcal}</td><td>${m.protein} g</td><td>${m.carbs} g</td><td>${m.fat} g</td></tr>`).join('')}
    </tbody></table>
    <p class="print-meta">Objectif : ${GOALS[p.input.goal].label} · Régime : ${DIET_LABELS[p.input.diet]} · ${p.input.mealsPerDay} repas/jour</p>
  `;
  triggerPrint(html);
}

function printNutritionTable() {
  if (!currentProfile) { showToast('Complétez votre profil avant d\'imprimer.', 'warn'); return; }
  const p = currentProfile;
  const rows = [
    ['Calories', fmtNum(p.goalCalories) + ' kcal'],
    ['Protéines', fmtNum(p.macros.protein.g, 1) + ' g'],
    ['Glucides', fmtNum(p.macros.carbs.g, 1) + ' g'],
    ['Lipides', fmtNum(p.macros.fat.g, 1) + ' g'],
    ['Fibres', fmtNum(p.macros.fiber.g) + ' g'],
    ['Eau', fmtNum(p.macros.water.ml) + ' ml']
  ];
  const html = `<h2>Besoins journaliers</h2><table><thead><tr><th>Nutriment</th><th>Besoin</th></tr></thead><tbody>${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('')}</tbody></table>`;
  triggerPrint(html);
}

/* ------------------------------------------------------------------ */
/* INITIALISATION DE LA PAGE CALCULATEUR                               */
/* ------------------------------------------------------------------ */

function initProfilePage() {
  initSegmented('genderSegmented', 'gender');
  initGoalGrid();

  document.getElementById('bmiAuto').addEventListener('change', (e) => {
    document.getElementById('bmiManual').disabled = e.target.checked;
    updateBmiPreview();
  });
  ['height', 'weight'].forEach(id => document.getElementById(id).addEventListener('input', updateBmiPreview));

  const form = document.getElementById('profileForm');
  form.addEventListener('submit', handleFormSubmit);
  form.addEventListener('reset', () => {
    setTimeout(() => {
      qsa('#genderSegmented .segmented__opt').forEach(b => b.classList.toggle('active', b.dataset.value === 'male'));
      document.getElementById('gender').value = 'male';
      qsa('#goalGrid .goal-opt').forEach(b => b.classList.toggle('active', b.dataset.value === 'maintain'));
      document.getElementById('goal').value = 'maintain';
      document.getElementById('bmiManual').disabled = document.getElementById('bmiAuto').checked;
    }, 0);
  });

  initBurnCalculator();

  document.getElementById('exportPdfBtnDash').addEventListener('click', exportBilanPdf);
  document.getElementById('exportPdfBtnSettings').addEventListener('click', exportBilanPdf);
  document.getElementById('printNutritionBtn').addEventListener('click', printNutritionTable);
  document.getElementById('printNutritionBtnSettings').addEventListener('click', printNutritionTable);

  if (currentProfile) {
    populateForm(currentProfile);
    renderCalcResultsCard(currentProfile);
    renderDashboard(currentProfile);
    renderNutritionPage(currentProfile);
  }

  window.addEventListener('nutrifit:themechange', () => {
    if (currentProfile) {
      drawDonutChart('chartMacroDashboard', macroSegments(currentProfile), 'legendMacroDashboard');
      drawDonutChart('chartMacroNutrition', macroSegments(currentProfile), 'legendMacroNutrition');
    }
  });
}