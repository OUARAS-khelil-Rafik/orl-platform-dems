'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { db, collection, query, where, getDocs } from '@/lib/local-data';
import { motion } from 'motion/react';
import { PlayCircle, Lock, Unlock, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/components/providers/auth-provider';
import { canAccessVideo } from '@/lib/access-control';
import { useCart } from '@/components/providers/cart-provider';
import Image from 'next/image';

interface Video {
  id: string;
  title: string;
  description: string;
  url: string;
  subspecialty: string;
  section: string;
  isFreeDemo: boolean;
  price: number;
  packId: string;
}

const SPECIALTIES = {
  otologie: { title: 'Otologie', desc: 'Anatomie et pathologie de l\'oreille', color: 'from-blue-500 to-cyan-500' },
  rhinologie: { title: 'Rhinologie & Sinusologie', desc: 'Fosses nasales et sinus', color: 'from-medical-500 to-emerald-500' },
  laryngologie: { title: 'Laryngologie & Cervicologie', desc: 'Larynx, pharynx et cou', color: 'from-violet-500 to-purple-500' },
};

export default function SpecialtyPage() {
  const router = useRouter();
  const slugParam = router.query.slug;
  const slug = typeof slugParam === 'string' ? slugParam : '';
  const specialtyInfo = SPECIALTIES[slug as keyof typeof SPECIALTIES];
  
  const { user, profile, loading: authLoading } = useAuth();
  const { addItem, items } = useCart();
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchVideos = async () => {
      if (!router.isReady || !slug) return;
      try {
        const q = query(collection(db, 'videos'), where('subspecialty', '==', slug));
        const querySnapshot = await getDocs(q);
        const fetchedVideos = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Video));
        setVideos(fetchedVideos);
      } catch (error) {
        console.error('Error fetching videos:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchVideos();
  }, [slug, router.isReady]);

  if (!router.isReady) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <div className="w-12 h-12 border-4 border-medical-200 border-t-medical-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!specialtyInfo) {
    return <div className="p-20 text-center text-2xl">Spécialité introuvable</div>;
  }

  const hasAccess = (video: Video) => canAccessVideo(video, profile);

  const packId = slug;
  const isPackInCart = !!(packId && items.some(item => item.id === packId));

  const anatomieVideos = videos.filter(v => v.section === 'anatomie');
  const pathologieVideos = videos.filter(v => v.section === 'pathologie');

  return (
    <div className="flex-1 bg-slate-50 pb-24">
      {/* Header */}
      <div className={`bg-gradient-to-r ${specialtyInfo.color} text-white py-20`}>
        <div className="container mx-auto px-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-4xl md:text-5xl font-bold mb-4"
            >
              {specialtyInfo.title}
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-xl opacity-90"
            >
              {specialtyInfo.desc}
            </motion.p>
          </div>
          
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            {profile?.role !== 'admin' && (
              <button
                onClick={() => {
                  if (!packId) return;
                  if (profile?.role === 'admin') {
                    return;
                  }
                  if (!user) {
                    router.push(`/sign-in?redirect=${encodeURIComponent(`/specialties/${slug}`)}`);
                    return;
                  }
                  if (isPackInCart) {
                    router.push('/checkout');
                  } else {
                    addItem({
                      id: packId,
                      title: `Pack ${specialtyInfo.title}`,
                      price: 5000, // Fixed price for now, ideally fetched from DB
                      type: 'pack',
                      imageUrl: ''
                    });
                  }
                }}
                className="bg-white text-slate-900 px-8 py-4 rounded-2xl font-bold text-lg hover:bg-slate-100 transition-colors shadow-xl"
              >
                {isPackInCart ? 'Aller au panier' : 'Acheter le pack complet (5000 DZD)'}
              </button>
            )}
          </motion.div>
        </div>
      </div>

      <div className="container mx-auto px-4 mt-12">
        {loading || authLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-12 h-12 border-4 border-medical-200 border-t-medical-600 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-16">
            {/* Anatomie Section */}
            <section>
              <h2 className="text-3xl font-bold text-slate-900 mb-8 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-medical-100 text-medical-600 flex items-center justify-center text-lg">A</span>
                Anatomie
              </h2>
              {anatomieVideos.length === 0 ? (
                <p className="text-slate-500">Aucune vidéo disponible pour le moment.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {anatomieVideos.map((video, i) => (
                    <VideoCard key={video.id} video={video} hasAccess={hasAccess(video)} index={i} />
                  ))}
                </div>
              )}
            </section>

            {/* Pathologie Section */}
            <section>
              <h2 className="text-3xl font-bold text-slate-900 mb-8 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-accent-100 text-accent-600 flex items-center justify-center text-lg">P</span>
                Pathologie
              </h2>
              {pathologieVideos.length === 0 ? (
                <p className="text-slate-500">Aucune vidéo disponible pour le moment.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {pathologieVideos.map((video, i) => (
                    <VideoCard key={video.id} video={video} hasAccess={hasAccess(video)} index={i} />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function VideoCard({ video, hasAccess, index }: { video: Video; hasAccess: boolean; index: number }) {
  const statusLabel = video.isFreeDemo
    ? 'Démo Gratuite'
    : hasAccess
      ? 'Acheté'
      : 'Pas encore acheté';

  const statusClass = video.isFreeDemo
    ? 'bg-emerald-500'
    : hasAccess
      ? 'bg-medical-500'
      : 'bg-slate-900/80';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow group flex flex-col"
    >
      <div className="aspect-video relative bg-slate-900 overflow-hidden">
        <Image
          src={`https://picsum.photos/seed/${video.id}/640/360`}
          alt={video.title}
          fill
          className="object-cover opacity-60 group-hover:opacity-80 transition-opacity"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          {hasAccess ? (
            <Link
              href={`/videos/${video.id}`}
              aria-label={`Ouvrir le contenu de ${video.title}`}
              className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform focus:outline-none focus:ring-2 focus:ring-white/70"
            >
              <PlayCircle className="h-8 w-8 text-white" />
            </Link>
          ) : (
            <div className="w-14 h-14 rounded-full bg-slate-900/60 backdrop-blur-sm flex items-center justify-center">
              <Lock className="h-6 w-6 text-slate-300" />
            </div>
          )}
        </div>
        <div
          className={`absolute top-3 right-3 text-white text-xs font-bold px-2 py-1 rounded-md uppercase tracking-wider ${statusClass}`}
        >
          {statusLabel}
        </div>
      </div>
      <div className="p-5 flex-1 flex flex-col">
        <h3 className="text-lg font-bold text-slate-900 mb-2 line-clamp-2">{video.title}</h3>
        <p className="text-sm text-slate-500 mb-4 line-clamp-2 flex-1">{video.description}</p>
        
        {hasAccess ? (
          <Link 
            href={`/videos/${video.id}`}
            className="flex items-center justify-between w-full py-2.5 px-4 bg-medical-50 text-medical-700 rounded-xl font-medium hover:bg-medical-100 transition-colors"
          >
            <span>Regarder le cours</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-lg font-bold text-slate-900">{video.price} DZD</span>
            <Link 
              href={`/videos/${video.id}`}
              className="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors"
            >
              Débloquer
            </Link>
          </div>
        )}
      </div>
    </motion.div>
  );
}
