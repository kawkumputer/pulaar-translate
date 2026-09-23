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

// Le sélecteur de langue reste caché tant que le pulaar n'est pas complet :
// une interface traduite à moitié donne l'impression d'un site cassé, ce qui
// est pire que de l'assumer en français.
//
// Passé à `true` le 2026-09-24 — les 39 libellés sont traduits par Abou Sy.
// Repasser à `false` si de nouvelles clés apparaissent sans leur pulaar.
//
//     npm run i18n     → ce qu'il reste à remplir
export const PULAAR_PRET = true;

export const TEXTES = {
  fr: {
    'doc.titre':        'Pulaar-Translate — Traducteur Français ↔ Pulaar (Fuuta Tooro)',
    'titre':            'Pulaar-Translate — Traducteur Français ↔ Pulaar',
    'accroche':         'Dialecte Fuuta Tooro · modèle NLLB affiné sur un corpus validé par des locuteurs natifs',

    // Les deux lignes vivent dans l'en-tête, l'une sous l'autre : ceux qui ont
    // confié leurs ouvrages en pulaar au projet doivent se lire d'emblée, pas
    // après avoir fait défiler la page. La seconde ligne est composée un peu
    // plus petite pour que le bloc reste léger à mesure que la liste grandit.
    'credits.fonde':    'Fondé par Hamath Kane et Abou Sy',
    'credits.avec':     'Contributions de Bocar Amadou Ba (ARPRIM), Alassane Mountaga Sall « Dembel », Hamet Amadou Ly, Bacca Bah et Oumar El Hadj Thiam, sur le traducteur comme sur le modèle de langue en développement.',
    // Mesuré le 2026-09-19 sur dix traductions, après le chargement du modèle
    // en float16 : médiane 0,7 s, maximum 4,8 s sur le tout premier appel.
    // Cinq secondes couvrent donc le pire cas observé, là où « deux » le
    // dépassait. Le chiffre annoncé doit rester au-dessus du mesuré, jamais
    // l'inverse : c'est le doute sur une panne qui fait fermer l'onglet.
    'avis':             'Le modèle tourne sur un GPU partagé : comptez moins de cinq secondes par traduction. La première après une période creuse peut demander jusqu’à une minute, le temps que le service sorte de veille.',
    'label.source':     'Texte source',
    'label.traduction': 'Traduction',
    'label.direction':  'Direction',
    'label.langue':     'Langue de l’interface',
    'placeholder':      'Saisissez le texte à traduire…',

    // Beaucoup écrivent le pulaar sans ses lettres propres, faute de clavier.
    // Dire pourquoi elles comptent porte plus loin que « écrivez correctement ».
    'clavier.aide':     'Votre clavier n’a pas ɓ ɗ ŋ ñ ƴ ? Touchez ces lettres pour les insérer.',
    'retour.orthographe': 'Écrivez le pulaar avec ses lettres propres. Une correction où ɓ ɗ ŋ ñ ƴ sont remplacés par b, d, n, y ne peut pas servir à corriger le modèle.',
    'sortie.vide':      'La traduction s’affichera ici.',
    'dir.fr_pul':       'Français → Pulaar',
    'dir.pul_fr':       'Pulaar → Français',
    'btn.traduire':     'Traduire',
    'btn.effacer':      'Effacer',
    'etat.encours':     'Traduction en cours…',
    'etat.longue':      'Toujours en cours… le GPU partagé est chargé, ou le service sort de veille.',
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

  // Traductions fournies par Abou Sy le 2026-09-23, reprises telles quelles.
  // Trois retouches seulement, toutes signalées en commentaire : elles portent
  // sur un nom propre vérifiable et sur la typographie, jamais sur la langue.
  pul: {
    // Abou n'a donné qu'un titre ; il sert aussi pour l'onglet du navigateur.
    'doc.titre':        'Pulaar-Translate (Fir-Pulaar) — Pirowol Farayse ↔ Pulaar',
    'titre':            'Pulaar-Translate (Fir-Pulaar) — Pirowol Farayse ↔ Pulaar',
    'accroche':         'Ngaddiini Fuuta Tooro · Model NLLB ɓuccito fawiingo dow laral haalooɓe jibinannde maggal.',
    'credits.fonde':    'Feltuɓe : Hammaat Kan e Abuu Sih.',
    // Deux retouches ici. « APPRIM » corrigé en « ARPRIM » : c'est le nom réel
    // de l'association, celui que porte la ligne française — deux sigles
    // différents sur la même page seraient une faute visible. Et les guillemets
    // droits passés en chevrons, pour s'accorder au reste du site.
    'credits.avec':     'Wallidiiɓe Bokara Aamadu Bah (ARPRIM), Alasan Muntagaa Sal « Dembel », Hammee Aamadu Lih, Bacca Bah e Umar Elhajji Caam, to bannge firo e to mbaadi loosɗingol.',
    // Espace double retirée dans « haa  hojom ».
    'avis':             'Model o yiilotoo ko dow GPU feccito : limee les hojomaaji joy kala firo. Adiingo ngo caggal daawal ina waawi yahde haa hojom, fotde ko gollorgal ngal ina seerta e faɗɗere.',
    'label.source':     'Winndannde iwdi (lasli).',
    'label.traduction': 'Firo',
    'label.direction':  'Kuccam',
    'label.langue':     'Ɗemngal',          // quotidien : Langue → ɗemngal
    // Points de suspension normalises en « … », comme du cote francais.
    'placeholder':      'Winndu winndannde firateende nde…',
    'clavier.aide':     'So tawii tappirgal mon alaa ɓ ɗ ŋ ñ ƴ ? Memee ɗee alkule ngal waawde lommbude ɗe heen.',
    'retour.orthographe': 'Mbinndiree Pulaar alkule laaɓtuɗe. Ina saatoree ɓ ɗ ŋ ñ ƴ, so tawii on lomtiniri b d n y, ɗuum waawataa wallitde saato model o.',
    'sortie.vide':      'Firo ngo ko ɗoo yaltata.',
    // Abou ecrit le tiret la ou le francais porte une fleche. Conserve tel
    // quel : la fleche est une convention typographique, pas une traduction.
    'dir.fr_pul':       'Farayse - Pulaar',
    'dir.pul_fr':       'Pulaar - Farayse',
    'btn.traduire':     'Pirgol',
    'btn.effacer':      'Moomtu',           // quotidien : Effaces → moomtu
    'etat.encours':     'Firo ngo ina he bolol',
    'etat.longue':      'Haa jooni ina he bolol… GPU peccitaaɗo o koko loowi, walla tawi gollorgal ngal ko ko ɗifti',
    'etat.termine':     'Joofii.',          // ARPRIM informatique : Terminé → Joofii
    'etat.echec':       'Firo ngo jaccii',
    'etat.reseau':      'Ceŋagol ngol newotaako. Ƴeewtindo seŋornde weeyo kadi ƴeewtindo-ɗaa',
    // Abou a rendu ces deux cles d'un seul tenant. La phrase est coupee par le
    // lien vers Hugging Face : « nder Hugging Face » porte le lien, comme
    // « sur Hugging Face » du cote francais.
    'pied':             'Eɓɓoore udditiinde ko yowitii he pulaar Fuuta Tooro. Modelaaji ɗi ina caaktaa',
    'pied.lien':        'nder Hugging Face',
    'pied.suite':       'Firooji otomatik ɗi ina coomi juumreeji ; yo kaaloowo ɗemgal ngal ƴeewtindo ɗum, ko adii kala kuutoragol paayodinngol',
    'pied.contact':     'Naamnal, Teskuya, Aɗa muuyi addude ballal ?',

    'retour.question':  'Mbele ngoo firo ango regii ?',
    'retour.oui':       'Eey',
    'retour.non':       'Alaa, miɗo hollita ko ɓuri.',
    'retour.correction': 'Firo moƴƴo ngo',
    // Espace double retiree dans « ɗoo  firo ».
    'retour.exemple':   'Winndu ɗoo firo moƴƴo ngo.',
    // Abou a donné ces deux phrases d'un bloc ; elles sont séparées ici parce
    // que le formulaire les affiche l'une après l'autre.
    'retour.fuuta':     'Model o jangata ko Pulaar Fuuta Tooro.',
    'retour.nom':       'Innde ma (Waɗɗaaki).',
    'retour.envoyer':   'Nuldu',
    'retour.avis':      'So on ngaddii ballal mon ma ɗum waaw wallitoyde ɓuccitagol model o. Hoto mbaɗee heen innaataare mon heertinde.',
    'retour.merci':     'Jaaraama, ɗum loowiima.',
    'retour.vide':      'Hollit firo moƴƴo ngo ko adii nuldugol',
    'retour.echec':     'Nuldal ngal jaccii. Waɗtu.',
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
