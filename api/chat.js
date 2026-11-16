// Route serverless Vercel : relais entre l'app de test de l'assistant (LLM
// PulaarLLM) et son Inference Endpoint Hugging Face.
//
// Ce n'est PAS un service public. L'app HaalPulaar n'est installée que par
// TestFlight (test interne) ou à la main sur Android, sans compte pour
// l'instant. Elle s'identifie par :
//   - une clé d'accès commune (en-tête X-Cle-Assistant = CHAT_CLE) ;
//   - un identifiant d'appareil tiré au hasard (X-Appareil), dont on ne garde
//     qu'une empreinte salée.
// La clé est dans l'app : quelqu'un qui démonte l'app peut la lire. Le
// vrai garde-fou du coût est donc le quota, par appareil (QUOTA_CHAT) ET pour
// tous les appareils ensemble (QUOTA_CHAT_TOTAL), sur des clés chat:… à part :
// le quota du traducteur n'est pas touché. Changer CHAT_CLE dans Vercel coupe
// l'accès à toutes les copies de l'app.
//
// Deux actions, sur la même route pour ne compter qu'une fonction Vercel :
//   envoyer (défaut) : { mode, message, historique, chaud, chercher, conversation, tour }
//                      → { reponse, id, restant, sources }
//   chercher (facultatif, 2026-11-14) : l'interrupteur « Chercher dans les livres » de l'app. L'endpoint
//   cherche alors dans les livres, le corpus et ARPRIM, et répond d'après les extraits trouvés, rendus
//   dans `sources` ([{ source, texte }], vide si rien de pertinent) pour que l'app les montre.
//   noter            : { action: 'noter', id, note, correction, commentaire }
//                      → { ok: true }
//   admin, dormir (2026-11-16) : réservés à qui a le code CHAT_ADMIN_CLE (en-tête X-Admin-Cle), choisi par
//   Hamath, propre à ce bouton : il ne donne aucun autre droit. « admin » vérifie le code (l'app ne le garde que
//   s'il est bon) ; « dormir » endort l'endpoint tout de suite au lieu d'attendre 15 min sans message
//   (scale-to-zero de Hugging Face : facturation arrêtée, réveil seul au message suivant ; ce n'est pas la
//   pause, qui ne se réveille pas). Il faut HF_TOKEN_ENDPOINTS (droit d'écriture sur les endpoints) et
//   HF_ENDPOINT_NOM (espace/nom de l'endpoint).
//                      → { ok: true }
//
// Chaque échange est enregistré dans conversations_llm (voir
// supabase/migration_2026-11-12_conversations_llm.sql) : c'est la matière
// qui sert à comprendre les limites du modèle et à préparer la version
// suivante.

import crypto from 'node:crypto';
import {
  configure, inserer, modifier, rpc, hacher, memeSecret,
} from './_supabase.js';
import { rendre } from './_quota.js';

const MODES = new Set(['conv', 'fr', 'pul']);
const NOTES = new Set(['juste', 'faux', 'invente', 'pas_pulaar']);
const MAX_CARACTERES = 1000;
const MAX_HISTORIQUE = 6; // le handler n'en garde pas plus
const MAX_SOURCES = 5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Même format que l'identifiant d'appareil de Pulaar Translate.
const APPAREIL_VALIDE = /^[A-Za-z0-9_-]{16,64}$/;
// Au-delà, la fonction Vercel (maxDuration 60) serait coupée sans réponse.
const DELAI_ENDPOINT_MS = 50_000;
const API_ENDPOINTS = 'https://api.endpoints.huggingface.cloud/v2/endpoint';
const NOM_ENDPOINT = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function entier(nom, defaut) {
  const v = Number.parseInt(process.env[nom] ?? '', 10);
  return Number.isFinite(v) && v >= 0 ? v : defaut;
}

function texteValide(t, max = MAX_CARACTERES) {
  return typeof t === 'string' && t.trim() !== '' && t.length <= max;
}

function historiqueValide(h) {
  return Array.isArray(h) && h.length <= 50 && h.every(
    (x) => Array.isArray(x) && x.length === 2
      && x.every((s) => typeof s === 'string' && s.length <= 2 * MAX_CARACTERES),
  );
}

// La version du modèle servi, lue dans la réponse de l'endpoint : le handler
// renvoie le dépôt de la LoRA (kawkumputer/pulaar-llm-instruct-v12 → v12).
// L'étiquette suit donc l'endpoint, sans variable à changer à chaque version.
// MODELE_LLM ne sert que si la réponse ne la donne pas.
export function versionModele(lora) {
  const m = typeof lora === 'string' ? lora.match(/-(v\d+[a-z]?)$/) : null;
  return m ? m[1] : (process.env.MODELE_LLM || 'inconnu');
}

