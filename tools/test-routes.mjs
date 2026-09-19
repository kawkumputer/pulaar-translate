// Teste les routes serverless sans Supabase ni Vercel.
//
//     node tools/test-routes.mjs
//
// `fetch` est remplacé par un espion qui rejoue ce que PostgREST renverrait.
// Ce qui est vérifié ici, ce n'est pas que ça marche : c'est que ça REFUSE ce
// qu'il faut refuser. Une route d'écriture ouverte au public qui accepte tout
// est le vrai risque, et ces cas-là ne s'exercent jamais à la main.

import { pathToFileURL } from 'node:url';
import path from 'node:path';

process.env.SUPABASE_URL = 'https://faux.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'cle-de-test';
process.env.ADMIN_MOT_DE_PASSE = 'secret-de-test';
process.env.HACHAGE_SEL = 'sel-de-test';
process.env.MODELE_VERSION = 'v11';

let recents = [];   // ce que renvoie la requête de limitation de débit
let aExporter = []; // ce que renvoie la requête d'export
let inseres = [];   // ce qui a été écrit

globalThis.fetch = async (url, options) => {
  const u = String(url);
  const rep = (corps, status = 200) => ({
    ok: status < 400, status, text: async () => (corps === null ? '' : JSON.stringify(corps)),
  });
  if (options.method === 'POST') { inseres.push(JSON.parse(options.body)); return rep(null, 201); }
  if (options.method === 'PATCH') return rep([{ id: 'x', statut: 'valide' }]);
  if (u.includes('cree_le=gte')) return rep(recents);
  if (u.includes('statut=eq.valide')) return rep(aExporter);
  if (u.includes('select=statut,verdict')) return rep([{ statut: 'nouveau', verdict: 'bonne' }]);
  return rep([]);
};

const api = (f) => pathToFileURL(path.resolve('api', f)).href;
const { default: retour } = await import(api('retour.js'));
const { default: admin } = await import(api('admin.js'));

function fausseReponse() {
  const r = { code: null, corps: null, entetes: {} };
  r.status = (c) => { r.code = c; return r; };
  r.json = (o) => { r.corps = o; return r; };
  r.send = (o) => { r.corps = o; return r; };
  r.setHeader = (k, v) => { r.entetes[k] = v; };
  return r;
}

const BON = {
  texte_source: 'Je vais au village',
  direction: 'fr → pul',
  traduction_modele: 'Njahat mi ko to wuro',
  verdict: 'bonne',
};

let echecs = 0;
function verifier(nom, ok, detail = '') {
  if (!ok) echecs++;
  console.log(`  ${ok ? 'OK  ' : 'ECHEC'} ${nom}${ok ? '' : ` — ${detail}`}`);
}

async function cas(nom, handler, req, attendu) {
  const res = fausseReponse();
  req.headers = req.headers || { 'x-forwarded-for': '203.0.113.7' };
  req.query = req.query || {};
  await handler(req, res);
  verifier(`${nom.padEnd(50)} ${res.code}`, res.code === attendu,
    `attendu ${attendu}, reçu ${JSON.stringify(res.corps).slice(0, 80)}`);
  return res;
}

console.log('\n── /api/retour : ce qui doit passer et ce qui doit être refusé ──');
await cas('retour valide', retour, { method: 'POST', body: BON }, 201);
await cas('GET refusé', retour, { method: 'GET', body: {} }, 405);
const vide = await cas('corps vide', retour, { method: 'POST', body: {} }, 400);
verifier('« corps vide » dit incomplet', vide.corps.erreur === 'Retour incomplet.',
  vide.corps.erreur);
await cas('direction inventée', retour,
  { method: 'POST', body: { ...BON, direction: 'fr → wolof' } }, 400);
await cas('verdict inventé', retour,
  { method: 'POST', body: { ...BON, verdict: 'bof' } }, 400);
const trop = await cas('texte source trop long', retour,
  { method: 'POST', body: { ...BON, texte_source: 'a'.repeat(1001) } }, 400);
// Trop long et incomplet sont deux problèmes différents : les confondre envoie
// chercher un champ qui manque alors qu'il faut raccourcir.
verifier('« trop long » ne se dit pas « incomplet »',
  trop.corps.erreur === 'Champ trop long.', trop.corps.erreur);
await cas('correction trop longue', retour,
  { method: 'POST', body: { ...BON, verdict: 'mauvaise', correction: 'a'.repeat(2001) } }, 400);
await cas('nom trop long', retour,
  { method: 'POST', body: { ...BON, contributeur: 'a'.repeat(81) } }, 400);
await cas('correction identique à la sortie', retour,
  { method: 'POST', body: { ...BON, verdict: 'mauvaise', correction: BON.traduction_modele } }, 400);
