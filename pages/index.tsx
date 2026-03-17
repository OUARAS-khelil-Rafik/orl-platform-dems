'use client';

import { motion } from 'motion/react';
import Link from 'next/link';
import { ArrowRight, BookOpen, PlayCircle, FileText, CheckCircle2, Stethoscope, Brain, Activity } from 'lucide-react';
import Image from 'next/image';

export default function HomePage() {
  return (
    <div className="flex flex-col w-full">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-slate-900 text-white pt-24 pb-32">
        <div className="absolute inset-0 z-0">
          <Image
            src="https://picsum.photos/seed/surgery/1920/1080?blur=2"
            alt="Medical Background"
            fill
            className="object-cover opacity-20"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-900 via-slate-900/90 to-transparent" />
        </div>
        
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-3xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-medical-500/20 text-medical-300 border border-medical-500/30 mb-6 text-sm font-medium"
            >
              <Stethoscope className="h-4 w-4" />
              <span>Préparation au Concours DEMS ORL</span>
            </motion.div>
            
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-5xl md:text-7xl font-bold tracking-tight mb-6 leading-tight"
            >
              L&apos;excellence en <span className="text-transparent bg-clip-text bg-gradient-to-r from-medical-400 to-accent-400">Otorhinolaryngologie</span>
            </motion.h1>
            
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-lg md:text-xl text-slate-300 mb-10 max-w-2xl leading-relaxed"
            >
              Une plateforme d&apos;apprentissage complète conçue par des experts pour les médecins résidents. Vidéos, cas cliniques, QCM et schémas anatomiques pour réussir votre DEMS.
            </motion.p>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex flex-col sm:flex-row gap-4"
            >
              <Link 
                href="/pricing" 
                className="inline-flex items-center justify-center gap-2 bg-medical-600 text-white px-8 py-4 rounded-full text-lg font-medium hover:bg-medical-500 transition-all shadow-lg shadow-medical-900/20 hover:shadow-medical-600/40"
              >
                Découvrir nos offres
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link 
                href="/specialties/otologie" 
                className="inline-flex items-center justify-center gap-2 bg-white/10 text-white border border-white/20 px-8 py-4 rounded-full text-lg font-medium hover:bg-white/20 transition-all backdrop-blur-sm"
              >
                <PlayCircle className="h-5 w-5" />
                Voir une démo gratuite
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Subspecialties Section */}
      <section className="py-24 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Trois Piliers d&apos;Apprentissage</h2>
            <p className="text-lg text-slate-600">Explorez nos modules spécialisés couvrant l&apos;intégralité du programme ORL, divisés en Anatomie et Pathologie.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                title: 'Otologie',
                desc: 'Anatomie de l\'oreille, audiométrie, pathologies de l\'oreille moyenne et interne, chirurgie otologique.',
                icon: Activity,
                color: 'from-blue-500 to-cyan-500',
                bg: 'bg-blue-50',
                href: '/specialties/otologie'
              },
              {
                title: 'Rhinologie & Sinusologie',
                desc: 'Fosses nasales, sinus de la face, physiologie olfactive, pathologies inflammatoires et tumorales.',
                icon: Brain,
                color: 'from-medical-500 to-emerald-500',
                bg: 'bg-medical-50',
                href: '/specialties/rhinologie'
              },
              {
                title: 'Laryngologie & Cervicologie',
                desc: 'Anatomie du cou, larynx, pharynx, pathologies vocales, déglutition et oncologie cervico-faciale.',
                icon: Stethoscope,
                color: 'from-violet-500 to-purple-500',
                bg: 'bg-violet-50',
                href: '/specialties/laryngologie'
              }
            ].map((spec, i) => (
              <motion.div
                key={spec.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="group relative bg-white rounded-3xl p-8 border border-slate-200 shadow-sm hover:shadow-xl transition-all overflow-hidden"
              >
                <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${spec.color} opacity-0 group-hover:opacity-100 transition-opacity`} />
                <div className={`w-14 h-14 rounded-2xl ${spec.bg} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                  <spec.icon className="h-7 w-7 text-slate-700" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-3">{spec.title}</h3>
                <p className="text-slate-600 mb-8 leading-relaxed">{spec.desc}</p>
                <Link 
                  href={spec.href}
                  className="inline-flex items-center gap-2 text-medical-600 font-semibold hover:text-medical-700 transition-colors"
                >
                  Explorer le module <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-slate-50 border-y border-slate-200">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6">Une pédagogie interactive et complète</h2>
              <p className="text-lg text-slate-600 mb-8">Chaque vidéo de cours est accompagnée d'extensions pédagogiques pour valider vos acquis et vous préparer aux conditions réelles de l'examen.</p>
              
              <div className="space-y-6">
                {[
                  { title: 'Vidéos Haute Définition', desc: 'Cours magistraux et démonstrations chirurgicales.', icon: PlayCircle },
                  { title: 'Cas Cliniques (Format SFORL)', desc: 'Mises en situation réelles avec dossiers progressifs.', icon: FileText },
                  { title: 'QCM d\'Évaluation', desc: 'Testez vos connaissances après chaque module.', icon: CheckCircle2 },
                  { title: 'Schémas Anatomiques & Radio', desc: 'Imagerie médicale et schémas interactifs numérotés.', icon: BookOpen },
                ].map((feature, i) => (
                  <motion.div 
                    key={feature.title}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: i * 0.1 }}
                    className="flex gap-4"
                  >
                    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                      <feature.icon className="h-6 w-6 text-medical-600" />
                    </div>
                    <div>
                      <h4 className="text-xl font-bold text-slate-900 mb-1">{feature.title}</h4>
                      <p className="text-slate-600">{feature.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="aspect-square md:aspect-[4/3] rounded-3xl overflow-hidden shadow-2xl relative">
                <Image
                  src="https://picsum.photos/seed/doctor/800/600"
                  alt="Doctor studying"
                  fill
                  className="object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent flex items-end p-8">
                  <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 text-white w-full">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 rounded-full bg-medical-500 flex items-center justify-center">
                        <PlayCircle className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <p className="font-semibold">Anatomie de l'Oreille Moyenne</p>
                        <p className="text-sm text-slate-300">Module Otologie • 45 min</p>
                      </div>
                    </div>
                    <div className="w-full bg-white/20 rounded-full h-2">
                      <div className="bg-medical-400 h-2 rounded-full w-2/3" />
                    </div>
                  </div>
                </div>
              </div>
              {/* Decorative elements */}
              <div className="absolute -top-6 -right-6 w-24 h-24 bg-accent-100 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob" />
              <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-medical-100 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-2000" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
