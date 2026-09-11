import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { router } from "./routes.ts";
import { APP_VERSION } from "../shared/types.js";
import { closeBrowser } from "./browser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || (process.env.NODE_ENV === "production" ? 5000 : 3001);

// Confidentialite : par defaut le serveur n'ecoute QUE sur cette machine
// (127.0.0.1). Personne d'autre sur le reseau Wi-Fi ne peut y acceder.
// Sur un hebergeur (Replit, VPS), il faut ecouter sur toutes les interfaces :
// c'est detecte automatiquement, ou forcable avec HOST=0.0.0.0.
const SUR_HEBERGEUR = !!(process.env.REPL_ID || process.env.REPLIT_DEV_DOMAIN || process.env.RENDER || process.env.FLY_APP_NAME);
const HOST = process.env.HOST || (SUR_HEBERGEUR ? "0.0.0.0" : "127.0.0.1");

app.use(express.json({ limit: "2mb" }));

// Journal : on tait les appels de rafraichissement de l'interface, sinon ils
// noient les vraies informations dans la console.
const ROUTES_SILENCIEUSES = [
  "/api/campaign/status",
  "/api/stats",
  "/api/contacts",
  "/api/config",
  "/api/templates",
  "/api/campaign/limits",
];

app.use((req, _res, next) => {
  if (
    req.path.startsWith("/api") &&
    !(req.method === "GET" && ROUTES_SILENCIEUSES.includes(req.path)) &&
    !/^\/api\/scrape\/jobs\//.test(req.path)
  ) {
    console.log(`${new Date().toLocaleTimeString("fr-CA")} — ${req.method} ${req.path}`);
  }
  next();
});

app.use("/api", router);

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "verchere-prospection", version: APP_VERSION }));

// Interface compilee (production)
const dist = path.resolve(__dirname, "../dist/public");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(dist, "index.html"));
  });
} else {
  app.get("/", (_req, res) =>
    res.send(
      "<h1>Verchere — Prospection</h1><p>Interface non compilée. Lancez <code>npm run build</code>, ou <code>npm run dev</code> pour le mode développement (interface sur le port 5173).</p>",
    ),
  );
}

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("[erreur]", err);
  res.status(500).json({ erreur: err?.message || "Erreur serveur" });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`Verchere Prospection v${APP_VERSION} — serveur sur http://localhost:${PORT}`);
  console.log(
    HOST === "127.0.0.1"
      ? "Accès restreint à cet ordinateur uniquement."
      : `Attention : le serveur écoute sur ${HOST} — accessible depuis le réseau.`,
  );
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    await closeBrowser();
    server.close(() => process.exit(0));
  });
}
