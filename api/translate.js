// Route serverless Vercel : relais entre le navigateur et le Space Hugging Face.
//
// Pourquoi ne pas appeler le Space directement depuis le navigateur ?
//   - le relais evite les problemes de CORS ;
//   - il permet de garder le Space privé plus tard sans toucher au front ;
//   - il donne un endroit unique ou brancher un jour une limite de débit.
//
// Le Space tourne sur CPU gratuit : compter 20 à 40 s par traduction, et
// jusqu'à 2 min si le Space sortait de veille. Le front doit l'annoncer.

import { Client } from '@gradio/client';

const SPACE = process.env.HF_SPACE || 'kawkumputer/PulaarAI';
const DIRECTIONS = new Set(['fr → pul', 'pul → fr']);
const MAX_CARACTERES = 1000;

// La connexion est coûteuse : on la garde entre deux invocations tant que
// l'instance serverless reste chaude.
let clientPromise = null;

function connecter() {
  if (!clientPromise) {
    clientPromise = Client.connect(SPACE, {
      // renseigner HF_TOKEN dans Vercel seulement si le Space devient privé
      hf_token: process.env.HF_TOKEN || undefined,
    }).catch((err) => {
      clientPromise = null; // ne pas figer un échec de connexion
      throw err;
    });
  }
  return clientPromise;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ erreur: 'Méthode non autorisée' });
  }

  const { texte, direction } = req.body || {};

  if (typeof texte !== 'string' || !texte.trim()) {
    return res.status(400).json({ erreur: 'Texte vide.' });
  }
  if (texte.length > MAX_CARACTERES) {
    return res.status(400).json({
      erreur: `Texte trop long : ${texte.length} caractères, maximum ${MAX_CARACTERES}.`,
    });
  }
  if (!DIRECTIONS.has(direction)) {
    return res.status(400).json({ erreur: 'Direction inconnue.' });
  }

  try {
    const client = await connecter();
    // "/translate" correspond a api_name="translate" cote Space (§14 du
    // notebook). Si le Space est redeploye sans ce parametre, adapter ici.
    const sortie = await client.predict('/translate', [texte.trim(), direction]);
    const traduction = Array.isArray(sortie?.data) ? sortie.data[0] : sortie?.data;

    if (typeof traduction !== 'string') {
      throw new Error('Réponse inattendue du Space');
    }
    return res.status(200).json({ traduction });
  } catch (err) {
    console.error('Echec de traduction :', err);
    // Le cas le plus frequent : le Space etait en veille et n'a pas repondu
    // dans le temps imparti. Ce n'est pas une erreur du visiteur.
    const enVeille = /timeout|ECONNRESET|fetch failed|503|502/i.test(String(err?.message));
    return res.status(enVeille ? 503 : 500).json({
      erreur: enVeille
        ? "Le modèle sortait de veille et n'a pas répondu à temps. Réessayez dans une minute."
        : "La traduction a échoué. Réessayez dans un instant.",
    });
  }
}
