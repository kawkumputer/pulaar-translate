// Teste la route /api/chat sans Supabase, sans Vercel et sans endpoint.
//
//     node tools/test-chat.mjs
//
// `fetch` est remplacé par un espion qui joue Supabase (RPC, REST) et
// l'Inference Endpoint. On vérifie surtout ce qui doit être REFUSÉ : une app
// sans la bonne clé, un appareil sans identifiant, une note sur l'échange d'un
// autre appareil, et que le quota du chat ne touche jamais aux clés du
// traducteur.

import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const CONV = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ENDPOINT = 'https://faux-endpoint.endpoints.huggingface.cloud';
const CLE = 'cle-assistant-de-test';
const TEL = 'appareil-de-hamath-0123456789';
const AUTRE = 'autre-appareil-9876543210abc';

process.env.SUPABASE_URL = 'https://faux.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'cle-de-test';
process.env.HACHAGE_SEL = 'sel-de-test';
process.env.HF_ENDPOINT_CHAT = ENDPOINT;
process.env.HF_TOKEN_CHAT = 'jeton-endpoint';
process.env.CHAT_CLE = CLE;

const empreinte = (v) => crypto.createHash('sha256').update(`sel-de-test${v}`).digest('hex').slice(0, 32);
const H_TEL = empreinte(TEL);

let quotaRetour = 299;   // ce que renvoie consommer_quota
let endpoint = 'ok';     // ok | veille | coupe | panne | refus | sans_lora | sources
let colonnesSources = true;  // false : la migration 2026-11-14 n'est pas encore passée
let appels;              // tout ce qui a été demandé, par catégorie
let inseres;             // lignes de conversations_llm

function remettre() {
  appels = { consommer: [], rendre: [], endpoint: [], patch: [] };
  inseres = [];
  quotaRetour = 299;
  endpoint = 'ok';
  colonnesSources = true;
}

const rep = (corps, status = 200) => ({
  ok: status < 400,
  status,
  text: async () => (corps === null ? '' : JSON.stringify(corps)),
  json: async () => corps,
});

