import { Users, Store, Facebook, MessageSquare, CornerDownLeft } from "lucide-react";

const CASES = [
  { cle: "total", label: "Total contacts", Icone: Users },
  { cle: "kijiji", label: "Kijiji", Icone: Store },
  { cle: "facebook", label: "Facebook", Icone: Facebook },
  { cle: "contactes", label: "Contactés", Icone: MessageSquare },
  { cle: "reponses", label: "Réponses", Icone: CornerDownLeft },
];

export default function Stats({ stats, chargement }: { stats: any; chargement: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
      {CASES.map(({ cle, label, Icone }) => (
        <div key={cle} className="carte px-5 py-4">
          <div className="flex items-start justify-between">
            <span className="text-sm text-marine-600/80">{label}</span>
            <Icone size={16} className="text-marine-600/40" />
          </div>
          <div className="mt-2 text-3xl font-bold text-marine-900">
            {chargement ? "—" : (stats?.[cle] ?? 0)}
          </div>
        </div>
      ))}
    </div>
  );
}
