'use client';

import { useState } from 'react';
import { db, collection, addDoc, getDocs, deleteDoc, doc } from '@/lib/local-data';
import { Loader2, Database, Trash2 } from 'lucide-react';

export function SeedDataButton() {
  const [isSeeding, setIsSeeding] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const pedagogicalCollections = ['videos', 'clinicalCases', 'qcms', 'openQuestions', 'diagrams'] as const;

  const clearData = async () => {
    if (!confirm('Voulez-vous vraiment SUPPRIMER TOUTES les données (vidéos, cas, QCM, questions ouvertes, schémas, paiements) ?')) return;
    
    setIsClearing(true);
    try {
      const collections = [...pedagogicalCollections, 'payments'];
      for (const collName of collections) {
        const snap = await getDocs(collection(db, collName));
        for (const d of snap.docs) {
          await deleteDoc(doc(db, collName, d.id));
        }
      }
      alert('Données supprimées.');
      window.location.reload();
    } catch (error) {
      console.error('Error clearing data:', error);
      alert('Erreur lors de la suppression.');
    } finally {
      setIsClearing(false);
    }
  };

  const seedData = async () => {
    if (!confirm("Cette action va SUPPRIMER les contenus pédagogiques existants (vidéos, cas, QCM, questions ouvertes, schémas) puis recréer des données de test. Continuer ?")) return;
    
    setIsSeeding(true);
    try {
      // 0. Clear existing pedagogical content (but leave paiements intacts)
      for (const collName of pedagogicalCollections) {
        const snap = await getDocs(collection(db, collName));
        for (const d of snap.docs) {
          await deleteDoc(doc(db, collName, d.id));
        }
      }

      // 1. Seed Videos
      const now = new Date().toISOString();
      const videos = [
        {
          title: "Anatomie de l'oreille moyenne",
          description: "Exploration des structures de l'oreille moyenne : chaîne ossiculaire, fenêtre ovale, trompe d'Eustache.",
          url: "https://www.youtube.com/watch?v=2G8Zp_S40p4",
          subspecialty: "otologie",
          section: "anatomie",
          isFreeDemo: true,
          price: 0,
          packId: "otologie",
          createdAt: now
        },
        {
          title: "Examen clinique de la cloison nasale",
          description: "Techniques de rhinoscopie et d'endoscopie pour évaluer les déviations septales et l'obstruction nasale.",
          url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          subspecialty: "rhinologie",
          section: "pathologie",
          isFreeDemo: false,
          price: 2500,
          packId: "rhinologie",
          createdAt: now
        },
        {
          title: "Laryngoscopie indirecte et directe",
          description: "Comparaison des techniques de visualisation du larynx et des cordes vocales en pratique courante.",
          url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          subspecialty: "laryngologie",
          section: "anatomie",
          isFreeDemo: false,
          price: 3000,
          packId: "laryngologie",
          createdAt: now
        }
      ];

      const videoRefs: string[] = [];
      for (const video of videos) {
        const docRef = await addDoc(collection(db, 'videos'), video);
        videoRefs.push(docRef.id);
      }

      // 2. Seed Clinical Cases (un cas par vidéo)
      const clinicalCases = [
        {
          videoId: videoRefs[0],
          title: "Otite moyenne chronique simple",
          description:
            "Patient présentant depuis plusieurs mois une hypoacousie unilatérale gauche avec otorrhée peu fétide, tableau typique d'otite moyenne chronique simple sans signe de gravité.",
          patientHistory:
            "Patient de 35 ans consultant pour une hypoacousie unilatérale gauche évoluant depuis 6 mois, avec otorrhée intermittente non fétide.",
          clinicalExamination:
            "Otoscopie : perforation tympanique centrale, muqueuse de la caisse congestive sans image de cholestéatome.",
          additionalTests:
            "Audiométrie tonale : surdité de transmission 35 dB à gauche. Scanner des rochers : comblement partiel de la caisse sans lyse osseuse.",
          diagnosis: "Otite moyenne chronique simple (non cholestéatomateuse).",
          treatment:
            "Traitement médical initial (gouttes auriculaires, éviction de l'eau). Discussion d'une tympanoplastie type I après assèchement.",
          discussion:
            "Le diagnostic différentiel avec une otite cholestéatomateuse repose sur l'examen otoscopique et l'imagerie.",
          images: [
            "https://picsum.photos/seed/omc1/800/600",
            "https://picsum.photos/seed/omc2/800/600"
          ],
          reference: "Cours d'otologie DEMS – chapitre Otite moyenne chronique.",
          questions: [
            {
              id: "case1-q1",
              kind: "qcm",
              prompt: "Quels éléments cliniques orientent vers une otite moyenne chronique simple ?",
              options: [
                "Otorrhée non fétide, perforation centrale, pas de polype",
                "Otorrhée très fétide, polype dans le CAE",
                "Otorrhée sanglante et paralysie faciale",
                "Otalgi e très intense et fièvre élevée"
              ],
              correctOptionIndexes: [0],
              explanation:
                "L'otite chronique simple associe classiquement une perforation centrale, une otorrhée peu fétide et l'absence de signes de gravité.",
            },
            {
              id: "case1-q2",
              kind: "select",
              prompt: "Quel examen complémentaire est prioritaire pour évaluer la fonction auditive ?",
              options: [
                "Audiométrie tonale",
                "IRM cérébrale",
                "Scanner cérébral sans injection",
                "Ponction lombaire"
              ],
              correctOptionIndex: 0,
              explanation: "L'audiométrie tonale permet de quantifier la surdité de transmission et de suivre l'évolution.",
            },
            {
              id: "case1-q3",
              kind: "open",
              prompt: "Quels sont les objectifs principaux d'une tympanoplastie dans ce contexte ?",
              answer:
                "Assécher l'oreille, restaurer la barrière tympanique et améliorer la fonction auditive en rétablissant la chaîne ossiculaire si nécessaire.",
            },
          ],
          createdAt: now,
        },
        {
          videoId: videoRefs[1],
          title: "Déviation de la cloison nasale symptomatique",
          description:
            "Jeune adulte se plaignant d'une obstruction nasale chronique gênante, en rapport avec une déviation septale isolée mise en évidence à l'examen clinique.",
          patientHistory:
            "Patient de 28 ans se plaignant d'obstruction nasale chronique, majorée à l'effort, sans épistaxis ni céphalées importantes.",
          clinicalExamination:
            "Rhinoscopie antérieure : déviation marquée de la cloison vers la droite, cornet inférieur controlatéral hypertrophié.",
          additionalTests:
            "Endoscopie nasale : pas de polype, muqueuse légèrement inflammatoire. Aucun signe de tumeur.",
          diagnosis: "Rhinopathie obstructive par déviation septale isolée.",
          treatment:
            "Traitement médical initial par lavages et corticoïdes locaux, discussion d'une septoplastie si gêne fonctionnelle persistante.",
          discussion:
            "La corrélation entre la gêne décrite par le patient et les anomalies anatomiques est essentielle avant d'indiquer une chirurgie.",
          images: ["https://picsum.photos/seed/rhino1/800/600"],
          reference: "Recommandations de bonne pratique – prise en charge de l'obstruction nasale.",
          questions: [
            {
              id: "case2-q1",
              kind: "qcm",
              prompt: "Quels symptômes orientent vers une indication de septoplastie ?",
              options: [
                "Obstruction nasale chronique invalidante",
                "Rhinites saisonnières isolées",
                "Rhinorrhée claire sans obstruction",
                "Éternuements isolés sans gêne respiratoire"
              ],
              correctOptionIndexes: [0],
              explanation: "La gêne respiratoire chronique restant malgré un traitement médical bien conduit est un argument majeur.",
            },
          ],
          createdAt: now,
        },
        {
          videoId: videoRefs[2],
          title: "Dysphonie et lésion bénigne des cordes vocales",
          description:
            "Enseignant avec dysphonie progressive liée à des nodules bénins des cordes vocales sur surmenage vocal, sans signe de lésion maligne.",
          patientHistory:
            "Enseignant de 45 ans présentant une dysphonie progressive depuis plusieurs mois, majorée en fin de journée.",
          clinicalExamination:
            "Laryngoscopie : nodule blanchâtre bilatéral du tiers moyen des cordes vocales, mobilité conservée.",
          additionalTests:
            "Stroboscopie : perturbation modérée de l'ondulation muqueuse, lésion compatible avec des nodules de chanteur.",
          diagnosis: "Nodules bénins des cordes vocales sur surmenage vocal.",
          treatment:
            "Rééducation orthophonique vocale en première intention, mesures d'hygiène vocale ; chirurgie uniquement en cas d'échec.",
          discussion:
            "L'indication chirurgicale doit être posée avec prudence après un essai bien conduit de rééducation vocale.",
          images: ["https://picsum.photos/seed/laryn1/800/600"],
          reference: "Cours de laryngologie DEMS – dysphonies fonctionnelles.",
          questions: [
            {
              id: "case3-q1",
              kind: "select",
              prompt: "Quel est le traitement de première intention ?",
              options: [
                "Rééducation orthophonique",
                "Laryngectomie totale",
                "Chimiothérapie",
                "Corticothérapie générale prolongée"
              ],
              correctOptionIndex: 0,
              explanation: "Les nodules bénins relèvent d'abord d'une prise en charge fonctionnelle et d'une hygiène vocale.",
            },
            {
              id: "case3-q2",
              kind: "open",
              prompt: "Citez deux règles d'hygiène vocale à conseiller à ce patient.",
              answer: "Éviter de forcer sur la voix, limiter les environnements bruyants, s'hydrater régulièrement, éviter le tabac.",
            },
          ],
          createdAt: now,
        },
      ];

      for (const clinicalCase of clinicalCases) {
        await addDoc(collection(db, 'clinicalCases'), clinicalCase as any);
      }

      // 3. Seed QCMs (modèle compatible avec mode et correctOptionIndexes)
      const qcms = [
        {
          videoId: videoRefs[0],
          question: "Quel est l'osselet qui s'articule directement avec la fenêtre ovale ?",
          options: [
            "Le marteau (Malleus)",
            "L'enclume (Incus)",
            "L'étrier (Stapes)",
            "Le processus lenticulaire"
          ],
          mode: 'single' as const,
          correctOptionIndexes: [2],
          correctOptionIndex: 2,
          explanation:
            "L'étrier est le dernier osselet de la chaîne ; sa platine s'insère dans la fenêtre ovale pour transmettre les vibrations.",
          images: ["https://picsum.photos/seed/qcm-ear/800/600"],
          createdAt: now,
        },
        {
          videoId: videoRefs[1],
          question: "Quels éléments font partie de l'examen clinique de base de la cloison nasale ?",
          options: [
            "Rhinoscopie antérieure",
            "Inspection de la cavité buccale",
            "Palpation des sinus faciaux",
            "Examen otoscopique"
          ],
          mode: 'multiple' as const,
          correctOptionIndexes: [0, 2],
          correctOptionIndex: 0,
          explanation:
            "La rhinoscopie et la palpation des sinus s'intègrent à l'examen de la cloison et de la perméabilité nasale.",
          images: [],
          createdAt: now,
        },
        {
          videoId: videoRefs[2],
          question: "Quel symptôme doit faire évoquer un nodule bénin des cordes vocales chez l'enseignant ?",
          options: [
            "Dysphonie progressive sans dyspnée",
            "Dysphagie aiguë douloureuse",
            "Otalgie réflexe intense",
            "Hémoptysie massive"
          ],
          mode: 'single' as const,
          correctOptionIndexes: [0],
          correctOptionIndex: 0,
          explanation:
            "La dysphonie chronique d'effort chez un professionnel de la voix est typique des nodules bénins.",
          images: ["https://picsum.photos/seed/qcm-voice/800/600"],
          createdAt: now,
        },
      ];

      for (const qcm of qcms) {
        await addDoc(collection(db, 'qcms'), qcm as any);
      }

      // 4. Seed Open Questions (une ou plusieurs questions ouvertes par vidéo)
      const openQuestions = [
        {
          videoId: videoRefs[0],
          question: "Expliquez le rôle fonctionnel de la chaîne ossiculaire dans la transmission du son.",
          answer:
            "La chaîne ossiculaire (marteau, enclume, étrier) transmet et amplifie les vibrations du tympan vers la fenêtre ovale, permettant le passage de l'onde mécanique vers l'oreille interne.",
          reference: "Cours d'anatomie ORL – oreille moyenne.",
          createdAt: now,
        },
        {
          videoId: videoRefs[1],
          question: "Quels critères cliniques vous font proposer une septoplastie chez un patient obstructif ?",
          answer:
            "La décision repose sur une obstruction nasale chronique invalidante, corrélée à une déviation septale objectivée à l'examen, et persistante malgré un traitement médical bien conduit.",
          reference: "Recommandations ORL sur l'obstruction nasale chronique.",
          createdAt: now,
        },
        {
          videoId: videoRefs[2],
          question: "Pourquoi la rééducation vocale est-elle prioritaire avant toute chirurgie des nodules bénins ?",
          answer:
            "Parce qu'elle corrige les comportements vocaux à risque, réduit l'inflammation phonotraumatique et permet souvent une amélioration clinique sans geste invasif.",
          reference: "Cours de laryngologie DEMS – prise en charge de la dysphonie fonctionnelle.",
          createdAt: now,
        },
      ];

      for (const openQuestion of openQuestions) {
        await addDoc(collection(db, 'openQuestions'), openQuestion as any);
      }

      // 5. Seed Diagrams (un schéma par vidéo)
      const diagrams = [
        {
          videoId: videoRefs[0],
          title: "Schéma de l'oreille moyenne",
          imageUrl: "https://picsum.photos/seed/anatomy-ear/1200/800",
          markers: [
            { number: 1, x: 30, y: 40, label: "Membrane tympanique", description: "Sépare l'oreille externe de l'oreille moyenne." },
            { number: 2, x: 50, y: 35, label: "Chaîne ossiculaire", description: "Transmet les vibrations au labyrinthe." },
            { number: 3, x: 70, y: 60, label: "Trompe d'Eustache", description: "Équilibre les pressions de part et d'autre du tympan." }
          ],
          createdAt: now,
        },
        {
          videoId: videoRefs[1],
          title: "Schéma de la cloison nasale",
          imageUrl: "https://picsum.photos/seed/anatomy-nose/1200/800",
          markers: [
            { number: 1, x: 35, y: 45, label: "Cloison nasale", description: "Structure ostéo-cartilagineuse séparant les fosses nasales." },
            { number: 2, x: 60, y: 50, label: "Cornet inférieur", description: "Contribue à la régulation du flux aérien et à l'humidification." }
          ],
          createdAt: now,
        },
        {
          videoId: videoRefs[2],
          title: "Schéma des cordes vocales",
          imageUrl: "https://picsum.photos/seed/anatomy-larynx/1200/800",
          markers: [
            { number: 1, x: 40, y: 40, label: "Cordes vocales", description: "Structures vibratiles responsables de la phonation." },
            { number: 2, x: 65, y: 55, label: "Nodules bénins", description: "Épaississements symétriques liés au surmenage vocal." }
          ],
          createdAt: now,
        },
      ];

      for (const diagram of diagrams) {
        await addDoc(collection(db, 'diagrams'), diagram as any);
      }

      alert('Données de test ajoutées avec succès !');
      window.location.reload();
    } catch (error) {
      console.error('Error seeding data:', error);
      alert('Erreur lors de l\'ajout des données.');
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={clearData}
        disabled={isClearing || isSeeding}
        className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-xl font-medium hover:bg-red-700 transition-colors disabled:opacity-70"
      >
        {isClearing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
        Vider la base
      </button>
      <button
        onClick={seedData}
        disabled={isSeeding || isClearing}
        className="flex items-center gap-2 bg-amber-600 text-white px-4 py-2 rounded-xl font-medium hover:bg-amber-700 transition-colors disabled:opacity-70"
      >
        {isSeeding ? <Loader2 className="w-5 h-5 animate-spin" /> : <Database className="w-5 h-5" />}
        Régénérer contenu pédagogique (test)
      </button>
    </div>
  );
}
