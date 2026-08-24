'use client';

import { useEffect, useMemo, useState, FormEvent, useRef } from 'react';
import Link from 'next/link';
import {
  addDoc,
  collection,
  db,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from '@/lib/data/local-data';
import { useAuth } from '@/components/providers/auth-provider';
import {
  Calendar as CalendarIcon,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit2,
  Filter,
  List,
  ListOrdered,
  LayoutGrid,
  Columns,
  Plus,
  Search,
  Trash2,
  X,
  StickyNote,
  BookOpen,
  GraduationCap,
  ClipboardCheck,
  User,
  MapPin,
  Timer,
  Bold,
  Italic,
  Underline,
} from 'lucide-react';

type ViewMode = 'month' | 'week' | 'day' | 'agenda';
type PlannerCategory = 'cours' | 'revision' | 'examen' | 'personnel' | 'autre';
type PlannerEvent = {
  id: string;
  userId: string;
  title: string;
  description: string;
  category: PlannerCategory;
  color: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  createdAt?: string;
  updatedAt?: string;
};

type PlannerFormState = {
  title: string;
  description: string;
  category: PlannerCategory;
  color: string;
  date: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  location: string;
};

const CATEGORY_CONFIG: Record<
  PlannerCategory,
  { label: string; icon: typeof BookOpen; dot: string; bg: string; border: string }
> = {
  cours: {
    label: 'Cours',
    icon: BookOpen,
    dot: 'bg-[#b0673e]',
    bg: 'bg-[color-mix(in_oklab,var(--app-accent)_12%,var(--app-surface)_88%)]',
    border: 'border-[color-mix(in_oklab,var(--app-accent)_36%,var(--app-border)_64%)]',
  },
  revision: {
    label: 'Révision',
    icon: GraduationCap,
    dot: 'bg-[#3f7ca1]',
    bg: 'bg-[color-mix(in_oklab,#3f7ca1_14%,var(--app-surface)_86%)]',
    border: 'border-[color-mix(in_oklab,#3f7ca1_36%,var(--app-border)_64%)]',
  },
  examen: {
    label: 'Examen / QCM',
    icon: ClipboardCheck,
    dot: 'bg-[#5b7b58]',
    bg: 'bg-[color-mix(in_oklab,#5b7b58_14%,var(--app-surface)_86%)]',
    border: 'border-[color-mix(in_oklab,#5b7b58_36%,var(--app-border)_64%)]',
  },
  personnel: {
    label: 'Personnel',
    icon: User,
    dot: 'bg-[#a15f72]',
    bg: 'bg-[color-mix(in_oklab,#a15f72_14%,var(--app-surface)_86%)]',
    border: 'border-[color-mix(in_oklab,#a15f72_36%,var(--app-border)_64%)]',
  },
  autre: {
    label: 'Autre',
    icon: StickyNote,
    dot: 'bg-[#7a6a57]',
    bg: 'bg-[color-mix(in_oklab,#7a6a57_10%,var(--app-surface)_90%)]',
    border: 'border-[color-mix(in_oklab,#7a6a57_24%,var(--app-border)_76%)]',
  },
};

const CATEGORY_COLORS: Record<PlannerCategory, string> = {
  cours: '#b0673e',
  revision: '#3f7ca1',
  examen: '#5b7b58',
  personnel: '#a15f72',
  autre: '#7a6a57',
};

const VIEW_LABELS: Record<ViewMode, string> = {
  month: 'Mois',
  week: 'Semaine',
  day: 'Jour',
  agenda: 'Agenda',
};

const WEEKDAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const WEEKDAYS_FULL = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const MONTHS_FR = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);

const toDateKey = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const parseDateKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
};

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const isToday = (d: Date) => sameDay(d, new Date());

