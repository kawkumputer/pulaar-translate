// Libellés de l'interface, en français et en pulaar.
//
// RÈGLE : aucune chaîne pulaar n'est inventée. Une chaîne vide déclenche le
// repli sur le français, si bien que l'interface reste utilisable pendant que
// les traductions arrivent. Remplir une ligne suffit à la faire apparaître.
//
// Les chaînes déjà remplies portent leur source en commentaire :
//   · quotidien  = corpus validé par Abou Sy
//   · ARPRIM     = terminologie de l'Association pour la Renaissance du Pulaar
//
// Pour ajouter une traduction : remplir la valeur dans `pul`, rien d'autre.

export const LANGUES = {
  fr:  { etiquette: 'Français', drapeau: 'FR' },
  pul: { etiquette: 'Pulaar',   drapeau: 'PUL' },
};

export const TEXTES = {
  fr: {
    'doc.titre':        'Pulaar-Translate — Traducteur Français ↔ Pulaar (Fuuta Tooro)',
    'titre':            'Pulaar-Translate — Traducteur Français ↔ Pulaar',
    'accroche':         'Dialecte Fuuta Tooro · modèle NLLB affiné sur un corpus validé par des locuteurs natifs',
    'avis':             'Le modèle tourne sur un GPU partagé : comptez quelques secondes par traduction. La toute première peut demander jusqu’à une minute, le temps que le service sorte de veille et charge le modèle.',
    'label.source':     'Texte source',
    'label.traduction': 'Traduction',
    'label.direction':  'Direction',
    'label.langue':     'Langue de l’interface',
    'placeholder':      'Saisissez le texte à traduire…',
    'sortie.vide':      'La traduction s’affichera ici.',
    'dir.fr_pul':       'Français → Pulaar',
    'dir.pul_fr':       'Pulaar → Français',
    'btn.traduire':     'Traduire',
    'btn.effacer':      'Effacer',
    'etat.encours':     'Traduction en cours…',
    'etat.longue':      'Toujours en cours… le service sort de veille et charge le modèle.',
    'etat.termine':     'Terminé.',
    'etat.echec':       'Échec de la traduction.',
    'etat.reseau':      'Connexion impossible. Vérifiez votre réseau et réessayez.',
    'pied':             'Projet ouvert autour du pulaar du Fuuta Tooro. Les modèles sont publiés',
    'pied.lien':        'sur Hugging Face',
    'pied.suite':       'Les traductions automatiques comportent des erreurs : faites-les vérifier par un locuteur avant tout usage important.',
  },

  pul: {
    'doc.titre':        '',
    'titre':            '',
    'accroche':         '',
    'avis':             '',
    'label.source':     '',
    'label.traduction': '',
    'label.direction':  '',
    'label.langue':     'Ɗemngal',          // quotidien : Langue → ɗemngal
    'placeholder':      '',
    'sortie.vide':      '',
    'dir.fr_pul':       '',
    'dir.pul_fr':       '',
    'btn.traduire':     '',
    'btn.effacer':      'Moomtu',           // quotidien : Effaces → moomtu
    'etat.encours':     '',
    'etat.longue':      '',
    'etat.termine':     'Joofii.',          // ARPRIM informatique : Terminé → Joofii
    'etat.echec':       '',
    'etat.reseau':      '',
    'pied':             '',
    'pied.lien':        '',
    'pied.suite':       '',
  },
};

// Repli : une chaîne pulaar vide rend le français, jamais une clé nue.
export function t(cle, langue) {
  const valeur = (TEXTES[langue] || {})[cle];
  return (valeur && valeur.trim()) ? valeur : TEXTES.fr[cle] || cle;
}

// Combien reste-t-il à traduire ? Utilisé par tools/i18n-manquants.js
export function manquantes(langue) {
  return Object.keys(TEXTES.fr).filter((c) => !(TEXTES[langue] || {})[c]);
}
