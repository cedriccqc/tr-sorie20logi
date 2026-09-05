import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { storage } from "./storage.js";

let browser: Browser | null = null;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

export async function getBrowser(): Promise<Browser> {
  if (browser && browser.isConnected()) return browser;
  try {
    browser = await lancer();
  } catch (e) {
    const m = (e as Error).message;
    if (/Executable doesn't exist|browserType.launch/i.test(m)) {
      throw new Error(
        "Chromium introuvable. Lancez « npx playwright install --with-deps chromium » dans le shell, " +
          "ou définissez CHROMIUM_PATH vers un Chromium existant. (détail : " +
          m.split("\n")[0] +
          ")",
      );
    }
    throw e;
  }
  return browser;
}

async function lancer(): Promise<Browser> {
  return chromium.launch({
    headless: !storage.getModeVisible(),
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
    ],
  });
}

export async function newContext(
  plateforme?: "kijiji" | "facebook",
): Promise<BrowserContext> {
  const b = await getBrowser();
  const ctx = await b.newContext({
    userAgent: UA,
    locale: "fr-CA",
    timezoneId: "America/Toronto",
    viewport: { width: 1366, height: 900 },
    extraHTTPHeaders: { "Accept-Language": "fr-CA,fr;q=0.9,en;q=0.6" },
  });
  // Masque quelques signaux d'automatisation
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  if (plateforme) {
    const session = storage.getSession(plateforme);
    if (session?.cookies?.length) {
      const { appliques, rejetes } = await appliquerCookies(ctx, session.cookies as any[]);
      if (appliques === 0) {
        console.warn(
          `[browser] AUCUN témoin ${plateforme} appliqué sur ${session.cookies.length} — session anonyme.`,
        );
      } else if (rejetes > 0) {
        console.warn(`[browser] ${plateforme} : ${appliques} témoins appliqués, ${rejetes} rejetés.`);
      }
    }
  }
  return ctx;
}

/**
 * Convertit un temoin au format Playwright.
 * Les extensions de navigateur (Cookie Editor, EditThisCookie) exportent
 * `expirationDate`, `hostOnly`, `storeId`, et des `sameSite` comme
 * "no_restriction" ou "lax" — que Playwright refuse.
 */
export function normaliserCookie(brut: any, domaineDefaut?: string): any | null {
  if (!brut?.name || brut.value == null) return null;

  const sameSiteBrut = String(brut.sameSite ?? "").toLowerCase();
  const sameSite =
    sameSiteBrut === "no_restriction" || sameSiteBrut === "none"
      ? "None"
      : sameSiteBrut === "strict"
        ? "Strict"
        : "Lax"; // couvre "lax", "unspecified", vide

  const expires =
    typeof brut.expires === "number"
      ? brut.expires
      : typeof brut.expirationDate === "number"
        ? Math.floor(brut.expirationDate)
        : -1;

  return {
    name: String(brut.name),
    value: String(brut.value),
    domain: brut.domain || domaineDefaut || undefined,
    path: brut.path || "/",
    expires: brut.session ? -1 : expires,
    httpOnly: !!brut.httpOnly,
    // Playwright exige secure=true quand sameSite vaut None.
    secure: sameSite === "None" ? true : !!brut.secure,
    sameSite,
  };
}

/**
 * Applique les temoins UN PAR UN : un seul temoin malformé ne doit pas faire
 * echouer tout le lot (c'est ce qui rendait la session anonyme).
 */
export async function appliquerCookies(ctx: BrowserContext, bruts: any[], domaineDefaut?: string) {
  let appliques = 0;
  let rejetes = 0;
  const propres = bruts.map((c) => normaliserCookie(c, domaineDefaut)).filter(Boolean) as any[];

  // Tentative groupee d'abord (rapide), puis repli individuel.
  try {
    await ctx.addCookies(propres);
    return { appliques: propres.length, rejetes: bruts.length - propres.length };
  } catch {
    for (const c of propres) {
      try {
        await ctx.addCookies([c]);
        appliques++;
      } catch {
        rejetes++;
      }
    }
  }
  return { appliques, rejetes: rejetes + (bruts.length - propres.length) };
}

/**
 * Navigateur TOUJOURS visible, independant de celui mis en cache.
 * Sert a la connexion manuelle : l'utilisateur s'identifie lui-meme.
 */
export async function navigateurVisible() {
  const b = await chromium.launch({
    headless: false,
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"],
  });
  const ctx = await b.newContext({
    userAgent: UA,
    locale: "fr-CA",
    timezoneId: "America/Toronto",
    viewport: { width: 1280, height: 900 },
    extraHTTPHeaders: { "Accept-Language": "fr-CA,fr;q=0.9,en;q=0.6" },
  });
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  return { navigateur: b, contexte: ctx };
}

/** Pause aleatoire (ms) — evite un rythme robotique. */
export function jitter(minMs: number, maxMs: number) {
  const ms = Math.floor(minMs + Math.random() * (maxMs - minMs));
  return new Promise((r) => setTimeout(r, ms));
}

export async function scrollProgressif(page: Page, tours = 6) {
  for (let i = 0; i < tours; i++) {
    await page.mouse.wheel(0, 1200 + Math.random() * 800);
    await jitter(400, 1100);
  }
}

export async function closeBrowser() {
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
  }
}