const formatDayHeader = (d: Date) => {
  const day = WEEKDAYS_FULL[(d.getDay() + 6) % 7];
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${day} ${dd}/${mm}`;
};

const formatTime = (date: Date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

const formatRange = (startIso: string, endIso: string, allDay: boolean) => {
  const s = new Date(startIso);
  const e = new Date(endIso);
  if (allDay) return 'Journée entière';
  if (sameDay(s, e)) return `${formatTime(s)} – ${formatTime(e)}`;
  return `${s.toLocaleDateString('fr-FR')} ${formatTime(s)} → ${e.toLocaleDateString('fr-FR')} ${formatTime(e)}`;
};

const isHtmlNote = (s: string) => /<[^>]+>/.test(s);
// compact : bullets visibles même en version tronquée semaine
const stripHtmlToText = (html: string) =>
  html
    .replace(/<\/li>/gi, ' • ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<\/div>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const getMonthMatrix = (current: Date) => {
  const year = current.getFullYear();
  const month = current.getMonth();
  const firstDay = new Date(year, month, 1);
  const startWeekDay = (firstDay.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - startWeekDay);
  const rows: Date[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      const idx = w * 7 + d;
      week.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + idx, 12, 0, 0, 0));
    }
    rows.push(week);
  }
  return rows;
};

const getWeekDays = (current: Date) => {
  const dayIdx = (current.getDay() + 6) % 7;
  const monday = new Date(current);
  monday.setDate(current.getDate() - dayIdx);
  monday.setHours(12, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
};

// — Fix agenda semaine : helpers pour clamping multi-jours et layout chevauchements
const clampEventToDay = (day: Date, ev: PlannerEvent): { startMin: number; endMin: number; clampedStart: Date; clampedEnd: Date } | null => {
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(day);
  dayEnd.setHours(23, 59, 59, 999);
  const s = new Date(ev.start);
  const e = new Date(ev.end);
  if (e.getTime() <= s.getTime()) return null;
  if (e.getTime() <= dayStart.getTime() || s.getTime() > dayEnd.getTime()) return null;
  const clampedStart = s < dayStart ? dayStart : s;
  const clampedEnd = e > dayEnd ? dayEnd : e;
  const startMin = clampedStart.getHours() * 60 + clampedStart.getMinutes();
  // si fin == 23:59 du jour et événement déborde au lendemain, on étend à 24*60 pour remplir la grille
  const isEndOfDay = clampedEnd.getHours() === 23 && clampedEnd.getMinutes() === 59 && e.getTime() > dayEnd.getTime();
  const endMin = isEndOfDay ? 24 * 60 : clampedEnd.getHours() * 60 + clampedEnd.getMinutes();
  if (endMin <= startMin) return null;
  return { startMin, endMin, clampedStart, clampedEnd };
};

type WeekLayoutEvent = {
  ev: PlannerEvent;
  startMin: number;
  endMin: number;
  column: number;
  totalColumns: number;
};

const layoutWeekDayEvents = (day: Date, events: PlannerEvent[]): WeekLayoutEvent[] => {
  const withClamp = events
    .map((ev) => {
      const c = clampEventToDay(day, ev);
      return c ? { ev, startMin: c.startMin, endMin: c.endMin } : null;
    })
    .filter((x): x is { ev: PlannerEvent; startMin: number; endMin: number } => Boolean(x))
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  if (withClamp.length === 0) return [];

  // regroupement par clusters qui se chevauchent (transitivement)
  const clusters: Array<Array<{ ev: PlannerEvent; startMin: number; endMin: number }>> = [];
  let current: Array<{ ev: PlannerEvent; startMin: number; endMin: number }> = [];
  let clusterEnd = -1;
  for (const item of withClamp) {
    if (current.length === 0) {
      current = [item];
      clusterEnd = item.endMin;
    } else if (item.startMin < clusterEnd) {
      current.push(item);
      clusterEnd = Math.max(clusterEnd, item.endMin);
    } else {
      clusters.push(current);
      current = [item];
      clusterEnd = item.endMin;
    }
  }
  if (current.length) clusters.push(current);

  const result: WeekLayoutEvent[] = [];
  for (const cluster of clusters) {
    const sorted = [...cluster].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
    const colEnds: number[] = [];
    const colOf = new Map<string, number>();
    for (const it of sorted) {
      let colIdx = colEnds.findIndex((end) => it.startMin >= end);
      if (colIdx === -1) {
        colIdx = colEnds.length;
        colEnds.push(it.endMin);
      } else {
        colEnds[colIdx] = it.endMin;
      }
      colOf.set(it.ev.id, colIdx);
    }
    const total = colEnds.length || 1;
    for (const it of cluster) {
      result.push({
        ev: it.ev,
        startMin: it.startMin,
        endMin: it.endMin,
        column: colOf.get(it.ev.id) ?? 0,
        totalColumns: total,
      });
    }
  }
  return result.sort((a, b) => a.startMin - b.startMin);
};

const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1, 12, 0, 0, 0);
const addDays = (d: Date, n: number) => {
  const nd = new Date(d);
  nd.setDate(d.getDate() + n);
  nd.setHours(12, 0, 0, 0);
  return nd;
};

const defaultFormState = (date: Date, hours?: number): PlannerFormState => {
  const hh = typeof hours === 'number' ? hours : 9;
  const dateKey = toDateKey(date);
  return {
    title: '',
    description: '',
    category: 'cours',
    color: CATEGORY_COLORS.cours,
    date: dateKey,
    startTime: `${String(hh).padStart(2, '0')}:00`,
    endTime: `${String(Math.min(23, hh + 1)).padStart(2, '0')}:00`,
    allDay: false,
    location: '',
  };
};

const buildIsoRange = (form: PlannerFormState) => {
  const base = parseDateKey(form.date);
  if (form.allDay) {
    const s = new Date(base);
    s.setHours(0, 0, 0, 0);
    const e = new Date(base);
    e.setHours(23, 59, 59, 999);
    return { start: s.toISOString(), end: e.toISOString() };
  }
  const [sh, sm] = form.startTime.split(':').map(Number);
  const [eh, em] = form.endTime.split(':').map(Number);
  const s = new Date(base);
  s.setHours(sh || 0, sm || 0, 0, 0);
  const e = new Date(base);
  e.setHours(eh || 0, em || 0, 0, 0);
  if (e.getTime() <= s.getTime()) {
    e.setDate(e.getDate() + 1);
  }
  if (e.getTime() <= s.getTime()) {
    e.setTime(s.getTime() + 60 * 60 * 1000);
  }
  return { start: s.toISOString(), end: e.toISOString() };
};

const toFormFromEvent = (ev: PlannerEvent): PlannerFormState => {
  const s = new Date(ev.start);
  return {
    title: ev.title,
    description: ev.description || '',
    category: ev.category,
    color: ev.color || CATEGORY_COLORS[ev.category],
    date: toDateKey(s),
    startTime: formatTime(s),
    endTime: formatTime(new Date(ev.end)),
    allDay: Boolean(ev.allDay),
    location: ev.location || '',
  };
};

export function PlannerAgenda({ embedded = false }: { embedded?: boolean } = {}) {
  const { user, loading: authLoading } = useAuth();
  const [events, setEvents] = useState<PlannerEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(() => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    return d;
  });
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | PlannerCategory>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<PlannerEvent | null>(null);
  const [formState, setFormState] = useState<PlannerFormState>(() => defaultFormState(new Date()));
  const [isSaving, setIsSaving] = useState(false);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNowTick(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const noteEditorRef = useRef<HTMLDivElement>(null);

  const execNoteCommand = (command: string, value?: string) => {
    noteEditorRef.current?.focus();
    // execCommand est deprecated mais reste le plus léger pour bold/italic/underline/liste sans lib externe
    document.execCommand(command, false, value);
    if (noteEditorRef.current) {
      const rawHtml = noteEditorRef.current.innerHTML;
      const text = noteEditorRef.current.innerText?.trim() ?? '';
      const next = text ? rawHtml : '';
      setFormState((p) => ({ ...p, description: next }));
      if (!text && rawHtml) {
        requestAnimationFrame(() => {
          if (noteEditorRef.current && noteEditorRef.current.innerText.trim() === '') {
            noteEditorRef.current.innerHTML = '';
          }
        });
      }
    }
  };

  const syncNoteFromEditor = () => {
    if (noteEditorRef.current) {
      const rawHtml = noteEditorRef.current.innerHTML;
      const text = noteEditorRef.current.innerText?.trim() ?? '';
      const next = text ? rawHtml : '';
      setFormState((p) => ({ ...p, description: next }));
      // placeholder CSS :empty ne matche pas <br> seul -> on vide réellement le DOM
      if (!text && rawHtml && rawHtml !== '') {
        // ne pas casser le curseur pendant la frappe -> nettoyage différé
        requestAnimationFrame(() => {
          if (noteEditorRef.current && noteEditorRef.current.innerText.trim() === '') {
            noteEditorRef.current.innerHTML = '';
          }
        });
      }
    }
  };

  useEffect(() => {
    if (isModalOpen && noteEditorRef.current) {
      // initialise le contenu éditable depuis formState (HTML ou texte brut)
      const raw = formState.description || '';
      const isHtml = /<[^>]+>/.test(raw);
      const html = isHtml ? raw : raw.replace(/\n/g, '<br>');
      if (noteEditorRef.current.innerHTML !== html) {
        noteEditorRef.current.innerHTML = html;
      }
    }
  }, [isModalOpen, editingEvent?.id]);

  // Modal Ajouter événement : dark/light + accessibilité (Escape, lock scroll)
  useEffect(() => {
    if (!isModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isModalOpen]);

  const fetchEvents = async () => {
    if (!user) {
      setEvents([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const snap = await getDocs(query(collection(db, 'plannerEvents'), where('userId', '==', user.uid)));
      const next: PlannerEvent[] = snap.docs
        .map((entry) => {
          const data = entry.data() as Partial<PlannerEvent>;
          return {
            id: entry.id,
            userId: String(data.userId || user.uid),
            title: String(data.title || 'Sans titre'),
            description: String(data.description || ''),
            category: (data.category as PlannerCategory) || 'autre',
            color: String(data.color || CATEGORY_COLORS[(data.category as PlannerCategory) || 'autre'] || '#7a6a57'),
            start: String(data.start || new Date().toISOString()),
            end: String(data.end || new Date().toISOString()),
            allDay: Boolean(data.allDay),
            location: String(data.location || ''),
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          };
        })
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
      setEvents(next);
    } catch (error) {
      console.error('Error loading planner events:', error);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const filteredEvents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return events.filter((ev) => {
      if (categoryFilter !== 'all' && ev.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        ev.title.toLowerCase().includes(q) ||
        ev.description.toLowerCase().includes(q) ||
        ev.location.toLowerCase().includes(q)
      );
    });
  }, [events, searchQuery, categoryFilter]);

  const eventsByDayKey = useMemo(() => {
    const map = new Map<string, PlannerEvent[]>();
    filteredEvents.forEach((ev) => {
      const s = new Date(ev.start);
      const e = new Date(ev.end);
      const cursor = new Date(s);
      cursor.setHours(12, 0, 0, 0);
      const endDay = new Date(e);
      endDay.setHours(12, 0, 0, 0);
      while (cursor.getTime() <= endDay.getTime()) {
        const key = toDateKey(cursor);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(ev);
        cursor.setDate(cursor.getDate() + 1);
      }
    });
    map.forEach((list, key) => {
      map.set(
        key,
        [...list].sort((a, b) => {
          if (a.allDay && !b.allDay) return -1;
          if (!a.allDay && b.allDay) return 1;
          return new Date(a.start).getTime() - new Date(b.start).getTime();
        })
      );
    });
    return map;
  }, [filteredEvents]);

  const monthMatrix = useMemo(() => getMonthMatrix(currentDate), [currentDate]);
  const weekDays = useMemo(() => getWeekDays(currentDate), [currentDate]);

  const upcomingEvents = useMemo(() => {
    const now = new Date();
    return [...filteredEvents]
      .filter((ev) => new Date(ev.end).getTime() >= now.getTime())
      .slice(0, 6);
  }, [filteredEvents]);

  const todayCount = useMemo(() => {
    const key = toDateKey(new Date());
    return eventsByDayKey.get(key)?.length || 0;
  }, [eventsByDayKey]);

  const openCreateModal = (date?: Date, hour?: number) => {
    const base = date || currentDate;
    setEditingEvent(null);
    setFormState(defaultFormState(base, hour));
    setIsModalOpen(true);
  };

  const openEditModal = (ev: PlannerEvent) => {
    setEditingEvent(ev);
    setFormState(toFormFromEvent(ev));
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingEvent(null);
  };

  const onSaveEvent = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!formState.title.trim()) return;
    const { start, end } = buildIsoRange(formState);
    const payload = {
      userId: user.uid,
      title: formState.title.trim(),
      description: formState.description.trim(),
      category: formState.category,
      color: formState.color || CATEGORY_COLORS[formState.category],
      start,
      end,
      allDay: formState.allDay,
      location: formState.location.trim(),
      updatedAt: new Date().toISOString(),
    };
    try {
      setIsSaving(true);
      if (editingEvent) {
        await updateDoc(doc(db, 'plannerEvents', editingEvent.id), payload);
      } else {
        await addDoc(collection(db, 'plannerEvents'), {
          ...payload,
          createdAt: new Date().toISOString(),
        });
      }
      await fetchEvents();
      closeModal();
    } catch (err) {
      console.error('Error saving planner event:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const onDeleteEvent = async (id: string) => {
    const ok = confirm('Supprimer cet événement ?');
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'plannerEvents', id));
      setEvents((prev) => prev.filter((ev) => ev.id !== id));
      closeModal();
    } catch (err) {
      console.error('Error deleting planner event:', err);
    }
  };

  const handlePrev = () => {
    if (viewMode === 'month') setCurrentDate((prev) => addMonths(prev, -1));
    else if (viewMode === 'week') setCurrentDate((prev) => addDays(prev, -7));
    else setCurrentDate((prev) => addDays(prev, -1));
  };
  const handleNext = () => {
    if (viewMode === 'month') setCurrentDate((prev) => addMonths(prev, 1));
    else if (viewMode === 'week') setCurrentDate((prev) => addDays(prev, 7));
    else setCurrentDate((prev) => addDays(prev, 1));
  };
  const handleToday = () => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    setCurrentDate(d);
  };

  const headerLabel = useMemo(() => {
    if (viewMode === 'month') return `${MONTHS_FR[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    if (viewMode === 'week') {
      const start = weekDays[0];
      const end = weekDays[6];
      if (start.getMonth() === end.getMonth())
        return `${MONTHS_FR[start.getMonth()]} ${start.getFullYear()} · ${String(start.getDate()).padStart(2, '0')} – ${String(end.getDate()).padStart(2, '0')}`;
      return `${String(start.getDate()).padStart(2, '0')} ${MONTHS_FR[start.getMonth()].slice(0, 3)} – ${String(end.getDate()).padStart(2, '0')} ${MONTHS_FR[end.getMonth()].slice(0, 3)} ${end.getFullYear()}`;
    }
    return currentDate.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  }, [currentDate, viewMode, weekDays]);

  const agendaGrouped = useMemo(() => {
    const groups = new Map<string, PlannerEvent[]>();
    filteredEvents.forEach((ev) => {
      const key = toDateKey(new Date(ev.start));
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(ev);
    });
    groups.forEach((list, key) => {
      groups.set(
        key,
        [...list].sort((a, b) => {
          if (a.allDay && !b.allDay) return -1;
          if (!a.allDay && b.allDay) return 1;
          return new Date(a.start).getTime() - new Date(b.start).getTime();
        })
      );
    });
    return Array.from(groups.entries())
      .sort((a, b) => parseDateKey(a[0]).getTime() - parseDateKey(b[0]).getTime())
      .slice(0, 30);
  }, [filteredEvents]);

  if (authLoading) {
    if (embedded) {
      return (
        <div className="flex justify-center py-16">
          <div className="w-10 h-10 border-4 border-medical-200 border-t-medical-600 rounded-full animate-spin" />
        </div>
      );
    }
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
    if (embedded) return null;
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
              Accès au Planner réservé aux membres
            </h1>
            <p className="text-sm md:text-base" style={{ color: 'var(--app-muted)' }}>
              Connecte-toi pour organiser tes cours, révisions et notes comme dans Google Agenda.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Link
                href="/sign-up"
                className="inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-semibold"
                style={{
                  background:
                    'linear-gradient(135deg, color-mix(in oklab, var(--app-accent) 88%, #000 12%) 0%, var(--app-accent) 100%)',
                  color: 'var(--app-accent-contrast)',
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

  const plannerHero = (
        <section
          className="rounded-3xl border p-6 md:p-7 flex flex-col md:flex-row md:items-center justify-between gap-4"
          style={{
            borderColor: 'color-mix(in oklab, var(--app-accent) 24%, var(--app-border) 76%)',
            background:
              'linear-gradient(145deg, var(--hero-bg-start) 0%, color-mix(in oklab, var(--hero-bg-end) 82%, var(--app-accent) 18%) 100%)',
          }}
        >
          <div>
            <p className="text-xs uppercase tracking-[0.14em]" style={{ color: 'var(--hero-body)' }}>
              Organisation du temps
            </p>
            <h1 className="text-3xl md:text-4xl font-bold mt-1" style={{ color: 'var(--hero-title)' }}>
              Planner Agenda
            </h1>
            <p className="text-sm mt-2 max-w-2xl" style={{ color: 'var(--hero-body)' }}>
              Planifie tes cours, révisions, QCM et examens comme Google Agenda. Ajoute des notes, organise par couleur et garde une vue claire sur ton temps.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openCreateModal()}
            className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold shrink-0 shadow-lg hover:brightness-95 transition"
            style={{
              background:
                'linear-gradient(135deg, color-mix(in oklab, var(--app-accent) 88%, #000 12%) 0%, var(--app-accent) 100%)',
              color: 'var(--app-accent-contrast)',
            }}
          >
            <Plus className="h-4 w-4" /> Nouvel événement
          </button>
        </section>
  );

  const plannerMain = (
    <>
        {/* Controls bar */}
        <section
          className="rounded-2xl border p-3 md:p-4 flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between"
          style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)' }}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleToday}
              className="rounded-xl border px-4 py-2 text-sm font-semibold hover:brightness-95 transition"
              style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface-2)', color: 'var(--app-text)' }}
            >
              Aujourd&apos;hui
            </button>
            <div className="flex items-center rounded-xl border overflow-hidden" style={{ borderColor: 'var(--app-border)' }}>
              <button onClick={handlePrev} className="p-2 hover:bg-[var(--app-surface-2)] transition" aria-label="Précédent">
                <ChevronLeft className="h-5 w-5" style={{ color: 'var(--app-text)' }} />
              </button>
              <div className="h-6 w-px" style={{ backgroundColor: 'var(--app-border)' }} />
              <button onClick={handleNext} className="p-2 hover:bg-[var(--app-surface-2)] transition" aria-label="Suivant">
                <ChevronRight className="h-5 w-5" style={{ color: 'var(--app-text)' }} />
              </button>
            </div>
            <h2 className="text-base md:text-lg font-bold capitalize ml-1" style={{ color: 'var(--app-text)' }}>
              {headerLabel}
            </h2>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center rounded-xl border p-1" style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface-2)' }}>
              {(['month', 'week', 'day', 'agenda'] as ViewMode[]).map((mode) => {
                const isActive = viewMode === mode;
                const Icon = mode === 'month' ? LayoutGrid : mode === 'week' ? Columns : mode === 'day' ? CalendarDays : List;
                return (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${isActive ? 'shadow-sm' : ''}`}
                    style={{
                      backgroundColor: isActive ? 'var(--app-accent)' : 'transparent',
                      color: isActive ? 'var(--app-accent-contrast)' : 'var(--app-text)',
                    }}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {VIEW_LABELS[mode]}
                  </button>
                );
              })}
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--app-muted)' }} />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher..."
                className="rounded-xl border pl-9 pr-3 py-2 text-sm w-40 md:w-56 focus:outline-none focus:ring-2 focus:ring-medical-500"
                style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)', color: 'var(--app-text)', colorScheme: 'light dark' } as React.CSSProperties}
              />
            </div>

            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: 'var(--app-muted)' }} />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as any)}
                className="rounded-xl border pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500 appearance-none"
                style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)', color: 'var(--app-text)', colorScheme: 'light dark' } as React.CSSProperties}
              >
                <option value="all">Toutes catégories</option>
                <option value="cours">Cours</option>
                <option value="revision">Révision</option>
                <option value="examen">Examen / QCM</option>
                <option value="personnel">Personnel</option>
                <option value="autre">Autre</option>
              </select>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
          {/* Sidebar */}
          <aside className="space-y-4 lg:sticky lg:top-24 self-start">
            {/* Mini calendar */}
            <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)' }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold" style={{ color: 'var(--app-text)' }}>
                  {MONTHS_FR[currentDate.getMonth()]} {currentDate.getFullYear()}
                </h3>
                <div className="flex items-center gap-1">
                  <button onClick={() => setCurrentDate((d) => addMonths(d, -1))} className="p-1 rounded hover:bg-[var(--app-surface-2)]">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button onClick={() => setCurrentDate((d) => addMonths(d, 1))} className="p-1 rounded hover:bg-[var(--app-surface-2)]">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center">
                {WEEKDAYS_FR.map((d) => (
                  <div key={d} className="text-[11px] font-semibold py-1" style={{ color: 'var(--app-muted)' }}>
                    {d}
                  </div>
                ))}
                {getMonthMatrix(currentDate)[0]
                  .concat(getMonthMatrix(currentDate)[1])
                  .concat(getMonthMatrix(currentDate)[2])
                  .concat(getMonthMatrix(currentDate)[3])
                  .concat(getMonthMatrix(currentDate)[4])
                  .concat(getMonthMatrix(currentDate)[5])
                  .slice(0, 35)
                  .map((d, idx) => {
                    const key = toDateKey(d);
                    const isCurrentMonth = d.getMonth() === currentDate.getMonth();
                    const selected = sameDay(d, currentDate);
                    const today = isToday(d);
                    const hasEvents = (eventsByDayKey.get(key)?.length || 0) > 0;
                    return (
                      <button
                        key={idx}
                        onClick={() => {
                          const nd = new Date(d);
                          nd.setHours(12, 0, 0, 0);
                          setCurrentDate(nd);
                          setViewMode('day');
                        }}
                        className={`relative h-8 w-8 mx-auto rounded-full text-xs flex items-center justify-center transition ${selected ? '' : isCurrentMonth ? '' : 'opacity-40'}`}
                        style={{
                          backgroundColor: selected ? 'var(--app-accent)' : today ? 'color-mix(in oklab, var(--app-accent) 14%, var(--app-surface) 86%)' : 'transparent',
                          color: selected ? 'var(--app-accent-contrast)' : isCurrentMonth ? 'var(--app-text)' : 'var(--app-muted)',
                          border: today && !selected ? '1px solid var(--app-accent)' : '1px solid transparent',
                        }}
                      >
                        {d.getDate()}
                        {hasEvents && !selected && <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-[var(--app-accent)]" />}
                      </button>
                    );
                  })}
              </div>
              <button
                onClick={() => openCreateModal(currentDate)}
                className="mt-3 w-full rounded-xl border py-2 text-sm font-semibold flex items-center justify-center gap-2 hover:brightness-95 transition"
                style={{ borderColor: 'var(--app-border)', color: 'var(--app-text)', backgroundColor: 'var(--app-surface-2)' }}
              >
                <Plus className="h-4 w-4" /> Créer
              </button>
            </div>

            {/* Stats */}
            <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)' }}>
              <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--app-text)' }}>
                Aperçu
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border p-3 text-center" style={{ borderColor: 'var(--app-border)', backgroundColor: 'color-mix(in oklab, var(--app-accent) 8%, var(--app-surface) 92%)' }}>
                  <p className="text-2xl font-bold" style={{ color: 'var(--app-accent)' }}>
                    {todayCount}
                  </p>
                  <p className="text-xs font-medium" style={{ color: 'var(--app-muted)' }}>
                    Aujourd&apos;hui
                  </p>
                </div>
                <div className="rounded-xl border p-3 text-center" style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface-2)' }}>
                  <p className="text-2xl font-bold" style={{ color: 'var(--app-text)' }}>
                    {filteredEvents.length}
                  </p>
                  <p className="text-xs font-medium" style={{ color: 'var(--app-muted)' }}>
                    Total
                  </p>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {(Object.keys(CATEGORY_CONFIG) as PlannerCategory[]).map((cat) => {
                  const count = filteredEvents.filter((e) => e.category === cat).length;
                  if (count === 0) return null;
                  const cfg = CATEGORY_CONFIG[cat];
                  return (
                    <div key={cat} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2" style={{ color: 'var(--app-text)' }}>
                        <span className={`h-2.5 w-2.5 rounded-full ${cfg.dot}`} />
                        {cfg.label}
                      </span>
                      <span className="font-semibold rounded-full px-2 py-0.5 border" style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface-2)', color: 'var(--app-text)' }}>
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Upcoming */}
            <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)' }}>
              <h3 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--app-text)' }}>
                <Clock className="h-4 w-4" style={{ color: 'var(--app-accent)' }} /> À venir
              </h3>
              {upcomingEvents.length === 0 ? (
                <p className="text-xs py-4 text-center" style={{ color: 'var(--app-muted)' }}>
                  Aucun événement à venir.
                  <br />
                  <button onClick={() => openCreateModal()} className="mt-2 text-[var(--app-accent)] font-semibold hover:underline">
                    + Ajouter un cours
                  </button>
                </p>
              ) : (
                <div className="space-y-2">
                  {upcomingEvents.map((ev) => (
                    <button
                      key={ev.id}
                      onClick={() => openEditModal(ev)}
                      className="w-full text-left rounded-xl border p-3 hover:brightness-95 transition"
                      style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface-2)', borderLeft: `4px solid ${ev.color}` }}
                    >
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--app-text)' }}>
                        {ev.title}
                      </p>
                      <p className="text-xs truncate" style={{ color: 'var(--app-muted)' }}>
                        {new Date(ev.start).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })} · {formatRange(ev.start, ev.end, ev.allDay)}
                      </p>
                      {ev.location && (
                        <p className="text-xs flex items-center gap-1 mt-1" style={{ color: 'var(--app-muted)' }}>
                          <MapPin className="h-3 w-3" /> {ev.location}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Legend */}
            <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)' }}>
              <h3 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--app-muted)' }}>
                Catégories
              </h3>
              <div className="space-y-2">
                {(Object.entries(CATEGORY_CONFIG) as [PlannerCategory, (typeof CATEGORY_CONFIG)[PlannerCategory]][]).map(([key, cfg]) => {
                  const Icon = cfg.icon;
                  return (
                    <div key={key} className="flex items-center gap-2 text-sm">
                      <span className={`h-3 w-3 rounded-full ${cfg.dot}`} />
                      <Icon className="h-3.5 w-3.5" style={{ color: 'var(--app-muted)' }} />
                      <span style={{ color: 'var(--app-text)' }}>{cfg.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>

          {/* Main calendar */}
          <div className="min-w-0">
            {loading ? (
              <div className="flex justify-center py-20">
                <div className="w-12 h-12 border-4 border-medical-200 border-t-medical-600 rounded-full animate-spin" />
              </div>
            ) : viewMode === 'month' ? (
              <div
                className="rounded-2xl border overflow-hidden"
                style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)', boxShadow: '0 10px 28px color-mix(in oklab, var(--app-border) 18%, transparent)' }}
              >
                <div className="grid grid-cols-7 border-b" style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface-2)' }}>
                  {WEEKDAYS_FR.map((d) => (
                    <div key={d} className="py-3 text-center text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--app-muted)' }}>
                      {d}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 auto-rows-fr">
                  {monthMatrix.flat().map((date, idx) => {
                    const key = toDateKey(date);
                    const isCurrentMonth = date.getMonth() === currentDate.getMonth();
                    const today = isToday(date);
                    const dayEvents = eventsByDayKey.get(key) || [];
                    const isSelected = selectedDayKey === key;
                    return (
                      <div
                        key={idx}
                        onClick={() => setSelectedDayKey((prev) => (prev === key ? null : key))}
                        className={`min-h-[120px] border-r border-b p-2 flex flex-col gap-1 cursor-pointer transition hover:brightness-[0.98] ${idx % 7 === 6 ? 'border-r-0' : ''}`}
                        style={{
                          borderColor: 'var(--app-border)',
                          backgroundColor: today
                            ? 'color-mix(in oklab, var(--app-accent) 6%, var(--app-surface) 94%)'
                            : isCurrentMonth
                              ? 'var(--app-surface)'
                              : 'color-mix(in oklab, var(--app-surface-2) 60%, var(--app-surface) 40%)',
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`h-7 w-7 flex items-center justify-center rounded-full text-sm font-semibold ${today ? '' : isCurrentMonth ? '' : 'opacity-50'}`}
                            style={{
                              backgroundColor: today ? 'var(--app-accent)' : 'transparent',
                              color: today ? 'var(--app-accent-contrast)' : isCurrentMonth ? 'var(--app-text)' : 'var(--app-muted)',
                            }}
                          >
                            {date.getDate()}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openCreateModal(date);
                            }}
                            className="h-6 w-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-[var(--app-surface-2)] transition border"
                            style={{ borderColor: 'var(--app-border)' }}
                            title="Ajouter"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="space-y-1 flex-1 overflow-hidden">
                          {dayEvents.slice(0, 3).map((ev) => (
                            <button
                              key={ev.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditModal(ev);
                              }}
                              className="w-full text-left rounded-md px-2 py-1 text-xs font-medium truncate flex items-center gap-1.5 border hover:brightness-95 transition"
                              style={{
                                backgroundColor: `${ev.color}18`,
                                borderColor: `${ev.color}40`,
                                color: 'var(--app-text)',
                                borderLeft: `3px solid ${ev.color}`,
                              }}
                              title={`${ev.title} · ${formatRange(ev.start, ev.end, ev.allDay)}`}
                            >
                              <span className="truncate">
                                {!ev.allDay && (
                                  <span className="font-mono text-[11px] mr-1" style={{ color: ev.color }}>
                                    {formatTime(new Date(ev.start))}
                                  </span>
                                )}
                                {ev.title}
                              </span>
                            </button>
                          ))}
                          {dayEvents.length > 3 && (
                            <div className="text-xs font-semibold px-1" style={{ color: 'var(--app-accent)' }}>
                              + {dayEvents.length - 3} autre{dayEvents.length - 3 > 1 ? 's' : ''}
                            </div>
                          )}
                          {dayEvents.length === 0 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openCreateModal(date);
                              }}
                              className="w-full rounded-md border border-dashed py-1.5 text-xs font-medium opacity-0 hover:opacity-100 transition flex items-center justify-center gap-1"
                              style={{ borderColor: 'var(--app-border)', color: 'var(--app-muted)' }}
                            >
                              <Plus className="h-3 w-3" /> Ajouter
                            </button>
                          )}
                        </div>

                        {isSelected && dayEvents.length > 0 && (
                          <div
                            className="mt-2 rounded-xl border p-2 space-y-1 max-h-40 overflow-auto"
                            style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface-2)' }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <p className="text-xs font-bold" style={{ color: 'var(--app-text)' }}>
                              {date.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' })}
                            </p>
                            {dayEvents.map((ev) => (
                              <button
                                key={ev.id}
                                onClick={() => openEditModal(ev)}
                                className="w-full text-left rounded-lg border px-2 py-1.5 hover:brightness-95 flex items-start gap-2"
                                style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)', borderLeft: `3px solid ${ev.color}` }}
                              >
                                <span className="flex-1 min-w-0">
                                  <span className="text-xs font-semibold block truncate" style={{ color: 'var(--app-text)' }}>
                                    {ev.title}
                                  </span>
                                  <span className="text-[11px] block truncate" style={{ color: 'var(--app-muted)' }}>
                                    {formatRange(ev.start, ev.end, ev.allDay)} {ev.location ? `· ${ev.location}` : ''}
                                  </span>
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : viewMode === 'week' ? (
              <div
                className="rounded-2xl border overflow-hidden flex flex-col"
                style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)' }}
              >
                {/* Semaine : grid responsive — fix oversize (pas de min-w forcé sur desktop, scroll horizontal seulement sur mobile) */}
                <div className="overflow-auto max-h-[560px] overscroll-contain" id="week-scroll">
                  <div className="min-w-[640px] md:min-w-0">
                    {/* En-tête semaine */}
                    <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] md:grid-cols-[64px_repeat(7,1fr)] border-b sticky top-0 z-20 shrink-0" style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface-2)' }}>
                  <div className="p-3 border-r flex items-center justify-center" style={{ borderColor: 'var(--app-border)' }}>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--app-muted)' }}>
                      <Clock className="h-3.5 w-3.5" /> Heure
                    </span>
                  </div>
                  {weekDays.map((d) => {
                    const today = isToday(d);
                    const dd = toDateKey(d);
                    const count = eventsByDayKey.get(dd)?.length || 0;
                    return (
                      <button
                        key={dd}
                        type="button"
                        onClick={() => {
                          const nd = new Date(d);
                          nd.setHours(12, 0, 0, 0);
                          setCurrentDate(nd);
                          setViewMode('day');
                        }}
                        className={`p-3 text-center border-r last:border-r-0 hover:brightness-[0.98] transition ${today ? 'bg-[color-mix(in_oklab,var(--app-accent)_8%,var(--app-surface)_92%)]' : ''}`}
                        style={{ borderColor: 'var(--app-border)' }}
                      >
                        <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: today ? 'var(--app-accent)' : 'var(--app-muted)' }}>
                          {WEEKDAYS_FR[(d.getDay() + 6) % 7]}
                        </p>
                        <p
                          className={`mx-auto mt-1 h-8 w-8 flex items-center justify-center rounded-full text-sm font-bold`}
                          style={{ backgroundColor: today ? 'var(--app-accent)' : 'transparent', color: today ? 'var(--app-accent-contrast)' : 'var(--app-text)' }}
                        >
                          {d.getDate()}
                        </p>
                        {count > 0 && <p className="text-[11px] mt-1 font-medium" style={{ color: 'var(--app-accent)' }}>{count} évènement{count > 1 ? 's' : ''}</p>}
                      </button>
                    );
                  })}
                </div>

                {/* Bande journée entière — fix : plus d'overlay absolu par colonne */}
                {(() => {
                  const hasAnyAllDay = weekDays.some((d) => (eventsByDayKey.get(toDateKey(d)) || []).some((e) => e.allDay));
                  if (!hasAnyAllDay) return null;
                  return (
                    <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] md:grid-cols-[64px_repeat(7,1fr)] border-b shrink-0" style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)' }}>
                      <div
                        className="p-2 border-r text-[10px] font-bold uppercase tracking-widest flex items-center justify-center"
                        style={{ borderColor: 'var(--app-border)', color: 'var(--app-muted)', backgroundColor: 'color-mix(in oklab, var(--app-surface-2) 60%, var(--app-surface) 40%)' }}
                      >
                        Journée
                      </div>
                      {weekDays.map((day) => {
                        const key = toDateKey(day);
                        const all = (eventsByDayKey.get(key) || []).filter((e) => e.allDay);
                        return (
                          <div key={key} className="border-r last:border-r-0 p-1 space-y-1 min-h-[52px]" style={{ borderColor: 'var(--app-border)' }}>
                            {all.slice(0, 3).map((ev) => (
                              <button
                                key={ev.id}
                                type="button"
                                onClick={() => openEditModal(ev)}
                                className="w-full text-left rounded-md px-1.5 py-1 text-[11px] font-semibold truncate border flex items-center gap-1 hover:brightness-95 transition"
                                style={{ backgroundColor: `${ev.color}22`, borderColor: `${ev.color}40`, borderLeft: `3px solid ${ev.color}`, color: 'var(--app-text)' }}
                                title={`${ev.title} · Journée entière`}
                              >
                                <span className="truncate">{ev.title}</span>
                              </button>
                            ))}
                            {all.length > 3 && (
                              <span className="block text-[11px] font-semibold px-1" style={{ color: 'var(--app-accent)' }}>
                                + {all.length - 3} autre{all.length - 3 > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Grille horaire — layout chevauchements + indicateur temps réel — fix grid gap & oversize */}
                <div className="relative">
                  <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] md:grid-cols-[64px_repeat(7,1fr)]">
                    <div className="relative">
                      {HOURS.map((h) => (
                        <div key={h} className="h-[56px] border-b border-r relative" style={{ borderColor: 'var(--app-border)' }}>
                          <span
                            className="absolute -top-2 right-1.5 text-[11px] font-mono px-1 rounded"
                            style={{ color: 'var(--app-muted)', backgroundColor: 'var(--app-surface)' }}
                          >
                            {String(h).padStart(2, '0')}:00
                          </span>
                        </div>
                      ))}
                    </div>
                    {weekDays.map((day) => {
                      const key = toDateKey(day);
                      const rawDayEvents = (eventsByDayKey.get(key) || []).filter((e) => !e.allDay);
                      const layouts = layoutWeekDayEvents(day, rawDayEvents);
                      const isCurrentDay = sameDay(day, nowTick);
                      const nowMin = nowTick.getHours() * 60 + nowTick.getMinutes();
                      const nowTop = (nowMin / 60) * 56;
                      return (
                        <div key={key} className="relative border-r last:border-r-0" style={{ borderColor: 'var(--app-border)' }}>
                          {HOURS.map((h) => (
                            <div
                              key={h}
                              onClick={() => openCreateModal(day, h)}
                              className="h-[56px] border-b hover:bg-[color-mix(in_oklab,var(--app-accent)_5%,transparent)] cursor-pointer transition"
                              style={{ borderColor: 'color-mix(in oklab, var(--app-border) 70%, transparent)' }}
                            />
                          ))}
                          {/* Indicateur heure actuelle */}
                          {isCurrentDay && nowMin >= 0 && nowMin < 24 * 60 && (
                            <div
                              className="absolute left-0 right-0 pointer-events-none z-10"
                              style={{ top: `${nowTop}px` }}
                              aria-hidden
                            >
                              <div className="relative h-0.5 bg-red-500/90">
                                <span className="absolute -left-1 -top-[5px] h-2.5 w-2.5 rounded-full bg-red-500 shadow-sm border-2" style={{ borderColor: 'var(--app-surface)' }} />
                              </div>
                            </div>
                          )}
                          {/* Événements calés avec clamping + colonnes */}
                          {layouts.map(({ ev, startMin, endMin, column, totalColumns }) => {
                            const s = new Date(ev.start);
                            const e = new Date(ev.end);
                            const dayStart = new Date(day);
                            dayStart.setHours(0, 0, 0, 0);
                            const dayEnd = new Date(day);
                            dayEnd.setHours(23, 59, 59, 999);
                            const isContinuedBefore = s < dayStart;
                            const isContinuedAfter = e > dayEnd;
                            const top = (startMin / 60) * 56;
                            const height = ((endMin - startMin) / 60) * 56 - 2;
                            const h = Math.max(22, height);
                            const leftPct = (column / totalColumns) * 100;
                            const widthPct = (1 / totalColumns) * 100;
                            const showDesc = h > 44;
                            const showLoc = h > 58;
                            return (
                              <button
                                key={ev.id}
                                onClick={() => openEditModal(ev)}
                                className="absolute rounded-lg border px-2 py-1 text-left shadow-sm hover:brightness-95 hover:shadow-md transition overflow-hidden flex flex-col"
                                style={{
                                  top: `${top}px`,
                                  height: `${h}px`,
                                  left: `calc(${leftPct}% + 2px)`,
                                  width: `calc(${widthPct}% - 4px)`,
                                  backgroundColor: `${ev.color}18`,
                                  borderColor: `${ev.color}38`,
                                  borderLeft: `3px solid ${ev.color}`,
                                  zIndex: 5 + column,
                                  opacity: isContinuedBefore || isContinuedAfter ? 0.96 : 1,
                                }}
                                title={`${ev.title} · ${formatRange(ev.start, ev.end, ev.allDay)}${isContinuedBefore ? ' · ↩ continue' : ''}${isContinuedAfter ? ' · ↪ suite' : ''}`}
                              >
                                <span className="text-xs font-bold truncate flex items-center gap-1" style={{ color: 'var(--app-text)' }}>
                                  {isContinuedBefore && <span className="text-[10px] leading-none">↩</span>}
                                  <span className="truncate">{ev.title}</span>
                                  {isContinuedAfter && <span className="text-[10px] leading-none">↪</span>}
                                </span>
                                <span className="text-[11px] truncate font-mono" style={{ color: 'var(--app-muted)' }}>
                                  {(() => {
                                    // affichage clampé pour le jour courant
                                    const clamp = clampEventToDay(day, ev);
                                    if (!clamp) return `${formatTime(s)} – ${formatTime(e)}`;
                                    const sd = clamp.clampedStart;
                                    const ed = clamp.clampedEnd;
                                    if (isContinuedBefore && isContinuedAfter) return `00:00 – 23:59`;
                                    if (isContinuedBefore) return `00:00 – ${formatTime(ed)}`;
                                    if (isContinuedAfter) return `${formatTime(sd)} – 23:59`;
                                    return `${formatTime(sd)} – ${formatTime(ed)}`;
                                  })()}
                                </span>
                                {showDesc && ev.description && (
                                  <span className="text-[11px] line-clamp-2 mt-0.5 leading-tight" style={{ color: 'var(--app-muted)' }}>
                                    {isHtmlNote(ev.description) ? stripHtmlToText(ev.description) : ev.description}
                                  </span>
                                )}
                                {showLoc && ev.location && (
                                  <span className="text-[11px] flex items-center gap-1 mt-0.5 leading-tight" style={{ color: 'var(--app-muted)' }}>
                                    <MapPin className="h-3 w-3 shrink-0" /> <span className="truncate">{ev.location}</span>
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
                  </div>
                </div>
              </div>
            ) : viewMode === 'day' ? (
              <div
                className="rounded-2xl border overflow-hidden"
                style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)' }}
              >
                <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface-2)' }}>
                  <h3 className="text-lg font-bold capitalize" style={{ color: 'var(--app-text)' }}>
                    {currentDate.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                  </h3>
                  <span
                    className="rounded-full px-3 py-1 text-xs font-semibold border"
                    style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)', color: 'var(--app-muted)' }}
                  >
                    {(eventsByDayKey.get(toDateKey(currentDate)) || []).length} évènement(s)
                  </span>
                </div>

                <div className="p-4 space-y-3">
                  {(eventsByDayKey.get(toDateKey(currentDate)) || []).length === 0 ? (
                    <div className="py-12 text-center rounded-2xl border border-dashed" style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface-2)' }}>
                      <CalendarIcon className="h-10 w-10 mx-auto mb-3" style={{ color: 'var(--app-muted)' }} />
                      <p className="font-semibold" style={{ color: 'var(--app-text)' }}>
                        Aucun événement ce jour
                      </p>
                      <p className="text-sm mt-1" style={{ color: 'var(--app-muted)' }}>
                        Organise ton temps: ajoute un cours, une révision ou une note.
                      </p>
                      <button
                        onClick={() => openCreateModal(currentDate)}
                        className="mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold"
                        style={{ backgroundColor: 'var(--app-accent)', color: 'var(--app-accent-contrast)' }}
                      >
                        <Plus className="h-4 w-4" /> Ajouter un événement
                      </button>
                    </div>
                  ) : (
                    (eventsByDayKey.get(toDateKey(currentDate)) || []).map((ev) => (
                      <div
                        key={ev.id}
                        className="rounded-2xl border p-4 flex gap-4 hover:brightness-98 transition"
                        style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface-2)', borderLeft: `4px solid ${ev.color}` }}
                      >
                        <div className="shrink-0 text-center min-w-[84px]">
                          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: ev.color }}>
                            {CATEGORY_CONFIG[ev.category].label}
                          </p>
                          {ev.allDay ? (
                            <p className="mt-1 rounded-lg px-2 py-1 text-xs font-bold text-white" style={{ backgroundColor: ev.color }}>
                              Journée entière
                            </p>
                          ) : (
                            <p className="mt-1 font-mono text-sm font-bold" style={{ color: 'var(--app-text)' }}>
                              {formatTime(new Date(ev.start))}
                            </p>
                          )}
                          {!ev.allDay && <p className="text-xs font-mono" style={{ color: 'var(--app-muted)' }}>{formatTime(new Date(ev.end))}</p>}
                        </div>

                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-base truncate" style={{ color: 'var(--app-text)' }}>
                            {ev.title}
                          </h4>
                          {ev.description ? (
                            isHtmlNote(ev.description) ? (
                              <div
                                className="mt-1 text-sm break-words [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_strong]:font-bold [&_b]:font-bold [&_em]:italic [&_i]:italic [&_u]:underline [&_p]:my-1"
                                style={{ color: 'var(--app-muted)' }}
                                dangerouslySetInnerHTML={{ __html: ev.description }}
                              />
                            ) : (
                              <p className="mt-1 text-sm whitespace-pre-wrap break-words" style={{ color: 'var(--app-muted)' }}>
                                {ev.description}
                              </p>
                            )
                          ) : (
                            <p className="mt-1 text-xs italic" style={{ color: 'var(--app-muted)' }}>
                              Aucune note.
                            </p>
                          )}
                          <div className="mt-3 flex flex-wrap gap-2 text-xs">
                            {ev.location && (
                              <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1" style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)', color: 'var(--app-muted)' }}>
                                <MapPin className="h-3 w-3" /> {ev.location}
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1" style={{ borderColor: `${ev.color}40`, backgroundColor: `${ev.color}14`, color: ev.color }}>
                              <Timer className="h-3 w-3" /> {formatRange(ev.start, ev.end, ev.allDay)}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 shrink-0">
                          <button
                            onClick={() => openEditModal(ev)}
                            className="h-9 w-9 inline-flex items-center justify-center rounded-xl border hover:brightness-95 transition"
                            style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)', color: 'var(--app-text)' }}
                            title="Modifier"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => onDeleteEvent(ev.id)}
                            className="h-9 w-9 inline-flex items-center justify-center rounded-xl border hover:brightness-95 transition"
                            style={{ borderColor: 'color-mix(in oklab, var(--app-danger) 40%, var(--app-border) 60%)', backgroundColor: 'color-mix(in oklab, var(--app-danger) 10%, var(--app-surface) 90%)', color: 'var(--app-danger)' }}
                            title="Supprimer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Timeline for day view hours */}
                <div className="border-t" style={{ borderColor: 'var(--app-border)' }}>
                  <div className="p-4">
                    <h4 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--app-muted)' }}>
                      Grille horaire
                    </h4>
                    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--app-border)' }}>
                      {HOURS.filter((h) => h >= 6 && h <= 22).map((h) => {
                        const hourEvents = (eventsByDayKey.get(toDateKey(currentDate)) || []).filter((ev) => {
                          if (ev.allDay) return false;
                          const s = new Date(ev.start).getHours();
                          const e = new Date(ev.end).getHours();
                          return h >= s && h <= e;
                        });
                        return (
                          <div key={h} className="flex gap-3 border-b last:border-b-0 hover:bg-[color-mix(in_oklab,var(--app-accent)_3%,transparent)]" style={{ borderColor: 'var(--app-border)' }}>
                            <div className="w-20 shrink-0 py-3 text-center border-r font-mono text-xs font-semibold" style={{ borderColor: 'var(--app-border)', color: 'var(--app-muted)', backgroundColor: 'var(--app-surface-2)' }}>
                              {String(h).padStart(2, '0')}:00
                            </div>
                            <div className="flex-1 min-h-[48px] py-2 flex flex-wrap gap-1.5 items-center">
                              {hourEvents.length === 0 ? (
                                <button
                                  onClick={() => openCreateModal(currentDate, h)}
                                  className="text-xs opacity-0 hover:opacity-100 flex items-center gap-1 font-medium"
                                  style={{ color: 'var(--app-muted)' }}
                                >
                                  <Plus className="h-3 w-3" /> {String(h).padStart(2, '0')}:00 Ajouter
                                </button>
                              ) : (
                                hourEvents.map((ev) => (
                                  <button
                                    key={ev.id}
                                    onClick={() => openEditModal(ev)}
                                    className="rounded-full border px-3 py-1 text-xs font-semibold truncate hover:brightness-95"
                                    style={{ backgroundColor: `${ev.color}18`, borderColor: `${ev.color}40`, color: 'var(--app-text)' }}
                                  >
                                    {formatTime(new Date(ev.start))} {ev.title}
                                  </button>
                                ))
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              // Agenda view
              <div
                className="rounded-2xl border overflow-hidden"
                style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)' }}
              >
                <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface-2)' }}>
                  <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--app-text)' }}>
                    <List className="h-4 w-4" style={{ color: 'var(--app-accent)' }} /> Agenda · liste chronologique
                  </h3>
                  <span className="text-xs" style={{ color: 'var(--app-muted)' }}>
                    {filteredEvents.length} évènement(s)
                  </span>
                </div>
                {agendaGrouped.length === 0 ? (
                  <div className="py-16 text-center">
                    <p className="font-semibold" style={{ color: 'var(--app-text)' }}>
                      Aucun résultat
                    </p>
                    <p className="text-sm mt-1" style={{ color: 'var(--app-muted)' }}>
                      Essaie un autre filtre ou crée ton premier créneau.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y" style={{ borderColor: 'var(--app-border)' }}>
                    {agendaGrouped.map(([key, list]) => {
                      const d = parseDateKey(key);
                      const today = isToday(d);
                      return (
                        <div key={key} className="flex gap-4 p-4 hover:bg-[color-mix(in_oklab,var(--app-surface-2)_60%,transparent)] transition">
                          <div className="w-24 shrink-0 text-center">
                            <div
                              className={`rounded-2xl border p-3 ${today ? '' : ''}`}
                              style={{
                                borderColor: today ? 'var(--app-accent)' : 'var(--app-border)',
                                backgroundColor: today ? 'var(--app-accent)' : 'var(--app-surface-2)',
                                color: today ? 'var(--app-accent-contrast)' : 'var(--app-text)',
                              }}
                            >
                              <p className="text-xs uppercase tracking-widest font-bold" style={{ color: today ? 'var(--app-accent-contrast)' : 'var(--app-muted)' }}>
                                {WEEKDAYS_FR[(d.getDay() + 6) % 7]}
                              </p>
                              <p className="text-2xl font-bold leading-none mt-1">{d.getDate()}</p>
                              <p className="text-xs font-semibold mt-1" style={{ color: today ? 'var(--app-accent-contrast)' : 'var(--app-muted)' }}>
                                {MONTHS_FR[d.getMonth()].slice(0, 3)} {d.getFullYear()}
                              </p>
                            </div>
                            {today && <p className="text-xs font-bold mt-1" style={{ color: 'var(--app-accent)' }}>Aujourd&apos;hui</p>}
                          </div>
                          <div className="flex-1 space-y-2 min-w-0">
                            {list.map((ev) => (
                              <button
                                key={ev.id}
                                onClick={() => openEditModal(ev)}
                                className="w-full text-left rounded-xl border p-3 flex gap-3 items-start hover:brightness-95 transition"
                                style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface-2)', borderLeft: `4px solid ${ev.color}` }}
                              >
                                <span
                                  className="mt-1 h-2.5 w-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: ev.color }}
                                />
                                <span className="flex-1 min-w-0">
                                  <span className="flex flex-wrap items-center gap-2">
                                    <span className="font-semibold text-sm truncate" style={{ color: 'var(--app-text)' }}>
                                      {ev.title}
                                    </span>
                                    <span
                                      className="rounded-full border px-2 py-0.5 text-[11px] font-bold"
                                      style={{ borderColor: `${ev.color}40`, backgroundColor: `${ev.color}14`, color: ev.color }}
                                    >
                                      {CATEGORY_CONFIG[ev.category].label}
                                    </span>
                                    <span className="text-xs font-mono" style={{ color: 'var(--app-muted)' }}>
                                      {formatRange(ev.start, ev.end, ev.allDay)}
                                    </span>
                                  </span>
                                  {ev.description && (
                                    isHtmlNote(ev.description) ? (
                                      <span
                                        className="block text-sm mt-1 break-words line-clamp-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_strong]:font-bold [&_b]:font-bold [&_em]:italic [&_u]:underline"
                                        style={{ color: 'var(--app-muted)' }}
                                        dangerouslySetInnerHTML={{ __html: ev.description }}
                                      />
                                    ) : (
                                      <span className="block text-sm mt-1 whitespace-pre-wrap break-words line-clamp-2" style={{ color: 'var(--app-muted)' }}>
                                        {ev.description}
                                      </span>
                                    )
                                  )}
                                  {ev.location && (
                                    <span className="inline-flex items-center gap-1 mt-2 text-xs rounded-full border px-2 py-1" style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)', color: 'var(--app-muted)' }}>
                                      <MapPin className="h-3 w-3" /> {ev.location}
                                    </span>
                                  )}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Modal Ajouter / Modifier événement — dark/light corrigé */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="planner-modal-title">
            <button type="button" onClick={closeModal} className="absolute inset-0 bg-black/50 dark:bg-black/60 backdrop-blur-sm" aria-label="Fermer" />
            <div
              className="relative w-full max-w-xl max-h-[90vh] overflow-auto rounded-3xl border shadow-2xl"
              style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)', colorScheme: 'light dark' } as React.CSSProperties}
            >
              <div className="sticky top-0 z-10 flex items-center justify-between p-5 border-b backdrop-blur" style={{ borderColor: 'var(--app-border)', backgroundColor: 'color-mix(in oklab, var(--app-surface) 92%, var(--app-surface-2) 8%)' }}>
                <h3 id="planner-modal-title" className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--app-text)' }}>
                  <CalendarIcon className="h-5 w-5" style={{ color: 'var(--app-accent)' }} />
                  {editingEvent ? 'Modifier l’événement' : 'Nouvel événement'}
                </h3>
                <button onClick={closeModal} className="h-9 w-9 inline-flex items-center justify-center rounded-xl border hover:brightness-95" style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface-2)', color: 'var(--app-text)' }} aria-label="Fermer">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={onSaveEvent} className="p-5 space-y-4">
                <div>
                  <label className="text-sm font-semibold mb-1.5 block" style={{ color: 'var(--app-text)' }}>
                    Titre *
                  </label>
                  <input
                    value={formState.title}
                    onChange={(e) => setFormState((p) => ({ ...p, title: e.target.value }))}
                    placeholder="Ex. Cours Larynx – Chapitre 3, Révision QCM Otologie..."
                    className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500"
                    style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface-2)', color: 'var(--app-text)', colorScheme: 'light dark' } as React.CSSProperties}
                    required
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold mb-1.5 block" style={{ color: 'var(--app-text)' }}>
                    Notes / description
                  </label>
                  {/* Toolbar riche : puces / gras / italique / souligné – dark/light via var(--app-*) */}
                  <div
                    className="flex flex-wrap items-center gap-1.5 p-2 rounded-t-xl border border-b-0"
                    style={{ borderColor: 'var(--app-border)', backgroundColor: 'color-mix(in oklab, var(--app-surface-2) 85%, var(--app-surface) 15%)' }}
                  >
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); execNoteCommand('bold'); }}
                      className="h-8 w-8 inline-flex items-center justify-center rounded-lg border hover:brightness-95 transition"
                      style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)', color: 'var(--app-text)' }}
                      title="Gras"
                      aria-label="Gras"
                    >
                      <Bold className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); execNoteCommand('italic'); }}
                      className="h-8 w-8 inline-flex items-center justify-center rounded-lg border hover:brightness-95 transition"
                      style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)', color: 'var(--app-text)' }}
                      title="Italique"
                      aria-label="Italique"
                    >
                      <Italic className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); execNoteCommand('underline'); }}
                      className="h-8 w-8 inline-flex items-center justify-center rounded-lg border hover:brightness-95 transition"
                      style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)', color: 'var(--app-text)' }}
                      title="Souligné"
                      aria-label="Souligné"
                    >
                      <Underline className="h-4 w-4" />
                    </button>
                    <span className="w-px h-6 mx-1" style={{ backgroundColor: 'var(--app-border)' }} />
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); execNoteCommand('insertUnorderedList'); }}
                      className="h-8 w-8 inline-flex items-center justify-center rounded-lg border hover:brightness-95 transition"
                      style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)', color: 'var(--app-text)' }}
                      title="Puces"
                      aria-label="Puces"
                    >
                      <List className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); execNoteCommand('insertOrderedList'); }}
                      className="h-8 w-8 inline-flex items-center justify-center rounded-lg border hover:brightness-95 transition"
                      style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)', color: 'var(--app-text)' }}
                      title="Numérotation"
                      aria-label="Numérotation"
                    >
                      <ListOrdered className="h-4 w-4" />
                    </button>
                    <span className="ml-auto text-[11px] font-medium hidden sm:inline" style={{ color: 'var(--app-muted)' }}>
                      Sélectionne du texte puis choisis un style
                    </span>
                  </div>
                  <div
                    ref={noteEditorRef}
                    contentEditable
                    role="textbox"
                    aria-multiline="true"
                    data-placeholder="Objectifs, pages à réviser, liens, checklist..."
                    onInput={syncNoteFromEditor}
                    onBlur={syncNoteFromEditor}
                    className="w-full min-h-[110px] max-h-[180px] overflow-auto rounded-b-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500 prose prose-sm max-w-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_strong]:font-bold [&_b]:font-bold [&_em]:italic [&_i]:italic [&_u]:underline"
                    style={{
                      borderColor: 'var(--app-border)',
                      backgroundColor: 'var(--app-surface-2)',
                      color: 'var(--app-text)',
                      colorScheme: 'light dark',
                    } as React.CSSProperties}
                    suppressContentEditableWarning
                  />
                  <p className="mt-1 text-xs" style={{ color: 'var(--app-muted)' }}>
                    Puces, gras, italique et souligné pris en charge. Le contenu s'affiche tel quel en semaine/jour/agenda (clair/sombre).
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-semibold mb-1.5 block" style={{ color: 'var(--app-text)' }}>
                      Catégorie
                    </label>
                    <select
                      value={formState.category}
                      onChange={(e) => {
                        const cat = e.target.value as PlannerCategory;
                        setFormState((p) => ({ ...p, category: cat, color: CATEGORY_COLORS[cat] }));
                      }}
                      className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500"
                      style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface-2)', color: 'var(--app-text)', colorScheme: 'light dark' } as React.CSSProperties}
                    >
                      <option value="cours">Cours</option>
                      <option value="revision">Révision</option>
                      <option value="examen">Examen / QCM</option>
                      <option value="personnel">Personnel</option>
                      <option value="autre">Autre</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-semibold mb-1.5 block" style={{ color: 'var(--app-text)' }}>
                      Couleur
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={formState.color}
                        onChange={(e) => setFormState((p) => ({ ...p, color: e.target.value }))}
                        className="h-11 w-14 rounded-xl border p-1 cursor-pointer"
                        style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface-2)', colorScheme: 'light dark' } as React.CSSProperties}
                        title="Couleur de l'événement"
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {(Object.entries(CATEGORY_COLORS) as [PlannerCategory, string][]).map(([cat, col]) => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setFormState((p) => ({ ...p, category: cat, color: col }))}
                            className="h-7 w-7 rounded-full border-2 flex items-center justify-center"
                            style={{ backgroundColor: col, borderColor: formState.color === col ? 'var(--app-text)' : 'transparent' }}
                            title={CATEGORY_CONFIG[cat].label}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border p-4 space-y-3" style={{ borderColor: 'var(--app-border)', backgroundColor: 'color-mix(in oklab, var(--app-surface-2) 70%, var(--app-surface) 30%)' }}>
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--app-text)' }}>
                      <Clock className="h-4 w-4" /> Date & horaires
                    </label>
                    <label className="flex items-center gap-2 text-sm font-medium cursor-pointer" style={{ color: 'var(--app-text)' }}>
                      <input
                        type="checkbox"
                        checked={formState.allDay}
                        onChange={(e) => setFormState((p) => ({ ...p, allDay: e.target.checked }))}
                        className="h-4 w-4 rounded border"
                        style={{ accentColor: 'var(--app-accent)' }}
                      />
                      Journée entière
                    </label>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-1">
                      <label className="text-xs font-semibold uppercase tracking-widest mb-1 flex items-center gap-1.5" style={{ color: 'var(--app-muted)' }}>
                        <CalendarDays className="h-3 w-3" style={{ color: 'var(--app-muted)' }} /> Date
                      </label>
                      <input
                        type="date"
                        value={formState.date}
                        onChange={(e) => setFormState((p) => ({ ...p, date: e.target.value }))}
                        className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500"
                        style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)', color: 'var(--app-text)', colorScheme: 'light dark' } as React.CSSProperties}
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-widest mb-1 flex items-center gap-1.5" style={{ color: 'var(--app-muted)' }}>
                        <Clock className="h-3 w-3" style={{ color: 'var(--app-muted)' }} /> Début
                      </label>
                      <input
                        type="time"
                        value={formState.startTime}
                        onChange={(e) => setFormState((p) => ({ ...p, startTime: e.target.value }))}
                        disabled={formState.allDay}
                        className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500 disabled:opacity-50"
                        style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)', color: 'var(--app-text)', colorScheme: 'light dark' } as React.CSSProperties}
                        required={!formState.allDay}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-widest mb-1 flex items-center gap-1.5" style={{ color: 'var(--app-muted)' }}>
                        <Clock className="h-3 w-3" style={{ color: 'var(--app-muted)' }} /> Fin
                      </label>
                      <input
                        type="time"
                        value={formState.endTime}
                        onChange={(e) => setFormState((p) => ({ ...p, endTime: e.target.value }))}
                        disabled={formState.allDay}
                        className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500 disabled:opacity-50"
                        style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface)', color: 'var(--app-text)', colorScheme: 'light dark' } as React.CSSProperties}
                        required={!formState.allDay}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-semibold mb-1.5 block flex items-center gap-1.5" style={{ color: 'var(--app-text)' }}>
                    <MapPin className="h-3.5 w-3.5" /> Lieu (optionnel)
                  </label>
                  <input
                    value={formState.location}
                    onChange={(e) => setFormState((p) => ({ ...p, location: e.target.value }))}
                    placeholder="Ex. CHU, salle TD, visio, bibliothèque..."
                    className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-medical-500"
                    style={{ borderColor: 'var(--app-border)', backgroundColor: 'var(--app-surface-2)', color: 'var(--app-text)', colorScheme: 'light dark' } as React.CSSProperties}
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-60 hover:brightness-95 transition"
                    style={{
                      background:
                        'linear-gradient(135deg, color-mix(in oklab, var(--app-accent) 88%, #000 12%) 0%, var(--app-accent) 100%)',
                      color: 'var(--app-accent-contrast)',
                    }}
                  >
                    {isSaving ? 'Enregistrement...' : editingEvent ? 'Enregistrer les modifications' : 'Créer l’événement'}
                  </button>
                  {editingEvent && (
                    <button
                      type="button"
                      onClick={() => onDeleteEvent(editingEvent.id)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold"
                      style={{ borderColor: 'color-mix(in oklab, var(--app-danger) 40%, var(--app-border) 60%)', color: 'var(--app-danger)', backgroundColor: 'color-mix(in oklab, var(--app-danger) 10%, var(--app-surface) 90%)' }}
                    >
                      <Trash2 className="h-4 w-4" /> Supprimer
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={closeModal}
                    className="inline-flex items-center justify-center rounded-xl border px-4 py-3 text-sm font-semibold"
                    style={{ borderColor: 'var(--app-border)', color: 'var(--app-text)', backgroundColor: 'var(--app-surface-2)' }}
                  >
                    Annuler
                  </button>
                </div>

                <p className="text-xs text-center" style={{ color: 'var(--app-muted)' }}>
                  Tes événements sont privés et liés à ton compte. Google Agenda style: glisse entre Mois / Semaine / Jour / Agenda.
                </p>
              </form>
            </div>
          </div>
        )}
    </>
  );

  if (embedded) {
    return <div className="space-y-6">{plannerMain}</div>;
  }

  return (
    <div
      className="flex-1 py-6 md:py-8"
      style={{
        background:
          'linear-gradient(180deg, color-mix(in oklab, var(--app-surface) 95%, white 5%) 0%, color-mix(in oklab, var(--app-surface-2) 76%, var(--app-accent) 24%) 100%)',
      }}
    >
      <div className="container mx-auto px-4 max-w-7xl space-y-6">
        {plannerHero}
        {plannerMain}
      </div>
    </div>
  );
}

export default function PlannerPage() {
  return <PlannerAgenda />;
}