globalThis.fetch = async (url, options = {}) => {
  const u = String(url);
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
    if (endpoint === 'sans_lora') return rep([{ reponse: 'Jam tan.', tokens: 5, arrete: true }]);
    if (endpoint === 'sources') {
      return rep([{
        reponse: 'Hitaande Murtuɗo jibinaa ko 1942.', tokens: 12, arrete: true, sources: 2,
        lora: 'kawkumputer/pulaar-llm-instruct-v12',
        sources_trouvees: [
          { source: 'biographie Murtudo', texte: 'Murtuɗo jibinaa ko e hitaande 1942.' },
          { source: 'ARPRIM (pulaar.org)', texte: 'Ceerno Murtuɗo jibinaa ko hitaande 1942.', score: 2 },
          { pas: 'une source' },
        ],
      }]);
    }
    return rep([{ reponse: 'Jam tan.', tokens: 5, arrete: true, lora: 'kawkumputer/pulaar-llm-instruct-v12' }]);
  }
  if (u.includes('/rest/v1/conversations_llm') && options.method === 'POST') {
    const ligne = JSON.parse(options.body);
    if (!colonnesSources && ('chercher' in ligne || 'sources' in ligne)) {
      return rep({ code: 'PGRST204', message: "Could not find the 'chercher' column of 'conversations_llm'" }, 400);
    }
    inseres.push(ligne);
    return rep(null, 201);
  }
  if (u.includes('/rest/v1/conversations_llm') && options.method === 'PATCH') {
    appels.patch.push({ url: u, corps: JSON.parse(options.body) });
    // La ligne n'existe que pour l'appareil qui l'a écrite.
    const ligne = inseres.find((l) => u.includes(`id=eq.${l.id}`) && u.includes(`appareil=eq.${l.appareil}`));
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

async function appeler(corps, { cle = CLE, appareil = TEL, methode = 'POST' } = {}) {
  const res = fausseReponse();
  const headers = {};
  if (cle !== null) headers['x-cle-assistant'] = cle;
  if (appareil !== null) headers['x-appareil'] = appareil;
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
let r = await appeler(MSG, { methode: 'GET' });
verifier('GET refusé (405)', r.code === 405, json(r));
r = await appeler(MSG, { cle: null });
verifier('sans clé : 403 interdit', r.code === 403 && r.corps.code === 'interdit', json(r));
r = await appeler(MSG, { cle: 'mauvaise' });
verifier('mauvaise clé : 403 interdit', r.code === 403 && r.corps.code === 'interdit', json(r));
const sauveCle = process.env.CHAT_CLE;
delete process.env.CHAT_CLE;
r = await appeler(MSG, { cle: '' });
verifier('CHAT_CLE absente dans Vercel : tout est refusé, même une clé vide', r.code === 403, json(r));
process.env.CHAT_CLE = sauveCle;
r = await appeler(MSG, { appareil: null });
verifier('sans appareil : 400', r.code === 400, json(r));
r = await appeler(MSG, { appareil: 'court' });
verifier('appareil invalide : 400', r.code === 400, json(r));
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
  r = await appeler(corps);
  verifier(`${nom} : 400`, r.code === 400 && appels.consommer.length === 0, json(r));
}

console.log('Échange réussi');
remettre();
const histo = Array.from({ length: 9 }, (_, i) => [`q${i}`, `r${i}`]);
r = await appeler({ ...MSG, historique: histo, chaud: 1, mode: 'conv', tour: 9 });
verifier('200 avec réponse, id et restant',
  r.code === 200 && r.corps.reponse === 'Jam tan.' && /^[0-9a-f-]{36}$/.test(r.corps.id) && r.corps.restant === 299,
  json(r));
const q = appels.consommer[0];
verifier('quota : appareil (300) et total (500), sur des clés chat:',
  json(q) === json({ p_cles: [`chat:d:${H_TEL}`, 'chat:tout'], p_limites: [300, 500] }), json(q));
verifier('jamais une clé du traducteur (u:, d:, ip:)',
  !q.p_cles.some((c) => /^(u|d|ip):/.test(c)), json(q));
verifier('l identifiant brut de l appareil n est envoyé nulle part',
  !json(appels).includes(TEL) && !json(inseres).includes(TEL), 'fuite de l identifiant brut');
const e = appels.endpoint[0];
verifier('endpoint appelé avec HF_TOKEN_CHAT', e.entetes.Authorization === 'Bearer jeton-endpoint', json(e.entetes));
verifier('historique tronqué aux 6 derniers échanges',
  json(e.corps.inputs.historique) === json(histo.slice(-6)), json(e.corps.inputs.historique));
verifier('entrée normalisée (chaud booléen, message nettoyé)',
  e.corps.inputs.chaud === true && e.corps.inputs.message === 'Jam waali' && e.corps.inputs.mode === 'conv', json(e.corps));
const l = inseres[0];
verifier('échange enregistré avec l id renvoyé et l empreinte de l appareil',
  l && l.id === r.corps.id && l.appareil === H_TEL && l.conversation === CONV && l.tour === 9
  && l.modele === 'v12' && l.reponse === 'Jam tan.' && l.historique.length === 6, json(l));
verifier('aucune unité rendue', appels.rendre.length === 0, json(appels.rendre));
remettre();
endpoint = 'sans_lora';
r = await appeler(MSG);
verifier('réponse sans lora : modèle « inconnu », jamais une version supposée',
  r.code === 200 && inseres[0]?.modele === 'inconnu', json(inseres[0]));

verifier('sans recherche : chercher n est pas envoyé à l endpoint, sources vides, ligne marquée sans recherche',
  !('chercher' in appels.endpoint[0].corps.inputs) && json(r.corps.sources) === '[]'
  && inseres[0].chercher === false && inseres[0].sources === null, json({ e: appels.endpoint[0], l: inseres[0] }));

console.log('Recherche dans les livres');
remettre();
endpoint = 'sources';
r = await appeler({ ...MSG, message: 'Hol hitaande Murtuɗo jibinaa?', chercher: true });
verifier('chercher transmis à l endpoint', appels.endpoint[0].corps.inputs.chercher === true, json(appels.endpoint[0]));
verifier('sources renvoyées à l app, propres (source et texte seulement, objets mal formés écartés)',
  r.code === 200 && json(r.corps.sources) === json([
    { source: 'biographie Murtudo', texte: 'Murtuɗo jibinaa ko e hitaande 1942.' },
    { source: 'ARPRIM (pulaar.org)', texte: 'Ceerno Murtuɗo jibinaa ko hitaande 1942.' }]), json(r.corps));
verifier('ligne enregistrée avec chercher et les sources',
  inseres[0].chercher === true && inseres[0].sources.length === 2, json(inseres[0]));
remettre();
endpoint = 'sources';
colonnesSources = false;
r = await appeler({ ...MSG, chercher: true });
verifier('colonnes absentes (migration pas encore passée) : échange enregistré quand même, sans elles',
  r.code === 200 && /^[0-9a-f-]{36}$/.test(r.corps.id) && inseres.length === 1 && !('sources' in inseres[0])
  && r.corps.sources.length === 2, json({ r: r.corps, l: inseres }));
for (const [nom, corps] of [
  ['chercher non booléen', { ...MSG, chercher: 'oui' }],
  ['chercher en mode traduction', { ...MSG, mode: 'fr', chercher: true }],
]) {
  remettre();
  r = await appeler(corps);
  verifier(`${nom} : 400, aucune unité`, r.code === 400 && appels.consommer.length === 0, json(r));
}

console.log('Endpoint indisponible : unités rendues');
for (const [cas, attendu, code] of [['veille', 503, 'reveil'], ['coupe', 503, 'reveil'], ['panne', 500, undefined], ['refus', 500, undefined]]) {
  remettre();
  endpoint = cas;
  r = await appeler(MSG);
  verifier(`${cas} : ${attendu}${code ? ` ${code}` : ''}, unités rendues, rien d enregistré`,
    r.code === attendu && r.corps.code === code && appels.rendre.length === 1
    && json(appels.rendre[0]) === json({ p_cles: [`chat:d:${H_TEL}`, 'chat:tout'] }) && inseres.length === 0, json(r));
}

console.log('Quota du chat');
remettre();
quotaRetour = -1;
r = await appeler(MSG);
verifier('appareil au plafond : 429 quota, endpoint non appelé',
  r.code === 429 && r.corps.code === 'quota' && /300/.test(r.corps.erreur) && appels.endpoint.length === 0, json(r));
remettre();
quotaRetour = -2;
r = await appeler(MSG);
verifier('plafond total : 429 quota, message « tous appareils »',
  r.code === 429 && /tous appareils/.test(r.corps.erreur) && appels.endpoint.length === 0, json(r));
remettre();
const sauve = process.env.HF_ENDPOINT_CHAT;
delete process.env.HF_ENDPOINT_CHAT;
r = await appeler(MSG);
verifier('endpoint non configuré : 503, aucune unité', r.code === 503 && r.corps.code === 'non_configure'
  && appels.consommer.length === 0, json(r));
process.env.HF_ENDPOINT_CHAT = sauve;

console.log('Notation');
remettre();
r = await appeler(MSG);
const id = r.corps.id;
r = await appeler({ action: 'noter', id, note: 'invente', correction: '  Mi anndaa.  ' });
verifier('note acceptée', r.code === 200 && r.corps.ok === true, json(r));
const p = appels.patch[0];
verifier('filtrée sur l id ET l empreinte de l appareil',
  p.url.includes(`id=eq.${id}`) && p.url.includes(`appareil=eq.${H_TEL}`), p.url);
verifier('correction nettoyée, date de note posée',
  p.corps.note === 'invente' && p.corps.correction === 'Mi anndaa.' && p.corps.commentaire === null
  && !Number.isNaN(Date.parse(p.corps.note_le)), json(p.corps));
r = await appeler({ action: 'noter', id, note: 'juste' }, { appareil: AUTRE });
verifier('un autre appareil ne peut pas noter cet échange : 404', r.code === 404, json(r));
r = await appeler({ action: 'noter', id, note: 'juste' }, { cle: 'mauvaise' });
verifier('noter sans la bonne clé : 403', r.code === 403, json(r));
for (const [nom, corps] of [
  ['note inconnue', { action: 'noter', id, note: 'bof' }],
  ['id invalide', { action: 'noter', id: 'abc', note: 'juste' }],
  ['correction trop longue', { action: 'noter', id, correction: 'a'.repeat(1001) }],
]) {
  r = await appeler(corps);
  verifier(`${nom} : 400`, r.code === 400, json(r));
}
verifier('noter ne consomme pas de quota', appels.consommer.length === 1, json(appels.consommer));

console.log(echecs ? `\n${echecs} échec(s)` : '\nTout passe.');
process.exit(echecs ? 1 : 0);
