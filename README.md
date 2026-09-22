# pulaar-translate

Démonstrateur public du traducteur **français ↔ pulaar** (dialecte Fuuta Tooro).

En ligne : **<https://www.pulaar-translate.com>** · Contact :
**pulaartranslate@gmail.com**

Page unique déployée sur Vercel, qui appelle le Space Hugging Face
`kawkumputer/PulaarAI` — lequel sert le modèle NLLB-1.3B affiné en LoRA.

```
navigateur  →  Vercel /api/translate  →  Space HF Gradio  →  modèle LoRA
            →  Vercel /api/retour     →  Supabase (table retours)
            →  Vercel /api/admin      →  Supabase (dépouillement, export)
```

## Pourquoi une page HTML et pas Flutter

Flutter Web rend l'interface dans un `<canvas>` : le contenu est **invisible
pour les moteurs de recherche**, et le premier chargement pèse 2 à 3 Mo. Pour
une page dont le métier est « on arrive, on tape une phrase, on lit la
traduction », c'est du poids sans contrepartie.

Flutter reste le bon choix pour intégrer le traducteur dans l'application
`learn_pulaar` : même API, mêmes endpoints, code partagé avec le reste de
l'app. Un backend, deux façades.

## Pourquoi un relais serverless

La page n'appelle pas le Space directement :

- pas de problème de CORS ;
- il porte les secrets — jeton Hugging Face et clé Supabase — qui ne doivent
  jamais atteindre le navigateur ;
- le Space peut passer en privé plus tard sans toucher au front ;
- un endroit unique où brancher la limite de débit.

## Déployer

```bash
npm install
npx vercel          # aperçu
npx vercel --prod   # production
```

| Variable | Rôle |
|---|---|
| `HF_SPACE` | Space à appeler. Défaut : `kawkumputer/PulaarAI` |
| `HF_TOKEN` | **Obligatoire.** Lecture seule. Voir ci-dessous |
| `SUPABASE_URL` | `https://xxxx.supabase.co` — Settings → API |
| `SUPABASE_SERVICE_KEY` | Clé `service_role`. **Jamais la clé `anon`** |
| `ADMIN_MOT_DE_PASSE` | Accès à `/admin.html`. Sans elle, la page reste fermée |
| `HACHAGE_SEL` | Chaîne aléatoire quelconque, pour saler l'empreinte des IP |
| `MODELE_VERSION` | Version jugée par les retours. Défaut : `v11` |

Toutes sont à créer en type **Secret**, pour les environnements *Production*
**et** *Preview* — sinon un déploiement d'aperçu part sans jeton. Une variable
n'est prise en compte qu'au build suivant : après l'avoir ajoutée, il faut
redéployer.

### Pourquoi `HF_TOKEN` n'est pas facultatif

Depuis la bascule du Space sur **ZeroGPU**, le quota GPU est facturé au compte
appelant. Sans jeton, l'appel part en anonyme et **tous les visiteurs se
partagent le petit quota attaché à l'IP de sortie de Vercel** : le service
tombe après quelques traductions. Avec le jeton du compte Pro, ils puisent
dans le quota Pro. Un jeton en lecture seule suffit, le relais ne fait
qu'appeler.

## Ce qu'il faut vérifier au premier déploiement

L'endpoint appelé est `/translate`, qui correspond au `api_name="translate"`
posé dans la cellule §14 du notebook d'entraînement. **Ce paramètre doit avoir
été déployé** : il a été ajouté le 2026-09-18, donc il faut que le Space ait
été (re)publié depuis. Sinon, l'appel échoue et il faut relancer §14.

Vérification rapide, sans passer par le site :

```bash
npm install
node -e "import('@gradio/client').then(async ({Client}) => {
  const c = await Client.connect('kawkumputer/PulaarAI');
  console.log(await c.view_api());
})"
```

La sortie doit lister un endpoint nommé `/translate` prenant deux entrées
(le texte, la direction).

## Clavier pulaar

Beaucoup de contributeurs écrivent le pulaar sans ses lettres propres, faute
de clavier : `Mido jogii` au lieu de `Miɗo jogii`. Une correction ainsi
orthographiée ne peut pas servir à corriger le modèle.

Cinq touches et leurs capitales apparaissent donc **sous le champ qui attend du
pulaar** — le texte source quand la direction est `pul → fr`, la correction
quand elle est `fr → pul`. Ailleurs elles resteraient dans le chemin.

L'ordre suit la fréquence relevée sur les 8 080 paires du corpus :

| ɗ | ɓ | ñ | ƴ | ŋ |
|---|---|---|---|---|
| 5 823 | 3 788 | 978 | 786 | 380 |

Les capitales servent aussi — 466 occurrences, surtout en début de phrase —
d'où les dix touches plutôt que cinq.

