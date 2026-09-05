// Installe Chromium pour Playwright si absent (ignore si deja fourni par l'hote).
import { execSync } from "child_process";

if (process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD === "1" || process.env.CHROMIUM_PATH) {
  console.log("[verchere] Chromium fourni par l'environnement — installation ignorée.");
  process.exit(0);
}

try {
  execSync("npx playwright install chromium", { stdio: "inherit" });
} catch (e) {
  console.warn(
    "[verchere] Installation de Chromium impossible. Lancez « npx playwright install chromium » manuellement avant de scraper.",
  );
}
