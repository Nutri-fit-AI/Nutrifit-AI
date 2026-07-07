/* ==========================================================================
   RECIPES.JS
   Catalogue de recettes filtrable (recherche, objectif, régime, catégorie,
   exclusion automatique des allergènes du profil), modale de détail avec
   impression, et gestion de la liste de courses (panier).
   ========================================================================== */

let cartItems = storageGet(STORAGE_KEYS.CART, []);
let recipeFilters = { search: '', objective: 'all', diet: 'all', category: 'all' };
let currentModalRecipeId = null;

const CATEGORY_BG = {
  breakfast: 'linear-gradient(135deg, rgba(255,207,92,.18), transparent)',
  lunch:     'linear-gradient(135deg, rgba(57,255,136,.18), transparent)',
  dinner:    'linear-gradient(135deg, rgba(74,198,255,.18), transparent)',
  snack:     'linear-gradient(135deg, rgba(29,184,112,.18), transparent)',
  shaker:    'linear-gradient(135deg, rgba(255,107,74,.18), transparent)'
};

function difficultyLabel(d) {
  return d === 'easy' ? 'Facile' : d === 'medium' ? 'Intermédiaire' : 'Difficile';
}

/** Une recette est compatible avec un régime si elle correspond au régime demandé (un omnivore mange de tout). */
function dietCompatible(recipe, diet) {
  if (diet === 'omnivore') return true;
  if (diet === 'vegetarian') return recipe.diets.includes('vegetarian') || recipe.diets.includes('vegan');
  if (diet === 'vegan') return recipe.diets.includes('vegan');
  return true;
}

function getRecipeById(id) { return RECIPES.find(r => r.id === id); }

/** Applique recherche + filtres + exclusion automatique des allergies déclarées dans le profil. */
function getFilteredRecipes() {
  const profile = getCurrentProfile();
  const userAllergies = profile ? (profile.input.allergies || []) : [];

  return RECIPES.filter(r => {
    if (recipeFilters.category !== 'all' && r.category !== recipeFilters.category) return false;
    if (recipeFilters.objective !== 'all' && !r.objectives.includes(recipeFilters.objective)) return false;
    if (recipeFilters.diet !== 'all' && !dietCompatible(r, recipeFilters.diet)) return false;
    if (userAllergies.length && r.allergens.some(a => userAllergies.includes(a))) return false;
    if (recipeFilters.search) {
      const haystack = (r.name + ' ' + r.ingredients.join(' ')).toLowerCase();
      if (!haystack.includes(recipeFilters.search.toLowerCase())) return false;
    }
    return true;
  });
}

/* ------------------------------------------------------------------ */
/* RENDU DE LA GRILLE                                                  */
/* ------------------------------------------------------------------ */

function recipeCardHtml(r) {
  return `
    <article class="recipe-card" data-id="${r.id}">
      <div class="recipe-card__header" style="background:${CATEGORY_BG[r.category]}">${r.emoji}</div>
      <div class="recipe-card__body">
        <h3 class="recipe-card__title">${r.name}</h3>
        <div class="recipe-card__meta">
          <span class="badge badge-tag">${r.prepTime} min</span>
          <span class="badge badge-difficulty-${r.difficulty}">${difficultyLabel(r.difficulty)}</span>
        </div>
        <div class="recipe-card__macros">
          <div><b>${r.kcal}</b>kcal</div>
          <div><b>${r.protein}g</b>Prot.</div>
          <div><b>${r.carbs}g</b>Gluc.</div>
          <div><b>${r.fat}g</b>Lip.</div>
        </div>
        <div class="recipe-card__footer">
          <button type="button" class="btn btn-outline btn-sm recipe-detail-btn" data-id="${r.id}">Détails</button>
          <button type="button" class="btn btn-primary btn-sm recipe-addcart-btn" data-id="${r.id}" aria-label="Ajouter à la liste de courses">
            <svg class="icon"><use href="#icon-plus"/></svg>
          </button>
        </div>
      </div>
    </article>`;
}

function renderRecipeGrid() {
  const list = getFilteredRecipes();
  document.getElementById('recipeGrid').innerHTML = list.map(recipeCardHtml).join('');
  document.getElementById('recipeNoResults').hidden = list.length > 0;
}

