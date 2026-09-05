const base = "/api";

async function req(chemin: string, options: RequestInit = {}) {
  const r = await fetch(base + chemin, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const texte = await r.text();
  let data: any = null;
  try {
    data = texte ? JSON.parse(texte) : null;
  } catch {
    data = texte;
  }
  if (!r.ok) throw new Error(data?.erreur || `Erreur ${r.status}`);
  return data;
}

export const api = {
  config: () => req("/config"),
  stats: () => req("/stats"),

  contacts: (params: Record<string, any> = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== "" && v !== "all") as any,
    ).toString();
    return req(`/contacts${q ? "?" + q : ""}`);
  },
  majContact: (id: number, patch: any) =>
    req(`/contacts/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  supprimerContact: (id: number) => req(`/contacts/${id}`, { method: "DELETE" }),
  marquerContactes: (ids: number[], message?: string) =>
    req("/contacts/mark-contacted", { method: "POST", body: JSON.stringify({ ids, message }) }),
  detailsContact: (id: number) => req(`/contacts/${id}/fetch-details`, { method: "POST" }),
  numerosManquants: (limite = 10) =>
    req("/contacts/fetch-missing-phones", { method: "POST", body: JSON.stringify({ limite }) }),

  scraper: (plateforme: "kijiji" | "facebook", corps: any) =>
    req(`/scrape/${plateforme}`, { method: "POST", body: JSON.stringify(corps) }),
  job: (id: string) => req(`/scrape/jobs/${id}`),
  jobs: () => req("/scrape/jobs"),
  stopJob: (id: string) => req(`/scrape/jobs/${id}/stop`, { method: "POST" }),

  verifierReponses: () => req("/check-replies", { method: "POST" }),

  templates: () => req("/templates"),
  creerTemplate: (t: any) => req("/templates", { method: "POST", body: JSON.stringify(t) }),
  majTemplate: (id: number, t: any) =>
    req(`/templates/${id}`, { method: "PUT", body: JSON.stringify(t) }),
  supprimerTemplate: (id: number) => req(`/templates/${id}`, { method: "DELETE" }),

  campagne: () => req("/campaign/status"),
  planCampagne: (corps: any) =>
    req("/campaign/plan", { method: "POST", body: JSON.stringify(corps) }),
  demarrerCampagne: (corps: any) =>
    req("/campaign/start", { method: "POST", body: JSON.stringify(corps) }),
  arreterCampagne: () => req("/campaign/stop", { method: "POST" }),
  limites: () => req("/campaign/limits"),
  majLimites: (l: any) => req("/campaign/limits", { method: "PUT", body: JSON.stringify(l) }),

  connexionKijiji: (email: string, motDePasse: string) =>
    req("/settings/kijiji-login", { method: "POST", body: JSON.stringify({ email, motDePasse }) }),
  connexionManuelle: () => req("/settings/kijiji-connexion-manuelle", { method: "POST" }),
  etatConnexionManuelle: () => req("/settings/kijiji-connexion-manuelle"),
  verifierSessionKijiji: () => req("/settings/kijiji-verifier", { method: "POST" }),
  cookiesKijiji: (cookies: string) =>
    req("/settings/kijiji-cookies", { method: "POST", body: JSON.stringify({ cookies }) }),
  cookiesFacebook: (cookies: string) =>
    req("/settings/facebook-cookies", { method: "POST", body: JSON.stringify({ cookies }) }),
  deconnexion: (p: string) => req(`/settings/${p}/deconnexion`, { method: "POST" }),
  modeVisible: (actif: boolean) =>
    req("/settings/mode-visible", { method: "POST", body: JSON.stringify({ actif }) }),
};
