// Accès à Supabase depuis les routes serverless, via son API REST (PostgREST).
//
// Pourquoi pas @supabase/supabase-js ? Les requêtes utiles ici sont trois
// appels HTTP triviaux. Une dépendance de plus alourdirait le démarrage à
// froid de chaque fonction sans rien simplifier.
//
// SUPABASE_SERVICE_KEY contourne RLS : elle ne doit jamais sortir du serveur.
// Elle n'est lue que dans ce fichier, qui n'est jamais importé par le front.

import crypto from 'node:crypto';

const URL_BASE = process.env.SUPABASE_URL;
const CLE = process.env.SUPABASE_SERVICE_KEY;

export function configure() {
  return Boolean(URL_BASE && CLE);
}

function enTetes(extra = {}) {
  return {
    apikey: CLE,
    Authorization: `Bearer ${CLE}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function appeler(chemin, options) {
  const rep = await fetch(`${URL_BASE}/rest/v1/${chemin}`, options);
  if (!rep.ok) {
    const detail = await rep.text();
    throw new Error(`Supabase ${rep.status} : ${detail.slice(0, 300)}`);
  }
  // Une écriture avec Prefer: return=minimal renvoie un corps vide : le .json()
  // lèverait alors que tout s'est bien passé.
  const texte = await rep.text();
  return texte ? JSON.parse(texte) : null;
}

export function inserer(table, ligne) {
  return appeler(table, {
    method: 'POST',
    headers: enTetes({ Prefer: 'return=minimal' }),
    body: JSON.stringify(ligne),
  });
}

export function lire(table, requete) {
  return appeler(`${table}?${requete}`, { method: 'GET', headers: enTetes() });
}

export function supprimer(table, requete) {
  return appeler(`${table}?${requete}`, {
    method: 'DELETE',
    headers: enTetes({ Prefer: 'return=minimal' }),
  });
}

export function modifier(table, requete, champs) {
  return appeler(`${table}?${requete}`, {
    method: 'PATCH',
    headers: enTetes({ Prefer: 'return=representation' }),
    body: JSON.stringify(champs),
  });
}

// ── Empreinte de l'IP ───────────────────────────────────────────────────────
// On ne stocke jamais l'adresse elle-même. Le sel rend l'empreinte inutilisable
// ailleurs : sans lui, un hachage de SHA-256 sur un espace aussi petit que les
// adresses IPv4 se retrouve par simple énumération.
export function hacherIp(req) {
  const brut = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  if (!brut) return null;
  const sel = process.env.HACHAGE_SEL || '';
  return crypto.createHash('sha256').update(sel + brut).digest('hex').slice(0, 32);
}

// ── Comparaison de secrets ──────────────────────────────────────────────────
// Le hachage préalable sert à deux choses : donner deux tampons de même
// longueur, que timingSafeEqual exige, et empêcher que la durée de comparaison
// ne révèle la longueur du mot de passe attendu.
export function memeSecret(fourni, attendu) {
  if (typeof fourni !== 'string' || typeof attendu !== 'string' || !attendu) {
    return false;
  }
  const a = crypto.createHash('sha256').update(fourni).digest();
  const b = crypto.createHash('sha256').update(attendu).digest();
  return crypto.timingSafeEqual(a, b);
}
