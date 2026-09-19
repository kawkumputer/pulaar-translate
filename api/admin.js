// Route serverless Vercel : dépouillement des retours. Accès réservé.
//
// Trois usages, tous derrière le même mot de passe :
//   GET    ?statut=nouveau          liste les retours, avec les compteurs
//   GET    ?format=jsonl&statut=…   exporte au schéma du dataset {fr, pul, source}
//   PATCH  {id, statut, note}       valide ou rejette un retour
//
// Règle de fond : rien ne part à l'entraînement sans être passé par ici. Une
// correction venue du web est un candidat, pas une donnée. L'export ne sort
// donc que ce qui a été validé à la main.

import { configure, lire, modifier, memeSecret } from './_supabase.js';

const STATUTS = new Set(['nouveau', 'valide', 'rejete']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CHAMPS = [
  'id', 'cree_le', 'texte_source', 'direction', 'traduction_modele',
  'verdict', 'correction', 'contributeur', 'modele',
  'statut', 'note_interne',
].join(',');

function autorise(req) {
  const attendu = process.env.ADMIN_MOT_DE_PASSE;
  // Sans mot de passe configuré, la page est fermée plutôt qu'ouverte à tous.
  if (!attendu) return false;
  return memeSecret(String(req.headers['x-admin-mdp'] || ''), attendu);
}

// Retour validé → paire au schéma du dataset d'entraînement.
// Un verdict « bonne » confirme la sortie du modèle : c'est utilisable aussi.
// Un « mauvaise » sans correction ne l'est pas : il signale un trou, il ne le
// comble pas.
function enPaire(r) {
  const versPulaar = r.direction === 'fr → pul';
  const propose = r.verdict === 'bonne' ? r.traduction_modele : r.correction;
  if (!propose) return null;
  return versPulaar
    ? { fr: r.texte_source, pul: propose, source: 'retour_public' }
    : { fr: propose, pul: r.texte_source, source: 'retour_public' };
}

export default async function handler(req, res) {
  if (!configure()) {
    return res.status(503).json({ erreur: 'Supabase n’est pas configuré.' });
  }
  if (!autorise(req)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(401).json({ erreur: 'Mot de passe incorrect.' });
  }
  res.setHeader('Cache-Control', 'no-store');

  try {
    if (req.method === 'GET') {
      const statut = STATUTS.has(req.query.statut) ? req.query.statut : null;
      const filtre = statut ? `&statut=eq.${statut}` : '';

      if (req.query.format === 'jsonl') {
        // L'export ne connaît qu'un statut : validé. Exporter des retours non
        // dépouillés reviendrait à contourner la relecture.
        const lignes = await lire('retours',
          `select=${CHAMPS}&statut=eq.valide&order=cree_le.asc`);
        const paires = lignes.map(enPaire).filter(Boolean);
        res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
        res.setHeader('Content-Disposition',
          'attachment; filename="retours_valides.jsonl"');
        return res.status(200).send(
          paires.map((p) => JSON.stringify(p)).join('\n') + (paires.length ? '\n' : ''),
        );
      }

      const limite = Math.min(Number(req.query.limite) || 200, 500);
      const [lignes, tous] = await Promise.all([
        lire('retours', `select=${CHAMPS}&order=cree_le.desc&limit=${limite}${filtre}`),
        lire('retours', 'select=statut,verdict'),
      ]);

      const compteurs = { nouveau: 0, valide: 0, rejete: 0, bonne: 0, mauvaise: 0 };
      for (const l of tous) {
        compteurs[l.statut] = (compteurs[l.statut] || 0) + 1;
        compteurs[l.verdict] = (compteurs[l.verdict] || 0) + 1;
      }
      return res.status(200).json({ retours: lignes, compteurs, total: tous.length });
    }

    if (req.method === 'PATCH') {
      const { id, statut, note_interne } = req.body || {};
      if (!UUID.test(String(id || ''))) {
        return res.status(400).json({ erreur: 'Identifiant invalide.' });
      }
      if (!STATUTS.has(statut)) {
        return res.status(400).json({ erreur: 'Statut inconnu.' });
      }
      const champs = { statut };
      if (typeof note_interne === 'string') {
        champs.note_interne = note_interne.slice(0, 500).trim() || null;
      }
      const maj = await modifier('retours', `id=eq.${id}`, champs);
      return res.status(200).json({ retour: Array.isArray(maj) ? maj[0] : maj });
    }

    return res.status(405).json({ erreur: 'Méthode non autorisée' });
  } catch (err) {
    console.error('Echec cote admin :', err);
    return res.status(500).json({ erreur: 'La requête a échoué.' });
  }
}
