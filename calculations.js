/* ==========================================================================
   CALCULATIONS.JS
   Toutes les formules nutritionnelles et sportives de l'application.
   Ce module est volontairement "pur" : aucune manipulation du DOM ici,
   uniquement des fonctions de calcul réutilisables et testables.
   ========================================================================== */

/** Arrondit à 1 décimale (utile pour les grammages). */
function round1(n) { return Math.round(n * 10) / 10; }

/* ------------------------------------------------------------------ */
/* IMC                                                                 */
/* ------------------------------------------------------------------ */

/** Indice de masse corporelle = poids(kg) / taille(m)^2 */
function calcBMI(weightKg, heightCm) {
  const heightM = heightCm / 100;
  if (!heightM) return 0;
  return weightKg / (heightM * heightM);
}

/** Catégorie OMS associée à un IMC donné. */
function getBMICategory(bmi) {
  if (bmi < 18.5) return { label: 'Insuffisance pondérale', tone: 'warn' };
  if (bmi < 25)   return { label: 'Corpulence normale',      tone: 'good' };
  if (bmi < 30)   return { label: 'Surpoids',                 tone: 'warn' };
  return               { label: 'Obésité',                    tone: 'warn' };
}

/* ------------------------------------------------------------------ */
/* MÉTABOLISME DE BASE — Formule de Mifflin-St Jeor                    */
/* ------------------------------------------------------------------ */

/**
 * Homme : 10 x poids + 6.25 x taille - 5 x âge + 5
 * Femme : 10 x poids + 6.25 x taille - 5 x âge - 161
 */
function calcBMR(gender, weightKg, heightCm, age) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return gender === 'female' ? base - 161 : base + 5;
}

/* ------------------------------------------------------------------ */
/* DÉPENSE ÉNERGÉTIQUE JOURNALIÈRE (TDEE)                              */
/* ------------------------------------------------------------------ */

/** TDEE = métabolisme de base x facteur d'activité choisi. */
function calcTDEE(bmr, activityLevel) {
  const factor = (ACTIVITY_FACTORS[activityLevel] || ACTIVITY_FACTORS.sedentary).factor;
  return bmr * factor;
}

/**
 * Estimation informative de la dépense moyenne quotidienne liée aux
 * séances de sport déclarées (musculation + cardio), en plus du TDEE.
 * Sert d'indicateur complémentaire, affiché séparément pour ne pas
 * compter deux fois la même dépense dans l'objectif calorique.
 */
function calcTrainingBurnPerDay(strengthSessions, sessionDuration, cardioSessions, weightKg) {
  const strengthMET = MET_TABLE.strength.medium;
  const cardioMET = MET_TABLE.running.medium;
  const cardioRefDuration = 40; // durée moyenne de référence pour une séance de cardio
  const weeklyStrengthKcal = (Number(strengthSessions) || 0) * (Number(sessionDuration) || 0) * (strengthMET * 3.5 * weightKg / 200);
  const weeklyCardioKcal = (Number(cardioSessions) || 0) * cardioRefDuration * (cardioMET * 3.5 * weightKg / 200);
  return (weeklyStrengthKcal + weeklyCardioKcal) / 7;
}

/* ------------------------------------------------------------------ */
/* CALORIES CIBLES SELON L'OBJECTIF                                    */
/* ------------------------------------------------------------------ */

function calcGoalCalories(tdee, goal) {
  const g = GOALS[goal] || GOALS.maintain;
  return Math.round(tdee * (1 + g.calAdjust));
}

/* ------------------------------------------------------------------ */
/* MACRONUTRIMENTS                                                     */
/* ------------------------------------------------------------------ */

/**
 * Répartit les calories cibles en protéines / lipides / glucides selon
 * l'objectif, puis ajoute fibres et eau recommandées.
 */
function calcMacros(weightKg, goalCalories, goal) {
  const g = GOALS[goal] || GOALS.maintain;

  const proteinG = weightKg * g.proteinPerKg;
  const proteinKcal = proteinG * 4;

  const fatKcal = goalCalories * g.fatPercent;
  const fatG = fatKcal / 9;

  const carbsKcal = Math.max(goalCalories - proteinKcal - fatKcal, 0);
  const carbsG = carbsKcal / 4;

  const fiberG = Math.round((goalCalories / 1000) * 14); // 14 g / 1000 kcal (repère nutritionnel standard)

  return {
    protein: { g: round1(proteinG), kcal: Math.round(proteinKcal) },
    carbs:   { g: round1(carbsG),   kcal: Math.round(carbsKcal) },
    fat:     { g: round1(fatG),     kcal: Math.round(fatKcal) },
    fiber:   { g: fiberG }
  };
}

