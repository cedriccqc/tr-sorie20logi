# Verchere — Système de prospection

Outil interne de prospection immobilière : acquisition d'annonces sur **Kijiji** et
**Facebook Marketplace**, journal de contacts, campagnes de messages avec cadence
anti-spam, modèles de messages, export CSV.

Cible : **bâtisses commerciales à louer** et **complexes résidentiels / immeubles à revenus**
dans le Grand Montréal, les Laurentides, la Rive-Nord, Lanaudière, Québec et Gatineau.

---

## Démarrage

```bash
npm install                      # installe les dépendances + Chromium (Playwright)
npm run dev                      # interface sur http://localhost:5173, API sur :3001
```

Production (Replit) :

```bash
npm run build
npm start                        # sert l'interface + l'API sur le port 5000
```

Variables d'environnement (optionnelles, voir `.env.example`) :

| Variable | Effet |
|---|---|
| `PORT` | Port du serveur (défaut : 5000 en production) |
| `DATA_DIR` | Dossier de la base JSON (défaut : `./data`) |
| `HEADFUL=1` | Ouvre un navigateur visible — utile pour déboguer un scraper |
| `CHROMIUM_PATH` | Chemin d'un Chromium déjà installé |

---

## Option gratuite : faire rouler sur votre PC (recommandé)

Aucun hébergement à payer, et **le scraping fonctionne mieux** : Kijiji et Facebook
bloquent ou envoient des captchas aux adresses IP de centres de données, alors qu'une
connexion résidentielle passe normalement. Vos cookies de session restent aussi sur votre
machine.

**Windows** — installez [Node.js LTS](https://nodejs.org) (gratuit), puis double-cliquez
sur `demarrer-verchere.bat`. Il installe tout la première fois, compile l'interface,
démarre le serveur et ouvre <http://localhost:5000>. Les fois suivantes, le démarrage est
immédiat.

**macOS / Linux** :

```bash
npm install && npx playwright install chromium && npm run build && npm start
```

Seule contrainte : l'ordinateur doit être allumé pendant une campagne (les envois sont
espacés de 1 à 5 minutes). Les contacts déjà collectés restent dans `data/` en tout temps.

---

## Déploiement sur Replit

1. Créer un Repl **Node.js**, importer ce dossier (ou le zip).
2. Dans le shell : `npm install && npm run build`
3. Commande de démarrage : `npm start`
4. Si Chromium manque : `npx playwright install --with-deps chromium`

Le dossier `data/` contient toute la base (contacts, modèles, cadence, sessions).
Le sauvegarder = sauvegarder votre prospection.

---

## Architecture

```
config/territoire.ts      villes, régions, IDs Kijiji, catégories ciblées
shared/types.ts           types partagés client/serveur
server/
  index.ts                serveur Express
  routes.ts               toutes les routes /api
  storage.ts              base JSON persistante (contacts, modèles, cadence, sessions)
  campaign.ts             moteur d'envoi séquencé + cadence anti-spam
  browser.ts              Playwright : contexte furtif, cookies, pauses aléatoires
  scrapers/kijiji.ts      recherche, détails, connexion, envoi, réponses
  scrapers/facebook.ts    idem pour Marketplace
client/src/               interface React + Tailwind
```

