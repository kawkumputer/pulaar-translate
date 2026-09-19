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

// Le sélecteur de langue reste caché tant que le pulaar n'est pas complet.
// Une interface traduite à 10 % donne l'impression d'un site à moitié cassé,
// ce qui est pire que de l'assumer en français. Tout le mécanisme de traduction
// reste en place : il suffira de repasser cette constante à `true`.
//
//     npm run i18n     → ce qu'il reste à remplir
export const PULAAR_PRET = false;

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
    'pied.contact':     'Une question, une remarque, envie de contribuer ?',

    // Retours des visiteurs. Ce sont eux qui disent au modèle où il se trompe :
    // le « non » doit être aussi facile à donner que le « oui ».
    'retour.question':  'Cette traduction est-elle correcte ?',
    'retour.oui':       'Oui',
    'retour.non':       'Non, je propose mieux',
    'retour.correction': 'La bonne traduction',
    'retour.exemple':   'Écrivez ici la traduction juste…',
    // Le projet ne couvre que le Fuuta Tooro. Le dire sur le formulaire évite
    // de recevoir des corriges d'autres parlers, justes ailleurs mais fausses
    // ici, qu'on prendrait pour des erreurs du modèle.
    'retour.fuuta':     'Le modèle apprend le pulaar du Fuuta Tooro.',
    'retour.nom':       'Votre nom (facultatif)',
    'retour.envoyer':   'Envoyer',
    'retour.avis':      'Votre contribution pourra servir à améliorer le modèle. N’y mettez pas d’information personnelle.',
    'retour.merci':     'Merci, c’est enregistré.',
    'retour.vide':      'Indiquez la bonne traduction avant d’envoyer.',
    'retour.echec':     'L’envoi a échoué. Réessayez.',
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
    'pied.contact':     '',

    // « Oui » et « non » ne figurent pas dans les 8 080 paires validées, et
    // « merci » y apparaît sous cinq formes concurrentes. Rien n'est rempli
    // ici tant que ce n'est pas arbitré : le repli sur le français vaut mieux
    // qu'un pulaar inventé.
    'retour.question':  '',
    'retour.oui':       '',
    'retour.non':       '',
    'retour.correction': '',
    'retour.exemple':   '',
    'retour.fuuta':     '',
    'retour.nom':       '',
    'retour.envoyer':   '',
    'retour.avis':      '',
    'retour.merci':     '',
    'retour.vide':      '',
    'retour.echec':     '',
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
