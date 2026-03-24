'use client';

import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  addDoc,
  collection,
  db,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from '@/lib/local-data';
import { useAuth } from '@/components/providers/auth-provider';
import { ArrowDown, ArrowUp, CheckCircle2, Pencil, Plus, Save, Trash2 } from 'lucide-react';

type SpecialtyKey = 'otologie' | 'rhinologie-sinusologie' | 'cervicologie';
type ProgressField = 'round1' | 'round2' | 'round3' | 'qcms';

type PlanningItem = {
  id: string;
  specialty: SpecialtyKey;
  chapterName?: string;
  courseType: string;
  courseName: string;
  order: number;
  createdAt?: string;
  updatedAt?: string;
};

type ProgressState = {
  round1: boolean;
  round2: boolean;
  round3: boolean;
  qcms: boolean;
};

type PlanningFormState = {
  specialty: SpecialtyKey;
  chapterName: string;
  courseType: string;
  courseName: string;
};

type PlanningFilterState = {
  specialty: 'all' | SpecialtyKey;
  courseType: string;
  chapterKey: string;
  courseQuery: string;
};

const PROGRESS_STORAGE_PREFIX = 'dems-planning-progress-v1';

const SPECIALTY_CONFIG: Record<
  SpecialtyKey,
  {
    title: string;
    chapterHint?: string;
    requiresChapter: boolean;
    typeOptions: string[];
  }
> = {
  otologie: {
    title: 'OTOLOGIE',
    requiresChapter: false,
    typeOptions: [
      'Anatomie',
      'Pathologie',
      'Physiologie/Imagerie',
      'Diagnostic',
      'Explorations fonctionnelles',
      'Technique chirurgicales',
    ],
  },
  'rhinologie-sinusologie': {
    title: 'RHINOLOGIE-SINUSOLOGIE',
    chapterHint: 'Ex. CHAPITRE 01: Pyramide et fosses nasales, sinus',
    requiresChapter: true,
    typeOptions: [
      'Anatomie',
      'Pathologie',
      'Physiologie/Imagerie',
      'Diagnostic',
      'Technique chirurgicales',
      'Cours',
    ],
  },
  cervicologie: {
    title: 'CERVICOLOGIE',
    chapterHint: 'Ex. CHAPITRE 01: Larynx',
    requiresChapter: true,
    typeOptions: [
      'Anatomie',
      'Physiologie/Imagerie',
      'Pathologie/Diagnostic',
      'Technique chirurgicales',
      'Cours',
    ],
  },
};

const DEFAULT_PROGRESS: ProgressState = {
  round1: false,
  round2: false,
  round3: false,
  qcms: false,
};

const defaultFormState = (): PlanningFormState => ({
  specialty: 'otologie',
  chapterName: '',
  courseType: SPECIALTY_CONFIG.otologie.typeOptions[0],
  courseName: '',
});

const normalizeCourseType = (specialty: SpecialtyKey, courseType: string) => {
  const options = SPECIALTY_CONFIG[specialty].typeOptions;
  if (options.includes(courseType)) return courseType;
  return options[0];
};

const normalizeChapterKey = (chapterName: string) => {
  const withoutPrefix = chapterName.replace(/^\s*chapitre\s*\d+\s*[:.-]?\s*/i, '');

  return withoutPrefix
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
};

const extractChapterTopic = (chapterName: string) => {
  return chapterName
    .replace(/^\s*chapitre\s*\d+\s*[:.-]?\s*/i, '')
    .trim()
    .replace(/\s+/g, ' ');
};

const formatChapterLabel = (index: number, topic: string) => {
  const number = String(index + 1).padStart(2, '0');
  return `Chapitre ${number} : ${topic}`;
};

const mergeUniqueChapterOptions = (values: string[]) => {
  const map = new Map<string, string>();

  values.forEach((value) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const key = normalizeChapterKey(trimmed);
    if (!key || map.has(key)) return;
    map.set(key, trimmed);
  });

  return Array.from(map.values());
};

const getProgressStorageKey = (uid?: string) => `${PROGRESS_STORAGE_PREFIX}:${uid || 'guest'}`;

const renderCourseName = (courseName: string): ReactNode => {
  const sourceLines = courseName.split(/\r?\n/);

  if (!sourceLines.some((line) => line.trim().length > 0)) {
    return 'Sans titre';
  }

  const listItemPattern = /^\s*([-+*]|\d+[.)])\s+(.+)$/;
  const blocks: Array<{ type: 'paragraph'; lines: string[] } | { type: 'unordered' | 'ordered'; items: string[] }> = [];

  const pushParagraph = (line: string) => {
    const prev = blocks[blocks.length - 1];
    if (prev && prev.type === 'paragraph') {
      prev.lines.push(line);
      return;
    }
    blocks.push({ type: 'paragraph', lines: [line] });
  };

  const pushListItem = (listType: 'unordered' | 'ordered', content: string) => {
    const prev = blocks[blocks.length - 1];
    if (prev && prev.type === listType) {
      prev.items.push(content);
      return;
    }
    blocks.push({ type: listType, items: [content] });
  };

  sourceLines.forEach((rawLine) => {
    const trimmed = rawLine.trim();

    if (!trimmed) {
      blocks.push({ type: 'paragraph', lines: [''] });
      return;
    }

    const listMatch = trimmed.match(listItemPattern);
    if (listMatch) {
      const marker = listMatch[1];
      const itemContent = listMatch[2].trim();
      const listType = /^\d/.test(marker) ? 'ordered' : 'unordered';
      pushListItem(listType, itemContent);
      return;
    }

    pushParagraph(trimmed);
  });

  return (
    <div className="space-y-1">
      {blocks.map((block, index) => {
        if (block.type === 'unordered') {
          return (
            <ul key={`ul-${index}`} className="list-disc pl-5 space-y-1">
              {block.items.map((item, itemIndex) => (
                <li key={`uli-${index}-${itemIndex}`} className="whitespace-pre-wrap break-words">
                  {item}
                </li>
              ))}
            </ul>
          );
        }

        if (block.type === 'ordered') {
          return (
            <ol key={`ol-${index}`} className="list-decimal pl-5 space-y-1">
              {block.items.map((item, itemIndex) => (
                <li key={`oli-${index}-${itemIndex}`} className="whitespace-pre-wrap break-words">
                  {item}
                </li>
              ))}
            </ol>
          );
        }

        if (block.type === 'paragraph') {
          return (
            <p key={`p-${index}`} className="whitespace-pre-wrap break-words">
              {block.lines.join('\n')}
            </p>
          );
        }

        return null;
      })}
    </div>
  );
};

