// Teste la route /api/chat sans Supabase, sans Vercel et sans endpoint.
//
//     node tools/test-chat.mjs
//
// `fetch` est remplacé par un espion qui joue Supabase (auth, RPC, REST) et
// l'Inference Endpoint. On vérifie surtout ce qui doit être REFUSÉ : un compte
// hors liste, une note sur l'échange d'un autre, et que le quota du chat ne
// touche jamais aux clés du traducteur.

import { pathToFileURL } from 'node:url';
import path from 'node:path';

const HAMATH = '11111111-1111-4111-8111-111111111111';
const AUTRE = '22222222-2222-4222-8222-222222222222';
const INCONNU = '33333333-3333-4333-8333-333333333333';
const CONV = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ENDPOINT = 'https://faux-endpoint.endpoints.huggingface.cloud';

process.env.SUPABASE_URL = 'https://faux.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'cle-de-test';
process.env.HACHAGE_SEL = 'sel-de-test';
process.env.HF_ENDPOINT_CHAT = ENDPOINT;
process.env.HF_TOKEN_CHAT = 'jeton-endpoint';
process.env.CHAT_UTILISATEURS = ` ${HAMATH.toUpperCase()}, ${AUTRE} `;

const JETONS = { 'jeton-hamath': HAMATH, 'jeton-autre': AUTRE, 'jeton-inconnu': INCONNU };

let quotaRetour = 299;   // ce que renvoie consommer_quota
let endpoint = 'ok';     // ok | veille | coupe | panne | refus
let appels;              // tout ce qui a été demandé, par catégorie
let inseres;             // lignes de conversations_llm

function remettre() {
  appels = { consommer: [], rendre: [], endpoint: [], patch: [] };
  inseres = [];
  quotaRetour = 299;
  endpoint = 'ok';
}

const rep = (corps, status = 200) => ({
  ok: status < 400,
  status,
  text: async () => (corps === null ? '' : JSON.stringify(corps)),
  json: async () => corps,
});

globalThis.fetch = async (url, options = {}) => {
  const u = String(url);
  if (u.endsWith('/auth/v1/user')) {
    const jeton = String(options.headers?.Authorization || '').replace('Bearer ', '');
    return JETONS[jeton] ? rep({ id: JETONS[jeton] }) : rep({ msg: 'invalide' }, 401);
  }
  if (u.endsWith('/rpc/consommer_quota')) {
    appels.consommer.push(JSON.parse(options.body));
    return rep(quotaRetour);
  }
  if (u.endsWith('/rpc/rendre_quota')) {
    appels.rendre.push(JSON.parse(options.body));
    return rep(null);
  }
  if (u === ENDPOINT) {
    appels.endpoint.push({ entetes: options.headers, corps: JSON.parse(options.body) });
    if (endpoint === 'veille') return rep({ error: 'scaled to zero' }, 503);
    if (endpoint === 'panne') return rep({ error: 'boum' }, 500);
    if (endpoint === 'refus') return rep({ erreur: 'message vide' });
    if (endpoint === 'coupe') {
      const e = new Error('aborted');
      e.name = 'AbortError';
      throw e;
    }
    return rep([{ reponse: 'Jam tan.', tokens: 5, arrete: true, lora: 'x' }]);
  }
  if (u.includes('/rest/v1/conversations_llm') && options.method === 'POST') {
    inseres.push(JSON.parse(options.body));
    return rep(null, 201);
  }
  if (u.includes('/rest/v1/conversations_llm') && options.method === 'PATCH') {
    appels.patch.push({ url: u, corps: JSON.parse(options.body) });
    // La ligne n'existe que pour son auteur.
    const ligne = inseres.find((l) => u.includes(`id=eq.${l.id}`) && u.includes(`utilisateur=eq.${l.utilisateur}`));
    return rep(ligne ? [ligne] : []);
  }
  throw new Error(`appel inattendu : ${options.method || 'GET'} ${u}`);
};

const { default: chat } = await import(pathToFileURL(path.resolve('api', 'chat.js')).href);

