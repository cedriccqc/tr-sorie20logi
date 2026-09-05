import { newContext, jitter, scrollProgressif } from "../browser.js";
import { storage } from "../storage.js";
import { VILLES } from "../../config/territoire.ts";
import type { OptionsScrape } from "./kijiji.ts";

const BASE = "https://www.facebook.com";

export function construireUrlMarketplace(motCle: string, villeValue: string) {
  const ville = VILLES.find((v) => v.value === villeValue);
  const cite = ville?.fbCity || "montreal";
  const q = encodeURIComponent(motCle);
  return `${BASE}/marketplace/${cite}/search?query=${q}&exact=false&sortBy=creation_time_descend`;
}

export async function scraperFacebook(opts: OptionsScrape) {
  const {
    motsCles,
    villes,
    categorie,
    filtreVilleStrict,
    onLog = () => {},
    onProgress = () => {},
    annule = () => false,
  } = opts;

  const session = storage.getSession("facebook");
  if (!session?.cookies?.length) {
    throw new Error(
      "Session Facebook absente. Collez vos cookies Facebook dans Connexions avant de lancer une recherche Marketplace.",
    );
  }

  const ctx = await newContext("facebook");
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
        onLog(`Marketplace « ${motCle} » à ${labelVille}…`);
        const url = construireUrlMarketplace(motCle, ville);

        try {
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
          await jitter(2000, 4000);

          if (/login|checkpoint/i.test(page.url())) {
            throw new Error("Facebook redirige vers la connexion — cookies expirés.");
          }

          await scrollProgressif(page, 8);

          const annonces = await page.evaluate(() => {
            const out: any[] = [];
            const vus = new Set<string>();
            document.querySelectorAll('a[href*="/marketplace/item/"]').forEach((el) => {
              const a = el as HTMLAnchorElement;
              const m = a.href.match(/\/marketplace\/item\/(\d+)/);
              if (!m) return;
              const id = m[1];
              if (vus.has(id)) return;
              vus.add(id);
              const bloc = (a.closest('[class]') || a) as HTMLElement;
              const lignes = (bloc.innerText || "")
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean);
              const prix = lignes.find((l) => /\$/.test(l)) || null;
              const titre = lignes.find((l) => !/\$/.test(l) && l.length > 4) || "(sans titre)";
              const lieu = lignes[lignes.length - 1] || null;
              out.push({
                annonceId: id,
                titre,
                url: `https://www.facebook.com/marketplace/item/${id}/`,
                prix,
                lieu,
              });
            });
            return out;
          });

          for (const a of annonces) {
            trouves++;
            if (filtreVilleStrict && a.lieu && !a.lieu.toLowerCase().includes(labelVille.toLowerCase().slice(0, 5)))
              continue;
            const { created } = storage.upsertContact({
              plateforme: "facebook",
              annonceId: a.annonceId,
              titre: a.titre,
              url: a.url,
              prix: a.prix,
              ville: a.lieu || labelVille,
              motCle,
              categorie,
            });
            if (created) ajoutes++;
          }
          onLog(`  ${annonces.length} annonces trouvées (${ajoutes} nouvelles au total)`);
        } catch (e) {
          onLog(`  erreur : ${(e as Error).message}`);
        }

        fait++;
        onProgress(fait, total, trouves, ajoutes);
        await jitter(4000, 9000);
      }
    }
    return { trouves, ajoutes, annule: false };
  } finally {
    await ctx.close().catch(() => {});
  }
}

export async function recupererDetailsFacebook(url: string) {
  const ctx = await newContext("facebook");
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await jitter(1500, 3000);
    return await page.evaluate(() => {
      const texte = document.body.innerText || "";
      const tel = texte.match(/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
      const vendeur = document.querySelector('a[href*="/marketplace/profile/"]');
      return {
        nom: vendeur?.textContent?.trim() || null,
        telephone: tel ? tel[0].trim() : null,
        courriel: (texte.match(/[\w.+-]+@[\w-]+\.[\w.]{2,}/) || [null])[0],
        description: texte.slice(0, 2000),
      };
    });
  } finally {
    await ctx.close().catch(() => {});
  }
}

export async function envoyerMessageFacebook(url: string, message: string) {
  const session = storage.getSession("facebook");
  if (!session?.cookies?.length) throw new Error("Session Facebook absente — ajoutez vos cookies.");

  const ctx = await newContext("facebook");
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await jitter(2000, 4000);

    const zone = page
      .locator('textarea[placeholder], div[contenteditable="true"], textarea')
      .first();
    await zone.waitFor({ timeout: 15000 });
    await zone.click();
    // On vide le message pre-rempli de Facebook
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Backspace");
    await zone.type(message, { delay: 30 + Math.random() * 50 });
    await jitter(1200, 2500);

    const envoi = page
      .locator('div[aria-label="Envoyer"], div[aria-label="Send"], button:has-text("Envoyer"), button[type="submit"]')
      .first();
    await envoi.click({ timeout: 10000 });
    await jitter(2500, 5000);

    storage.incrementDailySent("facebook");
    return { ok: true };
  } finally {
    await ctx.close().catch(() => {});
  }
}

export async function verifierReponsesFacebook(): Promise<{ nom: string; extrait: string }[]> {
  const session = storage.getSession("facebook");
  if (!session?.cookies?.length) throw new Error("Session Facebook absente.");
  const ctx = await newContext("facebook");
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}/marketplace/inbox`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await jitter(2500, 4500);
    return await page.evaluate(() => {
      const out: any[] = [];
      document.querySelectorAll('[role="row"], [role="gridcell"] a').forEach((el) => {
        const t = (el.textContent || "").trim().replace(/\s+/g, " ");
        if (t.length > 10) out.push({ nom: t.slice(0, 60), extrait: t.slice(0, 300) });
      });
      return out;
    });
  } finally {
    await ctx.close().catch(() => {});
  }
}
