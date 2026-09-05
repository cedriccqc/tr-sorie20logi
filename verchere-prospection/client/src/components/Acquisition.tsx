import { useEffect, useRef, useState } from "react";
import { Play, Square, Loader2 } from "lucide-react";
import { api } from "../api";

export default function Acquisition({ config, onFini }: { config: any; onFini: () => void }) {
  const [plateforme, setPlateforme] = useState<"kijiji" | "facebook">("kijiji");
  const [motsCles, setMotsCles] = useState("");
  const [villes, setVilles] = useState<string[]>(["laval"]);
  const [categorie, setCategorie] = useState("commercial");
  const [strict, setStrict] = useState(true);
  const [pages, setPages] = useState(2);
  const [job, setJob] = useState<any>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const timer = useRef<any>(null);

  useEffect(() => {
    if (config?.motsClesDefaut && !motsCles) setMotsCles(config.motsClesDefaut.join("\n"));
  }, [config]);

  useEffect(() => () => clearInterval(timer.current), []);

  const listeMots = motsCles.split("\n").map((s) => s.trim()).filter(Boolean);
  const enCours = job?.status === "running";

  async function lancer() {
    setErreur(null);
    try {
      const j = await api.scraper(plateforme, {
        motsCles: listeMots,
        villes,
        categorie,
        filtreVilleStrict: strict,
        pagesParRecherche: pages,
      });
      setJob(j);
      clearInterval(timer.current);
      timer.current = setInterval(async () => {
        try {
          const maj = await api.job(j.id);
          setJob(maj);
          if (maj.status !== "running") {
            clearInterval(timer.current);
            onFini();
          }
        } catch {
          clearInterval(timer.current);
        }
      }, 2000);
    } catch (e: any) {
      setErreur(e.message);
    }
  }

  async function arreter() {
    if (job) await api.stopJob(job.id).catch(() => {});
  }

  function basculerVille(v: string) {
    setVilles((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  }

  const parRegion: Record<string, any[]> = {};
  (config?.villes || []).forEach((v: any) => {
    (parRegion[v.region] ||= []).push(v);
  });

  return (
    <section className="carte p-6">
      <h2 className="titre-section">Acquisition de contacts</h2>
      <p className="sous-titre mt-1">
        Lancer des recherches multi-mots-clés et multi-villes simultanément.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg bg-marine-50 p-1">
        {(["kijiji", "facebook"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPlateforme(p)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              plateforme === p ? "bg-white text-marine-900 shadow-sm" : "text-marine-600/70"
            }`}
          >
            {p === "kijiji" ? "Kijiji" : "Facebook Marketplace"}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <label className="text-sm font-medium">
            Mots-clés <span className="text-marine-600/60">(un par ligne)</span>
          </label>
          <textarea
            className="champ mt-2 h-40 resize-y font-mono text-[13px]"
            value={motsCles}
            onChange={(e) => setMotsCles(e.target.value)}
            placeholder={"local commercial à louer\nbâtisse commerciale\nimmeuble à revenus"}
          />
          <p className="mt-2 text-xs text-marine-600/70">
            {listeMots.length} terme(s) · {villes.length} ville(s) ·{" "}
            <strong>{listeMots.length * villes.length} recherches</strong>
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="etiquette">Catégorie</label>
              <select
                className="champ mt-1"
                value={categorie}
                onChange={(e) => setCategorie(e.target.value)}
              >
                {(config?.categories || []).map((c: any) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="etiquette">Pages par recherche</label>
              <input
                type="number"
                min={1}
                max={10}
                className="champ mt-1"
                value={pages}
                onChange={(e) => setPages(Number(e.target.value))}
              />
            </div>
          </div>

          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={strict} onChange={(e) => setStrict(e.target.checked)} />
            Filtrer par ville strictement (ignore les annonces hors de la ville cherchée)
          </label>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <span className="etiquette">
              Villes ({villes.length}/{config?.villes?.length || 0} sélectionnées)
            </span>
            <button
              className="text-xs font-medium text-marine-600 hover:underline"
              onClick={() =>
                setVilles(
                  villes.length === (config?.villes?.length || 0)
                    ? []
                    : (config?.villes || []).map((v: any) => v.value),
                )
              }
            >
              {villes.length === (config?.villes?.length || 0) ? "Tout désélectionner" : "Tout sélectionner"}
            </button>
          </div>

          <div className="mt-2 max-h-72 space-y-3 overflow-y-auto rounded-lg border border-marine-100 p-3">
            {Object.entries(parRegion).map(([region, vs]) => (
              <div key={region}>
                <div className="text-xs font-semibold text-marine-600/60">{region}</div>
                <div className="mt-1 grid gap-1 sm:grid-cols-2">
                  {vs.map((v) => (
                    <label key={v.value} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={villes.includes(v.value)}
                        onChange={() => basculerVille(v.value)}
                      />
                      {v.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {enCours ? (
          <button className="btn-danger" onClick={arreter}>
            <Square size={15} /> Arrêter
          </button>
        ) : (
          <button className="btn-primaire" onClick={lancer} disabled={!listeMots.length || !villes.length}>
            <Play size={15} /> Lancer le scraping {plateforme === "kijiji" ? "Kijiji" : "Facebook"}
          </button>
        )}
        {enCours && (
          <span className="flex items-center gap-2 text-sm text-marine-600">
            <Loader2 size={15} className="animate-spin" />
            {job.progression}/{job.total} recherches · {job.ajoutes} nouveaux contacts
          </span>
        )}
      </div>

      {erreur && <p className="mt-3 text-sm text-rose-600">{erreur}</p>}

      {job && (
        <div className="mt-4 rounded-lg bg-marine-900 p-3 font-mono text-[12px] leading-relaxed text-marine-100">
          <div className="mb-1 text-marine-200/60">
            Job {job.id} — {job.status}
            {job.erreur ? ` — ${job.erreur}` : ""}
          </div>
          <div className="max-h-48 overflow-y-auto whitespace-pre-wrap">
            {(job.logs || []).slice(-60).join("\n") || "…"}
          </div>
        </div>
      )}
    </section>
  );
}