/** Eau recommandée (ml) : 35 ml/kg + bonus lié à la fréquence d'entraînement. */
function calcWaterNeeds(weightKg, weeklySessions) {
  const base = weightKg * 35;
  const trainingBonus = (weeklySessions * 500) / 7;
  return Math.round(base + trainingBonus);
}

/* ------------------------------------------------------------------ */
/* RÉPARTITION DES CALORIES PAR REPAS                                  */
/* ------------------------------------------------------------------ */

const MEAL_TEMPLATES = {
  2: [{ slot: 'Repas 1', pct: 0.50 }, { slot: 'Repas 2', pct: 0.50 }],
  3: [{ slot: 'Petit-déjeuner', pct: 0.30 }, { slot: 'Déjeuner', pct: 0.40 }, { slot: 'Dîner', pct: 0.30 }],
  4: [{ slot: 'Petit-déjeuner', pct: 0.25 }, { slot: 'Déjeuner', pct: 0.35 }, { slot: 'Collation', pct: 0.10 }, { slot: 'Dîner', pct: 0.30 }],
  5: [{ slot: 'Petit-déjeuner', pct: 0.22 }, { slot: 'Collation', pct: 0.10 }, { slot: 'Déjeuner', pct: 0.30 }, { slot: 'Collation', pct: 0.10 }, { slot: 'Dîner', pct: 0.28 }],
  6: [{ slot: 'Petit-déjeuner', pct: 0.20 }, { slot: 'Collation', pct: 0.10 }, { slot: 'Déjeuner', pct: 0.25 }, { slot: 'Collation', pct: 0.10 }, { slot: 'Dîner', pct: 0.25 }, { slot: 'Collation', pct: 0.10 }]
};

function calcMealBreakdown(goalCalories, macros, mealsPerDay) {
  const template = MEAL_TEMPLATES[mealsPerDay] || MEAL_TEMPLATES[4];
  return template.map((t, i) => ({
    slot: t.slot,
    key: `${t.slot}-${i}`,
    pct: t.pct,
    kcal: Math.round(goalCalories * t.pct),
    protein: round1(macros.protein.g * t.pct),
    carbs: round1(macros.carbs.g * t.pct),
    fat: round1(macros.fat.g * t.pct)
  }));
}

/* ------------------------------------------------------------------ */
/* CALORIES BRÛLÉES (calculateur d'activité)                          */
/* ------------------------------------------------------------------ */

/** kcal = MET x 3.5 x poids(kg) / 200 x durée(min) — formule standard MET. */
function calcCaloriesBurned(activityKey, intensity, durationMin, weightKg) {
  const activity = MET_TABLE[activityKey] || MET_TABLE.strength;
  const met = activity[intensity] || activity.medium;
  return Math.round(met * 3.5 * weightKg / 200 * durationMin);
}

/* ------------------------------------------------------------------ */
/* ORCHESTRATEUR — calcule le profil complet à partir du formulaire    */
/* ------------------------------------------------------------------ */

function computeFullProfile(input) {
  const weight = Number(input.weight);
  const height = Number(input.height);
  const age = Number(input.age);

  const bmi = input.bmiAuto ? round1(calcBMI(weight, height)) : round1(Number(input.bmiManual) || calcBMI(weight, height));
  const bmiCategory = getBMICategory(bmi);

  const bmr = Math.round(calcBMR(input.gender, weight, height, age));
  const tdee = Math.round(calcTDEE(bmr, input.activityLevel));
  const trainingBurnPerDay = Math.round(calcTrainingBurnPerDay(input.strengthSessions, input.sessionDuration, input.cardioSessions, weight));

  const goalCalories = calcGoalCalories(tdee, input.goal);
  const macros = calcMacros(weight, goalCalories, input.goal);

  const weeklySessions = (Number(input.strengthSessions) || 0) + (Number(input.cardioSessions) || 0);
  macros.water = { ml: calcWaterNeeds(weight, weeklySessions) };

  const mealBreakdown = calcMealBreakdown(goalCalories, macros, Number(input.mealsPerDay) || 4);

  return { input, bmi, bmiCategory, bmr, tdee, trainingBurnPerDay, goalCalories, macros, mealBreakdown, computedAt: new Date().toISOString() };
}