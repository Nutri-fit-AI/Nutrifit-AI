/* ==========================================================================
   SHAKER.JS
   Calculateur de shaker : l'utilisateur ajuste la quantité de chaque
   ingrédient, les macronutriments totaux se recalculent en direct.
   Comprend aussi les présélections rapides et la sauvegarde de shakers
   personnalisés dans le navigateur.
   ========================================================================== */

let shakerQuantities = {};
SHAKER_INGREDIENTS.forEach(ing => { shakerQuantities[ing.id] = ing.default; });

let savedShakers = storageGet(STORAGE_KEYS.SAVED_SHAKERS, []);
let lastShakerTotals = null;

/** Calcule les totaux (kcal/protéines/glucides/lipides) pour un jeu de quantités donné. */
function computeShakerTotals(quantities) {
  const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  SHAKER_INGREDIENTS.forEach(ing => {
    const qty = Number(quantities[ing.id]) || 0;
    const factor = qty / ing.per;
    totals.kcal += ing.kcal * factor;
    totals.protein += ing.protein * factor;
    totals.carbs += ing.carbs * factor;
    totals.fat += ing.fat * factor;
  });
  return { kcal: Math.round(totals.kcal), protein: round1(totals.protein), carbs: round1(totals.carbs), fat: round1(totals.fat) };
}

/* ------------------------------------------------------------------ */
/* RENDU DU COMPOSITEUR                                                */
/* ------------------------------------------------------------------ */

function renderShakerBuilder() {
  document.getElementById('shakerBuilder').innerHTML = SHAKER_INGREDIENTS.map(ing => `
    <div class="shaker-row">
      <svg class="icon"><use href="#${ing.icon}"/></svg>
      <div>
        <span class="shaker-row__name">${ing.name}</span>
        <span class="shaker-row__caption">${ing.kcal} kcal / ${ing.per} ${ing.unit}</span>
      </div>
      <input type="number" min="0" step="${ing.step}" value="${shakerQuantities[ing.id]}" data-ing="${ing.id}" class="shaker-qty-input">
      <span class="shaker-row__unit">${ing.unit}</span>
    </div>`).join('');
}

function updateShakerResult() {
  const totals = computeShakerTotals(shakerQuantities);
  lastShakerTotals = totals;
  document.getElementById('shakerTotalKcal').innerHTML = `${totals.kcal} <small>kcal</small>`;

  const rows = [
    { label: 'Protéines', val: totals.protein, unit: 'g', max: 60, color: 'var(--brand-signal)' },
    { label: 'Glucides', val: totals.carbs, unit: 'g', max: 100, color: 'var(--brand-gold)' },
    { label: 'Lipides', val: totals.fat, unit: 'g', max: 40, color: 'var(--brand-info)' }
  ];
  document.getElementById('shakerMacroBars').innerHTML = rows.map(r => `
    <div class="macro-bar-row">
      <div class="row-top"><span>${r.label}</span><span>${r.val} ${r.unit}</span></div>
      <div class="progress-bar"><div class="progress-bar__fill" style="width:${clampPct(r.val, 0, r.max)}%; background:${r.color}"></div></div>
    </div>`).join('');
}

/* ------------------------------------------------------------------ */
/* PRÉSÉLECTIONS RAPIDES                                               */
/* ------------------------------------------------------------------ */

function renderShakerPresets() {
  document.getElementById('shakerPresets').innerHTML = SHAKER_PRESETS.map(p => `
    <button type="button" class="preset-btn" data-preset="${p.id}">
      <strong>${p.name}</strong>
      <span>Charger cette composition</span>
    </button>`).join('');
}

function applyShakerPreset(preset) {
  SHAKER_INGREDIENTS.forEach(ing => { shakerQuantities[ing.id] = preset.mix[ing.id] || 0; });
  renderShakerBuilder();
  updateShakerResult();
  showToast(`Composition « ${preset.name} » chargée.`);
}

/* ------------------------------------------------------------------ */
/* SHAKERS ENREGISTRÉS                                                 */
/* ------------------------------------------------------------------ */

function renderSavedShakers() {
  const card = document.getElementById('savedShakersCard');
  const list = document.getElementById('savedShakersList');
  if (!savedShakers.length) { card.hidden = true; return; }
  card.hidden = false;
  list.innerHTML = savedShakers.map(s => `
    <div class="saved-shaker-item">
      <div>
        <strong>${s.name}</strong>
        <div class="saved-shaker-item__macros">${s.totals.kcal} kcal · P ${s.totals.protein}g · G ${s.totals.carbs}g · L ${s.totals.fat}g</div>
      </div>
      <div style="display:flex;gap:8px">
        <button type="button" class="btn btn-outline btn-sm load-shaker-btn" data-id="${s.id}">Charger</button>
        <button type="button" class="icon-btn delete-shaker-btn" data-id="${s.id}" aria-label="Supprimer ce shaker"><svg class="icon"><use href="#icon-trash"/></svg></button>
      </div>
    </div>`).join('');
}

/* ------------------------------------------------------------------ */
/* INITIALISATION DE LA PAGE SHAKERS                                   */
/* ------------------------------------------------------------------ */

function initShakerPage() {
  renderShakerPresets();
  renderShakerBuilder();
  updateShakerResult();
  renderSavedShakers();

  document.getElementById('shakerBuilder').addEventListener('input', (e) => {
    const input = e.target.closest('.shaker-qty-input');
    if (!input) return;
    shakerQuantities[input.dataset.ing] = Number(input.value) || 0;
    updateShakerResult();
  });

  document.getElementById('shakerPresets').addEventListener('click', (e) => {
    const btn = e.target.closest('.preset-btn');
    if (!btn) return;
    const preset = SHAKER_PRESETS.find(p => p.id === btn.dataset.preset);
    if (preset) applyShakerPreset(preset);
  });

  document.getElementById('resetShakerBtn').addEventListener('click', () => {
    SHAKER_INGREDIENTS.forEach(ing => { shakerQuantities[ing.id] = ing.default; });
    renderShakerBuilder();
    updateShakerResult();
  });

  document.getElementById('saveShakerBtn').addEventListener('click', () => {
    const totals = computeShakerTotals(shakerQuantities);
    const name = `Mon shaker n°${savedShakers.length + 1}`;
    savedShakers.push({ id: 'custom-' + Date.now(), name, quantities: { ...shakerQuantities }, totals });
    storageSet(STORAGE_KEYS.SAVED_SHAKERS, savedShakers);
    renderSavedShakers();
    showToast('Shaker enregistré dans "Mes shakers".');
  });

  document.getElementById('savedShakersList').addEventListener('click', (e) => {
    const loadBtn = e.target.closest('.load-shaker-btn');
    const delBtn = e.target.closest('.delete-shaker-btn');
    if (loadBtn) {
      const s = savedShakers.find(x => x.id === loadBtn.dataset.id);
      if (s) { shakerQuantities = { ...s.quantities }; renderShakerBuilder(); updateShakerResult(); showToast(`« ${s.name} » chargé.`); }
    }
    if (delBtn) {
      savedShakers = savedShakers.filter(x => x.id !== delBtn.dataset.id);
      storageSet(STORAGE_KEYS.SAVED_SHAKERS, savedShakers);
      renderSavedShakers();
    }
  });

  document.getElementById('addShakerToTrackingBtn').addEventListener('click', () => {
    if (!lastShakerTotals) return;
    if (typeof addCustomItemToTrackingToday === 'function') {
      addCustomItemToTrackingToday('Shaker personnalisé', lastShakerTotals);
      showToast('Shaker ajouté au suivi du jour.');
    }
  });
}