export default function PlanningPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const canToggleProgress = Boolean(user);

  const [items, setItems] = useState<PlanningItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSavingItem, setIsSavingItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [formState, setFormState] = useState<PlanningFormState>(defaultFormState());
  const [progressByItem, setProgressByItem] = useState<Record<string, ProgressState>>({});
  const [isProgressHydrated, setIsProgressHydrated] = useState(false);
  const [newChapterDraft, setNewChapterDraft] = useState('');
  const [extraChapterOptions, setExtraChapterOptions] = useState<Record<SpecialtyKey, string[]>>({
    otologie: [],
    'rhinologie-sinusologie': [],
    cervicologie: [],
  });
  const [chapterOrderBySpecialty, setChapterOrderBySpecialty] = useState<Record<SpecialtyKey, string[]>>({
    otologie: [],
    'rhinologie-sinusologie': [],
    cervicologie: [],
  });
  const [filters, setFilters] = useState<PlanningFilterState>({
    specialty: 'all',
    courseType: 'all',
    chapterKey: 'all',
    courseQuery: '',
  });

  const fetchPlanningItems = async () => {
    try {
      const snap = await getDocs(collection(db, 'planningItems'));
      const nextItems = snap.docs
        .map((entry) => {
          const data = entry.data() as Partial<PlanningItem>;
          return {
            id: entry.id,
            specialty: (data.specialty || 'otologie') as SpecialtyKey,
            chapterName: data.chapterName || '',
            courseType: data.courseType || 'Cours',
            courseName: data.courseName || 'Sans titre',
            order: typeof data.order === 'number' && Number.isFinite(data.order) ? data.order : 999,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          };
        })
        .sort((a, b) => {
          if (a.specialty !== b.specialty) return a.specialty.localeCompare(b.specialty);
          if (a.order !== b.order) return a.order - b.order;
          return a.courseName.localeCompare(b.courseName);
        });

      setItems(nextItems);
    } catch (error) {
      console.error('Error loading planning items:', error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlanningItems();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let isDisposed = false;

    const loadProgress = async () => {
      setIsProgressHydrated(false);

      const storageKey = getProgressStorageKey(user?.uid);
      let nextProgress: Record<string, ProgressState> = {};

      try {
        const raw = window.localStorage.getItem(storageKey);
        nextProgress = raw ? (JSON.parse(raw) as Record<string, ProgressState>) : {};
      } catch {
        nextProgress = {};
      }

      if (user?.uid) {
        try {
          const progressDoc = await getDoc(doc(db, 'planningProgress', user.uid));
          if (progressDoc.exists()) {
            const data = progressDoc.data() as { byItem?: Record<string, ProgressState> } | undefined;
            if (data?.byItem && typeof data.byItem === 'object') {
              nextProgress = data.byItem;
            }
          }
        } catch (error) {
          console.error('Error loading planning progress:', error);
        }
      }

      if (!isDisposed) {
        setProgressByItem(nextProgress || {});
        setIsProgressHydrated(true);
      }
    };

    loadProgress();

    return () => {
      isDisposed = true;
    };
  }, [user?.uid]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isProgressHydrated) return;

    const storageKey = getProgressStorageKey(user?.uid);
    window.localStorage.setItem(storageKey, JSON.stringify(progressByItem));

    const persistProgress = async () => {
      if (!user?.uid) return;

      try {
        await setDoc(doc(db, 'planningProgress', user.uid), {
          byItem: progressByItem,
          updatedAt: new Date().toISOString(),
        });
      } catch (error) {
        console.error('Error saving planning progress:', error);
      }
    };

    persistProgress();
  }, [progressByItem, user?.uid, isProgressHydrated]);

  const groupedBySpecialty = useMemo(() => {
    const groups: Record<SpecialtyKey, PlanningItem[]> = {
      otologie: [],
      'rhinologie-sinusologie': [],
      cervicologie: [],
    };

    items.forEach((item) => {
      groups[item.specialty].push(item);
    });

    return groups;
  }, [items]);

  const availableCourseTypes = useMemo(() => {
    if (filters.specialty === 'all') {
      return Array.from(new Set(items.map((item) => item.courseType))).sort((a, b) => a.localeCompare(b));
    }

    const usedTypes = Array.from(
      new Set(items.filter((item) => item.specialty === filters.specialty).map((item) => item.courseType)),
    );
    const configured = SPECIALTY_CONFIG[filters.specialty].typeOptions.filter((type) => usedTypes.includes(type));
    const custom = usedTypes.filter((type) => !configured.includes(type)).sort((a, b) => a.localeCompare(b));
    return [...configured, ...custom];
  }, [filters.specialty, items]);

  const availableChapters = useMemo<Array<{ key: string; label: string }>>(() => {
    if (filters.specialty !== 'rhinologie-sinusologie' && filters.specialty !== 'cervicologie') {
      return [];
    }

    const specialty = filters.specialty;
    const chapterMap = groupedBySpecialty[specialty].reduce<Record<string, string>>((acc, item) => {
      const chapterLabel = item.chapterName?.trim();
      if (!chapterLabel) return acc;
      const chapterKey = normalizeChapterKey(chapterLabel);
      if (!chapterKey || acc[chapterKey]) return acc;
      acc[chapterKey] = extractChapterTopic(chapterLabel) || chapterLabel;
      return acc;
    }, {});

    const chapterKeys = Object.keys(chapterMap);
    if (chapterKeys.length === 0) return [];

    const savedOrder = chapterOrderBySpecialty[specialty] || [];
    const orderedKeys = [
      ...savedOrder.filter((key) => chapterKeys.includes(key)),
      ...chapterKeys.filter((key) => !savedOrder.includes(key)),
    ];

    return orderedKeys.map((key, index) => ({
      key,
      label: formatChapterLabel(index, chapterMap[key]),
    }));
  }, [filters.specialty, groupedBySpecialty, chapterOrderBySpecialty]);

  useEffect(() => {
    if (filters.courseType !== 'all' && !availableCourseTypes.includes(filters.courseType)) {
      setFilters((prev) => ({ ...prev, courseType: 'all' }));
    }
  }, [filters.courseType, availableCourseTypes]);

  useEffect(() => {
    const availableChapterKeys = new Set(availableChapters.map((chapter) => chapter.key));
    if (filters.chapterKey !== 'all' && !availableChapterKeys.has(filters.chapterKey)) {
      setFilters((prev) => ({ ...prev, chapterKey: 'all' }));
    }
  }, [filters.chapterKey, availableChapters]);

  const filteredBySpecialty = useMemo(() => {
    const groups: Record<SpecialtyKey, PlanningItem[]> = {
      otologie: [],
      'rhinologie-sinusologie': [],
      cervicologie: [],
    };

    const normalizedQuery = filters.courseQuery.trim().toLowerCase();

    items.forEach((item) => {
      if (filters.specialty !== 'all' && item.specialty !== filters.specialty) return;
      if (filters.courseType !== 'all' && item.courseType !== filters.courseType) return;

      if (filters.chapterKey !== 'all') {
        const itemChapterKey = normalizeChapterKey(item.chapterName || '');
        if (itemChapterKey !== filters.chapterKey) return;
      }

      if (normalizedQuery && !item.courseName.toLowerCase().includes(normalizedQuery)) return;

      groups[item.specialty].push(item);
    });

    return groups;
  }, [items, filters]);

  const chapterSuggestions = useMemo(() => {
    const requiresChapter = SPECIALTY_CONFIG[formState.specialty].requiresChapter;
    if (!requiresChapter) return [] as string[];

    const suggestionsMap = new Map<string, string>();

    groupedBySpecialty[formState.specialty].forEach((item) => {
      const chapter = item.chapterName?.trim();
      if (!chapter) return;
      const topic = extractChapterTopic(chapter);
      const key = normalizeChapterKey(topic);
      if (!key || suggestionsMap.has(key)) return;
      suggestionsMap.set(key, topic);
    });

    return Array.from(suggestionsMap.values());
  }, [formState.specialty, groupedBySpecialty]);

  const chapterOptions = useMemo<Array<{ key: string; topic: string; label: string }>>(() => {
    if (!SPECIALTY_CONFIG[formState.specialty].requiresChapter) return [];
    const specialtyExtras = extraChapterOptions[formState.specialty] || [];
    const topics = mergeUniqueChapterOptions([...chapterSuggestions, ...specialtyExtras]);
    const original = topics.map((topic) => ({ key: normalizeChapterKey(topic), topic }));
    const savedOrder = chapterOrderBySpecialty[formState.specialty] || [];
    const orderedKeys = [
      ...savedOrder.filter((key) => original.some((entry) => entry.key === key)),
      ...original.map((entry) => entry.key).filter((key) => !savedOrder.includes(key)),
    ];
    const ordered = orderedKeys
      .map((key) => original.find((entry) => entry.key === key))
      .filter((entry): entry is { key: string; topic: string } => Boolean(entry));

    return ordered.map((entry, index) => ({
      key: entry.key,
      topic: entry.topic,
      label: formatChapterLabel(index, entry.topic),
    }));
  }, [chapterSuggestions, extraChapterOptions, chapterOrderBySpecialty, formState.specialty]);

  const onAddChapterOption = () => {
    const topic = extractChapterTopic(newChapterDraft);
    if (!topic) return;
    const topicKey = normalizeChapterKey(topic);
    const alreadyExisting = chapterOptions.find((option) => option.key === topicKey);

    if (alreadyExisting) {
      setFormState((prev) => ({
        ...prev,
        chapterName: alreadyExisting.label,
      }));
      setNewChapterDraft('');
      return;
    }

    const chapterLabel = formatChapterLabel(chapterOptions.length, topic);

    setExtraChapterOptions((prev) => ({
      ...prev,
      [formState.specialty]: mergeUniqueChapterOptions([...(prev[formState.specialty] || []), topic]),
    }));

    setChapterOrderBySpecialty((prev) => {
      const current = prev[formState.specialty] || chapterOptions.map((option) => option.key);
      if (current.includes(topicKey)) return prev;

      return {
        ...prev,
        [formState.specialty]: [...current, topicKey],
      };
    });

    setFormState((prev) => ({
      ...prev,
      chapterName: chapterLabel,
    }));

    setNewChapterDraft('');
  };

  const onMoveChapterOption = (chapterKey: string, direction: 'up' | 'down') => {
    const currentOptions = chapterOptions;
    const currentKeys = currentOptions.map((option) => option.key);
    const currentIndex = currentKeys.indexOf(chapterKey);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= currentKeys.length) return;

    const nextKeys = [...currentKeys];
    [nextKeys[currentIndex], nextKeys[targetIndex]] = [nextKeys[targetIndex], nextKeys[currentIndex]];

    setChapterOrderBySpecialty((prev) => ({
      ...prev,
      [formState.specialty]: nextKeys,
    }));

    const selectedKey = normalizeChapterKey(formState.chapterName);
    if (!selectedKey) return;

    const selectedOption = currentOptions.find((option) => option.key === selectedKey);
    const nextSelectedIndex = nextKeys.indexOf(selectedKey);
    if (!selectedOption || nextSelectedIndex === -1) return;

    setFormState((prev) => ({
      ...prev,
      chapterName: formatChapterLabel(nextSelectedIndex, selectedOption.topic),
    }));
  };

  const onMoveTableChapter = (specialty: SpecialtyKey, chapterKey: string, direction: 'up' | 'down') => {
    if (!SPECIALTY_CONFIG[specialty].requiresChapter) return;

    const specialtyItems = groupedBySpecialty[specialty];
    const chapterMap = specialtyItems.reduce<Record<string, string>>((acc, item) => {
      const chapterLabel = item.chapterName?.trim() || 'CHAPITRE NON RENSEIGNE';
      const key = normalizeChapterKey(chapterLabel) || 'chapitre non renseigne';
      if (!acc[key]) {
        acc[key] = extractChapterTopic(chapterLabel) || 'Non renseigne';
      }
      return acc;
    }, {});

    const currentKeys = Object.keys(chapterMap);
    if (currentKeys.length < 2) return;

    const savedOrder = chapterOrderBySpecialty[specialty] || [];
    const orderedKeys = [
      ...savedOrder.filter((key) => currentKeys.includes(key)),
      ...currentKeys.filter((key) => !savedOrder.includes(key)),
    ];

    const currentIndex = orderedKeys.indexOf(chapterKey);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= orderedKeys.length) return;

    const nextKeys = [...orderedKeys];
    [nextKeys[currentIndex], nextKeys[targetIndex]] = [nextKeys[targetIndex], nextKeys[currentIndex]];

    setChapterOrderBySpecialty((prev) => ({
      ...prev,
      [specialty]: nextKeys,
    }));

    if (formState.specialty !== specialty) return;

    const selectedKey = normalizeChapterKey(formState.chapterName);
    const nextSelectedIndex = nextKeys.indexOf(selectedKey);
    if (nextSelectedIndex === -1) return;

    const selectedTopic = chapterMap[selectedKey];
    if (!selectedTopic) return;

    setFormState((prev) => ({
      ...prev,
      chapterName: formatChapterLabel(nextSelectedIndex, selectedTopic),
    }));
  };

  const onSpecialtyChange = (nextSpecialty: SpecialtyKey) => {
    const normalizedType = normalizeCourseType(nextSpecialty, formState.courseType);
    setFormState((prev) => ({
      ...prev,
      specialty: nextSpecialty,
      courseType: normalizedType,
      chapterName: '',
    }));
    setNewChapterDraft('');
  };

  const resetForm = () => {
    setFormState(defaultFormState());
    setEditingItemId(null);
    setNewChapterDraft('');
  };

  const onSaveItem = async (event: FormEvent) => {
    event.preventDefault();

    const normalizedCourseName = formState.courseName.trim();
    if (!normalizedCourseName) return;

    const selectedConfig = SPECIALTY_CONFIG[formState.specialty];

    const existingOrders = items.map((item) => item.order).filter((value) => Number.isFinite(value));
    const fallbackNextOrder = existingOrders.length > 0 ? Math.max(...existingOrders) + 1 : 1;
    const editingOrder = editingItemId
      ? items.find((entry) => entry.id === editingItemId)?.order
      : undefined;

    const payload = {
      specialty: formState.specialty,
      chapterName: selectedConfig.requiresChapter ? formState.chapterName.trim() : '',
      courseType: normalizeCourseType(formState.specialty, formState.courseType),
      courseName: normalizedCourseName,
      order: editingOrder ?? fallbackNextOrder,
      updatedAt: new Date().toISOString(),
    };

    try {
      setIsSavingItem(true);
      if (editingItemId) {
        await updateDoc(doc(db, 'planningItems', editingItemId), payload);
      } else {
        await addDoc(collection(db, 'planningItems'), {
          ...payload,
          createdAt: new Date().toISOString(),
        });
      }
      await fetchPlanningItems();
      resetForm();
    } catch (error) {
      console.error('Error saving planning item:', error);
    } finally {
      setIsSavingItem(false);
    }
  };

  const onEditItem = (item: PlanningItem) => {
    setEditingItemId(item.id);
    setFormState({
      specialty: item.specialty,
      chapterName: item.chapterName || '',
      courseType: normalizeCourseType(item.specialty, item.courseType),
      courseName: item.courseName,
    });
    setNewChapterDraft('');
  };

  const onDeleteItem = async (itemId: string) => {
    try {
      await deleteDoc(doc(db, 'planningItems', itemId));
      setItems((prev) => prev.filter((entry) => entry.id !== itemId));
      setProgressByItem((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    } catch (error) {
      console.error('Error deleting planning item:', error);
    }
  };

  const toggleProgress = (itemId: string, field: ProgressField) => {
    setProgressByItem((prev) => {
      const current = prev[itemId] || DEFAULT_PROGRESS;
      return {
        ...prev,
        [itemId]: {
          ...current,
          [field]: !current[field],
        },
      };
    });
  };

  const renderSpecialtyTable = (specialty: SpecialtyKey) => {
    const list = filteredBySpecialty[specialty];
    const config = SPECIALTY_CONFIG[specialty];

    if (list.length === 0) {
      return (
        <div
          className="rounded-2xl border border-dashed p-6 text-sm"
          style={{
            borderColor: 'var(--app-border)',
            backgroundColor: 'var(--app-surface)',
            color: 'var(--app-muted)',
          }}
        >
          Aucun résultat pour cette spécialité avec les filtres sélectionnés.
        </div>
      );
    }

    const groupedByChapter = list.reduce<Record<string, { label: string; items: PlanningItem[] }>>((acc, item) => {
      const chapterLabel = config.requiresChapter
        ? (item.chapterName?.trim() || 'CHAPITRE NON RENSEIGNE')
        : 'SANS CHAPITRE';
      const chapterKey = config.requiresChapter
        ? (normalizeChapterKey(chapterLabel) || 'chapitre non renseigne')
        : 'sans chapitre';

      if (!acc[chapterKey]) {
        acc[chapterKey] = { label: chapterLabel, items: [] };
      }

      if (
        acc[chapterKey].label === 'CHAPITRE NON RENSEIGNE' &&
        chapterLabel !== 'CHAPITRE NON RENSEIGNE'
      ) {
        acc[chapterKey].label = chapterLabel;
      }

      acc[chapterKey].items.push(item);
      return acc;
    }, {});

    const chapterKeys = Object.keys(groupedByChapter);
    const savedOrder = chapterOrderBySpecialty[specialty] || [];
    const orderedChapterKeys = [
      ...savedOrder.filter((key) => chapterKeys.includes(key)),
      ...chapterKeys.filter((key) => !savedOrder.includes(key)),
    ];

    const rows: Array<
      | { kind: 'chapter'; value: string; key: string; isFirst: boolean; isLast: boolean }
      | { kind: 'type'; value: string }
      | { kind: 'item'; value: PlanningItem }
    > = [];

    const getOrderedTypes = (items: PlanningItem[]) => {
      const usedTypes = Array.from(new Set(items.map((item) => item.courseType)));
      const orderedConfigured = config.typeOptions.filter((type) => usedTypes.includes(type));
      const custom = usedTypes.filter((type) => !config.typeOptions.includes(type)).sort();
      return [...orderedConfigured, ...custom];
    };

    if (config.requiresChapter) {
      orderedChapterKeys.forEach((chapterKey, chapterIndex) => {
        const sourceLabel = groupedByChapter[chapterKey].label;
        const chapterTopic = extractChapterTopic(sourceLabel) || 'Non renseigne';
        rows.push({
          kind: 'chapter',
          value: formatChapterLabel(chapterIndex, chapterTopic),
          key: chapterKey,
          isFirst: chapterIndex === 0,
          isLast: chapterIndex === orderedChapterKeys.length - 1,
        });
        const chapterItems = groupedByChapter[chapterKey].items;
        const chapterTypes = getOrderedTypes(chapterItems);

        chapterTypes.forEach((courseType) => {
          rows.push({ kind: 'type', value: courseType });
          chapterItems
            .filter((item) => item.courseType === courseType)
            .forEach((item) => {
              rows.push({ kind: 'item', value: item });
            });
        });
      });
    } else {
      const noChapterItems = groupedByChapter['sans chapitre']?.items || [];
      const noChapterTypes = getOrderedTypes(noChapterItems);

      noChapterTypes.forEach((courseType) => {
        rows.push({ kind: 'type', value: courseType });
        noChapterItems
          .filter((item) => item.courseType === courseType)
          .forEach((item) => {
            rows.push({ kind: 'item', value: item });
          });
      });
    }

    return (
      <div
        className="overflow-x-auto rounded-2xl border"
        style={{
          borderColor: 'var(--app-border)',
          backgroundColor: 'var(--app-surface)',
          boxShadow: '0 10px 28px color-mix(in oklab, var(--app-border) 18%, transparent)',
        }}
      >
        <table className={`w-full border-collapse text-left text-sm table-fixed ${isAdmin ? 'min-w-[1080px]' : 'min-w-[980px]'}`}>
          <colgroup>
            <col className={isAdmin ? 'w-[66%]' : 'w-[72%]'} />
            <col className="w-[7%]" />
            <col className="w-[7%]" />
            <col className="w-[7%]" />
            <col className="w-[7%]" />
            {isAdmin && <col className="w-[6%]" />}
          </colgroup>
          <tbody>
            {rows.map((row, index) => {
              if (row.kind === 'chapter') {
                return (
                  <tr
                    key={`${row.value}-${index}`}
                    style={{
                      backgroundColor: 'color-mix(in oklab, var(--app-surface-2) 74%, var(--app-border) 26%)',
                    }}
                  >
                    <td
                      colSpan={isAdmin ? 6 : 5}
                      className="border px-3 py-2 text-xs font-bold uppercase tracking-[0.08em]"
                      style={{ borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex-1 text-center">{row.value}</span>
                        {isAdmin && (
                          <span className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onMoveTableChapter(specialty, row.key, 'up')}
                              disabled={row.isFirst}
                              className="inline-flex h-6 w-6 items-center justify-center rounded border disabled:opacity-40"
                              style={{ borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                              title="Monter le chapitre"
                              aria-label="Monter le chapitre"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onMoveTableChapter(specialty, row.key, 'down')}
                              disabled={row.isLast}
                              className="inline-flex h-6 w-6 items-center justify-center rounded border disabled:opacity-40"
                              style={{ borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                              title="Descendre le chapitre"
                              aria-label="Descendre le chapitre"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              }

              if (row.kind === 'type') {
                return (
                  <tr
                    key={`${row.value}-${index}`}
                    style={{
                      backgroundColor: 'color-mix(in oklab, var(--app-accent) 12%, var(--app-surface) 88%)',
                    }}
                  >
                    <td
                      className="border px-3 py-2 text-xs font-bold uppercase tracking-[0.08em]"
                      style={{ borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                    >
                      {row.value}
                    </td>
                    <td className="border px-2 py-1 text-center text-[11px] font-semibold" style={{ borderColor: 'var(--app-border)', color: 'var(--app-muted)' }}>1er tour</td>
                    <td className="border px-2 py-1 text-center text-[11px] font-semibold" style={{ borderColor: 'var(--app-border)', color: 'var(--app-muted)' }}>2ème tour</td>
                    <td className="border px-2 py-1 text-center text-[11px] font-semibold" style={{ borderColor: 'var(--app-border)', color: 'var(--app-muted)' }}>3ème tour</td>
                    <td className="border px-2 py-1 text-center text-[11px] font-semibold" style={{ borderColor: 'var(--app-border)', color: 'var(--app-muted)' }}>QCM</td>
                    {isAdmin && <td className="border px-1.5 py-1 text-center text-[11px] font-semibold whitespace-nowrap" style={{ borderColor: 'var(--app-border)', color: 'var(--app-muted)' }}>Actions</td>}
                  </tr>
                );
              }

              const item = row.value;
              const progress = progressByItem[item.id] || DEFAULT_PROGRESS;

              return (
                <tr
                  key={item.id}
                  className="transition-colors"
                  style={{
                    backgroundColor: 'transparent',
                  }}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.backgroundColor = 'color-mix(in oklab, var(--app-surface-2) 58%, transparent)';
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <td className="border px-3 py-2 align-top" style={{ borderColor: 'var(--app-border)' }}>
                    <div className="font-medium whitespace-pre-line break-words" style={{ color: 'var(--app-text)' }}>
                      {renderCourseName(item.courseName)}
                    </div>
                  </td>

                  {(['round1', 'round2', 'round3', 'qcms'] as ProgressField[]).map((field) => (
                    <td key={field} className="border px-2 py-1 text-center align-middle" style={{ borderColor: 'var(--app-border)' }}>
                      {canToggleProgress ? (
                        <button
                          type="button"
                          onClick={() => toggleProgress(item.id, field)}
                          className="mx-auto flex h-8 w-8 items-center justify-center rounded border text-base font-bold transition-colors"
                          style={{
                            borderColor: 'var(--app-border)',
                            color: 'var(--app-text)',
                            backgroundColor: progress[field]
                              ? 'color-mix(in oklab, var(--app-accent) 20%, var(--app-surface) 80%)'
                              : 'var(--app-surface)',
                          }}
                          title={progress[field] ? 'Marquer non fait' : 'Marquer fait'}
                          aria-label={progress[field] ? 'Marquer non fait' : 'Marquer fait'}
                        >
                          {progress[field] ? 'X' : ''}
                        </button>
                      ) : (
                        <span
                          className="mx-auto flex h-8 w-8 items-center justify-center rounded border text-base font-bold"
                          style={{
                            borderColor: 'var(--app-border)',
                            color: 'var(--app-text)',
                            backgroundColor: progress[field]
                              ? 'color-mix(in oklab, var(--app-accent) 16%, var(--app-surface) 84%)'
                              : 'var(--app-surface)',
                          }}
                        >
                          {progress[field] ? 'X' : ''}
                        </span>
                      )}
                    </td>
                  ))}

                  {isAdmin && (
                    <td className="border px-1.5 py-2 text-center" style={{ borderColor: 'var(--app-border)' }}>
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onEditItem(item)}
                          className="p-1.5 rounded-md border transition-colors"
                          style={{ borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                          title="Modifier"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteItem(item.id)}
                          className="p-1.5 rounded-md border transition-colors"
                          style={{
                            borderColor: 'color-mix(in oklab, var(--app-danger) 44%, var(--app-border) 56%)',
                            color: 'var(--app-danger)',
                            backgroundColor: 'color-mix(in oklab, var(--app-danger) 10%, transparent)',
                          }}
                          title="Supprimer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  if (authLoading) {
    return (
      <div className="flex-1 py-20" style={{ backgroundColor: 'var(--app-surface)' }}>
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="flex justify-center py-20">
            <div className="w-12 h-12 border-4 border-medical-200 border-t-medical-600 rounded-full animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div
        className="flex-1 py-16"
        style={{
          background:
            'linear-gradient(180deg, color-mix(in oklab, var(--app-surface) 95%, white 5%) 0%, color-mix(in oklab, var(--app-surface-2) 76%, var(--app-accent) 24%) 100%)',
        }}
      >
        <div className="container mx-auto px-4 max-w-3xl">
          <section
            className="rounded-3xl border p-8 text-center space-y-4"
            style={{
              borderColor: 'color-mix(in oklab, var(--app-accent) 24%, var(--app-border) 76%)',
              backgroundColor: 'var(--app-surface)',
            }}
          >
            <h1 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--app-text)' }}>
              Accès au planning réservé aux membres
            </h1>
            <p className="text-sm md:text-base" style={{ color: 'var(--app-muted)' }}>
              Il faut vous inscrire ou vous connecter pour voir le planning.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Link
                href="/sign-up"
                className="inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
                style={{
                  background:
                    'linear-gradient(135deg, color-mix(in oklab, var(--app-accent) 88%, #000 12%) 0%, var(--app-accent) 100%)',
                }}
              >
                S&apos;inscrire
              </Link>
              <Link
                href="/sign-in"
                className="inline-flex items-center justify-center rounded-xl border px-5 py-2.5 text-sm font-semibold"
                style={{ borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
              >
                Se connecter
              </Link>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex-1 py-12"
      style={{
        background:
          'linear-gradient(180deg, color-mix(in oklab, var(--app-surface) 95%, white 5%) 0%, color-mix(in oklab, var(--app-surface-2) 76%, var(--app-accent) 24%) 100%)',
      }}
    >
      <div className="container mx-auto px-4 max-w-7xl space-y-8">
        <section
          className="rounded-3xl border p-6 md:p-8"
          style={{
            borderColor: 'color-mix(in oklab, var(--app-accent) 24%, var(--app-border) 76%)',
            background:
              'linear-gradient(145deg, var(--hero-bg-start) 0%, color-mix(in oklab, var(--hero-bg-end) 82%, var(--app-accent) 18%) 100%)',
          }}
        >
          <p className="text-xs uppercase tracking-[0.14em]" style={{ color: 'var(--hero-body)' }}>
            Programme de révision
          </p>
          <h1 className="text-3xl md:text-4xl font-bold mt-2" style={{ color: 'var(--hero-title)' }}>
            Planning ORL
          </h1>
        </section>

        {isAdmin && (
          <section
            className="rounded-3xl border p-5 md:p-6 shadow-sm"
            style={{
              borderColor: 'color-mix(in oklab, var(--app-accent) 24%, var(--app-border) 76%)',
              background:
                'linear-gradient(180deg, color-mix(in oklab, var(--app-surface) 96%, white 4%) 0%, color-mix(in oklab, var(--app-surface-2) 84%, var(--app-accent) 16%) 100%)',
            }}
          >
            <div
              className="mb-5 rounded-2xl border px-4 py-3"
              style={{
                borderColor: 'color-mix(in oklab, var(--app-accent) 28%, var(--app-border) 72%)',
                backgroundColor: 'color-mix(in oklab, var(--app-accent) 10%, var(--app-surface) 90%)',
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-bold inline-flex items-center gap-2" style={{ color: 'var(--app-text)' }}>
                  <CheckCircle2 className="h-5 w-5 text-medical-600" />
                  Gestion du planning
                </h2>
                {editingItemId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-3 py-1.5 rounded-lg border text-sm font-medium"
                    style={{ borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                  >
                    Annuler l&apos;édition
                  </button>
                )}
              </div>
              <p className="mt-2 text-sm" style={{ color: 'var(--app-muted)' }}>
                Ajoute rapidement un cours par spécialité, puis coche les tours/QCM depuis le tableau.
              </p>
            </div>

            <form onSubmit={onSaveItem} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 rounded-2xl border p-4" style={{ borderColor: 'var(--app-border)', backgroundColor: 'color-mix(in oklab, var(--app-surface) 95%, white 5%)' }}>
                <div className="md:col-span-5">
                  <label className="text-sm font-semibold mb-1.5 block" style={{ color: 'var(--app-text)' }}>Spécialité</label>
                  <select
                    value={formState.specialty}
                    onChange={(event) => onSpecialtyChange(event.target.value as SpecialtyKey)}
                    className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500"
                    style={{
                      borderColor: 'var(--app-border)',
                      backgroundColor: 'color-mix(in oklab, var(--app-surface) 92%, white 8%)',
                      color: 'var(--app-text)',
                    }}
                  >
                    <option value="otologie">Otologie</option>
                    <option value="rhinologie-sinusologie">Rhinologie-Sinusologie</option>
                    <option value="cervicologie">Cervicologie</option>
                  </select>
                </div>

                <div className="md:col-span-5">
                  <label className="text-sm font-semibold mb-1.5 block" style={{ color: 'var(--app-text)' }}>Type du cours</label>
                  <select
                    value={formState.courseType}
                    onChange={(event) => setFormState((prev) => ({ ...prev, courseType: event.target.value }))}
                    className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500"
                    style={{
                      borderColor: 'var(--app-border)',
                      backgroundColor: 'color-mix(in oklab, var(--app-surface) 92%, white 8%)',
                      color: 'var(--app-text)',
                    }}
                  >
                    {SPECIALTY_CONFIG[formState.specialty].typeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2 md:self-end">
                  <button
                    type="submit"
                    disabled={isSavingItem}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-95 disabled:opacity-70"
                    style={{
                      background:
                        'linear-gradient(135deg, color-mix(in oklab, var(--app-accent) 88%, #000 12%) 0%, var(--app-accent) 100%)',
                      boxShadow: '0 8px 20px color-mix(in oklab, var(--app-accent) 28%, transparent)',
                    }}
                  >
                    {editingItemId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    {editingItemId ? 'Mettre à jour' : 'Ajouter'}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--app-border)', backgroundColor: 'color-mix(in oklab, var(--app-surface) 96%, white 4%)' }}>
                <label className="text-sm font-semibold mb-1.5 block" style={{ color: 'var(--app-text)' }}>Cours</label>
                <textarea
                  value={formState.courseName}
                  onChange={(event) => setFormState((prev) => ({ ...prev, courseName: event.target.value }))}
                  placeholder={"Ex. Otite moyenne aiguë\n- Définition\n+ Traitement\n1. QCM rapide"}
                  rows={5}
                  className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500 resize-y"
                  style={{
                    borderColor: 'var(--app-border)',
                    backgroundColor: 'color-mix(in oklab, var(--app-surface) 94%, white 6%)',
                    color: 'var(--app-text)',
                  }}
                  required
                />
                <p className="mt-1 text-xs" style={{ color: 'var(--app-muted)' }}>
                  Tu peux utiliser: <strong>-</strong>, <strong>+</strong>, <strong>1.</strong> pour structurer en liste.
                </p>
              </div>

              {SPECIALTY_CONFIG[formState.specialty].requiresChapter && (
                <div className="rounded-2xl border p-4 space-y-2" style={{ borderColor: 'var(--app-border)', backgroundColor: 'color-mix(in oklab, var(--app-surface) 96%, white 4%)' }}>
                  <label className="text-sm font-semibold mb-1.5 block" style={{ color: 'var(--app-text)' }}>Nom du chapitre</label>
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
                    <input
                      type="text"
                      value={newChapterDraft}
                      onChange={(event) => setNewChapterDraft(event.target.value)}
                      placeholder="Ajouter un chapitre"
                      className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500"
                      style={{
                        borderColor: 'var(--app-border)',
                        backgroundColor: 'color-mix(in oklab, var(--app-surface) 92%, white 8%)',
                        color: 'var(--app-text)',
                      }}
                    />
                    <button
                      type="button"
                      onClick={onAddChapterOption}
                      className="rounded-xl border px-3 py-2.5 text-sm font-semibold"
                      style={{ borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                    >
                      Ajouter chapitre
                    </button>
                  </div>

                  <input type="hidden" value={formState.chapterName} required />

                  <div className="rounded-xl border p-2.5" style={{ borderColor: 'var(--app-border)' }}>
                    <div className="space-y-2">
                      {chapterOptions.length === 0 && (
                        <span className="text-xs" style={{ color: 'var(--app-muted)' }}>
                          Aucun chapitre pour le moment.
                        </span>
                      )}

                      {chapterOptions.map((chapterOption) => {
                        const isSelected = normalizeChapterKey(formState.chapterName) === chapterOption.key;
                        const chapterIndex = chapterOptions.findIndex((option) => option.key === chapterOption.key);
                        const isFirst = chapterIndex === 0;
                        const isLast = chapterIndex === chapterOptions.length - 1;

                        return (
                          <label
                            key={chapterOption.key}
                            className="flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer"
                            style={{
                              borderColor: isSelected ? 'var(--app-accent)' : 'var(--app-border)',
                              backgroundColor: isSelected
                                ? 'color-mix(in oklab, var(--app-accent) 16%, var(--app-surface) 84%)'
                                : 'var(--app-surface)',
                            }}
                          >
                            <input
                              type="radio"
                              name="chapter-selection"
                              checked={isSelected}
                              onChange={() => setFormState((prev) => ({ ...prev, chapterName: chapterOption.label }))}
                              className="h-4 w-4"
                              style={{ accentColor: 'var(--app-accent)' }}
                            />
                            <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                              <span className="text-sm truncate" style={{ color: 'var(--app-text)' }}>
                                {chapterOption.label}
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    onMoveChapterOption(chapterOption.key, 'up');
                                  }}
                                  disabled={isFirst}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border disabled:opacity-40"
                                  style={{ borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                                  title="Monter"
                                  aria-label="Monter"
                                >
                                  <ArrowUp className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    onMoveChapterOption(chapterOption.key, 'down');
                                  }}
                                  disabled={isLast}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border disabled:opacity-40"
                                  style={{ borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                                  title="Descendre"
                                  aria-label="Descendre"
                                >
                                  <ArrowDown className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <p className="mt-1 text-xs" style={{ color: 'var(--app-muted)' }}>
                    Choisis un chapitre, puis réordonne-le avec les flèches.
                  </p>
                </div>
              )}
            </form>
          </section>
        )}

        <section
          className="rounded-2xl border p-4 md:p-5"
          style={{
            borderColor: 'var(--app-border)',
            backgroundColor: 'color-mix(in oklab, var(--app-surface) 95%, white 5%)',
          }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--app-muted)' }}>
                Spécialité
              </label>
              <select
                value={filters.specialty}
                onChange={(event) => {
                  const nextSpecialty = event.target.value as PlanningFilterState['specialty'];
                  setFilters((prev) => ({
                    ...prev,
                    specialty: nextSpecialty,
                    courseType: 'all',
                    chapterKey: 'all',
                  }));
                }}
                className="w-full rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)', color: 'var(--app-text)' }}
              >
                <option value="all">Toutes les spécialités</option>
                <option value="otologie">Otologie</option>
                <option value="rhinologie-sinusologie">Rhinologie-Sinusologie</option>
                <option value="cervicologie">Cervicologie</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--app-muted)' }}>
                Type du cours
              </label>
              <select
                value={filters.courseType}
                onChange={(event) => setFilters((prev) => ({ ...prev, courseType: event.target.value }))}
                className="w-full rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)', color: 'var(--app-text)' }}
              >
                <option value="all">Tous les types</option>
                {availableCourseTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--app-muted)' }}>
                Chapitre (Rhino/Cervico)
              </label>
              <select
                value={filters.chapterKey}
                onChange={(event) => setFilters((prev) => ({ ...prev, chapterKey: event.target.value }))}
                disabled={availableChapters.length === 0}
                className="w-full rounded-xl border px-3 py-2 text-sm disabled:opacity-60"
                style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)', color: 'var(--app-text)' }}
              >
                <option value="all">Tous les chapitres</option>
                {availableChapters.map((chapter) => (
                  <option key={chapter.key} value={chapter.key}>
                    {chapter.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--app-muted)' }}>
                Cours
              </label>
              <input
                type="text"
                value={filters.courseQuery}
                onChange={(event) => setFilters((prev) => ({ ...prev, courseQuery: event.target.value }))}
                placeholder="Rechercher un cours"
                className="w-full rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)', color: 'var(--app-text)' }}
              />
            </div>
          </div>
        </section>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-12 h-12 border-4 border-medical-200 border-t-medical-600 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-8">
            {(Object.keys(SPECIALTY_CONFIG) as SpecialtyKey[])
              .filter((specialty) => filters.specialty === 'all' || filters.specialty === specialty)
              .map((specialty) => (
                <section key={specialty} className="space-y-3">
                  <h2 className="text-2xl font-bold" style={{ color: 'var(--app-text)' }}>
                    {SPECIALTY_CONFIG[specialty].title}
                  </h2>
                  {renderSpecialtyTable(specialty)}
                </section>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
