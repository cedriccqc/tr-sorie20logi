import type { Page } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { newContext, jitter, scrollProgressif, navigateurVisible } from "../browser.js";
import { storage } from "../storage.js";
import { APP_VERSION } from "../../shared/types.js";
import { VILLES, CATEGORIES } from "../../config/territoire.ts";

const BASE = "https://www.kijiji.ca";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, "../../data");
/** Délai max de chargement d'une annonce à l'envoi (ms). Réglable pour les tests/diagnostics. */
const GOTO_TIMEOUT_MS = Number(process.env.KIJIJI_GOTO_TIMEOUT_MS) || 45000;

function slug(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function construireUrlRecherche(motCle: string, villeValue: string, categorieValue: string, page = 1) {
  const ville = VILLES.find((v) => v.value === villeValue);
  const cat = CATEGORIES.find((c) => c.value === categorieValue) || CATEGORIES[0];
  if (!ville) throw new Error(`Ville inconnue: ${villeValue}`);
  const p = page > 1 ? `page-${page}/` : "";
  return `${BASE}/b-${cat.kijijiSlug}/${ville.kijijiSlug}/${p}${slug(motCle)}/k0c${cat.kijijiCatId}l${ville.kijijiLocId}?ad=offering&sort=dateDesc`;
}

/** Le lieu retourne par Kijiji correspond-il a la ville demandee ? */
export function correspondVille(lieu: string | null, villeValue: string) {
  if (!lieu) return false;
  const ville = VILLES.find((v) => v.value === villeValue);
  if (!ville) return false;
  const norm = lieu.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return ville.alias.some((a) =>
    norm.includes(a.normalize("NFD").replace(/[\u0300-\u036f]/g, "")),
  );
}

interface AnnonceBrute {
  annonceId: string;
  titre: string;
  url: string;
  prix: string | null;
  lieu: string | null;
  description: string | null;
}

async function extraireAnnonces(page: Page): Promise<AnnonceBrute[]> {
  return page.evaluate(() => {
    const out: any[] = [];
    const vus = new Set<string>();

    // 1) Voie rapide : les donnees Next.js embarquees
    try {
      const el = document.getElementById("__NEXT_DATA__");
      if (el?.textContent) {
        const json = JSON.parse(el.textContent);
        const pile: any[] = [json];
        while (pile.length) {
          const n = pile.pop();
          if (!n || typeof n !== "object") continue;
          if (Array.isArray(n)) {
            pile.push(...n);
            continue;
          }
          const id = n.id ?? n.listingId ?? n.adId;
          const titre = n.title ?? n.adTitle;
          const url = n.url ?? n.seoUrl ?? n.adUrl;
          if (id && titre && typeof url === "string" && url.includes("/v-")) {
            const key = String(id);
            if (!vus.has(key)) {
              vus.add(key);
              out.push({
                annonceId: key,
                titre: String(titre),
                url: url.startsWith("http") ? url : "https://www.kijiji.ca" + url,
                prix:
                  n.price?.amount != null
                    ? String(n.price.amount)
                    : n.price?.text ?? n.priceText ?? null,
                lieu: n.location?.name ?? n.location?.address ?? n.locationName ?? null,
                description: n.description ?? n.shortDescription ?? null,
              });
            }
          }
          for (const v of Object.values(n)) if (v && typeof v === "object") pile.push(v);
        }
      }
    } catch (e) {
      /* on bascule sur le DOM */
    }

    if (out.length) return out;

    // 2) Repli : lecture du DOM
    const cartes = document.querySelectorAll(
      '[data-testid^="listing-card"], [data-listing-id], li[data-testid], section[data-testid="listing-card"]',
    );
    const liste = cartes.length
      ? Array.from(cartes)
      : Array.from(document.querySelectorAll('a[href*="/v-"]')).map((a) => a.closest("li,article,div") || a);

    for (const carte of liste) {
      const a = carte.querySelector('a[href*="/v-"]') as HTMLAnchorElement | null;
      if (!a) continue;
      const href = a.href;
      const m = href.match(/\/(\d{6,})(?:[/?#]|$)/);
      const id = m ? m[1] : href;
      if (vus.has(id)) continue;
      vus.add(id);
      const txt = (sel: string) => {
        const e = carte.querySelector(sel);
        return e ? (e.textContent || "").trim() : null;
      };
      out.push({
        annonceId: id,
        titre: (a.textContent || "").trim() || txt("h3") || "(sans titre)",
        url: href,
        prix: txt('[data-testid*="price"], .price, [class*="price"]'),
        lieu: txt('[data-testid*="location"], [class*="location"]'),
        description: txt('[data-testid*="description"], [class*="description"]'),
      });
    }
    return out;
  });
}

export interface OptionsScrape {
  motsCles: string[];
  villes: string[];
  categorie: string;
  filtreVilleStrict: boolean;
  pagesParRecherche?: number;
  onLog?: (msg: string) => void;
  onProgress?: (fait: number, total: number, trouves: number, ajoutes: number) => void;
  annule?: () => boolean;
}

export async function scraperKijiji(opts: OptionsScrape) {
  const {
    motsCles,
    villes,
    categorie,
    filtreVilleStrict,
    pagesParRecherche = 2,
    onLog = () => {},
    onProgress = () => {},
    annule = () => false,
  } = opts;

  const ctx = await newContext("kijiji");
  const page = await ctx.newPage();
  const total = motsCles.length * villes.length;
  let fait = 0;
  let trouves = 0;
  let ajoutes = 0;

  try {
    for (const ville of villes) {
      for (const motCle of motsCles) {
        if (annule()) {
          onLog("Arrêt demandé.");
          return { trouves, ajoutes, annule: true };
        }
        const labelVille = VILLES.find((v) => v.value === ville)?.label || ville;
        onLog(`Recherche « ${motCle} » à ${labelVille}…`);

        for (let p = 1; p <= pagesParRecherche; p++) {
          const url = construireUrlRecherche(motCle, ville, categorie, p);
          try {
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
            await jitter(1200, 2600);
            await scrollProgressif(page, 4);
            const annonces = await extraireAnnonces(page);
            if (!annonces.length) {
              onLog(`  page ${p} : aucune annonce`);
              break;
            }
            for (const a of annonces) {
              trouves++;
              if (filtreVilleStrict && !correspondVille(a.lieu, ville)) continue;
              const { created } = storage.upsertContact({
                plateforme: "kijiji",
                annonceId: a.annonceId,
                titre: a.titre,
                url: a.url,
                prix: a.prix,
                ville: a.lieu || labelVille,
                description: a.description,
                motCle,
                categorie,
              });
              if (created) ajoutes++;
            }
            onLog(`  page ${p} : ${annonces.length} annonces (${ajoutes} nouvelles au total)`);
          } catch (e) {
            onLog(`  erreur page ${p} : ${(e as Error).message}`);
            break;
          }
          await jitter(1500, 3500);
        }

        fait++;
        onProgress(fait, total, trouves, ajoutes);
        await jitter(2000, 4500);
      }
    }
    return { trouves, ajoutes, annule: false };
  } finally {
    await ctx.close().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Details d'une annonce : nom, telephone, adresse
// ---------------------------------------------------------------------------

export async function recupererDetailsKijiji(url: string) {
  const ctx = await newContext("kijiji");
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await jitter(900, 2000);

    // Tente de reveler le numero de telephone
    for (const sel of [
      'button:has-text("Afficher le numéro")',
      'button:has-text("Show Phone Number")',
      '[data-testid*="phone"] button',
    ]) {
      try {
        const b = page.locator(sel).first();
        if (await b.isVisible({ timeout: 1500 })) {
          await b.click();
          await jitter(700, 1500);
          break;
        }
      } catch {}
    }

    return await page.evaluate(() => {
      const texte = document.body.innerText || "";
      const tel = texte.match(/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
      const courriel = texte.match(/[\w.+-]+@[\w-]+\.[\w.]{2,}/);
      const pick = (sels: string[]) => {
        for (const s of sels) {
          const e = document.querySelector(s);
          if (e?.textContent?.trim()) return e.textContent.trim();
        }
        return null;
      };
      return {
        nom: pick([
          '[data-testid*="seller-name"]',
          '[class*="sellerName"]',
          '[class*="ProfileName"]',
          'a[href*="/o-profil/"]',
        ]),
        telephone: tel ? tel[0].trim() : null,
        courriel: courriel ? courriel[0] : null,
        adresse: pick(['[data-testid*="address"]', '[class*="address"]', '[itemprop="address"]']),
        description: pick(['[data-testid*="description"]', '[class*="descriptionContainer"]'])?.slice(0, 2000) || null,
      };
    });
  } finally {
    await ctx.close().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Connexion Kijiji : recupere les cookies de session
// ---------------------------------------------------------------------------

/**
 * Sommes-nous reellement authentifies ? Le seul test fiable : Kijiji affiche
 * « Sign In / S'identifier » quand on ne l'est pas.
 */
export async function estConnecteKijiji(page: Page): Promise<boolean> {
  try {
    const lienConnexion = await page
      .locator('a[href*="t-login"], a:has-text("Sign In"), a:has-text("S\'identifier"), a:has-text("Se connecter")')
      .first()
      .isVisible({ timeout: 2500 })
      .catch(() => false);
    if (lienConnexion) return false;
    const compte = await page
      .locator('a[href*="my-account"], a[href*="m-my-ads"], [data-testid*="avatar"], button[aria-label*="ompte"]')
      .first()
      .isVisible({ timeout: 2500 })
      .catch(() => false);
    return compte;
  } catch {
    return false;
  }
}

/** Verifie la session enregistree en ouvrant reellement Kijiji. */
export async function verifierSessionKijiji(): Promise<{ connecte: boolean; detail: string }> {
  const session = storage.getSession("kijiji");
  if (!session?.cookies?.length) return { connecte: false, detail: "Aucune session enregistrée." };
  const ctx = await newContext("kijiji");
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await jitter(1200, 2200);
    const ok = await estConnecteKijiji(page);
    return {
      connecte: ok,
      detail: ok
        ? "Session Kijiji valide."
        : "Les témoins enregistrés ne vous authentifient pas — utilisez la connexion manuelle.",
    };
  } finally {
    await ctx.close().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Connexion manuelle : l'utilisateur s'identifie lui-meme dans une fenetre
// visible, puis on recupere les temoins de session. Aucun mot de passe ne
// transite par l'application.
// ---------------------------------------------------------------------------

export const etatConnexionManuelle: {
  etat: "inactif" | "attente" | "reussi" | "echec";
  message: string;
} = { etat: "inactif", message: "" };

export async function connexionManuelleKijiji() {
  if (etatConnexionManuelle.etat === "attente") {
    throw new Error("Une connexion manuelle est déjà en cours.");
  }
  etatConnexionManuelle.etat = "attente";
  etatConnexionManuelle.message =
    "Une fenêtre Chromium s'ouvre. Connectez-vous à Kijiji dedans — l'application détectera automatiquement quand c'est fait.";

  (async () => {
    const { navigateur, contexte } = await navigateurVisible();
    const page = await contexte.newPage();
    try {
      await page.goto(`${BASE}/t-login.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
      const limite = Date.now() + 5 * 60 * 1000;
      while (Date.now() < limite) {
        await new Promise((r) => setTimeout(r, 3000));
        if (page.isClosed()) break;
        if (await estConnecteKijiji(page)) {
          const cookies = await contexte.cookies();
          storage.setSession("kijiji", cookies);
          etatConnexionManuelle.etat = "reussi";
          etatConnexionManuelle.message = `Connecté à Kijiji — ${cookies.length} témoins enregistrés. Vous pouvez fermer la fenêtre.`;
          return;
        }
      }
      etatConnexionManuelle.etat = "echec";
      etatConnexionManuelle.message =
        "Délai écoulé sans détecter de connexion. Relancez et complétez l'identification dans la fenêtre.";
    } catch (e) {
      etatConnexionManuelle.etat = "echec";
      etatConnexionManuelle.message = (e as Error).message;
    } finally {
      await navigateur.close().catch(() => {});
    }
  })();

  return { demarre: true };
}

export async function connexionKijiji(email: string, motDePasse: string) {
  const ctx = await newContext();
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}/t-login.html`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await jitter(800, 1800);
    await page.fill('input[type="email"], input[name="emailOrNickname"], #username', email);
    await jitter(400, 900);
    await page.fill('input[type="password"], #password', motDePasse);
    await jitter(400, 900);
    await page.click('button[type="submit"], button:has-text("Connexion"), button:has-text("Sign In")');
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
    await jitter(1500, 3000);

    // Verification reelle : Kijiji nous reconnait-il ?
    if (!(await estConnecteKijiji(page))) {
      const alerte = await page
        .locator('[role="alert"], [class*="error"]')
        .first()
        .textContent()
        .catch(() => null);
      throw new Error(
        (alerte?.trim() ? alerte.trim() + " — " : "") +
          "Kijiji ne vous a pas authentifié. C'est fréquent : le formulaire demande souvent une " +
          "vérification supplémentaire. Utilisez plutôt « Connexion manuelle », qui ouvre une fenêtre " +
          "où vous vous identifiez vous-même.",
      );
    }
    const cookies = await ctx.cookies();
    storage.setSession("kijiji", cookies, email);
    return { ok: true, cookies: cookies.length };
  } finally {
    await ctx.close().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Envoi d'un message sur une annonce
// ---------------------------------------------------------------------------

/**
 * Zones de texte a NE JAMAIS considerer comme le champ message.
 * Le textarea de reCAPTCHA est toujours present et toujours cache : sans cette
 * exclusion, `.first()` tombe dessus et attend une visibilite qui n'arrive jamais.
 */
const TEXTAREA_MESSAGE = [
  'textarea[data-testid="text-area-message"]',
  'textarea[name="message"]',
  'textarea[id*="message" i]',
  'textarea[placeholder*="essage" i]',
  'textarea[aria-label*="essage" i]',
  'div[contenteditable="true"]',
  'textarea:not([name="g-recaptcha-response"]):not([class*="recaptcha"]):not([id*="recaptcha"])',
];

/**
 * Phrases pre-ecrites par Kijiji (champ pre-rempli et « reponses rapides »).
 * Si l'une d'elles est sur le point de partir a notre place, on bloque.
 */
const PHRASES_KIJIJI = /toujours disponible|still available|est-ce que cette annonce|is this (item )?available|prix est[- ]il n[ée]gociable|is the price negotiable/i;

/** Libelle EXACT d'un bouton d'envoi. Tout le reste est refuse. */
const LIBELLE_ENVOI = /^\s*(envoyer( (le |un )?message)?( au vendeur)?|send( (a |the )?message)?|soumettre|submit)\s*$/i;

/**
 * Erreur levee quand on a la preuve que le texte qui allait partir n'est PAS
 * le message choisi. La campagne s'arrete net sur cette erreur : inutile de
 * repeter la meme chose sur les 19 contacts suivants.
 */
export class ErreurContenuMessage extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurContenuMessage";
  }
}

export interface OptionsEnvoiKijiji {
  /**
   * Appele une fois le vendeur identifie, AVANT tout envoi. Retourne une
   * raison pour ignorer ce contact (ex. « meme vendeur que #12 »), ou null.
   */
  vendeurDejaContacte?: (vendeurId: string | null, vendeurNom: string | null) => string | null;
}

export type ResultatEnvoiKijiji =
  | {
      ok: true;
      /** true : Kijiji a confirme (ou on a vu partir la requete avec notre texte). */
      confirme: boolean;
      detail: string;
      vendeurId: string | null;
      vendeurNom: string | null;
    }
  | {
      ok: false;
      ignore: true;
      raison: string;
      /** Kijiji indique qu'une conversation existe deja avec ce vendeur. */
      dejaSurKijiji?: boolean;
      vendeurId: string | null;
      vendeurNom: string | null;
    };

/** Cherche le champ message dans la page ET dans ses iframes. */
async function trouverChampMessage(page: Page, timeoutMs = 15000) {
  const limite = Date.now() + timeoutMs;
  while (Date.now() < limite) {
    for (const frame of page.frames()) {
      for (const sel of TEXTAREA_MESSAGE) {
        try {
          const champ = frame.locator(`${sel}:visible`).first();
          if (await champ.isVisible({ timeout: 400 })) return champ;
        } catch {}
      }
    }
    await jitter(500, 900);
  }
  return null;
}

/** Kijiji nous demande-t-il une verification humaine, ou une connexion ? */
async function diagnostiquerBlocage(page: Page): Promise<string | null> {
  if (/login|signin|s-identifier/i.test(page.url())) {
    return "Kijiji redirige vers la page de connexion — votre session a expiré. Reconnectez-vous dans Connexions.";
  }
  // Kijiji exige une session authentifiee pour ecrire au vendeur.
  const modaleConnexion = await page
    .locator('text=/Sign in to send your message|Connectez-vous pour envoyer/i')
    .first()
    .isVisible({ timeout: 1000 })
    .catch(() => false);
  if (modaleConnexion || !(await estConnecteKijiji(page))) {
    return (
      "Vous n'êtes pas authentifié sur Kijiji — la plateforme exige une session ouverte pour " +
      "écrire à un vendeur. Allez dans Connexions et utilisez « Connexion manuelle » : " +
      "une fenêtre s'ouvre, vous vous identifiez vous-même, et l'app garde la session."
    );
  }
  const captcha = await page
    .locator('iframe[src*="recaptcha"][title*="challenge" i], iframe[title*="hCaptcha" i], div.g-recaptcha:visible, #px-captcha')
    .first()
    .isVisible({ timeout: 800 })
    .catch(() => false);
  if (captcha) {
    return (
      "Kijiji affiche une vérification humaine (captcha) sur cette annonce. " +
      "L'application ne la contourne pas — c'est à vous de la compléter. " +
      "Relancez l'app avec « demarrer-verchere-visible.bat » : le navigateur s'ouvrira à l'écran, " +
      "vous complétez la vérification vous-même, et la session reste valide pour les envois suivants."
    );
  }
  const texte = await page.innerText("body").catch(() => "");
  if (/annonce.{0,30}(supprim|expir|n'existe plus)/i.test(texte)) {
    return "L'annonce n'existe plus ou a été supprimée.";
  }
  return null;
}

async function capturerEcran(
  page: Page,
  etiquette: string,
  ecraser = false,
): Promise<string | null> {
  try {
    const dossier = path.join(DATA_DIR, "debug");
    fs.mkdirSync(dossier, { recursive: true });
    const fichier = path.join(dossier, ecraser ? `${etiquette}.png` : `${etiquette}-${Date.now()}.png`);
    await page.screenshot({ path: fichier, fullPage: false });
    return fichier;
  } catch {
    return null;
  }
}

/** Lit le contenu d'un champ, qu'il soit <textarea> ou div contenteditable. */
async function lireChamp(zone: any): Promise<string> {
  try {
    return await zone.evaluate((el: any) =>
      el.tagName === "TEXTAREA" || el.tagName === "INPUT" ? el.value : el.innerText || "",
    );
  } catch {
    return "";
  }
}

/**
 * Vide un champ React « recalcitrant » : on passe par le setter natif puis on
 * emet les evenements que React ecoute, sinon l'etat interne garde l'ancien
 * texte et c'est LUI qui est envoye.
 */
async function viderChampNatif(zone: any) {
  try {
    await zone.evaluate((el: any) => {
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
        const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        if (setter) setter.call(el, "");
        else el.value = "";
      } else {
        el.textContent = "";
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
  } catch {}
}

/**
 * Tape le message par blocs, avec un delai « humain » par caractere.
 * Un seul appel `type()` sur un long message (500 caracteres et plus)
 * depasse la limite de 30 s de Playwright et echoue avant la fin de la saisie.
 */
async function taperMessage(zone: any, message: string) {
  const TAILLE_BLOC = 40;
  for (let i = 0; i < message.length; i += TAILLE_BLOC) {
    const bloc = message.slice(i, i + TAILLE_BLOC);
    const delai = 18 + Math.random() * 30;
    try {
      await zone.pressSequentially(bloc, { delay: delai, timeout: 30000 });
    } catch {
      // Champ re-rendu ou clavier capricieux : on complete au remplissage direct.
      await zone.fill(message, { timeout: 15000 }).catch(() => {});
      return;
    }
    if (i + TAILLE_BLOC < message.length) await jitter(80, 250);
  }
}

const normaliser = (s: string) =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** Decode grossierement un corps de requete (JSON, formulaire) en texte lisible. */
function decoderCorps(brut: string): string {
  let s = brut || "";
  try {
    s = decodeURIComponent(s.replace(/\+/g, " "));
  } catch {}
  s = s
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\n|\\r|\\t/g, " ")
    .replace(/\\"/g, '"')
    .replace(/\\\//g, "/");
  return s;
}

/** Le corps de requete contient-il notre message (ou son debut significatif) ? */
function corpsContientMessage(brut: string, message: string): boolean {
  const corps = normaliser(decoderCorps(brut));
  const m = normaliser(message);
  if (!m) return false;
  if (corps.includes(m)) return true;
  // Kijiji peut tronquer ou reformater : un extrait significatif suffit.
  const extrait = m.slice(0, Math.min(60, m.length));
  return extrait.length >= 20 && corps.includes(extrait);
}

/**
 * Identifie le vendeur sur la page (id de profil + nom) : sert a ne pas ecrire
 * vingt fois a la meme personne qui a vingt annonces.
 */
async function identifierVendeur(page: Page): Promise<{ vendeurId: string | null; vendeurNom: string | null }> {
  try {
    return await page.evaluate(() => {
      let vendeurId: string | null = null;
      let vendeurNom: string | null = null;

      // 1) Donnees Next.js
      try {
        const el = document.getElementById("__NEXT_DATA__");
        if (el?.textContent) {
          const json = JSON.parse(el.textContent);
          const pile: any[] = [json];
          const clesId = ["posterId", "sellerId", "ownerId", "advertiserId", "profileId", "posterUserId"];
          const clesNom = ["posterName", "sellerName", "displayName", "nickname", "name"];
          let tours = 0;
          while (pile.length && tours++ < 50000) {
            const n = pile.pop();
            if (!n || typeof n !== "object") continue;
            if (Array.isArray(n)) {
              pile.push(...n);
              continue;
            }
            for (const k of clesId) {
              const v = n[k];
              if ((typeof v === "string" || typeof v === "number") && String(v).trim() && !vendeurId) {
                vendeurId = String(v).trim();
                for (const kn of clesNom) {
                  if (typeof n[kn] === "string" && n[kn].trim()) {
                    vendeurNom = n[kn].trim();
                    break;
                  }
                }
              }
            }
            // Objet « poster » / « seller » imbrique
            for (const k of ["poster", "seller", "owner", "advertiser", "profile"]) {
              const o = n[k];
              if (o && typeof o === "object" && !Array.isArray(o) && !vendeurId) {
                const id = o.id ?? o.userId ?? o.posterId;
                if (id != null && String(id).trim()) vendeurId = String(id).trim();
                for (const kn of clesNom) {
                  if (typeof o[kn] === "string" && o[kn].trim()) {
                    vendeurNom = vendeurNom || o[kn].trim();
                    break;
                  }
                }
              }
            }
            if (vendeurId) break;
            for (const v of Object.values(n)) if (v && typeof v === "object") pile.push(v);
          }
        }
      } catch {}

      // 2) Lien vers le profil du vendeur dans le DOM
      if (!vendeurId) {
        const a = document.querySelector(
          'a[href*="/o-profil"], a[href*="/o-user"], a[href*="/u/"], a[href*="profile"], a[href*="/b-vendeur"]',
        ) as HTMLAnchorElement | null;
        if (a?.href) {
          const m = a.href.match(/(\d{4,})(?:[/?#]|$)/);
          vendeurId = m ? m[1] : a.href.replace(/^https?:\/\/[^/]+/, "");
          vendeurNom = vendeurNom || (a.textContent || "").trim() || null;
        }
      }
      if (!vendeurNom) {
        const e = document.querySelector('[data-testid*="seller-name"], [class*="sellerName"], [class*="ProfileName"]');
        if (e?.textContent?.trim()) vendeurNom = e.textContent.trim();
      }
      return { vendeurId, vendeurNom };
    });
  } catch {
    return { vendeurId: null, vendeurNom: null };
  }
}

/**
 * Trouve le bouton d'envoi qui appartient au MEME formulaire que le champ.
 * On ne cherche jamais dans toute la page : c'est comme ca qu'on finit par
 * cliquer une « reponse rapide » de Kijiji qui envoie son propre texte.
 */
async function trouverBoutonEnvoi(zone: any) {
  // Conteneur : le <form> ou la boite de dialogue qui contient le champ ; sinon
  // on remonte les ancetres un par un (sans jamais depasser 6 niveaux).
  const candidats: any[] = [];
  const form = zone.locator('xpath=ancestor::*[self::form or self::dialog or @role="dialog"][1]');
  if ((await form.count().catch(() => 0)) > 0) candidats.push(form.first());
  for (let niveau = 1; niveau <= 6; niveau++) {
    const anc = zone.locator(`xpath=ancestor::*[${niveau}]`);
    if ((await anc.count().catch(() => 0)) > 0) candidats.push(anc.first());
  }

  for (const conteneur of candidats) {
    const boutons = conteneur.locator('button:visible, [role="button"]:visible, input[type="submit"]:visible');
    const n = await boutons.count().catch(() => 0);
    for (let i = 0; i < Math.min(n, 12); i++) {
      const b = boutons.nth(i);
      const libelle = (
        (await b.innerText().catch(() => "")) ||
        (await b.getAttribute("aria-label").catch(() => "")) ||
        (await b.getAttribute("value").catch(() => "")) ||
        ""
      ).trim();
      // Une « reponse rapide » ressemble a une question toute faite : jamais.
      if (/\?\s*$/.test(libelle) || PHRASES_KIJIJI.test(libelle)) continue;
      const type = ((await b.getAttribute("type").catch(() => "")) || "").toLowerCase();
      const estSubmit = type === "submit" && candidats[0] === conteneur && (await form.count().catch(() => 0)) > 0;
      if (LIBELLE_ENVOI.test(libelle) || (estSubmit && libelle.length <= 40)) {
        return { bouton: b, libelle: libelle || "(submit)" };
      }
    }
  }
  return null;
}

/**
 * Une conversation avec ce vendeur existe-t-elle deja sur Kijiji ?
 * On cherche le lien/bouton precis (pas le texte libre d'une description,
 * qui pourrait contenir des mots semblables par hasard).
 */
async function conversationExistante(page: Page): Promise<boolean> {
  const lien = await page
    .locator(
      'a:has-text("Voir la conversation"), button:has-text("Voir la conversation"), ' +
        'a:has-text("View conversation"), button:has-text("View conversation"), ' +
        'a:has-text("Continuer la conversation"), button:has-text("Continue the conversation"), ' +
        'a[href*="m-msg-my-messages"]:has-text("conversation")',
    )
    .first()
    .isVisible({ timeout: 1200 })
    .catch(() => false);
  if (lien) return true;
  const texte = await page.innerText("body").catch(() => "");
  return /vous avez d[ée]j[àa] envoy[ée] un message|you('ve| have) already sent a message/i.test(texte);
}

export async function envoyerMessageKijiji(
  url: string,
  message: string,
  options: OptionsEnvoiKijiji = {},
): Promise<ResultatEnvoiKijiji> {
  const session = storage.getSession("kijiji");
  if (!session?.cookies?.length) throw new Error("Session Kijiji absente — connectez-vous d'abord.");
  if (!message || !message.trim()) throw new Error("Message vide — rien n'a été envoyé.");
  if (PHRASES_KIJIJI.test(message)) {
    throw new ErreurContenuMessage(
      "Votre modèle ressemble à la question automatique de Kijiji (« est-ce toujours disponible? »). " +
        "Choisissez un vrai message de prospection. Rien n'a été envoyé.",
    );
  }

  const ctx = await newContext("kijiji");
  const page = await ctx.newPage();
  // Etape en cours : prefixe des messages d'erreur, pour savoir OU ca bloque.
  let etape = "ouverture de la page";
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: GOTO_TIMEOUT_MS });
    await jitter(1200, 2600);

    etape = "vérification de la session";
    const blocage = await diagnostiquerBlocage(page);
    if (blocage) throw new Error(blocage);

    // --- Qui est le vendeur ? (anti-doublon) --------------------------------
    etape = "identification du vendeur";
    const { vendeurId, vendeurNom } = await identifierVendeur(page);
    if (options.vendeurDejaContacte) {
      const raison = options.vendeurDejaContacte(vendeurId, vendeurNom);
      if (raison) return { ok: false, ignore: true, raison, vendeurId, vendeurNom };
    }

    // --- Conversation deja ouverte avec ce vendeur sur Kijiji ? ------------
    // Apres un premier message, Kijiji remplace le formulaire par un lien
    // « Voir la conversation ». Inutile (et nuisible) de reecrire.
    etape = "détection d'une conversation existante";
    if (await conversationExistante(page)) {
      return {
        ok: false,
        ignore: true,
        dejaSurKijiji: true,
        raison:
          "Kijiji indique qu'une conversation existe déjà avec ce vendeur — contact marqué « contacté », rien renvoyé.",
        vendeurId,
        vendeurNom,
      };
    }

    // Le formulaire est souvent replie derriere un bouton.
    etape = "ouverture du formulaire de contact";
    for (const sel of [
      'button:has-text("Contacter le vendeur")',
      'button:has-text("Contacter")',
      'button:has-text("Envoyer un message")',
      'button:has-text("Message the seller")',
      'a:has-text("Contacter le vendeur")',
      '[data-testid*="contact"] button',
    ]) {
      try {
        const b = page.locator(`${sel}:visible`).first();
        if (!(await b.isVisible({ timeout: 1200 }))) continue;
        const libelle = ((await b.innerText().catch(() => "")) || "").trim();
        // Jamais une reponse rapide, meme ici.
        if (/\?\s*$/.test(libelle) || PHRASES_KIJIJI.test(libelle)) continue;
        await b.click();
        await jitter(900, 1800);
        break;
      } catch {}
    }

    etape = "recherche du champ de message";
    const zone = await trouverChampMessage(page, 15000);
    if (!zone) {
      if (await conversationExistante(page)) {
        return {
          ok: false,
          ignore: true,
          dejaSurKijiji: true,
          raison:
            "Kijiji indique qu'une conversation existe déjà avec ce vendeur — contact marqué « contacté », rien renvoyé.",
          vendeurId,
          vendeurNom,
        };
      }
      const blocage2 = await diagnostiquerBlocage(page);
      const capture = await capturerEcran(page, "envoi-kijiji");
      throw new Error(
        (blocage2 || "Champ de message introuvable sur cette annonce (Kijiji a peut-être changé son formulaire).") +
          (capture ? ` Capture d'écran : ${capture}` : ""),
      );
    }

    // --- Vider le champ ---------------------------------------------------
    // Kijiji pre-remplit une question generique ("Is this still available?").
    // Si on ne la retire pas, c'est ELLE qui part.
    etape = "vidage du champ pré-rempli";
    await zone.click();
    await jitter(200, 400);
    await zone.fill("").catch(() => {});
    if ((await lireChamp(zone)).trim() !== "") {
      await page.keyboard.press("Control+A");
      await page.keyboard.press("Backspace");
      await jitter(200, 400);
    }
    if ((await lireChamp(zone)).trim() !== "") {
      await viderChampNatif(zone);
      await jitter(200, 400);
    }
    if ((await lireChamp(zone)).trim() !== "") {
      const capture = await capturerEcran(page, "envoi-kijiji-champ-non-vide");
      throw new Error(
        "Impossible de vider le champ pré-rempli par Kijiji — envoi annulé par sécurité. Rien n'a été envoyé." +
          (capture ? ` Capture : ${capture}` : ""),
      );
    }

    // --- Ecrire notre message --------------------------------------------
    etape = "saisie du message";
    await taperMessage(zone, message);
    await jitter(700, 1400);
    if (normaliser(await lireChamp(zone)) !== normaliser(message)) {
      // Deuxieme chance : remplissage direct.
      await zone.fill(message, { timeout: 15000 }).catch(() => {});
      await jitter(400, 800);
    }

    // --- GARDE-FOU 1 : le champ contient exactement notre message ----------
    etape = "vérification du contenu du champ";
    const contenu = await lireChamp(zone);
    if (normaliser(contenu) !== normaliser(message)) {
      const capture = await capturerEcran(page, "envoi-kijiji-contenu-different");
      throw new ErreurContenuMessage(
        "Envoi annulé par sécurité : le champ ne contient pas votre message. " +
          `Il contient « ${contenu.slice(0, 120)} ». Rien n'a été envoyé.` +
          (capture ? ` Capture : ${capture}` : ""),
      );
    }

    // --- Bouton d'envoi : uniquement dans le formulaire du champ -----------
    etape = "recherche du bouton Envoyer";
    const trouve = await trouverBoutonEnvoi(zone);
    if (!trouve) {
      const capture = await capturerEcran(page, "envoi-kijiji-bouton");
      throw new Error(
        "Message saisi mais bouton « Envoyer » introuvable dans le formulaire — rien n'a été envoyé." +
          (capture ? ` Capture : ${capture}` : ""),
      );
    }

    // Trace du dernier envoi, ecrasee a chaque fois (aucune accumulation).
    await capturerEcran(page, "dernier-envoi", true);

    // --- GARDE-FOU 2 : on surveille ce qui part reellement sur le reseau ----
    // Si une requete contient la phrase de Kijiji et PAS notre message, on la
    // bloque avant qu'elle n'atteigne le serveur.
    const observe = { notre: false, mauvais: null as string | null };
    const garde = async (route: any) => {
      try {
        const req = route.request();
        const methode = req.method();
        if (methode === "POST" || methode === "PUT" || methode === "PATCH") {
          const corps = req.postData() || "";
          if (corps && /kijiji/i.test(req.url())) {
            if (corpsContientMessage(corps, message)) {
              observe.notre = true;
            } else if (PHRASES_KIJIJI.test(decoderCorps(corps))) {
              observe.mauvais = decoderCorps(corps).slice(0, 200);
              await route.abort("blockedbyclient").catch(() => {});
              return;
            }
          }
        }
      } catch {}
      await route.continue().catch(() => {});
    };
    await page.route("**/*", garde);

    // --- Relecture juste avant le clic (le champ a pu etre re-rendu) -------
    if (normaliser(await lireChamp(zone)) !== normaliser(message)) {
      await page.unroute("**/*", garde).catch(() => {});
      throw new ErreurContenuMessage(
        "Envoi annulé par sécurité : le champ a changé juste avant l'envoi. Rien n'a été envoyé.",
      );
    }

    etape = "clic sur Envoyer";
    await trouve.bouton.click();
    // A partir d'ici, un message a PEUT-ETRE ete envoye : on ne leve plus
    // d'erreur (sauf preuve que la requete a ete bloquee), on RAPPORTE.
    storage.incrementDailySent("kijiji");
    await jitter(2500, 4500);
    await page.unroute("**/*", garde).catch(() => {});

    if (observe.mauvais && !observe.notre) {
      const capture = await capturerEcran(page, "envoi-kijiji-requete-bloquee");
      throw new ErreurContenuMessage(
        "Kijiji tentait d'envoyer SON texte à la place du vôtre — la requête a été bloquée, rien n'est parti. " +
          `Texte intercepté : « ${observe.mauvais.slice(0, 120)} ».` +
          (capture ? ` Capture : ${capture}` : ""),
      );
    }

    // Confirmation : Kijiji affiche un accuse, le formulaire disparait, ou le
    // champ a ete vide.
    const corps = await page.innerText("body").catch(() => "");
    const champApres = await trouverChampMessage(page, 2000);
    const champVide = champApres ? (await lireChamp(champApres)).trim() === "" : true;
    const accuse = /message (a été )?envoyé|votre message a été|message sent|your message has been/i.test(corps);
    const confirme = observe.notre || accuse || !champApres || champVide;

    etape = "confirmation de l'envoi";
    const blocageApres = await diagnostiquerBlocage(page);
    if (blocageApres && !confirme) {
      // Bloque APRES le clic : on ne sait pas si le message est parti.
      return {
        ok: true,
        confirme: false,
        detail: `Envoi incertain — ${blocageApres}`,
        vendeurId,
        vendeurNom,
      };
    }

    if (!confirme) {
      const capture = await capturerEcran(page, "envoi-kijiji-doute");
      return {
        ok: true,
        confirme: false,
        detail:
          "Envoi probable mais non confirmé par Kijiji — vérifiez votre boîte de messages avant de relancer." +
          (capture ? ` Capture : ${capture}` : ""),
        vendeurId,
        vendeurNom,
      };
    }

    return {
      ok: true,
      confirme: true,
      detail: observe.notre
        ? "Message envoyé (contenu vérifié sur le réseau)"
        : "Message envoyé",
      vendeurId,
      vendeurNom,
    };
  } catch (e) {
    const err = e as Error;
    // Prefixe version + etape : on sait exactement quelle version tourne et
    // ou l'envoi s'est arrete. (Une seule fois, meme si l'erreur remonte.)
    if (!err.message.startsWith("[v")) {
      err.message = `[v${APP_VERSION} · étape : ${etape}] ${err.message}`;
    }
    throw err;
  } finally {
    await ctx.close().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Verification des reponses dans la boite de messages Kijiji
// ---------------------------------------------------------------------------

export async function verifierReponsesKijiji(): Promise<{ nom: string; extrait: string }[]> {
  const session = storage.getSession("kijiji");
  if (!session?.cookies?.length) throw new Error("Session Kijiji absente — connectez-vous d'abord.");
  const ctx = await newContext("kijiji");
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}/m-msg-my-messages/`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await jitter(1500, 3000);
    return await page.evaluate(() => {
      const out: any[] = [];
      const items = document.querySelectorAll('[data-testid*="conversation"], li[class*="conversation"], [class*="ConversationItem"]');
      items.forEach((i) => {
        const t = (i.textContent || "").trim().replace(/\s+/g, " ");
        if (t) out.push({ nom: t.slice(0, 60), extrait: t.slice(0, 300) });
      });
      return out;
    });
  } finally {
    await ctx.close().catch(() => {});
  }
}
