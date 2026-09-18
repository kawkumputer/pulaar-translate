# pulaar-translate

Démonstrateur public du traducteur **français ↔ pulaar** (dialecte Fuuta Tooro).

Page unique déployée sur Vercel, qui appelle le Space Hugging Face
`kawkumputer/PulaarAI` — lequel sert le modèle NLLB-1.3B affiné en LoRA.

```
navigateur  →  Vercel /api/translate  →  Space HF Gradio  →  modèle LoRA
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
- le Space peut passer en privé plus tard sans toucher au front (il suffira de
  renseigner `HF_TOKEN` dans Vercel) ;
- un endroit unique où brancher une limite de débit le jour où c'est utile.

## Déployer

```bash
npm install
npx vercel          # aperçu
npx vercel --prod   # production
```

Aucune variable d'environnement n'est nécessaire tant que le Space est public.

| Variable | Rôle |
|---|---|
| `HF_SPACE` | Space à appeler. Défaut : `kawkumputer/PulaarAI` |
| `HF_TOKEN` | Uniquement si le Space devient privé |

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

## Limites connues, assumées

Elles viennent toutes du Space gratuit en CPU, pas de Vercel :

| | |
|---|---|
| 20 à 40 s par traduction | inférence CPU sur un modèle de 1,3 milliard de paramètres |
| jusqu'à 2 min au réveil | un Space gratuit s'endort après ~48 h sans trafic |
| une requête à la fois | pas de parallélisme sur un Space gratuit |

La page annonce ces délais et affiche un chronomètre, pour qu'un visiteur ne
croie pas que le service est cassé.

Pour passer sous les 2 secondes, la piste est **ZeroGPU** (compte Hugging Face
Pro) : c'est un changement de configuration du Space, ce projet n'a pas à
bouger.

## Structure

```
api/translate.js   relais serverless vers le Space
public/index.html  la page (aucune dépendance côté navigateur)
vercel.json        maxDuration 120 s — sinon Vercel coupe avant le Space
```
