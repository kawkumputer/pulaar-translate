// Écrit le texte français directement dans index.html.
//
//     node tools/prerendre.mjs              applique
//     node tools/prerendre.mjs --verifier   échoue si le HTML a dérivé
//
// Pourquoi : les libellés vivent dans i18n.js et sont injectés au chargement.
// Un robot qui n'exécute pas JavaScript ne voyait donc qu'un `<h1>` vide et
// 125 caractères de contenu — l'essentiel de la page étant invisible pour lui.
// Google sait rendre le JavaScript, mais c'est une seconde passe moins
// prioritaire, et Bing, les robots sociaux et les crawlers d'IA ne le font
// souvent pas.
//
// Le français est écrit en dur, ce qui ne coûte rien : c'est déjà la seule
// langue affichée tant que PULAAR_PRET vaut false, et `appliquerLangue()`
// réécrit de toute façon le même texte au chargement. Le jour où le pulaar
// sera prêt, le français restera le rendu par défaut avant exécution du
// script, ce qui est le bon choix pour l'indexation.
//
// La contrepartie est un risque de dérive entre i18n.js et le HTML : d'où le
// mode --verifier, branché sur `npm test`.

import fs from 'node:fs';
import { TEXTES } from '../public/i18n.js';

const FICHIER = 'public/index.html';
const fr = TEXTES.fr;

const echapper = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const echapperAttr = (s) => echapper(s).replace(/"/g, '&quot;');

function transformer(html) {
  const inconnues = [];

  // Les éléments porteurs de data-i18n ne contiennent que du texte : aucun
  // n'imbrique de balise, ce qui rend ce remplacement sûr.
  let sortie = html.replace(
    /<(\w+)([^>]*\bdata-i18n="([^"]+)"[^>]*)>([^<]*)<\/\1>/g,
    (bloc, tag, attrs, cle) => {
      if (!(cle in fr)) { inconnues.push(cle); return bloc; }
      return `<${tag}${attrs}>${echapper(fr[cle])}</${tag}>`;
    },
  );

  // Trois éléments reçoivent leur texte autrement qu'en contenu : deux
  // placeholders et la zone de sortie, tous posés par le script.
  sortie = sortie
    .replace(/(<textarea id="source"[^>]*?)(?:\s+placeholder="[^"]*")?(><\/textarea>)/,
      `$1 placeholder="${echapperAttr(fr['placeholder'])}"$2`)
    .replace(/(<textarea id="retour-correction"[^>]*?)(?:\s+placeholder="[^"]*")?(><\/textarea>)/,
      `$1 placeholder="${echapperAttr(fr['retour.exemple'])}"$2`)
    .replace(/(<p id="sortie" class="vide">)[^<]*(<\/p>)/,
      `$1${echapper(fr['sortie.vide'])}$2`);

  return { sortie, inconnues };
}

const html = fs.readFileSync(FICHIER, 'utf8');
const { sortie, inconnues } = transformer(html);

if (inconnues.length) {
  console.log(`\n  ECHEC cles data-i18n absentes de i18n.js : ${inconnues.join(', ')}\n`);
  process.exit(1);
}

const verifier = process.argv.includes('--verifier');

if (verifier) {
  if (sortie === html) {
    const texte = sortie
      .replace(/<script[\s\S]*?<\/script>/g, '')
      .replace(/<style[\s\S]*?<\/style>/g, '')
      .replace(/<[^>]+>/g, ' ')
      .split(/\s+/).filter(Boolean).join(' ');
    console.log(`\n  OK   index.html est a jour — ${texte.length} caracteres`
      + ' lisibles sans JavaScript\n');
    process.exit(0);
  }
  console.log('\n  ECHEC index.html a derive de i18n.js.'
    + '\n        Relancer : node tools/prerendre.mjs\n');
  process.exit(1);
}

if (sortie === html) {
  console.log('\n  index.html etait deja a jour.\n');
} else {
  fs.writeFileSync(FICHIER, sortie);
  const avant = (html.match(/data-i18n="[^"]+"><\//g) || []).length;
  console.log(`\n  index.html mis a jour — ${avant} element(s) etaient vides.\n`);
}