```bash
node tools/test-clavier.mjs     # inclus dans npm test
```

Le test exerce l'arithmétique du curseur (insertion au milieu, remplacement
d'une sélection, respect de `maxlength`) : une erreur d'indice y est invisible
à la relecture et se manifeste par un texte mélangé chez le contributeur.

## Retours des visiteurs

Sous chaque traduction, le visiteur répond « cette traduction est-elle
correcte ? ». Un « non » ouvre un champ de correction, plus son nom,
facultatif. Le formulaire rappelle que le modèle apprend le pulaar du **Fuuta
Tooro** : c'est ce qui limite les corrections venues d'autres parlers, justes
ailleurs mais fausses ici. Le tri définitif se fait à la relecture.

**Mise en service** : exécuter [`supabase/schema.sql`](supabase/schema.sql)
une fois dans Supabase (SQL Editor → New query → coller → Run), puis
renseigner les quatre variables Supabase ci-dessus.

### Ce que la table capture, et pourquoi

| Colonne | Pourquoi elle existe |
|---|---|
| `modele` | Dans six mois, un retour sans version du modèle n'est plus interprétable |
| `statut` | Rien ne part à l'entraînement sans être passé à `valide` à la main |
| `ip_hachee` | Empreinte salée, jamais l'adresse — limitation de débit uniquement |

### La règle qui compte

**Une correction venue du web est un candidat, pas une donnée.** Les 8 080
paires du dataset valent quelque chose parce qu'elles sont validées ; un
versement automatique les dévaluerait toutes d'un coup, sans qu'on sache
ensuite lesquelles sont sûres. D'où le `statut`, la page de dépouillement, et
un export qui ne sort que les retours validés.

### Dépouiller

`/admin.html`, protégée par `ADMIN_MOT_DE_PASSE`. Chaque retour s'y valide ou
s'y rejette, avec un aperçu de la paire `{fr, pul}` telle qu'elle entrerait
dans le dataset. Le bouton d'export produit un JSONL au schéma
`{fr, pul, source}` du corpus d'entraînement, `source` valant `retour_public`.

Les retours jugés « bonne » sont exportés eux aussi : ils confirment une sortie
du modèle, ce qui est de la donnée valide. Un « mauvaise » sans correction ne
l'est pas — il signale un trou, il ne le comble pas.

### Les trois textes s'amendent avant d'être validés

Texte source, sortie du modèle et correction sont modifiables dans la page de
dépouillement, et l'aperçu de la paire `{fr, pul}` se recalcule à chaque frappe.
Un contributeur tape parfois le source avec une faute, ou propose deux variantes
dans un seul champ :

```
"Mi neldii ma ɓataakuru he whatsapp" ou "Mi neldi on ɓataakuru he whatsapp"
```

Exportée telle quelle, cette ligne entrerait dans le corpus avec ses guillemets
et son « ou ». Trancher à la relecture coûte moins cher que nettoyer un corpus
après coup.

**La sortie d'origine du modèle est conservée.** C'est la seule trace de ce que
le modèle a réellement produit sur cette entrée — donc le diagnostic qui
alimente le lot suivant. La corriger pour l'exporter effacerait la preuve de
l'erreur, alors `traduction_modele_origine` garde la valeur d'avant la première
retouche, et la page l'affiche sous le champ. Migration :
[`supabase/migration_2026-09-22_origine.sql`](supabase/migration_2026-09-22_origine.sql),
à exécuter une fois.

Seuls les champs réellement touchés sont envoyés : un simple rejet ne réécrit
rien.

### Rejeter n'est pas supprimer

**Rejeter** garde la ligne en base, simplement hors de la vue de travail. Même
quand la correction ne vaut rien, le *texte source* dit qu'un tour de phrase est
demandé et que le modèle le rate : c'est la feuille de route du lot suivant, et
la jeter serait perdre le signal en même temps que le bruit. Garder la trace
évite aussi de rejuger deux fois la même proposition.

**Supprimer** efface définitivement, et n'existe que pour ce qu'on ne veut pas
conserver du tout : insultes, spam. C'est la seule action irréversible de la
page, donc la seule qui demande confirmation.

## Domaine

Canonique : **`https://www.pulaar-translate.com`**. L'apex
`pulaar-translate.com` y redirige en 308, et `pulaar-translate.vercel.app`
reste servi mais pointe dessus par sa balise canonique.

Le domaine est écrit en dur à six endroits — les moteurs lisent les balises
avant que le moindre JavaScript ne s'exécute, donc aucune constante partagée ne
peut les alimenter. La contrepartie de cette duplication est un contrôle :

```bash
npm run domaine     # inclus dans npm test
```

