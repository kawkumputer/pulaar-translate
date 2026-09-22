// Route serverless Vercel : dépouillement des retours. Accès réservé.
//
// Trois usages, tous derrière le même mot de passe :
//   GET    ?statut=nouveau          liste les retours, avec les compteurs
//   GET    ?format=jsonl&statut=…   exporte au schéma du dataset {fr, pul, source}
//   PATCH  {id, statut, note}       valide ou rejette un retour
//   DELETE ?id=…                    efface définitivement — spam et abus seuls
//
// Rejeter et supprimer ne servent pas à la même chose. Un retour rejeté reste
// en base : sa correction ne vaut rien, mais son TEXTE SOURCE dit qu'un tour de
// phrase est demandé et que le modèle le rate — c'est la feuille de route du
// lot suivant. La suppression est réservée à ce qu'on ne veut pas conserver du
// tout : insultes, spam.
//
// Règle de fond : rien ne part à l'entraînement sans être passé par ici. Une
// correction venue du web est un candidat, pas une donnée. L'export ne sort
// donc que ce qui a été validé à la main.

import { configure, lire, modifier, supprimer, memeSecret } from './_supabase.js';

const STATUTS = new Set(['nouveau', 'valide', 'rejete']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CHAMPS = [
  'id', 'cree_le', 'texte_source', 'direction', 'traduction_modele',
  'traduction_modele_origine',
  'verdict', 'correction', 'contributeur', 'modele',
  'statut', 'note_interne',
].join(',');

// Textes que le dépouillement peut amender, avec leur longueur maximale.
// Ce sont exactement les trois valeurs qui composent la paire exportée.
const MODIFIABLES = {
  texte_source: 1000,
  traduction_modele: 3000,
  correction: 2000,
};

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
      const corps = req.body || {};
      const { id, statut } = corps;
      if (!UUID.test(String(id || ''))) {
        return res.status(400).json({ erreur: 'Identifiant invalide.' });
      }
      if (!STATUTS.has(statut)) {
        return res.status(400).json({ erreur: 'Statut inconnu.' });
      }
      const champs = { statut };
      if (typeof corps.note_interne === 'string') {
        champs.note_interne = corps.note_interne.slice(0, 500).trim() || null;
      }

      // Les trois textes sont amendables au dépouillement. Un contributeur
      // propose parfois deux variantes dans un seul champ — « X » ou « Y » —,
      // écrit une correction bancale, ou tape le texte source avec une faute.
      // Trancher à la relecture coûte moins cher que nettoyer un corpus après
      // coup, et ce sont ces trois valeurs qui composent la paire exportée.
      for (const [cle, max] of Object.entries(MODIFIABLES)) {
        if (typeof corps[cle] !== 'string') continue;
        const propre = corps[cle].trim();
        if (propre.length > max) {
          return res.status(400).json({ erreur: `Champ « ${cle} » trop long.` });
        }
        // texte_source et traduction_modele sont NOT NULL en base : les vider
        // ferait échouer la requête avec un message incompréhensible.
        if (!propre && cle !== 'correction') {
          return res.status(400).json({ erreur: `Champ « ${cle} » obligatoire.` });
        }
        champs[cle] = propre || null;
      }

      // La sortie du modèle est la seule trace de ce que v11 a réellement
      // produit sur cette entrée : c'est le diagnostic qui alimente le lot
      // suivant. Avant de l'écraser, on en garde l'original — une seule fois,
      // pour que plusieurs retouches successives ne le remplacent pas par une
      // version déjà corrigée.
      if (champs.traduction_modele) {
        const [avant] = await lire('retours',
          `select=traduction_modele,traduction_modele_origine&id=eq.${id}`);
        if (avant && avant.traduction_modele !== champs.traduction_modele
            && !avant.traduction_modele_origine) {
          champs.traduction_modele_origine = avant.traduction_modele;
        }
      }

      const maj = await modifier('retours', `id=eq.${id}`, champs);
      return res.status(200).json({ retour: Array.isArray(maj) ? maj[0] : maj });
    }

    if (req.method === 'DELETE') {
      // L'identifiant est validé avant d'entrer dans l'URL PostgREST : sans ce
      // contrôle, une chaîne fabriquée changerait le filtre et la suppression
      // porterait sur autre chose que la ligne visée.
      const id = String(req.query.id || '');
      if (!UUID.test(id)) {
        return res.status(400).json({ erreur: 'Identifiant invalide.' });
      }
      await supprimer('retours', `id=eq.${id}`);
      return res.status(200).json({ supprime: true });
    }

    return res.status(405).json({ erreur: 'Méthode non autorisée' });
  } catch (err) {
    console.error('Echec cote admin :', err);
    return res.status(500).json({ erreur: 'La requête a échoué.' });
  }
}