function syncFiltersWithProfile() {
  const profile = getCurrentProfile();
  if (!profile) return;
  recipeFilters.objective = profile.input.goal;
  recipeFilters.diet = profile.input.diet;
  const objSel = document.getElementById('filterObjective');
  const dietSel = document.getElementById('filterDiet');
  if (objSel) objSel.value = recipeFilters.objective;
  if (dietSel) dietSel.value = recipeFilters.diet;
}

/* ------------------------------------------------------------------ */
/* MODALE DE DÉTAIL D'UNE RECETTE                                      */
/* ------------------------------------------------------------------ */

function openRecipeModal(id) {
  const r = getRecipeById(id);
  if (!r) return;
  currentModalRecipeId = id;

  document.getElementById('recipeModalBody').innerHTML = `
    <h2>${r.emoji} ${r.name}</h2>
    <div class="recipe-card__meta" style="margin-bottom:10px">
      <span class="badge badge-tag">${CATEGORY_META[r.category].label}</span>
      <span class="badge badge-tag">${r.prepTime} min</span>
      <span class="badge badge-difficulty-${r.difficulty}">${difficultyLabel(r.difficulty)}</span>
      ${r.objectives.map(o => `<span class="badge badge-soft">${GOALS[o].label}</span>`).join('')}
    </div>
    <div class="recipe-modal__macro-grid">
      <div class="result-item"><span class="result-value">${r.kcal}</span><span class="result-label">kcal</span></div>
      <div class="result-item"><span class="result-value">${r.protein} g</span><span class="result-label">Protéines</span></div>
      <div class="result-item"><span class="result-value">${r.carbs} g</span><span class="result-label">Glucides</span></div>
      <div class="result-item"><span class="result-value">${r.fat} g</span><span class="result-label">Lipides</span></div>
    </div>
    <div class="recipe-modal__section recipe-modal__ingredients">
      <h4>Ingrédients</h4>
      ${r.ingredients.map(i => `<label><input type="checkbox">${i}</label>`).join('')}
    </div>
    <div class="recipe-modal__section">
      <h4>Étapes de préparation</h4>
      <ol class="recipe-modal__steps">${r.steps.map(s => `<li>${s}</li>`).join('')}</ol>
    </div>
    <div class="form-actions">
      <button type="button" class="btn btn-outline btn-sm" id="printRecipeBtn"><svg class="icon"><use href="#icon-print"/></svg> Imprimer</button>
      <button type="button" class="btn btn-outline btn-sm" id="addToCartBtn"><svg class="icon"><use href="#icon-cart"/></svg> Ajouter à la liste de courses</button>
      <button type="button" class="btn btn-primary btn-sm" id="addToTrackingBtn"><svg class="icon"><use href="#icon-tracking"/></svg> Ajouter au suivi du jour</button>
    </div>
  `;

  document.getElementById('printRecipeBtn').addEventListener('click', () => printRecipe(r));
  document.getElementById('addToCartBtn').addEventListener('click', () => addRecipeToCart(r));
  document.getElementById('addToTrackingBtn').addEventListener('click', () => {
    if (typeof addRecipeToTrackingToday === 'function') {
      addRecipeToTrackingToday(r);
      showToast(`"${r.name}" ajoutée au suivi du jour.`);
    }
  });

  openModal('recipeModal');
}

function printRecipe(r) {
  const html = `
    <h2>${r.name}</h2>
    <p class="print-meta">${CATEGORY_META[r.category].label} · ${r.prepTime} min · ${difficultyLabel(r.difficulty)}</p>
    <div class="print-grid">
      <div class="print-stat"><b>${r.kcal}</b><span>kcal</span></div>
      <div class="print-stat"><b>${r.protein} g</b><span>Protéines</span></div>
      <div class="print-stat"><b>${r.carbs} g</b><span>Glucides</span></div>
      <div class="print-stat"><b>${r.fat} g</b><span>Lipides</span></div>
    </div>
    <h2>Ingrédients</h2>
    <ul>${r.ingredients.map(i => `<li>${i}</li>`).join('')}</ul>
    <h2>Préparation</h2>
    <ol>${r.steps.map(s => `<li>${s}</li>`).join('')}</ol>
  `;
  triggerPrint(html);
}

/* ------------------------------------------------------------------ */
/* LISTE DE COURSES (PANIER)                                           */
/* ------------------------------------------------------------------ */