function fausseReponse() {
  const r = { code: null, corps: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (o) => { r.corps = o; return r; };
  return r;
}

async function appeler(jeton, corps, methode = 'POST') {
  const res = fausseReponse();
  const headers = jeton ? { authorization: `Bearer ${jeton}` } : {};
  await chat({ method: methode, headers, body: corps }, res);
  return res;
}

let echecs = 0;
function verifier(nom, ok, detail = '') {
  if (!ok) echecs++;
  console.log(`  ${ok ? 'OK  ' : 'ECHEC'} ${nom}${ok ? '' : ` — ${detail}`}`);
}

const MSG = { message: 'Jam waali', conversation: CONV, tour: 0 };
const json = (x) => JSON.stringify(x);

console.log('Accès');
remettre();
let r = await appeler('jeton-hamath', MSG, 'GET');
verifier('GET refusé (405)', r.code === 405, json(r));
r = await appeler(null, MSG);
verifier('sans jeton : 401 session', r.code === 401 && r.corps.code === 'session', json(r));
r = await appeler('jeton-faux', MSG);
verifier('jeton refusé par Supabase : 401', r.code === 401 && r.corps.code === 'session', json(r));
r = await appeler('jeton-inconnu', MSG);
verifier('compte hors liste : 403', r.code === 403 && r.corps.code === 'interdit', json(r));
verifier('… sans consommer de quota ni appeler l endpoint',
  appels.consommer.length === 0 && appels.endpoint.length === 0, json(appels));

console.log('Validation (aucune unité consommée)');
for (const [nom, corps] of [
  ['mode inconnu', { ...MSG, mode: 'xx' }],
  ['message vide', { ...MSG, message: '   ' }],
  ['message trop long', { ...MSG, message: 'a'.repeat(1001) }],
  ['historique mal formé', { ...MSG, historique: [['seul']] }],
  ['conversation absente', { message: 'Jam' }],
]) {
  remettre();
  r = await appeler('jeton-hamath', corps);
  verifier(`${nom} : 400`, r.code === 400 && appels.consommer.length === 0, json(r));
}

console.log('Échange réussi');
remettre();
const histo = Array.from({ length: 9 }, (_, i) => [`q${i}`, `r${i}`]);
r = await appeler('jeton-hamath', { ...MSG, historique: histo, chaud: 1, mode: 'conv', tour: 9 });
verifier('200 avec réponse, id et restant',
  r.code === 200 && r.corps.reponse === 'Jam tan.' && /^[0-9a-f-]{36}$/.test(r.corps.id) && r.corps.restant === 299,
  json(r));
const q = appels.consommer[0];
verifier('quota à part : une seule clé chat:u:<uuid>, limite 300',
  json(q) === json({ p_cles: [`chat:u:${HAMATH}`], p_limites: [300] }), json(q));
verifier('jamais une clé du traducteur (u:, d:, ip:)',
  !q.p_cles.some((c) => /^(u|d|ip):/.test(c)), json(q));
const e = appels.endpoint[0];
verifier('endpoint appelé avec HF_TOKEN_CHAT', e.entetes.Authorization === 'Bearer jeton-endpoint', json(e.entetes));
verifier('historique tronqué aux 6 derniers échanges',
  json(e.corps.inputs.historique) === json(histo.slice(-6)), json(e.corps.inputs.historique));
verifier('entrée normalisée (chaud booléen, message nettoyé)',
  e.corps.inputs.chaud === true && e.corps.inputs.message === 'Jam waali' && e.corps.inputs.mode === 'conv', json(e.corps));
const l = inseres[0];
verifier('échange enregistré avec l id renvoyé',
  l && l.id === r.corps.id && l.utilisateur === HAMATH && l.conversation === CONV && l.tour === 9
  && l.modele === 'v10' && l.reponse === 'Jam tan.' && l.historique.length === 6, json(l));
verifier('aucune unité rendue', appels.rendre.length === 0, json(appels.rendre));
const idHamath = r.corps.id;

console.log('Endpoint indisponible : unité rendue');
for (const [cas, attendu, code] of [['veille', 503, 'reveil'], ['coupe', 503, 'reveil'], ['panne', 500, undefined], ['refus', 500, undefined]]) {
  remettre();
  endpoint = cas;
  r = await appeler('jeton-hamath', MSG);
  verifier(`${cas} : ${attendu}${code ? ` ${code}` : ''}, unité rendue, rien d enregistré`,
    r.code === attendu && r.corps.code === code && appels.rendre.length === 1
    && json(appels.rendre[0]) === json({ p_cles: [`chat:u:${HAMATH}`] }) && inseres.length === 0, json(r));
}

console.log('Quota du chat');
remettre();
quotaRetour = -1;
r = await appeler('jeton-hamath', MSG);
verifier('au plafond : 429 quota, endpoint non appelé',
  r.code === 429 && r.corps.code === 'quota' && appels.endpoint.length === 0, json(r));
remettre();
const sauve = process.env.HF_ENDPOINT_CHAT;
delete process.env.HF_ENDPOINT_CHAT;
r = await appeler('jeton-hamath', MSG);
verifier('endpoint non configuré : 503, aucune unité', r.code === 503 && r.corps.code === 'non_configure'
  && appels.consommer.length === 0, json(r));
process.env.HF_ENDPOINT_CHAT = sauve;

console.log('Notation');
remettre();
r = await appeler('jeton-hamath', MSG);
const id = r.corps.id;
r = await appeler('jeton-hamath', { action: 'noter', id, note: 'invente', correction: '  Mi anndaa.  ' });
verifier('note acceptée', r.code === 200 && r.corps.ok === true, json(r));
const p = appels.patch[0];
verifier('filtrée sur l id ET l utilisateur',
  p.url.includes(`id=eq.${id}`) && p.url.includes(`utilisateur=eq.${HAMATH}`), p.url);
verifier('correction nettoyée, date de note posée',
  p.corps.note === 'invente' && p.corps.correction === 'Mi anndaa.' && p.corps.commentaire === null
  && !Number.isNaN(Date.parse(p.corps.note_le)), json(p.corps));
r = await appeler('jeton-autre', { action: 'noter', id, note: 'juste' });
verifier('un autre compte ne peut pas noter cet échange : 404', r.code === 404, json(r));
for (const [nom, corps] of [
  ['note inconnue', { action: 'noter', id, note: 'bof' }],
  ['id invalide', { action: 'noter', id: 'abc', note: 'juste' }],
  ['correction trop longue', { action: 'noter', id, correction: 'a'.repeat(1001) }],
]) {
  r = await appeler('jeton-hamath', corps);
  verifier(`${nom} : 400`, r.code === 400, json(r));
}
verifier('noter ne consomme pas de quota', appels.consommer.length === 1, json(appels.consommer));
verifier('l échange du premier test reste à Hamath', idHamath !== id);

console.log(echecs ? `\n${echecs} échec(s)` : '\nTout passe.');
process.exit(echecs ? 1 : 0);
