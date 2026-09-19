# pulaar-translate

Démonstrateur public du traducteur **français ↔ pulaar** (dialecte Fuuta Tooro).

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

### Rejeter n'est pas supprimer

**Rejeter** garde la ligne en base, simplement hors de la vue de travail. Même
quand la correction ne vaut rien, le *texte source* dit qu'un tour de phrase est
demandé et que le modèle le rate : c'est la feuille de route du lot suivant, et
la jeter serait perdre le signal en même temps que le bruit. Garder la trace
évite aussi de rejuger deux fois la même proposition.

**Supprimer** efface définitivement, et n'existe que pour ce qu'on ne veut pas
conserver du tout : insultes, spam. C'est la seule action irréversible de la
page, donc la seule qui demande confirmation.

## Langue de l'interface

Le mécanisme français/pulaar est en place, mais le **sélecteur reste caché**
tant que `PULAAR_PRET` vaut `false` dans [`public/i18n.js`](public/i18n.js).
Une interface traduite à 10 % donne l'impression d'un site à moitié cassé, ce
qui est pire que de l'assumer en français.

```bash
npm run i18n     # ce qu'il reste à remplir dans l'objet `pul`
```

Quand tout est rempli, passer `PULAAR_PRET` à `true` : rien d'autre à changer.

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
| quelques secondes par traduction | ZeroGPU, GPU partagé |
| jusqu'à une minute au réveil | le Space s'endort et doit recharger le modèle |
| quota GPU journalier | réserve de 30 s par appel ; épuisée, le site répond 429 |

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