### Routes API

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/config` | villes, catégories, état des connexions |
| GET | `/api/stats` | compteurs du tableau de bord |
| GET | `/api/contacts` | journal, avec filtres (`plateforme`, `statut`, `ville`, `q`…) |
| PATCH / DELETE | `/api/contacts/:id` | modifier / supprimer |
| POST | `/api/contacts/mark-contacted` | marquer contacté en lot |
| POST | `/api/contacts/:id/fetch-details` | récupérer nom, téléphone, adresse |
| POST | `/api/contacts/fetch-missing-phones` | idem en lot, séquencé |
| POST | `/api/scrape/kijiji` · `/api/scrape/facebook` | lancer une acquisition (retourne un job) |
| GET | `/api/scrape/jobs/:id` | progression et journal du job |
| POST | `/api/scrape/jobs/:id/stop` | arrêter un job |
| POST | `/api/check-replies` | lire les boîtes de messages et marquer « répondu » |
| GET/POST/PUT/DELETE | `/api/templates` | modèles de messages |
| GET/POST | `/api/campaign/status` · `start` · `stop` | campagne d'envoi |
| GET/PUT | `/api/campaign/limits` | cadence anti-spam |
| POST | `/api/settings/kijiji-login` · `*-cookies` | connexions |
| GET | `/api/export/csv` | export du journal |

---

## Cadence anti-spam

Valeurs par défaut, modifiables dans l'interface :

- **Kijiji** : 15 messages/jour, 65–120 s entre deux envois
- **Facebook** : 10 messages/jour, 180–300 s entre deux envois

Le compteur quotidien se remet à zéro à minuit. Le moteur saute automatiquement les
contacts dont la plateforme a atteint sa limite. Les messages sont tapés caractère par
caractère avec un délai variable, et chaque navigation est espacée d'une pause aléatoire.

Un **mode simulation** permet de dérouler une campagne complète sans rien envoyer.

### Garde-fous d'envoi (Kijiji)

Le formulaire de contact Kijiji est pré-rempli avec « Est-ce toujours disponible? » et
propose des réponses rapides qui envoient leur propre texte. Pour qu'un envoi ne parte
jamais avec autre chose que votre message :

- le champ est vidé puis relu : s'il ne contient pas exactement votre message, rien n'est envoyé ;
- le bouton « Envoyer » est cherché uniquement dans le formulaire du champ, avec un libellé
  exact — jamais une réponse rapide, jamais ailleurs dans la page ;
- les requêtes réseau émises au clic sont inspectées : si Kijiji tente d'envoyer sa phrase
  à la place de la vôtre, la requête est **bloquée** et la campagne s'arrête ;
- un modèle qui ressemble à la question automatique de Kijiji est refusé.

### Anti-doublon

- Un contact **déjà contacté** est ignoré par défaut (case « renvoyer » dans la fenêtre d'envoi
  pour forcer).
- **Un seul message par vendeur** : le vendeur est identifié sur la page de l'annonce
  (profil) et par son nom ; ses autres annonces sont ignorées, dans la même campagne comme
  dans les suivantes.
- Dès que le bouton « Envoyer » a été cliqué, le contact est marqué **contacté**, même si
  Kijiji n'affiche pas de confirmation (le résultat est alors « incertain », en orange, avec
  une note sur le contact). Une relance ne renverra donc jamais deux fois à la même personne.
- La campagne se met en **pause après 3 échecs consécutifs** au lieu de répéter la même erreur
  sur tous les contacts.

Les captures d'écran des envois (`dernier-envoi.png`) et des anomalies sont dans `data/debug/`.

---

## Variables de message

Utilisables dans un modèle : `{{nom}}`, `{{ville}}`, `{{titre}}`, `{{prix}}`.

---

## Ajuster le territoire ou les catégories

Tout est dans `config/territoire.ts`.

Pour ajouter une ville, il faut son **ID de lieu Kijiji** : ouvrez une recherche sur
kijiji.ca dans cette ville et lisez le nombre après le `l` à la fin de l'URL
(ex. `…/k0c40l1700281` → `1700281`). Même logique pour une catégorie avec le `c`.

Le champ `alias` sert au filtre strict par ville : il liste les quartiers et variantes
d'écriture acceptés (ex. Laval accepte « Chomedey », « Vimont »).

---

## Limites connues

- Les sélecteurs Kijiji et Facebook changent régulièrement. Le scraper Kijiji lit d'abord
  les données `__NEXT_DATA__` (robuste), puis retombe sur le DOM. Si une recherche ne
  retourne rien, lancez avec `HEADFUL=1` pour voir ce que le navigateur affiche.
- Facebook bloque la connexion automatisée : les cookies doivent être collés à la main et
  se périment après quelques semaines.
- Le rapprochement des réponses est approximatif (correspondance sur le nom/titre) — il
  marque « répondu », à vous de confirmer dans le journal.

## Conformité

Outil interne. Respectez les conditions d'utilisation de Kijiji et de Meta, la
Loi 25 (protection des renseignements personnels au Québec) et la LCAP (anti-pourriel) :
identifiez-vous clairement, proposez un moyen de refuser, et n'envoyez pas en masse
au-delà des cadences configurées.