await cas('texte source non textuel', retour,
  { method: 'POST', body: { ...BON, texte_source: { injection: 1 } } }, 400);
await cas('champ non textuel', retour,
  { method: 'POST', body: { ...BON, contributeur: ['a'] } }, 400);

recents = [1, 2, 3, 4, 5].map((i) => ({ id: i }));
await cas('6e envoi dans la même minute', retour, { method: 'POST', body: BON }, 429);
recents = [];

console.log('\n── /api/admin : l’accès ────────────────────────────────────────');
const AUTH = { 'x-admin-mdp': 'secret-de-test' };
await cas('sans mot de passe', admin, { method: 'GET', headers: {} }, 401);
await cas('mauvais mot de passe', admin,
  { method: 'GET', headers: { 'x-admin-mdp': 'autre' } }, 401);
await cas('liste autorisée', admin, { method: 'GET', headers: AUTH }, 200);
await cas('PATCH identifiant invalide', admin,
  { method: 'PATCH', headers: AUTH, body: { id: '../../tout', statut: 'valide' } }, 400);
await cas('PATCH statut inventé', admin,
  { method: 'PATCH', headers: AUTH, body: { id: 'a1b2c3d4-1111-2222-3333-444455556666', statut: 'super' } }, 400);
await cas('PATCH correct', admin,
  { method: 'PATCH', headers: AUTH, body: { id: 'a1b2c3d4-1111-2222-3333-444455556666', statut: 'valide' } }, 200);
await cas('DELETE refusé', admin, { method: 'DELETE', headers: AUTH }, 405);

console.log('\n── L’export : le seul endroit qui touche au schéma du dataset ──');
aExporter = [
  { direction: 'fr → pul', texte_source: 'Il a faim',
    traduction_modele: 'Omo heyɗi', verdict: 'bonne', correction: null },
  { direction: 'fr → pul', texte_source: 'Bonjour',
    traduction_modele: 'Jam waali', verdict: 'mauvaise', correction: 'No mbaalɗaa' },
  { direction: 'pul → fr', texte_source: 'Miɗo tampi',
    traduction_modele: 'Je fatigue', verdict: 'mauvaise', correction: 'Je suis fatigué' },
  { direction: 'fr → pul', texte_source: 'Sans réponse',
    traduction_modele: 'x', verdict: 'mauvaise', correction: null },
];
const exp = await cas('export jsonl', admin,
  { method: 'GET', headers: AUTH, query: { format: 'jsonl' } }, 200);
const paires = exp.corps.trim().split('\n').map((l) => JSON.parse(l));

verifier('un « mauvaise » sans correction est écarté', paires.length === 3,
  `${paires.length} paires au lieu de 3`);
verifier('« bonne » confirme la sortie du modèle',
  paires[0].fr === 'Il a faim' && paires[0].pul === 'Omo heyɗi');
verifier('fr → pul : la correction devient le pulaar',
  paires[1].fr === 'Bonjour' && paires[1].pul === 'No mbaalɗaa');
verifier('pul → fr : la correction devient le français',
  paires[2].fr === 'Je suis fatigué' && paires[2].pul === 'Miɗo tampi',
  JSON.stringify(paires[2]));
verifier('schéma {fr, pul, source} exactement',
  paires.every((p) => Object.keys(p).sort().join() === 'fr,pul,source'
    && p.source === 'retour_public'));

console.log('\n── Ce qui est réellement écrit en base ─────────────────────────');
inseres = [];
await cas('champ inconnu envoyé par le client', retour,
  { method: 'POST', body: { ...BON, dialecte: 'Maasina', statut: 'valide' } }, 201);
verifier('les champs non prévus sont ignorés, pas recopiés',
  !('dialecte' in inseres[0]) && !('statut' in inseres[0]),
  Object.keys(inseres[0]).join(','));

const premier = inseres[0];
console.log('  colonnes  :', Object.keys(premier).join(', '));
console.log('  modele    :', premier.modele);
console.log('  ip_hachee :', `${premier.ip_hachee.slice(0, 12)}… (${premier.ip_hachee.length} car.)`);
verifier('aucune IP en clair', !JSON.stringify(inseres).includes('203.0.113.7'));

// Fermé par défaut : sans mot de passe configuré, personne n'entre. L'inverse
// — une page qui s'ouvre quand la variable manque — est le défaut classique.
delete process.env.ADMIN_MOT_DE_PASSE;
const res = fausseReponse();
await admin({ method: 'GET', headers: AUTH, query: {} }, res);
verifier('admin fermé quand le mot de passe n’est pas configuré', res.code === 401,
  `reçu ${res.code}`);

console.log(echecs ? `\n${echecs} ECHEC(S)\n` : '\nTous les cas passent.\n');
process.exit(echecs ? 1 : 0);
