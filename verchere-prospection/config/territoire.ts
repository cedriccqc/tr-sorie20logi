// ---------------------------------------------------------------------------
// TERRITOIRE VERCHERE
// ---------------------------------------------------------------------------
// `kijijiLocId` = identifiant de region Kijiji (le "l" dans une URL /k0c34l1700281).
// Les sous-villes (Lachute, Mirabel, ...) n'ont pas toujours d'ID propre : on
// utilise l'ID de la region parente + le filtre strict par ville cote serveur.
// Pour ajuster un ID : ouvrir une recherche sur kijiji.ca dans la ville voulue
// et lire le nombre apres le "l" a la fin de l'URL.
// ---------------------------------------------------------------------------

export interface Ville {
  value: string;
  label: string;
  region: string;
  kijijiLocId: number;
  kijijiSlug: string;
  /** Termes acceptes quand le filtre strict par ville est actif */
  alias: string[];
  /** Identifiant de lieu Facebook Marketplace */
  fbCity: string;
}

export const VILLES: Ville[] = [
  // --- Grand Montreal ---
  { value: "montreal", label: "Montréal", region: "Grand Montréal", kijijiLocId: 1700281, kijijiSlug: "ville-de-montreal", alias: ["montreal", "montréal", "mtl"], fbCity: "montreal" },
  { value: "laval", label: "Laval", region: "Grand Montréal", kijijiLocId: 1700474, kijijiSlug: "laval-rive-nord", alias: ["laval", "chomedey", "sainte-dorothee", "vimont", "duvernay"], fbCity: "laval" },
  { value: "longueuil", label: "Longueuil", region: "Grand Montréal", kijijiLocId: 1700276, kijijiSlug: "longueuil-rive-sud", alias: ["longueuil", "saint-hubert", "greenfield park", "brossard"], fbCity: "longueuil" },

  // --- Laurentides ---
  { value: "lachute", label: "Lachute", region: "Laurentides", kijijiLocId: 1700277, kijijiSlug: "laurentides", alias: ["lachute"], fbCity: "lachute" },
  { value: "sainteustache", label: "Saint-Eustache", region: "Laurentides", kijijiLocId: 1700474, kijijiSlug: "laval-rive-nord", alias: ["saint-eustache", "st-eustache", "sainte-eustache"], fbCity: "sainteustache" },
  { value: "saintjerome", label: "Saint-Jérôme", region: "Laurentides", kijijiLocId: 1700277, kijijiSlug: "laurentides", alias: ["saint-jerome", "saint-jérôme", "st-jerome"], fbCity: "saintjerome" },
  { value: "mirabel", label: "Mirabel", region: "Laurentides", kijijiLocId: 1700277, kijijiSlug: "laurentides", alias: ["mirabel", "saint-canut", "saint-augustin"], fbCity: "mirabel" },
  { value: "prevost", label: "Prévost", region: "Laurentides", kijijiLocId: 1700277, kijijiSlug: "laurentides", alias: ["prevost", "prévost"], fbCity: "prevost" },

  // --- Rive-Nord ---
  { value: "saintetherese", label: "Sainte-Thérèse", region: "Rive-Nord", kijijiLocId: 1700474, kijijiSlug: "laval-rive-nord", alias: ["sainte-therese", "sainte-thérèse", "ste-therese", "rosemere", "boisbriand"], fbCity: "saintetherese" },
  { value: "deuxmontagnes", label: "Deux-Montagnes", region: "Rive-Nord", kijijiLocId: 1700474, kijijiSlug: "laval-rive-nord", alias: ["deux-montagnes", "deux montagnes", "saint-joseph-du-lac", "pointe-calumet"], fbCity: "deuxmontagnes" },
  { value: "blainville", label: "Blainville", region: "Rive-Nord", kijijiLocId: 1700474, kijijiSlug: "laval-rive-nord", alias: ["blainville", "sainte-anne-des-plaines"], fbCity: "blainville" },

  // --- Lanaudiere ---
  { value: "terrebonne", label: "Terrebonne", region: "Lanaudière", kijijiLocId: 1700275, kijijiSlug: "lanaudiere", alias: ["terrebonne", "lachenaie", "la plaine", "mascouche"], fbCity: "terrebonne" },
  { value: "repentigny", label: "Repentigny", region: "Lanaudière", kijijiLocId: 1700275, kijijiSlug: "lanaudiere", alias: ["repentigny", "le gardeur", "charlemagne"], fbCity: "repentigny" },
  { value: "joliette", label: "Joliette", region: "Lanaudière", kijijiLocId: 1700275, kijijiSlug: "lanaudiere", alias: ["joliette", "notre-dame-des-prairies"], fbCity: "joliette" },

  // --- Autres ---
  { value: "quebec", label: "Québec", region: "Autres", kijijiLocId: 1700124, kijijiSlug: "ville-de-quebec", alias: ["quebec", "québec", "sainte-foy", "beauport", "charlesbourg", "levis"], fbCity: "quebeccity" },
  { value: "gatineau", label: "Gatineau", region: "Autres", kijijiLocId: 1700185, kijijiSlug: "gatineau", alias: ["gatineau", "hull", "aylmer", "buckingham"], fbCity: "gatineau" },
];

export const REGIONS = ["Grand Montréal", "Laurentides", "Rive-Nord", "Lanaudière", "Autres"];

// ---------------------------------------------------------------------------
// CATEGORIES CIBLEES PAR VERCHERE
// Immobilier commercial a louer + complexes residentiels.
// `kijijiCatId` = le "c" dans l'URL Kijiji (/k0c40l1700281).
// ---------------------------------------------------------------------------

export interface Categorie {
  value: string;
  label: string;
  kijijiCatId: number;
  kijijiSlug: string;
  description: string;
}

export const CATEGORIES: Categorie[] = [
  {
    value: "commercial",
    label: "Espaces commerciaux et bureaux",
    kijijiCatId: 40,
    kijijiSlug: "espaces-commerciaux-bureaux",
    description: "Bâtisses commerciales, locaux, bureaux, entrepôts à louer",
  },
  {
    value: "multilogement",
    label: "Immeubles à revenus / multilogements",
    kijijiCatId: 35,
    kijijiSlug: "immeubles-a-revenus",
    description: "Complexes résidentiels, plex, immeubles à revenus",
  },
  {
    value: "location_residentielle",
    label: "Appartements et condos à louer",
    kijijiCatId: 37,
    kijijiSlug: "appartements-condos",
    description: "Logements à louer — repérage de propriétaires multi-unités",
  },
  {
    value: "immobilier",
    label: "Immobilier (toutes catégories)",
    kijijiCatId: 34,
    kijijiSlug: "immobilier",
    description: "Recherche large dans tout l'immobilier",
  },
];

// Mots-cles de depart proposes dans l'interface
export const MOTS_CLES_DEFAUT = [
  "local commercial à louer",
  "bâtisse commerciale",
  "espace commercial",
  "immeuble à revenus",
  "complexe résidentiel",
  "plex à vendre",
];
