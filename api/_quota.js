// Quota journalier de traductions.
//
// Le Space tourne sur ZeroGPU : chaque traduction puise dans le quota GPU du
// compte Hugging Face. Ce module décide qui est l'appelant et combien il lui
// reste. Le comptage lui-même est fait par Supabase (consommer_quota), de façon
// atomique.
//
// Trois cas :
//   - app, connecté     → clé u:<uuid>,  QUOTA_COMPTE  (50 par défaut)
//   - app, sans compte  → clé d:<hash>,  QUOTA_INVITE  (5)  ET clé ip:<hash>
//   - site web          → clé ip:<hash>, QUOTA_IP      (100)
//
// QUOTA_IP est large exprès : au Sénégal comme en Mauritanie, les opérateurs
// mobiles font passer beaucoup d'abonnés par la même adresse IP (CGNAT). Une
// limite serrée bloquerait des inconnus les uns par les autres.
//
// Les trois limites se règlent dans les variables d'environnement Vercel, sans
// republier l'app.

import {
  configure, rpc, hacher, hacherIp, jetonDe, utilisateurDuJeton,
} from './_supabase.js';

function entier(nom, defaut) {
  const v = Number.parseInt(process.env[nom] ?? '', 10);
  return Number.isFinite(v) && v >= 0 ? v : defaut;
}

export const QUOTA_COMPTE = entier('QUOTA_COMPTE', 50);
export const QUOTA_INVITE = entier('QUOTA_INVITE', 5);
export const QUOTA_IP = entier('QUOTA_IP', 100);

// Identifiant d'appareil tiré au hasard par l'app au premier lancement.
const APPAREIL_VALIDE = /^[A-Za-z0-9_-]{16,64}$/;

// Renvoie { ok: true, restant, cles } ou { ok: false, statut, corps }.
// `cles` sert à rendre l'unité si la traduction échoue ensuite.
export async function consommer(req) {
  const jeton = jetonDe(req);
  const appareil = String(req.headers['x-appareil'] || '');

  // Un jeton présent mais refusé (expiré, compte supprimé) ne doit pas
  // retomber en silence sur le quota invité : l'app doit rafraîchir la
  // session ou redemander la connexion.
  let user = null;
  if (jeton) {
    user = await utilisateurDuJeton(jeton);
    if (!user) {
      return {
        ok: false,
        statut: 401,
        corps: {
          erreur: 'Session expirée. Reconnectez-vous.',
          code: 'session',
          connexion_requise: true,
        },
      };
    }
  }

  // Sans Supabase, on ne peut pas compter. On laisse passer plutôt que de
  // couper le traducteur, et on le signale dans le journal Vercel.
  if (!configure()) {
    console.error('Quota non appliqué : SUPABASE_URL ou SUPABASE_SERVICE_KEY absente');
    return { ok: true, restant: null, cles: [] };
  }

  const ip = hacherIp(req);
  let cles;
  let limites;
  let invite = false;

  if (user) {
    cles = [`u:${user.id}`];
    limites = [QUOTA_COMPTE];
  } else if (APPAREIL_VALIDE.test(appareil)) {
    invite = true;
    cles = [`d:${hacher(appareil)}`];
    limites = [QUOTA_INVITE];
    if (ip) {
      cles.push(`ip:${ip}`);
      limites.push(QUOTA_IP);
    }
  } else if (ip) {
    cles = [`ip:${ip}`];
    limites = [QUOTA_IP];
  } else {
    // Ni compte, ni appareil, ni IP : n'arrive pas derrière Vercel.
    return { ok: true, restant: null, cles: [] };
  }

  let resultat;
  try {
    resultat = await rpc('consommer_quota', { p_cles: cles, p_limites: limites });
  } catch (err) {
    console.error('Quota non appliqué : échec de consommer_quota :', err);
    return { ok: true, restant: null, cles: [] };
  }

  if (typeof resultat === 'number' && resultat >= 0) {
    return { ok: true, restant: resultat, cles };
  }

  // Au plafond. Pour l'app, la sortie est de se connecter (invité) ; pour un
  // compte, d'attendre demain ; pour le site, d'attendre ou de prendre l'app.
  const bloque = typeof resultat === 'number' ? -resultat - 1 : 0;
  return {
    ok: false,
    statut: 429,
    corps: {
      erreur: user
        ? `Vous avez utilisé vos ${QUOTA_COMPTE} traductions du jour. Le compteur repart à zéro à minuit (UTC).`
        : invite
          ? 'Limite du jour atteinte sans compte. Connectez-vous avec Google ou Apple pour continuer.'
          : 'Limite du jour atteinte pour cette connexion. Réessayez demain.',
      code: 'quota',
      limite: limites[bloque] ?? null,
      connexion_requise: invite,
    },
  };
}

// Rend l'unité consommée : le visiteur n'a rien reçu.
export async function rendre(cles) {
  if (!cles?.length) return;
  try {
    await rpc('rendre_quota', { p_cles: cles });
  } catch (err) {
    console.error('Échec de rendre_quota :', err);
  }
}
