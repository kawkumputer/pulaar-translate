// Route serverless Vercel : enregistre le retour d'un visiteur sur une
// traduction.
//
// Le navigateur ne parle jamais à Supabase directement. S'il le faisait, il
// faudrait lui confier une clé, et une clé dans une page publique est une clé
// publique. Tout passe donc par ici, avec la clé service côté serveur.

import { configure, inserer, lire, hacherIp } from './_supabase.js';

const DIRECTIONS = new Set(['fr → pul', 'pul → fr']);
const VERDICTS = new Set(['bonne', 'mauvaise']);

// Alignés sur les colonnes et sur le champ de saisie du front (1000).
const LIMITES = {
  texte_source: 1000,
  traduction_modele: 3000,
  correction: 2000,
  dialecte: 60,
  contributeur: 80,
};

// La version jugée suit le Space, pas le code du site : une variable
// d'environnement évite d'avoir à redéployer le site à chaque nouveau modèle.
const MODELE = process.env.MODELE_VERSION || 'v11';

// Cinq envois par minute et par empreinte. Un visiteur sincère qui corrige
// plusieurs phrases d'affilée reste en dessous ; un script, non.
const MAX_PAR_MINUTE = 5;

function texte(valeur, max) {
  if (valeur === undefined || valeur === null || valeur === '') return null;
  if (typeof valeur !== 'string') return undefined; // undefined = invalide
  const propre = valeur.trim();
  if (!propre) return null;
  if (propre.length > max) return undefined;
  return propre;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ erreur: 'Méthode non autorisée' });
  }
  if (!configure()) {
    console.error('SUPABASE_URL ou SUPABASE_SERVICE_KEY absente');
    return res.status(503).json({ erreur: 'Les retours ne sont pas encore activés.' });
  }

  const corps = req.body || {};

  const source = texte(corps.texte_source, LIMITES.texte_source);
  const sortie = texte(corps.traduction_modele, LIMITES.traduction_modele);
  if (!source || !sortie) {
    return res.status(400).json({ erreur: 'Retour incomplet.' });
  }
  if (!DIRECTIONS.has(corps.direction)) {
    return res.status(400).json({ erreur: 'Direction inconnue.' });
  }
  if (!VERDICTS.has(corps.verdict)) {
    return res.status(400).json({ erreur: 'Verdict inconnu.' });
  }

  const correction = texte(corps.correction, LIMITES.correction);
  const dialecte = texte(corps.dialecte, LIMITES.dialecte);
  const contributeur = texte(corps.contributeur, LIMITES.contributeur);
  if (correction === undefined || dialecte === undefined || contributeur === undefined) {
    return res.status(400).json({ erreur: 'Champ trop long.' });
  }

  // Une correction identique à la sortie du modèle ne dit rien : c'est presque
  // toujours un envoi par mégarde après avoir cliqué « Non ».
  if (correction && correction === sortie) {
    return res.status(400).json({
      erreur: 'La correction est identique à la traduction proposée.',
    });
  }

  const ip_hachee = hacherIp(req);

  try {
    if (ip_hachee) {
      const depuis = new Date(Date.now() - 60_000).toISOString();
      const recents = await lire(
        'retours',
        `select=id&ip_hachee=eq.${ip_hachee}&cree_le=gte.${depuis}`,
      );
      if (Array.isArray(recents) && recents.length >= MAX_PAR_MINUTE) {
        return res.status(429).json({
          erreur: 'Trop d’envois d’un coup. Patientez une minute.',
        });
      }
    }

    await inserer('retours', {
      texte_source: source,
      direction: corps.direction,
      traduction_modele: sortie,
      verdict: corps.verdict,
      correction,
      dialecte,
      contributeur,
      modele: MODELE,
      ip_hachee,
    });

    return res.status(201).json({ enregistre: true });
  } catch (err) {
    console.error('Echec d enregistrement du retour :', err);
    return res.status(500).json({ erreur: 'L’envoi a échoué. Réessayez.' });
  }
}
