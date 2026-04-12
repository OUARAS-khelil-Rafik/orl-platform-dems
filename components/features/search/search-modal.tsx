'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, X, PlayCircle, FileText, HelpCircle, Image as ImageIcon, Loader2 } from 'lucide-react';
import { db, collection, getDocs } from '@/lib/data/local-data';
import { useRouter } from 'next/router';

interface SearchResult {
  id: string;
  type: 'video' | 'qcm' | 'case' | 'open-question' | 'diagram';
  title: string;
  description?: string;
  url?: string;
  videoId?: string;
}

type SearchCategory = 'all' | SearchResult['type'];

const normalizeSearchText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const matchesQuery = (value: unknown, normalizedQuery: string) => {
  if (typeof value !== 'string') return false;
  return normalizeSearchText(value).includes(normalizedQuery);
};

export function SearchModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeCategory, setActiveCategory] = useState<SearchCategory>('all');
  const [loading, setLoading] = useState(false);
  const [navigationError, setNavigationError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery('');
      setResults([]);
      setActiveCategory('all');
      setNavigationError('');
    }
  }, [isOpen]);

  useEffect(() => {
    const search = async () => {
      if (query.length < 2) {
        setResults([]);
        return;
      }

      setLoading(true);
      setNavigationError('');
      try {
        const normalizedQuery = normalizeSearchText(query);
        const searchResults: SearchResult[] = [];

        // Fetch all data (in a real app, use Algolia or Typesense for full-text search)
        // Since Firestore doesn't support full-text search natively, we fetch and filter client-side for this demo
        
        const [videosSnap, qcmsSnap, casesSnap, openQuestionsSnap, diagramsSnap] = await Promise.all([
          getDocs(collection(db, 'videos')),
          getDocs(collection(db, 'qcms')),
          getDocs(collection(db, 'clinicalCases')),
          getDocs(collection(db, 'openQuestions')),
          getDocs(collection(db, 'diagrams'))
        ]);

        videosSnap.forEach(doc => {
          const data = doc.data();
          if (matchesQuery(data.title, normalizedQuery) || matchesQuery(data.description, normalizedQuery)) {
            searchResults.push({ id: doc.id, type: 'video', title: data.title, description: data.description, url: data.url });
          }
        });

        qcmsSnap.forEach(doc => {
          const data = doc.data();
          if (matchesQuery(data.question, normalizedQuery)) {
            searchResults.push({ id: doc.id, type: 'qcm', title: data.question, videoId: data.videoId });
          }
        });

        casesSnap.forEach(doc => {
          const data = doc.data();
          if (matchesQuery(data.title, normalizedQuery) || matchesQuery(data.description, normalizedQuery)) {
            searchResults.push({ id: doc.id, type: 'case', title: data.title || 'Cas clinique', description: data.description, videoId: data.videoId });
          }
        });

        openQuestionsSnap.forEach(doc => {
          const data = doc.data();
          if (
            matchesQuery(data.question, normalizedQuery) ||
            matchesQuery(data.answer, normalizedQuery) ||
            matchesQuery(data.reference, normalizedQuery)
          ) {
            searchResults.push({
              id: doc.id,
              type: 'open-question',
              title: data.question,
              description: data.reference,
              videoId: data.videoId,
            });
          }
        });

        diagramsSnap.forEach(doc => {
          const data = doc.data();
          if (matchesQuery(data.title, normalizedQuery) || matchesQuery(data.description, normalizedQuery)) {
            searchResults.push({ id: doc.id, type: 'diagram', title: data.title, description: data.description, videoId: data.videoId });
          }
        });

        const ranking = { video: 0, qcm: 1, case: 2, 'open-question': 3, diagram: 4 };
        const rankedResults = searchResults.sort((a, b) => {
          const rankGap = ranking[a.type] - ranking[b.type];
          if (rankGap !== 0) return rankGap;
          return a.title.localeCompare(b.title, 'fr');
        });

        setResults(rankedResults);
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(search, 300);
    return () => clearTimeout(debounce);
  }, [query]);

  const handleResultClick = (result: SearchResult) => {
    if (result.type === 'video') {
      onClose();
      router.push(`/videos/${result.id}`);
      return;
    }

    if (result.videoId) {
      onClose();
      const tab = result.type === 'case' ? 'cas' : result.type === 'open-question' ? 'open' : result.type;
      router.push(`/videos/${result.videoId}?tab=${tab}`);
      return;
    }

    setNavigationError("Impossible d'ouvrir ce resultat: video associee introuvable.");
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'video': return <PlayCircle className="w-5 h-5 text-medical-500" />;
      case 'qcm': return <HelpCircle className="w-5 h-5 text-accent-500" />;
      case 'case': return <FileText className="w-5 h-5 text-emerald-500" />;
      case 'open-question': return <FileText className="w-5 h-5 text-cyan-500" />;
      case 'diagram': return <ImageIcon className="w-5 h-5 text-purple-500" />;
      default: return <Search className="w-5 h-5 text-slate-500" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'video': return 'Vidéo';
      case 'qcm': return 'QCM';
      case 'case': return 'Cas Clinique';
      case 'open-question': return 'Question Ouverte';
      case 'diagram': return 'Schéma';
      default: return 'Autre';
    }
  };

  const getTagClass = (type: string) => {
    switch (type) {
      case 'video':
        return 'search-tag--video';
      case 'qcm':
        return 'search-tag--qcm';
      case 'case':
        return 'search-tag--case';
      case 'open-question':
        return 'search-tag--open';
      case 'diagram':
        return 'search-tag--diagram';
      default:
        return '';
    }
  };

  const getColorClass = (type: string) => {
    switch (type) {
      case 'video':
        return 'text-medical-500';
      case 'qcm':
        return 'text-accent-500';
      case 'case':
        return 'text-emerald-500';
      case 'open-question':
        return 'text-cyan-500';
      case 'diagram':
        return 'text-purple-500';
      default:
        return 'text-[var(--app-text)]';
    }
  };

  const categoryCounts = {
    all: results.length,
    video: results.filter((result) => result.type === 'video').length,
    qcm: results.filter((result) => result.type === 'qcm').length,
    case: results.filter((result) => result.type === 'case').length,
    'open-question': results.filter((result) => result.type === 'open-question').length,
    diagram: results.filter((result) => result.type === 'diagram').length,
  };

  const visibleResults =
    activeCategory === 'all' ? results : results.filter((result) => result.type === activeCategory);

  const quickLinks = [
    { label: 'Otologie', href: '/specialties/otologie' },
    { label: 'Rhinologie', href: '/specialties/rhinologie' },
    { label: 'Laryngologie', href: '/specialties/laryngologie' },
    { label: 'Catalogue vidéos', href: '/videos' },
  ];

  const categoryOptions: Array<{ value: SearchCategory; label: string }> = [
    { value: 'all', label: 'Tout' },
    { value: 'video', label: 'Vidéos' },
    { value: 'qcm', label: 'QCM' },
    { value: 'case', label: 'Cas' },
    { value: 'open-question', label: 'Questions' },
    { value: 'diagram', label: 'Schémas' },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 w-full max-w-3xl premium-panel rounded-3xl z-50 overflow-hidden"
          >
            <div className="p-4 border-b border-[var(--app-border)] bg-transparent">
              <div className="flex items-center gap-3 w-full bg-[var(--app-surface)]/60 rounded-2xl px-3 py-2 shadow-sm backdrop-blur-sm">
                <Search className="w-5 h-5 text-[var(--app-accent)]" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Rechercher des vidéos, QCMs, cas cliniques, questions ouvertes..."
                  className="flex-1 bg-transparent border-0 outline-none focus:ring-0 appearance-none text-[var(--app-text)] placeholder:text-[var(--app-muted)] text-base sm:text-lg"
                />
                {loading && <Loader2 className="w-5 h-5 text-[var(--app-accent)] animate-spin" />}
                <button
                  onClick={onClose}
                  className="p-2 text-[var(--app-muted)] hover:text-[var(--app-text)] hover:bg-transparent rounded-full transition-colors"
                  title="Fermer la recherche"
                  aria-label="Fermer la recherche"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="px-4 py-3 border-b border-[var(--app-border)] flex flex-wrap items-center gap-2 bg-transparent">
              {categoryOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setActiveCategory(option.value)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    activeCategory === option.value
                      ? 'border-[var(--app-accent)] text-[var(--app-accent)] bg-transparent'
                      : 'border-[var(--app-border)] text-[var(--app-muted)] bg-transparent hover:bg-[var(--app-surface-alt)]'
                  }`}
                >
                  {option.label} · {categoryCounts[option.value]}
                </button>
              ))}
            </div>

            {query.length < 2 && (
                <div className="px-4 pt-4 pb-2">
                <p className="text-xs uppercase tracking-[0.14em] text-[var(--app-muted)] mb-2">Accès rapide</p>
                <div className="flex flex-wrap gap-2">
                  {quickLinks.map((quickLink) => (
                    <button
                      key={quickLink.href}
                      type="button"
                      className="rounded-full border border-[var(--app-border)] bg-transparent px-3 py-1.5 text-sm text-[var(--app-text)] hover:bg-[var(--app-surface-alt)] transition-colors"
                      onClick={() => {
                        onClose();
                        router.push(quickLink.href);
                      }}
                    >
                      {quickLink.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="max-h-[60vh] overflow-y-auto">
              {navigationError && (
                <div className="mx-4 mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {navigationError}
                </div>
              )}

              {query.length > 0 && query.length < 2 && (
                <div className="p-8 text-center text-slate-500">
                  Tapez au moins 2 caractères pour rechercher...
                </div>
              )}

              {query.length >= 2 && visibleResults.length === 0 && !loading && (
                <div className="p-8 text-center text-slate-500">
                  Aucun résultat trouvé pour "{query}"
                </div>
              )}

              {visibleResults.length > 0 && (
                <div className="p-2">
                  {visibleResults.map((result, index) => (
                    <button
                      key={result.id}
                      onClick={() => handleResultClick(result)}
                      className="w-full flex items-start gap-4 p-3 hover:bg-[var(--app-surface-alt)] rounded-xl transition-colors text-left interactive-card"
                    >
                      <div className="mt-1 bg-[var(--app-surface)] p-2 rounded-lg shadow-sm border border-[var(--app-border)]">
                        {getIcon(result.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-nowrap">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getTagClass(result.type)} ${getColorClass(result.type)} whitespace-nowrap`}>{getTypeLabel(result.type)}</span>
                          {index < 3 && (
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border border-[var(--app-border)] text-[var(--app-accent)] bg-transparent whitespace-nowrap">
                              Recommandé
                            </span>
                          )}
                          <h4 className="font-medium text-[var(--app-text)] truncate">{result.title}</h4>
                        </div>
                        {result.description && (
                          <p className="text-sm text-[var(--app-muted)] line-clamp-1">{result.description}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
