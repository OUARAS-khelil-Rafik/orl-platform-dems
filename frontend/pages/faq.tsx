export default function FaqPage() {
  const faqs = [
    {
      q: 'Comment acceder aux videos payantes ?',
      a: 'Vous pouvez acheter une video, un pack de specialite, ou souscrire a un abonnement VIP Plus.',
    },
    {
      q: 'Quand mon acces est-il active ?',
      a: 'Apres verification du paiement par un administrateur, votre acces est active.',
    },
    {
      q: 'Puis-je contacter le support ?',
      a: 'Oui, via la page Contactez-nous pour toute demande technique ou administrative.',
    },
  ];

  return (
    <div className="flex-1 bg-slate-50 py-16">
      <div className="container mx-auto px-4 max-w-4xl">
        <h1 className="text-3xl font-bold text-slate-900 mb-8">FAQ</h1>

        <div className="space-y-4">
          {faqs.map((item) => (
            <div key={item.q} className="bg-white border border-slate-200 rounded-2xl p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-2">{item.q}</h2>
              <p className="text-slate-600">{item.a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
