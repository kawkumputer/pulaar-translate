// Liste les libellés d'interface qui n'ont pas encore de traduction pulaar.
//
//     node tools/i18n-manquants.mjs
//
// Les chaînes manquantes ne cassent rien : l'interface retombe sur le français.
// Ce script sert juste à voir ce qu'il reste à faire, et à copier-coller les
// clés à remplir dans public/i18n.js.

import { TEXTES, LANGUES } from '../public/i18n.js';

const total = Object.keys(TEXTES.fr).length;

for (const code of Object.keys(LANGUES)) {
  if (code === 'fr') continue;
  const cles = Object.keys(TEXTES.fr);
  const manquantes = cles.filter((c) => !(TEXTES[code] || {})[c]);
  const faites = total - manquantes.length;

  console.log(`\n=== ${LANGUES[code].etiquette} : ${faites}/${total} traduites ===\n`);
  if (!manquantes.length) {
    console.log('  rien a faire.');
    continue;
  }
  for (const c of manquantes) {
    console.log(`  '${c}':${' '.repeat(Math.max(1, 20 - c.length))}'',`);
    console.log(`       FR : ${TEXTES.fr[c]}`);
  }
  console.log('\n  A remplir dans public/i18n.js, objet `pul`.');
}