function updateCartBadge() {
  const el = document.getElementById('cartCount');
  if (el) el.textContent = cartItems.length;
}

function addRecipeToCart(recipe) {
  recipe.ingredients.forEach((ing, idx) => {
    cartItems.push({ id: `${recipe.id}-${idx}-${Date.now()}`, ingredient: ing, recipeName: recipe.name, checked: false });
  });
  storageSet(STORAGE_KEYS.CART, cartItems);
  updateCartBadge();
  renderCartList();
  showToast(`Ingrédients de "${recipe.name}" ajoutés à la liste de courses.`);
}

function renderCartList() {
  const container = document.getElementById('cartList');
  if (!container) return;
  if (!cartItems.length) {
    container.innerHTML = '<p class="empty-inline">Votre liste de courses est vide.</p>';
    return;
  }
  const groups = {};
  cartItems.forEach(item => { (groups[item.recipeName] = groups[item.recipeName] || []).push(item); });
  container.innerHTML = Object.entries(groups).map(([recipeName, items]) => `
    <div class="cart-list__group-title">${recipeName}</div>
    ${items.map(item => `
      <label class="cart-list__item ${item.checked ? 'checked' : ''}">
        <input type="checkbox" data-cart-id="${item.id}" ${item.checked ? 'checked' : ''}>
        <span>${item.ingredient}</span>
      </label>`).join('')}
  `).join('');
}

function printCart() {
  if (!cartItems.length) { showToast('Votre liste de courses est vide.', 'warn'); return; }
  const groups = {};
  cartItems.forEach(item => { (groups[item.recipeName] = groups[item.recipeName] || []).push(item); });
  const body = Object.entries(groups).map(([name, items]) => `<h2>${name}</h2><ul>${items.map(i => `<li>${i.ingredient}</li>`).join('')}</ul>`).join('');
  triggerPrint('<h2>Liste de courses</h2>' + body);
}

/* ------------------------------------------------------------------ */
/* INITIALISATION DE LA PAGE RECETTES                                  */
/* ------------------------------------------------------------------ */

function initRecipesPage() {
  document.getElementById('recipeSearch').addEventListener('input', debounce((e) => {
    recipeFilters.search = e.target.value;
    renderRecipeGrid();
  }, 200));

  document.getElementById('filterObjective').addEventListener('change', (e) => { recipeFilters.objective = e.target.value; renderRecipeGrid(); });
  document.getElementById('filterDiet').addEventListener('change', (e) => { recipeFilters.diet = e.target.value; renderRecipeGrid(); });

  qsa('#recipeCategoryTabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      qsa('#recipeCategoryTabs .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      recipeFilters.category = tab.dataset.cat;
      renderRecipeGrid();
    });
  });

  document.getElementById('recipeGrid').addEventListener('click', (e) => {
    const detailBtn = e.target.closest('.recipe-detail-btn');
    const addBtn = e.target.closest('.recipe-addcart-btn');
    if (detailBtn) { openRecipeModal(detailBtn.dataset.id); return; }
    if (addBtn) { const r = getRecipeById(addBtn.dataset.id); if (r) addRecipeToCart(r); return; }
    const card = e.target.closest('.recipe-card');
    if (card) openRecipeModal(card.dataset.id);
  });

  document.getElementById('openCartBtn').addEventListener('click', () => { renderCartList(); openModal('cartModal'); });
  document.getElementById('clearCartBtn').addEventListener('click', () => {
    cartItems = [];
    storageSet(STORAGE_KEYS.CART, cartItems);
    updateCartBadge();
    renderCartList();
    showToast('Liste de courses vidée.');
  });
  document.getElementById('printCartBtn').addEventListener('click', printCart);
  document.getElementById('cartList').addEventListener('change', (e) => {
    const cb = e.target.closest('input[type="checkbox"][data-cart-id]');
    if (!cb) return;
    const item = cartItems.find(i => i.id === cb.dataset.cartId);
    if (item) { item.checked = cb.checked; storageSet(STORAGE_KEYS.CART, cartItems); renderCartList(); }
  });

  syncFiltersWithProfile();
  updateCartBadge();
  renderRecipeGrid();

  window.addEventListener('nutrifit:profileupdated', () => { syncFiltersWithProfile(); renderRecipeGrid(); });
}