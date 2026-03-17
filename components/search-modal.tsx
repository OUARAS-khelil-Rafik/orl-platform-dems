'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, X, PlayCircle, FileText, HelpCircle, Image as ImageIcon, Loader2 } from 'lucide-react';
import { db, collection, getDocs } from '@/lib/local-data';
import { useRouter } from 'next/router';

interface SearchResult {
  id: string;
  type: 'video' | 'qcm' | 'case' | 'diagram';
  title: string;
  description?: string;
  url?: string;
  videoId?: string;
}

export function SearchModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery('');
      setResults([]);
    }
  }, [isOpen]);

  useEffect(() => {
    const search = async () => {
      if (query.length < 2) {
        setResults([]);
        return;
      }

      setLoading(true);
      try {
        const searchLower = query.toLowerCase();
        const searchResults: SearchResult[] = [];

        // Fetch all data (in a real app, use Algolia or Typesense for full-text search)
        // Since Firestore doesn't support full-text search natively, we fetch and filter client-side for this demo
        
        const [videosSnap, qcmsSnap, casesSnap, diagramsSnap] = await Promise.all([
          getDocs(collection(db, 'videos')),
          getDocs(collection(db, 'qcms')),
          getDocs(collection(db, 'clinicalCases')),
          getDocs(collection(db, 'diagrams'))
        ]);

        videosSnap.forEach(doc => {
          const data = doc.data();
          if (data.title?.toLowerCase().includes(searchLower) || data.description?.toLowerCase().includes(searchLower)) {
            searchResults.push({ id: doc.id, type: 'video', title: data.title, description: data.description });
          }
        });

        qcmsSnap.forEach(doc => {
          const data = doc.data();
          if (data.question?.toLowerCase().includes(searchLower)) {
            searchResults.push({ id: doc.id, type: 'qcm', title: data.question, videoId: data.videoId });
          }
        });

        casesSnap.forEach(doc => {
          const data = doc.data();
          if (data.title?.toLowerCase().includes(searchLower) || data.content?.toLowerCase().includes(searchLower)) {
            searchResults.push({ id: doc.id, type: 'case', title: data.title, description: data.content, videoId: data.videoId });
          }
        });

        diagramsSnap.forEach(doc => {
          const data = doc.data();
          if (data.title?.toLowerCase().includes(searchLower) || data.description?.toLowerCase().includes(searchLower)) {
            searchResults.push({ id: doc.id, type: 'diagram', title: data.title, description: data.description, videoId: data.videoId });
          }
        });

        setResults(searchResults);
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
    onClose();
    if (result.type === 'video') {
      router.push(`/videos/${result.id}`);
    } else if (result.videoId) {
      router.push(`/videos/${result.videoId}?tab=${result.type}`);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'video': return <PlayCircle className="w-5 h-5 text-medical-500" />;
      case 'qcm': return <HelpCircle className="w-5 h-5 text-accent-500" />;
      case 'case': return <FileText className="w-5 h-5 text-emerald-500" />;
      case 'diagram': return <ImageIcon className="w-5 h-5 text-purple-500" />;
      default: return <Search className="w-5 h-5 text-slate-500" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'video': return 'Vidéo';
      case 'qcm': return 'QCM';
      case 'case': return 'Cas Clinique';
      case 'diagram': return 'Schéma';
      default: return 'Autre';
    }
  };

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
            className="fixed top-20 left-1/2 -translate-x-1/2 w-full max-w-2xl bg-white rounded-2xl shadow-2xl z-50 overflow-hidden border border-slate-200"
          >
            <div className="p-4 border-b border-slate-100 flex items-center gap-3">
              <Search className="w-5 h-5 text-slate-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher des vidéos, QCMs, cas cliniques..."
                className="flex-1 bg-transparent border-none outline-none text-slate-900 placeholder:text-slate-400 text-lg"
              />
              {loading && <Loader2 className="w-5 h-5 text-medical-500 animate-spin" />}
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                title="Fermer la recherche"
                aria-label="Fermer la recherche"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {query.length > 0 && query.length < 2 && (
                <div className="p-8 text-center text-slate-500">
                  Tapez au moins 2 caractères pour rechercher...
                </div>
              )}

              {query.length >= 2 && results.length === 0 && !loading && (
                <div className="p-8 text-center text-slate-500">
                  Aucun résultat trouvé pour "{query}"
                </div>
              )}

              {results.length > 0 && (
                <div className="p-2">
                  {results.map((result) => (
                    <button
                      key={result.id}
                      onClick={() => handleResultClick(result)}
                      className="w-full flex items-start gap-4 p-3 hover:bg-slate-50 rounded-xl transition-colors text-left"
                    >
                      <div className="mt-1 bg-white p-2 rounded-lg shadow-sm border border-slate-100">
                        {getIcon(result.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                            {getTypeLabel(result.type)}
                          </span>
                          <h4 className="font-medium text-slate-900 truncate">{result.title}</h4>
                        </div>
                        {result.description && (
                          <p className="text-sm text-slate-500 line-clamp-1">{result.description}</p>
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
