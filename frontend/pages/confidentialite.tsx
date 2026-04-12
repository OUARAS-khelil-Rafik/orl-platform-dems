export default function ConfidentialitePage() {
  return (
    <div className="flex-1 bg-slate-50 py-16">
      <div className="container mx-auto px-4 max-w-4xl">
        <h1 className="text-3xl font-bold text-slate-900 mb-6">Politique de confidentialite</h1>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 text-slate-700">
          <p>
            Nous collectons uniquement les donnees necessaires au fonctionnement de la plateforme (compte, acces, achats).
          </p>
          <p>
            Les informations ne sont pas revendues et sont utilisees exclusivement pour fournir le service DEMS ENT.
          </p>
          <p>
            Vous pouvez demander la suppression de votre compte et de vos donnees via l'administration ou en contactant le support.
          </p>
        </div>
      </div>
    </div>
  );
}
