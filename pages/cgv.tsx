export default function CgvPage() {
  return (
    <div className="flex-1 bg-slate-50 py-16">
      <div className="container mx-auto px-4 max-w-4xl">
        <h1 className="text-3xl font-bold text-slate-900 mb-6">Conditions Generales de Vente (CGV)</h1>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 text-slate-700">
          <p>
            Les contenus proposes sur DEMS ENT sont destines a un usage pedagogique personnel.
          </p>
          <p>
            Toute commande est consideree comme definitive apres validation du paiement et verification administrative.
          </p>
          <p>
            L'acces aux contenus depend du type d'achat effectue (video, pack, abonnement) et de la duree de validite associee.
          </p>
          <p>
            En cas de question, merci de contacter le support via la page Contactez-nous.
          </p>
        </div>
      </div>
    </div>
  );
}
