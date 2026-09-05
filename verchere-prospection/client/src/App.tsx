import { useCallback, useEffect, useState } from "react";
import { LayoutGrid } from "lucide-react";
import { api } from "./api";
import Stats from "./components/Stats";
import Acquisition from "./components/Acquisition";
import Journal from "./components/Journal";
import Campagne from "./components/Campagne";
import Modeles from "./components/Modeles";
import Connexions from "./components/Connexions";
import EnvoiModal from "./components/EnvoiModal";

export default function App() {
  const [config, setConfig] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [selection, setSelection] = useState<number[]>([]);
  const [filtres, setFiltres] = useState<any>({ plateforme: "all", statut: "all", q: "" });
  const [modalOuvert, setModalOuvert] = useState(false);
  const [chargement, setChargement] = useState(true);

  const rafraichir = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([api.stats(), api.contacts(filtres)]);
      setStats(s);
      setContacts(c);
    } catch (e) {
      console.error(e);
    } finally {
      setChargement(false);
    }
  }, [filtres]);

  const rechargerConfig = useCallback(async () => {
    setConfig(await api.config());
  }, []);

  useEffect(() => {
    rechargerConfig();
  }, [rechargerConfig]);

  useEffect(() => {
    rafraichir();
    const t = setInterval(rafraichir, 15000);
    return () => clearInterval(t);
  }, [rafraichir]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-marine-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="text-laiton-400 text-lg leading-none">◆</span>
            <span className="text-xl font-bold tracking-[0.18em] text-marine-900">VERCHERE</span>
          </div>
          <span className="h-5 w-px bg-marine-200" />
          <div className="flex items-center gap-2 text-marine-600/80">
            <LayoutGrid size={16} />
            <span className="text-sm font-medium">Système de prospection</span>
          </div>
          <div className="ml-auto text-xs text-marine-600/60">
            Immobilier commercial · Complexes résidentiels
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        <Stats stats={stats} chargement={chargement} />

        <Acquisition config={config} onFini={rafraichir} />

        <Connexions config={config} onChange={rechargerConfig} />

        <Journal
          contacts={contacts}
          config={config}
          filtres={filtres}
          setFiltres={setFiltres}
          selection={selection}
          setSelection={setSelection}
          onRafraichir={rafraichir}
          onEnvoyer={() => setModalOuvert(true)}
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <Campagne onRafraichir={rafraichir} />
          <Modeles />
        </div>

        <footer className="pb-6 pt-2 text-center text-xs text-marine-600/50">
          Verchere — outil interne de prospection. Respectez les conditions d'utilisation des
          plateformes et la Loi 25 sur les renseignements personnels.
        </footer>
      </main>

      {modalOuvert && (
        <EnvoiModal
          selection={selection}
          contacts={contacts}
          onFermer={() => setModalOuvert(false)}
          onEnvoye={() => {
            setModalOuvert(false);
            rafraichir();
          }}
        />
      )}
    </div>
  );
}