// Les extraits renvoyés par l'endpoint, filtrés : on ne relaie que des { source, texte } bien formés.
export function sourcesValides(s) {
  if (!Array.isArray(s)) return [];
  return s.filter((x) => x && typeof x.source === 'string' && typeof x.texte === 'string'
    && x.texte.length <= 2000 && x.source.length <= 200)
    .slice(0, MAX_SOURCES)
    .map((x) => ({ source: x.source, texte: x.texte }));
}

// Appel de l'endpoint. Renvoie { ok: true, reponse, tokens, modele, sources } ou { ok: false }
// quand il dort ou démarre.
async function appelerEndpoint(entree) {
  const url = process.env.HF_ENDPOINT_CHAT;
  const jeton = process.env.HF_TOKEN_CHAT || process.env.HF_TOKEN;
  const arret = new AbortController();
  const minuterie = setTimeout(() => arret.abort(), DELAI_ENDPOINT_MS);
  try {
    const rep = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: entree }),
      signal: arret.signal,
    });
    // En veille (mise à l'échelle zéro) ou en démarrage, l'endpoint répond 503
    // tout de suite et se réveille : l'app réessaie un peu plus tard.
    if (rep.status === 503 || rep.status === 502) return { ok: false };
    if (!rep.ok) {
      const detail = await rep.text();
      throw new Error(`Endpoint ${rep.status} : ${detail.slice(0, 300)}`);
    }
    const corps = await rep.json();
    const sortie = Array.isArray(corps) ? corps[0] : corps;
    if (sortie?.erreur) throw new Error(`Endpoint a refusé : ${sortie.erreur}`);
    if (typeof sortie?.reponse !== 'string') throw new Error("Réponse inattendue de l'endpoint");
    return {
      ok: true,
      reponse: sortie.reponse,
      tokens: sortie.tokens ?? null,
      modele: versionModele(sortie.lora),
      sources: sourcesValides(sortie.sources_trouvees),
    };
  } catch (err) {
    if (err?.name === 'AbortError') return { ok: false };
    throw err;
  } finally {
    clearTimeout(minuterie);
  }
}

async function envoyer(req, res, appareil) {
  const {
    mode = 'conv', message, historique = [], chaud = false, chercher = false, conversation, tour = 0,
  } = req.body || {};
  if (!MODES.has(mode)) return res.status(400).json({ erreur: 'Mode inconnu.' });
  if (typeof chercher !== 'boolean') return res.status(400).json({ erreur: 'chercher doit être vrai ou faux.' });
  if (chercher && mode !== 'conv') {
    return res.status(400).json({ erreur: 'La recherche dans les livres ne marche qu’en discussion.' });
  }
  if (!texteValide(message)) {
    return res.status(400).json({
      erreur: `Message vide ou trop long (maximum ${MAX_CARACTERES} caractères).`,
    });
  }
  if (!historiqueValide(historique)) return res.status(400).json({ erreur: 'Historique mal formé.' });
  if (typeof conversation !== 'string' || !UUID.test(conversation)) {
    return res.status(400).json({ erreur: 'Identifiant de conversation invalide.' });
  }
  if (!process.env.HF_ENDPOINT_CHAT) {
    return res.status(503).json({ erreur: "L'assistant n'est pas encore branché.", code: 'non_configure' });
  }

  // Quota à part du traducteur, et seulement après la validation : par
  // appareil, et pour tous les appareils ensemble (le coût de l'endpoint).
  const QUOTA_CHAT = entier('QUOTA_CHAT', 300);
  const QUOTA_CHAT_TOTAL = entier('QUOTA_CHAT_TOTAL', 500);
  const cles = [`chat:d:${appareil}`, 'chat:tout'];
  let restant = null;
  try {
    const r = await rpc('consommer_quota', { p_cles: cles, p_limites: [QUOTA_CHAT, QUOTA_CHAT_TOTAL] });
    if (typeof r === 'number' && r < 0) {
      const total = r === -2;
      return res.status(429).json({
        erreur: total
          ? `Les ${QUOTA_CHAT_TOTAL} messages du jour (tous appareils) sont utilisés. Le compteur repart à zéro à minuit (UTC).`
          : `Les ${QUOTA_CHAT} messages du jour sont utilisés. Le compteur repart à zéro à minuit (UTC).`,
        code: 'quota',
      });
    }
    restant = typeof r === 'number' ? r : null;
  } catch (err) {
    console.error('Quota du chat non appliqué :', err);
  }

  const hist = historique.slice(-MAX_HISTORIQUE);
  const entree = { mode, message: message.trim(), historique: hist, chaud: Boolean(chaud) };
  if (chercher) entree.chercher = true;
  const debut = Date.now();
  let sortie;
  try {
    sortie = await appelerEndpoint(entree);
  } catch (err) {
    console.error("Échec de l'assistant :", err);
    await rendre(cles);
    return res.status(500).json({ erreur: "L'assistant n'a pas pu répondre. Réessayez dans un instant." });
  }
  if (!sortie.ok) {
    await rendre(cles);
    return res.status(503).json({
      erreur: 'Le modèle se réveille (3 à 5 minutes). Le message sera renvoyé tout seul.',
      code: 'reveil',
    });
  }

  const id = crypto.randomUUID();
  const ligne = {
    id,
    appareil,
    conversation,
    tour: Number.isInteger(tour) && tour >= 0 ? tour : 0,
    mode,
    message: entree.message,
    historique: hist,
    reponse: sortie.reponse,
    modele: sortie.modele,
    chaud: entree.chaud,
    duree_ms: Date.now() - debut,
    tokens: sortie.tokens,
    // migration_2026-11-14_conversations_llm_sources.sql
    chercher: Boolean(chercher),
    sources: sortie.sources.length ? sortie.sources : null,
  };
  try {
    try {
      await inserer('conversations_llm', ligne);
    } catch (err) {
      // Colonnes pas encore créées dans Supabase : l'échange est enregistré sans elles plutôt que perdu.
      if (!/PGRST204|chercher|sources/.test(String(err?.message))) throw err;
      const { chercher: _c, sources: _s, ...sansSources } = ligne;
      await inserer('conversations_llm', sansSources);
    }
  } catch (err) {
    // La réponse est donnée quand même ; seule la notation sera impossible.
    console.error('Échange non enregistré :', err);
    return res.status(200).json({
      reponse: sortie.reponse, id: null, restant, sources: sortie.sources, modele: sortie.modele,
    });
  }
  return res.status(200).json({
    reponse: sortie.reponse, id, restant, sources: sortie.sources, modele: sortie.modele,
  });
}

