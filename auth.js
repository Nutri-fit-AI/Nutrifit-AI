/* ==========================================================================
   AUTH.JS
   Fichier AJOUTÉ (n'altère aucun fichier existant) : gère la connexion
   Google obligatoire via Google Identity Services (GSI). Tant que
   l'utilisateur n'est pas connecté, un écran de connexion (#authGate,
   voir proj-01.html + css/auth.css) recouvre toute l'application.

   ⚠️ CONFIGURATION OBLIGATOIRE AVANT MISE EN LIGNE ⚠️
   Remplacez GOOGLE_CLIENT_ID ci-dessous par votre propre identifiant
   client OAuth Google :
     1. Rendez-vous sur https://console.cloud.google.com/apis/credentials
     2. Créez un identifiant → "ID client OAuth" → type "Application Web"
     3. Ajoutez l'URL de votre site dans "Origines JavaScript autorisées"
        (ex : http://localhost:5500 en test, https://votresite.com en prod)
     4. Copiez l'ID généré (il se termine par .apps.googleusercontent.com)
        et collez-le ci-dessous.
   Sans cette étape, le bouton Google ne pourra pas s'afficher.

   Note sécurité : cette vérification se fait uniquement côté client
   (le jeton n'est pas revalidé par un serveur). Pour un contrôle d'accès
   réellement sécurisé, le jeton "credential" reçu devrait être envoyé à
   un backend qui le vérifie auprès de Google avant d'ouvrir l'accès.
   ========================================================================== */

const GOOGLE_CLIENT_ID = '598708819909-kjq7ec3drhdo1htthkco0n6459un091k.apps.googleusercontent.com' ;
const GOOGLE_USER_KEY = 'nutrifit_google_user';
const GUEST_MODE_KEY = 'nutrifit_guest_mode';

/** Décode la partie "payload" d'un jeton JWT (id_token Google) pour en
 *  extraire les infos de profil (nom, e-mail, photo). Décodage simple,
 *  sans vérification de signature (voir note sécurité ci-dessus). */
function decodeGoogleJWT(token) {
  try {
    const base64Payload = token.split('.')[1];
    const json = decodeURIComponent(
      atob(base64Payload.replace(/-/g, '+').replace(/_/g, '/'))
        .split('')
        .map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    );
    return JSON.parse(json);
  } catch (e) {
    console.warn('Jeton Google illisible :', e);
    return null;
  }
}

function showAuthGate() {
  document.body.classList.add('auth-locked');
}

function hideAuthGate() {
  document.body.classList.remove('auth-locked');
}

/** Affiche les infos du compte connecté dans le pied de la sidebar,
 *  enregistre l'utilisateur et referme l'écran de connexion. */
function applyGoogleUser(user) {
  storageSet(GOOGLE_USER_KEY, user);

  const nameEl = document.getElementById('authUserName');
  const emailEl = document.getElementById('authUserEmail');
  const avatarEl = document.getElementById('authUserAvatar');

  if (nameEl) nameEl.textContent = user.name || '';
  if (emailEl) emailEl.textContent = user.email || '';
  if (avatarEl) avatarEl.src = user.picture || '';

  hideAuthGate();
}

/** Callback appelée par Google une fois l'utilisateur authentifié. */
function handleGoogleCredentialResponse(response) {
  const payload = decodeGoogleJWT(response.credential);
  if (!payload) {
    if (typeof showToast === 'function') {
      showToast('Connexion Google impossible, veuillez réessayer.', 'warn');
    }
    return;
  }
  applyGoogleUser({
    name: payload.name,
    email: payload.email,
    picture: payload.picture,
    sub: payload.sub
  });
}

/** Déconnexion : efface l'utilisateur local et rouvre l'écran de connexion. */
function signOutGoogle() {
  storageRemove(GOOGLE_USER_KEY);
  storageRemove(GUEST_MODE_KEY);
  if (window.google && google.accounts && google.accounts.id) {
    google.accounts.id.disableAutoSelect();
  }
  showAuthGate();
  renderGoogleButton();
}

/** Continue sans compte Google : referme l'écran de connexion et affiche
 *  un compte "Invité" dans le pied de la sidebar. (ajouté) */
function continueAsGuest() {
  storageSet(GUEST_MODE_KEY, true);

  const nameEl = document.getElementById('authUserName');
  const emailEl = document.getElementById('authUserEmail');
  const avatarEl = document.getElementById('authUserAvatar');

  if (nameEl) nameEl.textContent = 'Invité';
  if (emailEl) emailEl.textContent = '';
  if (avatarEl) avatarEl.src = '';

  hideAuthGate();
}

/** Dessine (ou redessine) le bouton officiel "Se connecter avec Google". */
function renderGoogleButton() {
  const container = document.getElementById('googleSignInBtn');
  if (!container || !window.google || !google.accounts || !google.accounts.id) return;
  container.innerHTML = '';
  google.accounts.id.renderButton(container, {
    theme: 'filled_black',
    size: 'large',
    shape: 'pill',
    text: 'continue_with',
    logo_alignment: 'left'
  });
}

/** Initialise Google Identity Services et affiche le portail de connexion
 *  obligatoire si aucun compte n'est déjà enregistré localement. */
function initGoogleAuth() {
  const existingUser = storageGet(GOOGLE_USER_KEY, null);
  const isGuest = storageGet(GUEST_MODE_KEY, false);

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', signOutGoogle);

  const guestBtn = document.getElementById('guestBtn');
  if (guestBtn) guestBtn.addEventListener('click', continueAsGuest);

  // Si l'utilisateur avait déjà choisi "invité" lors d'une visite précédente,
  // on rouvre directement l'appli sans repasser par l'écran de connexion. (ajouté)
  if (isGuest && !existingUser) {
    continueAsGuest();
    return;
  }

  if (!window.google || !google.accounts || !google.accounts.id) {
    // La librairie Google n'a pas pu se charger (réseau, bloqueur de script…)
    console.warn('Google Identity Services indisponible pour le moment.');
    if (!existingUser) showAuthGate();
    else applyGoogleUser(existingUser);
    return;
  }

  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleGoogleCredentialResponse,
    auto_select: true
  });

  if (existingUser) {
    applyGoogleUser(existingUser);
  } else {
    showAuthGate();
    google.accounts.id.prompt(); // propose aussi le "One Tap" Google
  }

  renderGoogleButton();
}

document.addEventListener('DOMContentLoaded', initGoogleAuth);
