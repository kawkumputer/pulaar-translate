// Vérifie que tous les fichiers s'accordent sur un seul domaine canonique.
//
//     node tools/verif-domaine.mjs
//
// Le domaine est écrit en dur à six endroits : les moteurs de recherche lisent
// les balises avant que le moindre JavaScript ne s'exécute, donc aucune
// constante partagée ne peut les alimenter. Le risque est qu'un déménagement
// n'en déplace que cinq : la canonique désignerait alors un domaine, le sitemap
// un autre, et le référencement se diviserait entre les deux — exactement ce
// qu'une balise canonique existe pour empêcher.
//
// Ce contrôle est la contrepartie de cette duplication inévitable.

import fs from 'node:fs';

const CANONIQUE = 'https://www.pulaar-translate.com';

// Domaines qui ont servi et ne doivent plus apparaître nulle part.
const ABANDONNES = ['pulaar-translate.vercel.app'];

const ATTENDU = [
  ['public/index.html', `<link rel="canonical" href="${CANONIQUE}/">`],
  ['public/index.html', `<meta property="og:url" content="${CANONIQUE}/">`],
  ['public/index.html', `<meta property="og:image" content="${CANONIQUE}/og-image.png">`],
  ['public/index.html', `<meta name="twitter:image" content="${CANONIQUE}/og-image.png">`],
  ['public/robots.txt', `Sitemap: ${CANONIQUE}/sitemap.xml`],
  ['public/sitemap.xml', `<loc>${CANONIQUE}/</loc>`],
];

let echecs = 0;
const cache = new Map();
const lire = (f) => {
  if (!cache.has(f)) cache.set(f, fs.readFileSync(f, 'utf8'));
  return cache.get(f);
};

console.log(`\n=== Domaine canonique : ${CANONIQUE} ===\n`);

for (const [fichier, extrait] of ATTENDU) {
  const ok = lire(fichier).includes(extrait);
  if (!ok) echecs++;
  console.log(`  ${ok ? 'OK  ' : 'ECHEC'} ${fichier.padEnd(20)} ${extrait}`);
}

console.log('');
for (const fichier of [...new Set(ATTENDU.map(([f]) => f)), 'tools/og-image.py']) {
  for (const vieux of ABANDONNES) {
    if (lire(fichier).includes(vieux)) {
      console.log(`  ECHEC ${fichier} contient encore ${vieux}`);
      echecs++;
    }
  }
}
if (!echecs) console.log('  Aucun domaine abandonné ne subsiste.');

// L'URL est aussi dessinée dans l'image de partage : un remplacement de texte
// ne suffit pas, il faut avoir relancé `python tools/og-image.py`.
const og = 'public/og-image.png';
if (fs.existsSync(og)) {
  const imageVieille = fs.statSync(og).mtimeMs < fs.statSync('tools/og-image.py').mtimeMs;
  console.log(`\n  ${imageVieille ? 'ECHEC' : 'OK  '} og-image.png ${imageVieille
    ? 'est plus ancienne que son generateur — relancer python tools/og-image.py'
    : 'est posterieure a son generateur'}`);
  if (imageVieille) echecs++;
}

console.log(echecs ? `\n${echecs} ECHEC(S)\n` : '\nLe domaine est coherent partout.\n');
process.exit(echecs ? 1 : 0);