function admin(req) {
  return memeSecret(String(req.headers['x-admin-cle'] || ''), process.env.CHAT_ADMIN_CLE || '');
}

// Endort l'endpoint tout de suite. Hugging Face répond par l'endpoint mis à jour.
async function dormir(res) {
  const nom = process.env.HF_ENDPOINT_NOM || '';
  const jeton = process.env.HF_TOKEN_ENDPOINTS;
  if (!NOM_ENDPOINT.test(nom) || !jeton) {
    return res.status(503).json({ erreur: 'La mise en veille n’est pas configurée.', code: 'non_configure' });
  }
  const rep = await fetch(`${API_ENDPOINTS}/${nom}/scale-to-zero`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton}` },
  });
  if (!rep.ok) {
    const detail = await rep.text();
    console.error(`Mise en veille refusée : ${rep.status} ${detail.slice(0, 300)}`);
    return res.status(502).json({ erreur: 'Hugging Face a refusé la mise en veille. Réessayez plus tard.' });
  }
  return res.status(200).json({ ok: true });
}

async function noter(req, res, appareil) {
  const {
    id, note = null, correction = null, commentaire = null,
  } = req.body || {};
  if (typeof id !== 'string' || !UUID.test(id)) return res.status(400).json({ erreur: 'Identifiant invalide.' });
  if (note !== null && !NOTES.has(note)) return res.status(400).json({ erreur: 'Note inconnue.' });
  for (const t of [correction, commentaire]) {
    if (t !== null && (typeof t !== 'string' || t.length > MAX_CARACTERES)) {
      return res.status(400).json({ erreur: 'Texte trop long.' });
    }
  }
  // Le filtre sur l'appareil empêche de noter l'échange d'un autre appareil.
  const lignes = await modifier(
    'conversations_llm',
    `id=eq.${id}&appareil=eq.${appareil}`,
    {
      note,
      correction: correction?.trim() || null,
      commentaire: commentaire?.trim() || null,
      note_le: new Date().toISOString(),
    },
  );
  if (!Array.isArray(lignes) || lignes.length === 0) {
    return res.status(404).json({ erreur: 'Échange introuvable.' });
  }
  return res.status(200).json({ ok: true });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erreur: 'Méthode non autorisée' });
  if (!configure()) return res.status(503).json({ erreur: 'Service non configuré.' });

  if (!memeSecret(String(req.headers['x-cle-assistant'] || ''), process.env.CHAT_CLE || '')) {
    return res.status(403).json({ erreur: "Cette app n'a pas accès à l'assistant.", code: 'interdit' });
  }
  const brut = String(req.headers['x-appareil'] || '');
  if (!APPAREIL_VALIDE.test(brut)) {
    return res.status(400).json({ erreur: "Identifiant d'appareil manquant ou invalide." });
  }
  const appareil = hacher(brut);

  const action = req.body?.action;
  if (action === 'admin' || action === 'dormir') {
    if (!admin(req)) return res.status(403).json({ erreur: 'Code incorrect.', code: 'admin' });
    if (action === 'admin') return res.status(200).json({ ok: true });
  }

  try {
    if (action === 'dormir') return await dormir(res);
    return action === 'noter'
      ? await noter(req, res, appareil)
      : await envoyer(req, res, appareil);
  } catch (err) {
    console.error('Erreur du chat :', err);
    return res.status(500).json({ erreur: 'Erreur interne. Réessayez.' });
  }
}