Il refuse qu'un domaine abandonné subsiste, et signale une `og-image.png` plus
ancienne que son générateur — l'URL est **dessinée dans l'image**, un
remplacement de texte ne suffit donc pas, il faut relancer
`python tools/og-image.py`.

Pour déménager : changer `CANONIQUE` dans
[`tools/verif-domaine.mjs`](tools/verif-domaine.mjs), lancer `npm run domaine`,
et corriger ce qu'il signale.

## Texte lisible sans JavaScript

Les libellés vivent dans `i18n.js` et sont injectés au chargement. Un robot qui
n'exécute pas JavaScript ne voyait donc qu'un **`<h1>` vide** et 125 caractères
de contenu. Google sait rendre le JavaScript — la page a bien été indexée —
mais c'est une seconde passe moins prioritaire, et Bing, les robots sociaux et
les crawlers d'IA ne le font souvent pas.

Le français est donc écrit **en dur** dans `index.html`, ce qui ne coûte rien :
c'est déjà la seule langue affichée tant que `PULAAR_PRET` vaut `false`, et
`appliquerLangue()` réécrit de toute façon le même texte. Résultat : 1 089
caractères indexables au lieu de 125.

```bash
npm run prerendre     # réécrit index.html depuis i18n.js
```

La contrepartie est un risque de dérive entre les deux fichiers. D'où le mode
`--verifier`, branché sur `npm test` : **toute modification d'un libellé dans
`i18n.js` doit être suivie de `npm run prerendre`**, sinon les tests échouent.

## Langue de l'interface

Le mécanisme français/pulaar est en place, mais le **sélecteur reste caché**
tant que `PULAAR_PRET` vaut `false` dans [`public/i18n.js`](public/i18n.js).
Une interface traduite à 10 % donne l'impression d'un site à moitié cassé, ce
qui est pire que de l'assumer en français.

```bash
npm run i18n     # ce qu'il reste à remplir dans l'objet `pul`
```

Quand tout est rempli, passer `PULAAR_PRET` à `true` : rien d'autre à changer.

## Fréquentation

**Vercel Web Analytics**, chargé par `/_vercel/insights/script.js` depuis
`index.html`. Sans cookie et sans donnée personnelle, donc **aucun bandeau de
consentement à afficher**.

Le script n'est servi que si Web Analytics est activé dans le tableau de bord
Vercel (onglet *Analytics* → *Enable*). Sans cela, la requête échoue
silencieusement et la page fonctionne normalement — c'est voulu : la mesure
d'audience ne doit jamais pouvoir casser le service.

## Sécurité

- La clé `service_role` contourne RLS. Elle ne vit que dans les variables
  Vercel, n'est lue que par `api/_supabase.js`, et ce fichier n'est jamais
  importé par le front.
- La table a **RLS activé sans aucune policy** : les rôles `anon` et
  `authenticated` n'ont aucun droit, même si leur clé fuitait. Ne pas ajouter
  de policy.
- `/admin.html` n'affiche jamais de HTML fourni par un visiteur : tout passe
  par `textContent`. Un nom de contributeur contenant un script s'exécuterait
  sinon dans la session de l'administrateur.
- Les IP ne sont pas stockées, seulement une empreinte salée tronquée.

## Limites connues, assumées

| | |
|---|---|
| ~0,7 s par traduction | mesuré le 2026-09-19, maximum 4,8 s sur le premier appel |
| jusqu'à une minute au réveil | le Space s'endort et doit recharger le modèle |
| quota GPU journalier | réserve de 30 s par appel ; épuisée, le site répond 429 |

Deux réglages du Space conditionnent ces chiffres, et tous deux ont coûté une
mesure pour être trouvés :

- **`@spaces.GPU(duration=30)`** — le quota se facture à la durée *réservée*,
  pas à la durée consommée. À 120 s, un seul appel de 3 s épuisait la réserve
  du jour.
- **modèle chargé en `float16`** — il était chargé en `float32` puis converti à
  chaque appel. Médiane passée de 8,9 s à 0,7 s en supprimant cette conversion.

La page annonce ces délais et affiche un chronomètre, pour qu'un visiteur ne
croie pas que le service est cassé.

## Structure

```
api/translate.js    relais serverless vers le Space
api/retour.js       enregistrement d'un retour visiteur
api/admin.js        dépouillement et export, derrière mot de passe
api/_supabase.js    accès Supabase — le « _ » l'exclut du routage Vercel
public/index.html   la page (aucune dépendance côté navigateur)
public/admin.html   page de dépouillement, noindex
public/i18n.js      libellés français et pulaar
supabase/schema.sql à exécuter une fois dans Supabase
vercel.json         maxDuration 120 s — sinon Vercel coupe avant le Space
```
