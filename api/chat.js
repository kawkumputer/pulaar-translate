// Route serverless Vercel : relais entre l'app de test de l'assistant (LLM
// PulaarLLM) et son Inference Endpoint Hugging Face.
//
// Ce n'est PAS un service public : seuls les comptes listés dans
// CHAT_UTILISATEURS (uuid Supabase, séparés par des virgules) y ont accès.
// L'endpoint est payé à l'heure d'allumage ; un quota journalier à part
// (clé chat:u:<uuid>, QUOTA_CHAT) sert de garde-fou. Le quota du traducteur
// n'est pas touché.
//
// Deux actions, sur la même route pour ne compter qu'une fonction Vercel :
//   envoyer (défaut) : { mode, message, historique, chaud, conversation, tour }
//                      → { reponse, id, restant }
//   noter            : { action: 'noter', id, note, correction, commentaire }
//                      → { ok: true }
//
// Chaque échange est enregistré dans conversations_llm (voir
// supabase/migration_2026-11-12_conversations_llm.sql) : c'est la matière
// qui sert à comprendre les limites du modèle et à préparer la version
// suivante.

import crypto from 'node:crypto';
import {
  configure, inserer, modifier, rpc, jetonDe, utilisateurDuJeton,
} from './_supabase.js';
import { rendre } from './_quota.js';

const MODES = new Set(['conv', 'fr', 'pul']);
const NOTES = new Set(['juste', 'faux', 'invente', 'pas_pulaar']);
const MAX_CARACTERES = 1000;
const MAX_HISTORIQUE = 6; // le handler n'en garde pas plus
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Au-delà, la fonction Vercel (maxDuration 60) serait coupée sans réponse.
const DELAI_ENDPOINT_MS = 50_000;

function entier(nom, defaut) {
  const v = Number.parseInt(process.env[nom] ?? '', 10);
  return Number.isFinite(v) && v >= 0 ? v : defaut;
}

function autorises() {
  return new Set(
    String(process.env.CHAT_UTILISATEURS || '')
      .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  );
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

// Appel de l'endpoint. Renvoie { ok: true, reponse, tokens } ou { ok: false }
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
    return { ok: true, reponse: sortie.reponse, tokens: sortie.tokens ?? null };
  } catch (err) {
    if (err?.name === 'AbortError') return { ok: false };
    throw err;
  } finally {
    clearTimeout(minuterie);
  }
}

async function envoyer(req, res, user) {
  const {
    mode = 'conv', message, historique = [], chaud = false, conversation, tour = 0,
  } = req.body || {};
  if (!MODES.has(mode)) return res.status(400).json({ erreur: 'Mode inconnu.' });
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

  // Quota à part du traducteur, et seulement après la validation.
  const QUOTA_CHAT = entier('QUOTA_CHAT', 300);
  const cles = [`chat:u:${user.id}`];
  let restant = null;
  try {
    const r = await rpc('consommer_quota', { p_cles: cles, p_limites: [QUOTA_CHAT] });
    if (typeof r === 'number' && r < 0) {
      return res.status(429).json({
        erreur: `Les ${QUOTA_CHAT} messages du jour sont utilisés. Le compteur repart à zéro à minuit (UTC).`,
        code: 'quota',
      });
    }
    restant = typeof r === 'number' ? r : null;
  } catch (err) {
    console.error('Quota du chat non appliqué :', err);
  }

  const hist = historique.slice(-MAX_HISTORIQUE);
  const entree = { mode, message: message.trim(), historique: hist, chaud: Boolean(chaud) };
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
  try {
    await inserer('conversations_llm', {
      id,
      utilisateur: user.id,
      conversation,
      tour: Number.isInteger(tour) && tour >= 0 ? tour : 0,
      mode,
      message: entree.message,
      historique: hist,
      reponse: sortie.reponse,
      modele: process.env.MODELE_LLM || 'v10',
      chaud: entree.chaud,
      duree_ms: Date.now() - debut,
      tokens: sortie.tokens,
    });
  } catch (err) {
    // La réponse est donnée quand même ; seule la notation sera impossible.
    console.error('Échange non enregistré :', err);
    return res.status(200).json({ reponse: sortie.reponse, id: null, restant });
  }
  return res.status(200).json({ reponse: sortie.reponse, id, restant });
}

async function noter(req, res, user) {
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
  // Le filtre sur l'utilisateur empêche de noter l'échange d'un autre compte.
  const lignes = await modifier(
    'conversations_llm',
    `id=eq.${id}&utilisateur=eq.${user.id}`,
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

  const jeton = jetonDe(req);
  const user = jeton ? await utilisateurDuJeton(jeton) : null;
  if (!user) {
    return res.status(401).json({
      erreur: jeton ? 'Session expirée. Reconnectez-vous.' : 'Connexion requise.',
      code: 'session',
      connexion_requise: true,
    });
  }
  if (!autorises().has(String(user.id).toLowerCase())) {
    return res.status(403).json({ erreur: "Ce compte n'a pas accès à l'assistant de test.", code: 'interdit' });
  }

  try {
    return req.body?.action === 'noter' ? await noter(req, res, user) : await envoyer(req, res, user);
  } catch (err) {
    console.error('Erreur du chat :', err);
    return res.status(500).json({ erreur: 'Erreur interne. Réessayez.' });
  }
}
