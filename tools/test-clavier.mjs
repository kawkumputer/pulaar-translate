// Teste l'insertion des lettres pulaar dans un champ de saisie.
//
//     node tools/test-clavier.mjs
//
// La fonction `inserer` est extraite du script de la page et exécutée contre un
// faux champ. Ce qu'on vérifie n'est pas qu'elle « marche » mais l'arithmétique
// du curseur : insérer au milieu, remplacer une sélection, respecter
// maxlength. Une erreur d'indice y est invisible à la relecture et se
// manifeste par un texte mélangé chez le contributeur.

import fs from 'node:fs';

const html = fs.readFileSync('public/index.html', 'utf8');

const source = html.match(/function inserer\(champ, lettre\) \{[\s\S]*?\n\}/);
if (!source) {
  console.log('\n  ECHEC fonction inserer introuvable dans index.html\n');
  process.exit(1);
}
const inserer = new Function(`${source[0]}; return inserer;`)();

const LETTRES = JSON.parse(
  html.match(/const LETTRES = (\[[^\]]*\])/)[1].replace(/'/g, '"'),
);

function faussChamp(valeur, debut, fin = debut, max = 0) {
  return {
    value: valeur,
    maxLength: max,
    selectionStart: debut,
    selectionEnd: fin,
    evenements: 0,
    setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; },
    focus() {},
    dispatchEvent() { this.evenements++; return true; },
  };
}

let echecs = 0;
function verifier(nom, ok, detail = '') {
  if (!ok) echecs++;
  console.log(`  ${ok ? 'OK  ' : 'ECHEC'} ${nom}${ok ? '' : ` — ${detail}`}`);
}

console.log('\n── Les lettres proposées ───────────────────────────────────────');
verifier('cinq lettres et leurs capitales', LETTRES.length === 10, `${LETTRES.length}`);
verifier('minuscules avant capitales',
  LETTRES.slice(0, 5).every((l) => l === l.toLowerCase())
  && LETTRES.slice(5).every((l) => l === l.toUpperCase()),
  LETTRES.join(' '));
verifier('chaque capitale correspond à sa minuscule',
  LETTRES.slice(5).map((l) => l.toLowerCase()).join('') === LETTRES.slice(0, 5).join(''),
  LETTRES.join(' '));
// Relevé sur les 8 080 paires : ɗ 5823, ɓ 3788, ñ 978, ƴ 786, ŋ 380.
verifier('ordre de fréquence du corpus',
  LETTRES.slice(0, 5).join('') === 'ɗɓñƴŋ', LETTRES.slice(0, 5).join(''));

console.log('\n── L’arithmétique du curseur ───────────────────────────────────');
let c = faussChamp('Mio jogii', 2);
inserer(c, 'ɗ');
verifier('insertion au milieu', c.value === 'Miɗo jogii', c.value);
verifier('curseur juste après la lettre', c.selectionStart === 3, `${c.selectionStart}`);
verifier('un évènement input est émis', c.evenements === 1, `${c.evenements}`);

c = faussChamp('', 0);
inserer(c, 'Ɓ');
verifier('insertion dans un champ vide', c.value === 'Ɓ', c.value);

c = faussChamp('abc', 3);
inserer(c, 'ŋ');
verifier('insertion en fin de texte', c.value === 'abcŋ', c.value);

// Une selection remplacee : c'est le cas ou l'on corrige un « d » deja tape.
c = faussChamp('Mido jogii', 2, 3);
inserer(c, 'ɗ');
verifier('la sélection est remplacée', c.value === 'Miɗo jogii', c.value);
verifier('curseur après le remplacement', c.selectionStart === 3, `${c.selectionStart}`);

console.log('\n── La limite de longueur ───────────────────────────────────────');
// L'affectation de `value` contourne maxlength : sans garde, les touches
// permettraient de depasser la limite que le clavier respecte.
c = faussChamp('abcde', 5, 5, 5);
inserer(c, 'ɗ');
verifier('rien n’est inséré à la limite', c.value === 'abcde', c.value);
verifier('aucun évènement à la limite', c.evenements === 0, `${c.evenements}`);

c = faussChamp('abcd', 4, 4, 5);
inserer(c, 'ɗ');
verifier('insertion acceptée sous la limite', c.value === 'abcdɗ', c.value);

c = faussChamp('abcde', 5, 5, 0);
inserer(c, 'ɗ');
verifier('sans maxlength, pas de blocage', c.value === 'abcdeɗ', c.value);

console.log(echecs ? `\n${echecs} ECHEC(S)\n` : '\nTous les cas passent.\n');
process.exit(echecs ? 1 : 0);
