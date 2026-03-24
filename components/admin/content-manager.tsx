'use client';

import { useState, useEffect } from 'react';
import { Video, FileText, HelpCircle, Image as ImageIcon, MessageSquare, Plus, Save, X, Loader2, Trash2, Edit2 } from 'lucide-react';
import { db, collection, addDoc, getDocs, deleteDoc, doc, updateDoc } from '@/lib/local-data';
import type {
  CaseQuestionModel,
  ClinicalCaseModel,
  DiagramMarkerModel,
  DiagramModel,
  OpenQuestionModel,
  QcmModel,
  QcmMode,
  VideoModel,
} from '@/lib/models';

type EditableCaseQuestion = {
  id: string;
  kind: 'qcm' | 'select' | 'open';
  prompt: string;
  images?: string[];
  options?: string[];
  correctOptionIndex?: number;
  correctOptionIndexes?: number[];
  qcmMode?: QcmMode;
  explanation?: string;
  answer?: string;
};

interface VideoFormData {
  title: string;
  description: string;
  url: string;
  subspecialty: string;
  section: string;
  isFreeDemo: boolean;
  price: number;
}

interface QcmFormData {
  videoId: string;
  question: string;
  options: string[];
  mode: QcmMode;
  correctOptionIndexes: number[];
  explanation: string;
  reference: string;
}

interface OpenQuestionFormData {
  videoId: string;
  question: string;
  answer: string;
  reference: string;
}

interface ClinicalCaseFormData {
  videoId: string;
  title: string;
  description: string;
  patientHistory: string;
  clinicalExamination: string;
  additionalTests: string;
  diagnosis: string;
  treatment: string;
  discussion: string;
  images: string[];
  reference: string;
  questions: EditableCaseQuestion[];
}

interface DiagramFormData {
  videoId: string;
  title: string;
  imageUrl: string;
  markers: DiagramMarkerModel[];
}

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
};

const createCaseQuestionId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `q-${crypto.randomUUID()}`;
  }
  return `q-${Date.now()}`;
};

const getSaveErrorMessage = (entityLabel: string, error: unknown) => {
  const details = getErrorMessage(error, 'Cause inconnue');
  return `Echec d'enregistrement ${entityLabel}. Verifiez les champs obligatoires puis reessayez. (${details})`;
};

const logAdminAction = (action: 'create' | 'update' | 'delete', entity: string, payload: Record<string, unknown>) => {
  console.info('[admin-action]', {
    action,
    entity,
    at: new Date().toISOString(),
    ...payload,
  });
};

export function AdminContentManager() {
  const [activeTab, setActiveTab] = useState<'video' | 'qcm' | 'case' | 'openQuestion' | 'diagram'>('video');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  
  const [videos, setVideos] = useState<VideoModel[]>([]);
  const [qcms, setQcms] = useState<QcmModel[]>([]);
  const [cases, setCases] = useState<ClinicalCaseModel[]>([]);
  const [openQuestions, setOpenQuestions] = useState<OpenQuestionModel[]>([]);
  const [diagrams, setDiagrams] = useState<DiagramModel[]>([]);

  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
  const [editingQcmId, setEditingQcmId] = useState<string | null>(null);
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [editingOpenQuestionId, setEditingOpenQuestionId] = useState<string | null>(null);
  const [editingDiagramId, setEditingDiagramId] = useState<string | null>(null);
  const [previewVideoId, setPreviewVideoId] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [videosSnap, qcmsSnap, casesSnap, openQuestionsSnap, diagramsSnap] = await Promise.all([
        getDocs(collection(db, 'videos')),
        getDocs(collection(db, 'qcms')),
        getDocs(collection(db, 'clinicalCases')),
        getDocs(collection(db, 'openQuestions')),
        getDocs(collection(db, 'diagrams'))
      ]);
      
      setVideos(videosSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as VideoModel));
      setQcms(qcmsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as QcmModel));
      setCases(casesSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as ClinicalCaseModel));
      setOpenQuestions(openQuestionsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as OpenQuestionModel));
      setDiagrams(diagramsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as DiagramModel));
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDelete = async (collectionName: string, id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cet élément ?')) return;
    try {
      await deleteDoc(doc(db, collectionName, id));
      setSuccessMessage('Élément supprimé avec succès.');
      logAdminAction('delete', collectionName, { id });
      fetchData(); // Refresh lists
    } catch (error: unknown) {
      console.error('Error deleting document:', error);
      setErrorMessage(`Echec de suppression (${collectionName}). ${getErrorMessage(error, 'Cause inconnue')}`);
    }
  };

  // Video Form State
  const [videoData, setVideoData] = useState<VideoFormData>({
    title: '',
    description: '',
    url: '',
    subspecialty: 'otologie',
    section: 'anatomie',
    isFreeDemo: false,
    price: 0
  });
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const QCM_OPTION_LABELS = ['A', 'B', 'C', 'D', 'E'];
  const getDefaultQcmOptions = () => QCM_OPTION_LABELS.map(() => '');
  const getOptionLabel = (index: number) => {
    if (index < 26) {
      return String.fromCharCode(65 + index);
    }
    return `Option ${index + 1}`;
  };
  const normalizeQcmOptions = (options: unknown): string[] => {
    const fallback = getDefaultQcmOptions();
    if (!Array.isArray(options)) return fallback;

    const normalized = options.map((value) => (typeof value === 'string' ? value : ''));
    return normalized.length > 0 ? normalized : fallback;
  };
  const getDefaultCaseQuestionOptions = () => QCM_OPTION_LABELS.map(() => '');
  const normalizeCaseQuestionOptions = (options: unknown): string[] => {
    const fallback = getDefaultCaseQuestionOptions();
    if (!Array.isArray(options)) return fallback;

    const normalized = options.map((value) => (typeof value === 'string' ? value : ''));
    return normalized.length > 0 ? normalized : fallback;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);
    setErrorMessage('');

    const formData = new FormData();
    formData.append('file', file);
    // Replace 'YOUR_UPLOAD_PRESET' and 'YOUR_CLOUD_NAME' with actual values or env vars
    // For this demo, we'll assume the user has set up an unsigned upload preset named 'dems_ent_videos'
    formData.append('upload_preset', process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'dems_ent_videos'); 

    try {
      const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || 'demo';
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(progress);
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          setVideoData(prev => ({ ...prev, url: response.secure_url }));
          setSuccessMessage('Vidéo téléchargée avec succès sur Cloudinary !');
        } else {
          const error = JSON.parse(xhr.responseText);
          setErrorMessage(`Erreur de téléchargement: ${error.error?.message || 'Inconnue'}`);
        }
        setIsUploading(false);
      };

      xhr.onerror = () => {
        setErrorMessage('Erreur réseau lors du téléchargement.');
        setIsUploading(false);
      };

      xhr.send(formData);
    } catch (error) {
      console.error('Upload error:', error);
      setErrorMessage('Une erreur inattendue est survenue lors du téléchargement.');
      setIsUploading(false);
    }
  };

  // QCM Form State
  const [qcmData, setQcmData] = useState<QcmFormData>({
    videoId: '',
    question: '',
    options: getDefaultQcmOptions(),
    mode: 'single' as 'single' | 'multiple',
    correctOptionIndexes: [] as number[],
    explanation: '',
    reference: '',
  });

  const handleVideoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!videoData.url.trim()) {
      setErrorMessage('Veuillez uploader une vidéo avant de sauvegarder.');
      return;
    }

    if (!videoData.isFreeDemo) {
      if (Number.isNaN(videoData.price)) {
        setErrorMessage('Le prix est obligatoire pour une vidéo premium.');
        return;
      }

      if (videoData.price < 0) {
        setErrorMessage('Le prix ne peut pas être négatif.');
        return;
      }
    }

    setIsSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const payload = {
        ...videoData,
        packId: videoData.isFreeDemo ? '' : videoData.subspecialty,
      };

      if (editingVideoId) {
        await updateDoc(doc(db, 'videos', editingVideoId), {
          ...payload,
          updatedAt: new Date().toISOString()
        });
        setSuccessMessage('Vidéo mise à jour avec succès !');
        logAdminAction('update', 'videos', { id: editingVideoId, title: payload.title });
        setEditingVideoId(null);
      } else {
        const docRef = await addDoc(collection(db, 'videos'), {
          ...payload,
          createdAt: new Date().toISOString()
        });
        logAdminAction('create', 'videos', { id: docRef.id, title: payload.title });
        setSuccessMessage('Vidéo ajoutée avec succès !');
      }
      
      fetchData(); // Refresh list
      
      setVideoData({
        title: '',
        description: '',
        url: '',
        subspecialty: 'otologie',
        section: 'anatomie',
        isFreeDemo: false,
        price: 0
      });
    } catch (error: unknown) {
      console.error('Error adding/updating video:', error);
      setErrorMessage(getSaveErrorMessage('de la vidéo', error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditVideo = (video: VideoModel) => {
    setEditingVideoId(video.id);
    setVideoData({
      title: video.title || '',
      description: video.description || '',
      url: video.url || '',
      subspecialty: video.subspecialty || 'otologie',
      section: video.section || 'anatomie',
      isFreeDemo: video.isFreeDemo || false,
      price: video.price || 0
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleQcmSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qcmData.videoId) {
      setErrorMessage('Veuillez sélectionner une vidéo.');
      return;
    }
    if (qcmData.options.some(opt => !opt.trim())) {
      setErrorMessage('Veuillez remplir toutes les options.');
      return;
    }
    if (qcmData.correctOptionIndexes.length === 0) {
      setErrorMessage('Veuillez sélectionner au moins une bonne réponse.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const payload = {
        videoId: qcmData.videoId,
        question: qcmData.question,
        options: qcmData.options,
        mode: qcmData.mode,
        correctOptionIndexes: qcmData.correctOptionIndexes,
        // pour compatibilité avec l'ancien modèle
        correctOptionIndex:
          qcmData.correctOptionIndexes && qcmData.correctOptionIndexes.length > 0
            ? qcmData.correctOptionIndexes[0]
            : 0,
        explanation: qcmData.explanation,
        reference: qcmData.reference,
      };

      if (editingQcmId) {
        await updateDoc(doc(db, 'qcms', editingQcmId), {
          ...payload,
          updatedAt: new Date().toISOString()
        });
        setSuccessMessage('QCM mis à jour avec succès !');
        logAdminAction('update', 'qcms', { id: editingQcmId, videoId: payload.videoId });
        setEditingQcmId(null);
      } else {
        const docRef = await addDoc(collection(db, 'qcms'), {
          ...payload,
          createdAt: new Date().toISOString()
        });
        logAdminAction('create', 'qcms', { id: docRef.id, videoId: payload.videoId });
        setSuccessMessage('QCM ajouté avec succès !');
      }
      
      fetchData(); // Refresh list

      setQcmData({
        videoId: qcmData.videoId, // garder la vidéo sélectionnée
        question: '',
        options: getDefaultQcmOptions(),
        mode: 'single',
        correctOptionIndexes: [],
        explanation: '',
        reference: '',
      });
    } catch (error: unknown) {
      console.error('Error adding/updating QCM:', error);
      setErrorMessage(getSaveErrorMessage('du QCM', error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditQcm = (qcm: QcmModel) => {
    setEditingQcmId(qcm.id);

    const mode: 'single' | 'multiple' = qcm.mode === 'multiple' ? 'multiple' : 'single';
    const fallbackIndex = typeof qcm.correctOptionIndex === 'number' ? qcm.correctOptionIndex : 0;
    const correctOptionIndexes: number[] =
      Array.isArray(qcm.correctOptionIndexes) && qcm.correctOptionIndexes.length > 0
        ? qcm.correctOptionIndexes
        : fallbackIndex >= 0
          ? [fallbackIndex]
          : [];

    setQcmData({
      videoId: qcm.videoId || '',
      question: qcm.question || '',
      options: normalizeQcmOptions(qcm.options),
      mode,
      correctOptionIndexes,
      explanation: qcm.explanation || '',
      reference: qcm.reference || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...qcmData.options];
    newOptions[index] = value;
    setQcmData({ ...qcmData, options: newOptions });
  };

  const handleAddQcmOption = () => {
    setQcmData((prev) => ({
      ...prev,
      options: [...prev.options, ''],
    }));
  };

  const handleRemoveQcmOption = (indexToRemove: number) => {
    setQcmData((prev) => {
      if (prev.options.length <= 2) {
        return prev;
      }

      const nextOptions = prev.options.filter((_, index) => index !== indexToRemove);
      const nextCorrectOptionIndexes = prev.correctOptionIndexes
        .filter((index) => index !== indexToRemove)
        .map((index) => (index > indexToRemove ? index - 1 : index));

      return {
        ...prev,
        options: nextOptions,
        correctOptionIndexes: nextCorrectOptionIndexes,
      };
    });
  };

  const [openQuestionData, setOpenQuestionData] = useState<OpenQuestionFormData>({
    videoId: '',
    question: '',
    answer: '',
    reference: '',
  });

  const handleOpenQuestionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openQuestionData.videoId) {
      setErrorMessage('Veuillez sélectionner une vidéo.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const payload = {
        ...openQuestionData,
      };

      if (editingOpenQuestionId) {
        await updateDoc(doc(db, 'openQuestions', editingOpenQuestionId), {
          ...payload,
          updatedAt: new Date().toISOString(),
        });
        setSuccessMessage('Question ouverte mise à jour avec succès !');
        logAdminAction('update', 'openQuestions', {
          id: editingOpenQuestionId,
          videoId: payload.videoId,
        });
        setEditingOpenQuestionId(null);
      } else {
        const docRef = await addDoc(collection(db, 'openQuestions'), {
          ...payload,
          createdAt: new Date().toISOString(),
        });
        logAdminAction('create', 'openQuestions', { id: docRef.id, videoId: payload.videoId });
        setSuccessMessage('Question ouverte ajoutée avec succès !');
      }

      fetchData();

      setOpenQuestionData({
        videoId: openQuestionData.videoId,
        question: '',
        answer: '',
        reference: '',
      });
    } catch (error: unknown) {
      console.error('Error adding/updating open question:', error);
      setErrorMessage(getSaveErrorMessage('de la question ouverte', error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditOpenQuestion = (item: OpenQuestionModel) => {
    setEditingOpenQuestionId(item.id);
    setOpenQuestionData({
      videoId: item.videoId || '',
      question: item.question || '',
      answer: item.answer || '',
      reference: item.reference || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Clinical Case Form State
  const [caseData, setCaseData] = useState<ClinicalCaseFormData>({
    videoId: '',
    title: '',
    description: '',
    patientHistory: '',
    clinicalExamination: '',
    additionalTests: '',
    diagnosis: '',
    treatment: '',
    discussion: '',
    images: [] as string[],
    reference: '',
    questions: []
  });

  const handleCaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseData.videoId) {
      setErrorMessage('Veuillez sélectionner une vidéo.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      if (editingCaseId) {
        await updateDoc(doc(db, 'clinicalCases', editingCaseId), {
          ...caseData,
          updatedAt: new Date().toISOString()
        });
        setSuccessMessage('Cas clinique mis à jour avec succès !');
        logAdminAction('update', 'clinicalCases', { id: editingCaseId, videoId: caseData.videoId });
        setEditingCaseId(null);
      } else {
        const docRef = await addDoc(collection(db, 'clinicalCases'), {
          ...caseData,
          createdAt: new Date().toISOString()
        });
        logAdminAction('create', 'clinicalCases', { id: docRef.id, videoId: caseData.videoId });
        setSuccessMessage('Cas clinique ajouté avec succès !');
      }
      
      fetchData(); // Refresh list

      setCaseData({
        videoId: caseData.videoId,
        title: '',
        description: '',
        patientHistory: '',
        clinicalExamination: '',
        additionalTests: '',
        diagnosis: '',
        treatment: '',
        discussion: '',
        images: [],
        reference: '',
        questions: []
      });
    } catch (error: unknown) {
      console.error('Error adding/updating clinical case:', error);
      setErrorMessage(getSaveErrorMessage('du cas clinique', error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditCase = (c: ClinicalCaseModel) => {
    setEditingCaseId(c.id);
    setCaseData({
      videoId: c.videoId || '',
      title: c.title || '',
      description: c.description || '',
      patientHistory: c.patientHistory || '',
      clinicalExamination: c.clinicalExamination || '',
      additionalTests: c.additionalTests || '',
      diagnosis: c.diagnosis || '',
      treatment: c.treatment || '',
      discussion: c.discussion || '',
      images: c.images || [],
      reference: c.reference || '',
      questions: c.questions || []
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCaseImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);
    setErrorMessage('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'dems_ent_videos');

    try {
      const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || 'demo';
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(progress);
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          setCaseData(prev => ({
            ...prev,
            images: [...(prev.images || []), response.secure_url],
          }));
          setSuccessMessage('Figure ajoutée avec succès !');
        } else {
          const error = JSON.parse(xhr.responseText);
          setErrorMessage(`Erreur de téléchargement de la figure: ${error.error?.message || 'Inconnue'}`);
        }
        setIsUploading(false);
      };

      xhr.onerror = () => {
        setErrorMessage('Erreur réseau lors du téléchargement de la figure.');
        setIsUploading(false);
      };

      xhr.send(formData);
    } catch (error) {
      console.error('Upload figure error:', error);
      setErrorMessage('Une erreur inattendue est survenue lors du téléchargement de la figure.');
      setIsUploading(false);
    } finally {
      // reset input value so same file can be re-selected if needed
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const addCaseQuestion = (kind: 'qcm' | 'select' | 'open') => {
    setCaseData(prev => {
      const questions = [...(prev.questions || [])];

      const base: EditableCaseQuestion = {
        id: createCaseQuestionId(),
        kind,
        prompt: ''
      };

      let question: EditableCaseQuestion;
      if (kind === 'open') {
        question = {
          ...base,
          answer: '',
          images: [] as string[],
        };
      } else if (kind === 'select') {
        question = {
          ...base,
          options: getDefaultCaseQuestionOptions(),
          correctOptionIndex: 0,
          explanation: '',
          images: [] as string[],
        };
      } else {
        // QCM avec mode choix unique ou multiple
        question = {
          ...base,
          options: getDefaultCaseQuestionOptions(),
          qcmMode: 'single' as 'single' | 'multiple',
          correctOptionIndexes: [] as number[],
          explanation: '',
          images: [] as string[],
        };
      }

      return {
        ...prev,
        questions: [...questions, question]
      };
    });
  };

  const updateCaseQuestion = (
    index: number,
    updater: (q: EditableCaseQuestion) => EditableCaseQuestion,
  ) => {
    setCaseData(prev => {
      const questions = [...(prev.questions || [])];
      questions[index] = updater(
        questions[index] || ({ id: createCaseQuestionId(), kind: 'open', prompt: '' } as EditableCaseQuestion),
      );
      return {
        ...prev,
        questions
      };
    });
  };

  const removeCaseQuestion = (index: number) => {
    setCaseData(prev => {
      const questions = [...(prev.questions || [])];
      questions.splice(index, 1);
      return {
        ...prev,
        questions
      };
    });
  };

  const changeCaseQuestionKind = (index: number, kind: 'qcm' | 'select' | 'open') => {
    updateCaseQuestion(index, (existing) => {
      const base: EditableCaseQuestion = {
        id: existing?.id || createCaseQuestionId(),
        kind,
        prompt: existing?.prompt || '',
        images: Array.isArray(existing?.images) ? existing.images : [],
      };

      if (kind === 'open') {
        return {
          ...base,
          answer: existing?.answer || ''
        };
      }

      const options = Array.isArray(existing?.options) && existing.options.length
        ? normalizeCaseQuestionOptions(existing.options)
        : getDefaultCaseQuestionOptions();

      if (kind === 'select') {
        return {
          ...base,
          options,
          correctOptionIndex: typeof existing?.correctOptionIndex === 'number' ? existing.correctOptionIndex : 0,
          explanation: existing?.explanation || ''
        };
      }

      // QCM multi-réponses
      const fallbackSingleIndex = typeof existing?.correctOptionIndex === 'number'
        ? existing.correctOptionIndex
        : 0;
      const existingIndexes: number[] = Array.isArray(existing?.correctOptionIndexes)
        ? existing.correctOptionIndexes
        : [];
      return {
        ...base,
        options,
        qcmMode: existing?.qcmMode === 'multiple' ? 'multiple' : 'single',
        correctOptionIndexes: existingIndexes.length > 0 ? existingIndexes : [fallbackSingleIndex],
        explanation: existing?.explanation || ''
      };
    });
  };

  const handleCaseQuestionImageUpload = async (
    questionIndex: number,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);
    setErrorMessage('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'dems_ent_videos');

    try {
      const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || 'demo';
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(progress);
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          setCaseData((prev) => {
            const questions = [...(prev.questions || [])];
            const current = questions[questionIndex] || {};
            const currentImages: string[] = Array.isArray(current.images)
              ? current.images
              : [];
            questions[questionIndex] = {
              ...current,
              images: [...currentImages, response.secure_url],
            };
            return {
              ...prev,
              questions,
            };
          });
          setSuccessMessage('Figure de question ajoutée avec succès !');
        } else {
          const error = JSON.parse(xhr.responseText);
          setErrorMessage(
            `Erreur de téléchargement de la figure de question: ${error.error?.message || 'Inconnue'}`,
          );
        }
        setIsUploading(false);
      };

      xhr.onerror = () => {
        setErrorMessage('Erreur réseau lors du téléchargement de la figure de question.');
        setIsUploading(false);
      };

      xhr.send(formData);
    } catch (error) {
      console.error('Upload case question figure error:', error);
      setErrorMessage(
        'Une erreur inattendue est survenue lors du téléchargement de la figure de question.',
      );
      setIsUploading(false);
    } finally {
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  // Diagram Form State
  const [diagramData, setDiagramData] = useState({
    videoId: '',
    title: '',
    imageUrl: '',
    markers: [] as { number: number, x: number, y: number, label: string, description: string }[],
    reference: '',
  });

  const handleDiagramSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!diagramData.videoId) {
      setErrorMessage('Veuillez sélectionner une vidéo.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      if (editingDiagramId) {
        await updateDoc(doc(db, 'diagrams', editingDiagramId), {
          ...diagramData,
          updatedAt: new Date().toISOString()
        });
        setSuccessMessage('Schéma mis à jour avec succès !');
        logAdminAction('update', 'diagrams', { id: editingDiagramId, videoId: diagramData.videoId });
        setEditingDiagramId(null);
      } else {
        const docRef = await addDoc(collection(db, 'diagrams'), {
          ...diagramData,
          createdAt: new Date().toISOString()
        });
        logAdminAction('create', 'diagrams', { id: docRef.id, videoId: diagramData.videoId });
        setSuccessMessage('Schéma ajouté avec succès !');
      }
      
      fetchData(); // Refresh list

      setDiagramData({
        videoId: diagramData.videoId,
        title: '',
        imageUrl: '',
        markers: [],
        reference: '',
      });
    } catch (error: unknown) {
      console.error('Error adding/updating diagram:', error);
      setErrorMessage(getSaveErrorMessage('du schéma', error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditDiagram = (d: DiagramModel) => {
    setEditingDiagramId(d.id);
    setDiagramData({
      videoId: d.videoId || '',
      title: d.title || '',
      imageUrl: d.imageUrl || '',
      markers: d.markers || [],
      reference: d.reference || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDiagramImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);
    setErrorMessage('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'dems_ent_videos');

    try {
      const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || 'demo';
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(progress);
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          setDiagramData(prev => ({
            ...prev,
            imageUrl: response.secure_url,
          }));
          setSuccessMessage('Schéma téléversé avec succès !');
        } else {
          const error = JSON.parse(xhr.responseText);
          setErrorMessage(`Erreur de téléchargement du schéma: ${error.error?.message || 'Inconnue'}`);
        }
        setIsUploading(false);
      };

      xhr.onerror = () => {
        setErrorMessage('Erreur réseau lors du téléchargement du schéma.');
        setIsUploading(false);
      };

      xhr.send(formData);
    } catch (error) {
      console.error('Upload diagram error:', error);
      setErrorMessage('Une erreur inattendue est survenue lors du téléchargement du schéma.');
      setIsUploading(false);
    } finally {
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const getVideoExtensionStats = (videoId: string) => {
    const caseCount = cases.filter((entry) => entry.videoId === videoId).length;
    const qcmCount = qcms.filter((entry) => entry.videoId === videoId).length;
    const openQuestionCount = openQuestions.filter((entry) => entry.videoId === videoId).length;
    const diagramCount = diagrams.filter((entry) => entry.videoId === videoId).length;
    const missingItems: string[] = [];

    if (caseCount === 0) missingItems.push('Cas cliniques');
    if (qcmCount === 0) missingItems.push('QCM');
    if (openQuestionCount === 0) missingItems.push('Questions ouvertes');
    if (diagramCount === 0) missingItems.push('Schémas');

    return {
      caseCount,
      qcmCount,
      openQuestionCount,
      diagramCount,
      missingItems,
      isComplete: missingItems.length === 0,
    };
  };

  const renderSelectedVideoPreview = (videoId: string) => {
    if (!videoId) return null;

    const selectedVideo = videos.find((video) => video.id === videoId);

    if (!selectedVideo) {
      return (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Vidéo sélectionnée introuvable.
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
        <p className="text-xs text-slate-600">
          <span className="font-semibold">Vidéo sélectionnée :</span> {selectedVideo.title}
        </p>
        {selectedVideo.url ? (
          <video
            controls
            preload="metadata"
            src={selectedVideo.url}
            className="w-full rounded-lg border border-slate-200 bg-black/90 max-h-52"
          >
            Votre navigateur ne supporte pas la lecture vidéo.
          </video>
        ) : (
          <p className="text-xs text-amber-700">Cette vidéo n'a pas encore d'URL de lecture.</p>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="flex border-b border-slate-200 overflow-x-auto">
        <button
          onClick={() => setActiveTab('video')}
          className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === 'video' ? 'text-medical-600 border-b-2 border-medical-600 bg-medical-50' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Video className="w-4 h-4" />
          Vidéos
        </button>
        <button
          onClick={() => setActiveTab('case')}
          className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === 'case' ? 'text-medical-600 border-b-2 border-medical-600 bg-medical-50' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <FileText className="w-4 h-4" />
          Cas Cliniques
        </button>
        <button
          onClick={() => setActiveTab('qcm')}
          className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === 'qcm' ? 'text-medical-600 border-b-2 border-medical-600 bg-medical-50' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <HelpCircle className="w-4 h-4" />
          QCMs
        </button>
        <button
          onClick={() => setActiveTab('openQuestion')}
          className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === 'openQuestion' ? 'text-medical-600 border-b-2 border-medical-600 bg-medical-50' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          Questions Ouvertes
        </button>
        <button
          onClick={() => setActiveTab('diagram')}
          className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === 'diagram' ? 'text-medical-600 border-b-2 border-medical-600 bg-medical-50' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          Schémas
        </button>
      </div>

      <div className="p-6">
        {successMessage && (
          <div className="mb-6 p-4 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-200 flex items-center justify-between">
            <span>{successMessage}</span>
            <button
              onClick={() => setSuccessMessage('')}
              className="text-emerald-600 hover:text-emerald-800"
              title="Fermer le message"
              aria-label="Fermer le message"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="mb-6 p-4 bg-red-50 text-red-800 rounded-xl border border-red-200 flex items-center justify-between">
            <span>{errorMessage}</span>
            <button
              onClick={() => setErrorMessage('')}
              className="text-red-600 hover:text-red-800"
              title="Fermer le message"
              aria-label="Fermer le message"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {activeTab === 'video' && (
          <div className="space-y-10">
            <form onSubmit={handleVideoSubmit} className="space-y-6 max-w-2xl">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">{editingVideoId ? 'Modifier la vidéo' : 'Ajouter une nouvelle vidéo'}</h3>
                <p className="text-sm text-slate-500 mb-6">Remplissez les informations ci-dessous pour {editingVideoId ? 'modifier' : 'ajouter'} une vidéo à la plateforme.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-slate-700">Titre de la vidéo</label>
                <input
                  type="text"
                  required
                  value={videoData.title}
                  onChange={(e) => setVideoData({...videoData, title: e.target.value})}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all"
                  placeholder="Ex: Anatomie de l'oreille moyenne"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-slate-700">Description</label>
                <textarea
                  required
                  value={videoData.description}
                  onChange={(e) => setVideoData({...videoData, description: e.target.value})}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all min-h-[100px]"
                  placeholder="Description détaillée du contenu de la vidéo..."
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-slate-700">Vidéo (upload)</label>
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-slate-500 font-medium">Uploader une vidéo :</span>
                    <label className="cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-slate-300">
                      {isUploading ? 'Téléchargement...' : 'Choisir un fichier'}
                      <input 
                        type="file" 
                        accept="video/*" 
                        className="hidden" 
                        onChange={handleFileUpload}
                        disabled={isUploading}
                      />
                    </label>
                  </div>
                  {videoData.url && !isUploading && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-2">
                      <p className="text-xs text-emerald-700 font-medium">Vidéo uploadée avec succès.</p>
                      <video
                        controls
                        preload="metadata"
                        src={videoData.url}
                        className="w-full rounded-lg border border-emerald-200 bg-black/90 max-h-56"
                      >
                        Votre navigateur ne supporte pas la lecture vidéo.
                      </video>
                    </div>
                  )}
                  {isUploading && (
                    <div className="w-full bg-slate-200 rounded-full h-2.5 mt-2">
                      <progress
                        className="w-full h-2.5 rounded-full overflow-hidden"
                        value={uploadProgress}
                        max={100}
                        aria-label="Progression du téléchargement"
                      />
                      <p className="text-xs text-slate-500 mt-1 text-right">{uploadProgress}%</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Sous-spécialité</label>
                <select
                  value={videoData.subspecialty}
                  onChange={(e) => setVideoData({...videoData, subspecialty: e.target.value})}
                  title="Sous-spécialité"
                  aria-label="Sous-spécialité"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all bg-white"
                >
                  <option value="otologie">Otologie</option>
                  <option value="rhinologie">Rhinologie</option>
                  <option value="laryngologie">Laryngologie</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Section</label>
                <select
                  value={videoData.section}
                  onChange={(e) => setVideoData({...videoData, section: e.target.value})}
                  title="Section"
                  aria-label="Section"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all bg-white"
                >
                  <option value="anatomie">Anatomie</option>
                  <option value="pathologie">Pathologie</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Type d'accès</label>
                <div className="flex items-center gap-4 mt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={videoData.isFreeDemo}
                      onChange={() => setVideoData({...videoData, isFreeDemo: true})}
                      className="text-medical-600 focus:ring-medical-500"
                    />
                    <span className="text-sm text-slate-700">Démo Gratuite</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={!videoData.isFreeDemo}
                      onChange={() => setVideoData({...videoData, isFreeDemo: false})}
                      className="text-medical-600 focus:ring-medical-500"
                    />
                    <span className="text-sm text-slate-700">Premium (Payant)</span>
                  </label>
                </div>
              </div>

              {!videoData.isFreeDemo && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Prix (DZD)</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={videoData.price}
                    onChange={(e) => setVideoData({...videoData, price: Number(e.target.value)})}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all"
                    placeholder="Ex: 1500"
                  />
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
              {editingVideoId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingVideoId(null);
                    setVideoData({
                      title: '',
                      description: '',
                      url: '',
                      subspecialty: 'otologie',
                      section: 'anatomie',
                      isFreeDemo: false,
                      price: 0
                    });
                  }}
                  className="flex items-center gap-2 border border-slate-300 text-slate-700 px-6 py-3 rounded-xl font-medium hover:bg-slate-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                  Annuler l'édition
                </button>
              )}
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-2 bg-medical-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-medical-700 transition-colors disabled:opacity-70"
              >
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                {editingVideoId ? 'Mettre à jour la vidéo' : 'Enregistrer la vidéo'}
              </button>
            </div>
          </form>
          
          <div className="mt-12 border-t border-slate-200 pt-8">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Vidéos existantes</h3>

            <div className="grid gap-4">
              {videos.map(video => (
                <div key={video.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <h4 className="font-medium text-slate-900">{video.title}</h4>
                    <p className="text-sm text-slate-500 capitalize">{video.subspecialty} - {video.section}</p>
                    {(() => {
                      const stats = getVideoExtensionStats(video.id);
                      return (
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                          <span className="px-2 py-1 rounded-full bg-slate-200 text-slate-700">Cas: {stats.caseCount}</span>
                          <span className="px-2 py-1 rounded-full bg-slate-200 text-slate-700">QCM: {stats.qcmCount}</span>
                          <span className="px-2 py-1 rounded-full bg-slate-200 text-slate-700">Questions ouvertes: {stats.openQuestionCount}</span>
                          <span className="px-2 py-1 rounded-full bg-slate-200 text-slate-700">Schémas: {stats.diagramCount}</span>
                          <span
                            className={`px-2 py-1 rounded-full font-medium ${
                              stats.isComplete
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {stats.isComplete ? 'Extensions complètes' : 'Extensions manquantes'}
                          </span>
                          {!stats.isComplete && (
                            <span className="px-2 py-1 rounded-full bg-red-100 text-red-700">
                              Manquants: {stats.missingItems.join(', ')}
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPreviewVideoId((current) => (current === video.id ? null : video.id))}
                        className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors"
                      >
                        {previewVideoId === video.id ? 'Masquer prévisualisation' : 'Prévisualiser'}
                      </button>
                      <a
                        href={`/videos/${video.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 text-xs rounded-lg border border-medical-300 text-medical-700 hover:bg-medical-50 transition-colors"
                      >
                        Ouvrir la lecture
                      </a>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEditVideo(video)}
                        className="p-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                        title="Modifier"
                      >
                        <Edit2 className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleDelete('videos', video.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Supprimer"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  {previewVideoId === video.id && (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-sm">
                      <p className="text-slate-700 mb-1"><span className="font-semibold">Prévisualisation:</span> {video.title}</p>
                      <p className="text-slate-500 line-clamp-2">{video.description}</p>
                      <div className="mt-2 text-xs text-slate-600">
                        {(() => {
                          const stats = getVideoExtensionStats(video.id);
                          return stats.isComplete
                            ? 'Contenu complet: prêt pour usage pédagogique.'
                            : `Cohérence incomplète: ${stats.missingItems.join(', ')}`;
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {videos.length === 0 && (
                <p className="text-slate-500 text-sm">Aucune vidéo trouvée.</p>
              )}
            </div>
          </div>
        </div>
        )}

        {activeTab === 'qcm' && (
          <div className="space-y-10">
            <form onSubmit={handleQcmSubmit} className="space-y-6 max-w-2xl">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-1">{editingQcmId ? 'Modifier le QCM' : 'Ajouter un QCM'}</h3>
                  <p className="text-sm text-slate-500 mb-6">Créez une question à choix multiples liée à une vidéo spécifique.</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Vidéo associée</label>
                  <select
                    required
                    value={qcmData.videoId}
                    onChange={(e) => setQcmData({...qcmData, videoId: e.target.value})}
                    title="Video associee au QCM"
                    aria-label="Video associee au QCM"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all bg-white"
                  >
                    <option value="" disabled>Sélectionner une vidéo...</option>
                    {videos.map(v => (
                      <option key={v.id} value={v.id}>{v.title}</option>
                    ))}
                  </select>
                  {renderSelectedVideoPreview(qcmData.videoId)}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Question</label>
                  <textarea
                    required
                    value={qcmData.question}
                    onChange={(e) => setQcmData({...qcmData, question: e.target.value})}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all min-h-[80px]"
                    placeholder="Posez votre question ici..."
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Type de QCM</label>
                  <select
                    value={qcmData.mode}
                    onChange={(e) => {
                      const nextMode = e.target.value as 'single' | 'multiple';
                      setQcmData((prev) => ({
                        ...prev,
                        mode: nextMode,
                        correctOptionIndexes:
                          nextMode === 'single'
                            ? (prev.correctOptionIndexes.length > 0 ? [prev.correctOptionIndexes[0]] : [])
                            : prev.correctOptionIndexes,
                      }));
                    }}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all bg-white text-sm"
                    title="Type de QCM"
                    aria-label="Type de QCM"
                  >
                    <option value="single">Choix unique</option>
                    <option value="multiple">Choix multiple</option>
                  </select>
                  <p className="text-xs text-slate-500">
                    Choix unique : une seule bonne réponse. Choix multiple : plusieurs réponses peuvent être correctes.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-700">Options de réponse</label>
                    <button
                      type="button"
                      onClick={handleAddQcmOption}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Ajouter une option
                    </button>
                  </div>
                  {qcmData.options.map((_, index) => {
                    const optionLabel = getOptionLabel(index);
                    return (
                    <div key={optionLabel} className="flex items-center gap-4">
                      {qcmData.mode === 'single' ? (
                        <input
                          type="radio"
                          name="main-qcm-correct-option"
                          checked={qcmData.correctOptionIndexes.includes(index)}
                          onChange={() =>
                            setQcmData((prev) => ({
                              ...prev,
                              correctOptionIndexes: [index],
                            }))
                          }
                          className="text-medical-600 focus:ring-medical-500 mt-1 h-4 w-4 border-slate-300"
                          title="Marquer comme bonne réponse"
                        />
                      ) : (
                        <input
                          type="checkbox"
                          checked={qcmData.correctOptionIndexes.includes(index)}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setQcmData((prev) => {
                              let nextIndexes = Array.isArray(prev.correctOptionIndexes)
                                ? [...prev.correctOptionIndexes]
                                : [];

                              if (checked) {
                                if (!nextIndexes.includes(index)) {
                                  nextIndexes.push(index);
                                }
                              } else {
                                nextIndexes = nextIndexes.filter((i) => i !== index);
                              }

                              return {
                                ...prev,
                                correctOptionIndexes: nextIndexes,
                              };
                            });
                          }}
                          className="text-medical-600 focus:ring-medical-500 mt-1 h-4 w-4 rounded border-slate-300"
                          title="Marquer comme bonne réponse"
                        />
                      )}
                      <span className="w-8 shrink-0 text-center text-xs font-semibold text-slate-600 bg-slate-100 border border-slate-300 rounded-md py-1">
                        {optionLabel}
                      </span>
                      <input
                        type="text"
                        required
                        value={qcmData.options[index] || ''}
                        onChange={(e) => handleOptionChange(index, e.target.value)}
                        className={`flex-1 px-4 py-2.5 rounded-xl border focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all ${
                          qcmData.correctOptionIndexes.includes(index) ? 'border-medical-500 bg-medical-50' : 'border-slate-300'
                        }`}
                        placeholder={`Option ${optionLabel}`}
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveQcmOption(index)}
                        disabled={qcmData.options.length <= 2}
                        className="rounded-lg border border-slate-300 p-2 text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                        title="Supprimer cette option"
                        aria-label="Supprimer cette option"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    );
                  })}
                  <p className="text-xs text-slate-500">
                    Choix unique: boutons radio. Choix multiple: cases à cocher. Minimum 2 options.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Explication (optionnelle)</label>
                  <textarea
                    value={qcmData.explanation}
                    onChange={(e) => setQcmData({...qcmData, explanation: e.target.value})}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all min-h-[80px]"
                    placeholder="Explication affichée après la réponse..."
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Références (optionnelle)</label>
                  <textarea
                    value={qcmData.reference}
                    onChange={(e) => setQcmData({ ...qcmData, reference: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all min-h-[80px]"
                    placeholder="Article, guide, source scientifique..."
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
                {editingQcmId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingQcmId(null);
                      setQcmData({
                        videoId: '',
                        question: '',
                        options: getDefaultQcmOptions(),
                        mode: 'single',
                        correctOptionIndexes: [],
                        explanation: '',
                        reference: '',
                      });
                    }}
                    className="flex items-center gap-2 border border-slate-300 text-slate-700 px-6 py-3 rounded-xl font-medium hover:bg-slate-100 transition-colors"
                  >
                    <X className="w-5 h-5" />
                    Annuler l'édition
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 bg-medical-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-medical-700 transition-colors disabled:opacity-70"
                >
                  {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  {editingQcmId ? 'Mettre à jour le QCM' : 'Enregistrer le QCM'}
                </button>
              </div>
            </form>

            <div className="mt-12 border-t border-slate-200 pt-8">
              <h3 className="text-lg font-bold text-slate-900 mb-4">QCMs existants</h3>
              <div className="grid gap-4">
                {qcms.map(qcm => {
                  const video = videos.find(v => v.id === qcm.videoId);
                  return (
                    <div key={qcm.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                      <div>
                        <h4 className="font-medium text-slate-900 line-clamp-1">{qcm.question}</h4>
                        <p className="text-sm text-slate-500">Vidéo: {video?.title || 'Inconnue'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => handleEditQcm(qcm)}
                          className="p-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                          title="Modifier"
                        >
                          <Edit2 className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => handleDelete('qcms', qcm.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {qcms.length === 0 && (
                  <p className="text-slate-500 text-sm">Aucun QCM trouvé.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'openQuestion' && (
          <div className="space-y-10">
            <form onSubmit={handleOpenQuestionSubmit} className="space-y-6 max-w-2xl">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-1">
                    {editingOpenQuestionId ? 'Modifier la Question Ouverte' : 'Ajouter une Question Ouverte'}
                  </h3>
                  <p className="text-sm text-slate-500 mb-6">
                    Ajoutez une question ouverte liée à une vidéo avec sa réponse et ses références.
                  </p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Vidéo associée</label>
                  <select
                    required
                    value={openQuestionData.videoId}
                    onChange={(e) => setOpenQuestionData({ ...openQuestionData, videoId: e.target.value })}
                    title="Video associee a la question ouverte"
                    aria-label="Video associee a la question ouverte"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all bg-white"
                  >
                    <option value="" disabled>Sélectionner une vidéo...</option>
                    {videos.map(v => (
                      <option key={v.id} value={v.id}>{v.title}</option>
                    ))}
                  </select>
                  {renderSelectedVideoPreview(openQuestionData.videoId)}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Question</label>
                  <textarea
                    required
                    value={openQuestionData.question}
                    onChange={(e) => setOpenQuestionData({ ...openQuestionData, question: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all min-h-[80px]"
                    placeholder="Saisissez la question ouverte..."
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Réponse</label>
                  <textarea
                    required
                    value={openQuestionData.answer}
                    onChange={(e) => setOpenQuestionData({ ...openQuestionData, answer: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all min-h-[100px]"
                    placeholder="Saisissez la réponse attendue..."
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Références (optionnelle)</label>
                  <textarea
                    value={openQuestionData.reference}
                    onChange={(e) => setOpenQuestionData({ ...openQuestionData, reference: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all min-h-[80px]"
                    placeholder="Article, source scientifique, guideline..."
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
                {editingOpenQuestionId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingOpenQuestionId(null);
                      setOpenQuestionData({
                        videoId: '',
                        question: '',
                        answer: '',
                        reference: '',
                      });
                    }}
                    className="flex items-center gap-2 border border-slate-300 text-slate-700 px-6 py-3 rounded-xl font-medium hover:bg-slate-100 transition-colors"
                  >
                    <X className="w-5 h-5" />
                    Annuler l'édition
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 bg-medical-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-medical-700 transition-colors disabled:opacity-70"
                >
                  {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  {editingOpenQuestionId ? 'Mettre à jour la question ouverte' : 'Enregistrer la question ouverte'}
                </button>
              </div>
            </form>

            <div className="mt-12 border-t border-slate-200 pt-8">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Questions ouvertes existantes</h3>
              <div className="grid gap-4">
                {openQuestions.map((item) => {
                  const video = videos.find(v => v.id === item.videoId);
                  return (
                    <div key={item.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                      <div>
                        <h4 className="font-medium text-slate-900 line-clamp-1">{item.question}</h4>
                        <p className="text-sm text-slate-500">Vidéo: {video?.title || 'Inconnue'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEditOpenQuestion(item)}
                          className="p-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                          title="Modifier"
                        >
                          <Edit2 className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleDelete('openQuestions', item.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {openQuestions.length === 0 && (
                  <p className="text-slate-500 text-sm">Aucune question ouverte trouvée.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'case' && (
          <div className="space-y-10">
            <form onSubmit={handleCaseSubmit} className="space-y-6 max-w-2xl">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-1">{editingCaseId ? 'Modifier le Cas Clinique' : 'Ajouter un Cas Clinique'}</h3>
                  <p className="text-sm text-slate-500 mb-6">Créez un cas clinique détaillé lié à une vidéo spécifique.</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Vidéo associée</label>
                  <select
                    required
                    value={caseData.videoId}
                    onChange={(e) => setCaseData({...caseData, videoId: e.target.value})}
                    title="Video associee au cas clinique"
                    aria-label="Video associee au cas clinique"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all bg-white"
                  >
                    <option value="" disabled>Sélectionner une vidéo...</option>
                    {videos.map(v => (
                      <option key={v.id} value={v.id}>{v.title}</option>
                    ))}
                  </select>
                  {renderSelectedVideoPreview(caseData.videoId)}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Figures (upload d'images)</label>
                  <div className="space-y-3">
                    {caseData.images && caseData.images.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {caseData.images.map((img, index) => (
                          <div
                            key={index}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-xs text-slate-700 max-w-full"
                          >
                            <span className="font-semibold">Figure {index + 1}</span>
                            <span className="truncate max-w-[160px]" title={img}>{img}</span>
                            <button
                              type="button"
                              onClick={() =>
                                setCaseData(prev => ({
                                  ...prev,
                                  images: prev.images.filter((_, i) => i !== index),
                                }))
                              }
                              className="ml-1 text-red-600 hover:text-red-800"
                              title="Supprimer la figure"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-col gap-2">
                      <label className="cursor-pointer inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-slate-300 w-fit">
                        {isUploading ? 'Téléchargement...' : 'Ajouter une figure'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleCaseImageUpload}
                          disabled={isUploading}
                        />
                      </label>
                      {isUploading && (
                        <p className="text-xs text-slate-500">Téléchargement de la figure : {uploadProgress}%</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Description du cas clinique</label>
                  <textarea
                    value={caseData.description}
                    onChange={(e) => setCaseData({ ...caseData, description: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all min-h-[120px]"
                    placeholder="Décrivez brièvement le cas clinique (contexte, symptômes, éléments clés)..."
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Référence (optionnelle)</label>
                  <textarea
                    value={caseData.reference || ''}
                    onChange={(e) => setCaseData({ ...caseData, reference: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all min-h-[80px]"
                    placeholder="Article, ouvrage, lien ou source à citer..."
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <label className="text-sm font-medium text-slate-700">Questions pédagogiques (optionnel)</label>
                      <p className="text-xs text-slate-500">
                        Ajoutez des QCM, sélecteurs ou questions ouvertes pour structurer le raisonnement clinique.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => addCaseQuestion('qcm')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        <Plus className="w-3 h-3" />
                        QCM
                      </button>
                      <button
                        type="button"
                        onClick={() => addCaseQuestion('select')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        <Plus className="w-3 h-3" />
                        Sélecteur
                      </button>
                      <button
                        type="button"
                        onClick={() => addCaseQuestion('open')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        <Plus className="w-3 h-3" />
                        Question ouverte
                      </button>
                    </div>
                  </div>

                  {(caseData.questions || []).length > 0 && (
                    <div className="space-y-4">
                      {(caseData.questions || []).map((q: EditableCaseQuestion, index: number) => {
                        const kind: 'qcm' | 'select' | 'open' =
                          q.kind === 'select' || q.kind === 'open' ? q.kind : 'qcm';
                        const qcmMode: 'single' | 'multiple' = q.qcmMode === 'multiple' ? 'multiple' : 'single';
                        const options: string[] = Array.isArray(q.options) && q.options.length
                          ? normalizeCaseQuestionOptions(q.options)
                          : getDefaultCaseQuestionOptions();

                        return (
                          <div
                            key={q.id || index}
                            className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-4"
                          >
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-semibold text-slate-500 uppercase">
                                  Question {index + 1}
                                </span>
                                <select
                                  value={kind}
                                  onChange={(e) => changeCaseQuestionKind(index, e.target.value as 'qcm' | 'select' | 'open')}
                                  className="text-xs px-2 py-1 rounded-lg border border-slate-300 bg-white text-slate-700"
                                  title="Type de question pédagogique"
                                  aria-label="Type de question pédagogique"
                                >
                                  <option value="qcm">QCM (cases à cocher)</option>
                                  <option value="select">Sélecteur (liste déroulante)</option>
                                  <option value="open">Question ouverte</option>
                                </select>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeCaseQuestion(index)}
                                className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Supprimer la question"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="space-y-3">
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-slate-700">Énoncé de la question</label>
                                <textarea
                                  value={q.prompt || ''}
                                  onChange={(e) =>
                                    updateCaseQuestion(index, (current) => ({
                                      ...current,
                                      prompt: e.target.value
                                    }))
                                  }
                                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all text-sm min-h-[60px]"
                                  placeholder="Formulez la question que verra l'étudiant..."
                                />
                              </div>

                              {(kind === 'qcm' || kind === 'select') && (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between gap-3">
                                    <label className="text-xs font-medium text-slate-700">Options de réponse</label>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateCaseQuestion(index, (current) => {
                                          const currentOptions = Array.isArray(current.options)
                                            ? [...current.options]
                                            : getDefaultCaseQuestionOptions();
                                          currentOptions.push('');
                                          return {
                                            ...current,
                                            options: currentOptions,
                                          };
                                        })
                                      }
                                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                                    >
                                      <Plus className="h-3 w-3" />
                                      Ajouter une option
                                    </button>
                                  </div>
                                  {kind === 'qcm' && (
                                    <div className="space-y-1">
                                      <label className="text-[11px] font-medium text-slate-700">Mode de correction</label>
                                      <select
                                        value={qcmMode}
                                        onChange={(e) => {
                                          const nextMode = e.target.value as 'single' | 'multiple';
                                          updateCaseQuestion(index, (current) => {
                                            const currentIndexes: number[] = Array.isArray(current.correctOptionIndexes)
                                              ? current.correctOptionIndexes
                                              : [];
                                            return {
                                              ...current,
                                              qcmMode: nextMode,
                                              correctOptionIndexes:
                                                nextMode === 'single'
                                                  ? (currentIndexes.length > 0 ? [currentIndexes[0]] : [])
                                                  : currentIndexes,
                                            };
                                          });
                                        }}
                                        className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-700"
                                        title="Mode de correction QCM"
                                        aria-label="Mode de correction QCM"
                                      >
                                        <option value="single">Choix unique</option>
                                        <option value="multiple">Choix multiple</option>
                                      </select>
                                    </div>
                                  )}
                                  <div className="space-y-2">
                                    {options.map((_, optIndex: number) => {
                                      const optLabel = getOptionLabel(optIndex);
                                      return (
                                      <div key={`${q.id || index}-${optIndex}`} className="flex items-center gap-2">
                                        {kind === 'qcm' ? (
                                          qcmMode === 'single' ? (
                                            <input
                                              type="radio"
                                              name={`case-qcm-correct-${index}`}
                                              className="mt-0.5 h-4 w-4 text-medical-600 border-slate-300"
                                              checked={Array.isArray(q.correctOptionIndexes) && q.correctOptionIndexes.includes(optIndex)}
                                              onChange={() =>
                                                updateCaseQuestion(index, (current) => ({
                                                  ...current,
                                                  correctOptionIndexes: [optIndex],
                                                }))
                                              }
                                              title="Bonne réponse"
                                            />
                                          ) : (
                                            <input
                                              type="checkbox"
                                              className="mt-0.5 h-4 w-4 text-medical-600 border-slate-300 rounded"
                                              checked={Array.isArray(q.correctOptionIndexes) && q.correctOptionIndexes.includes(optIndex)}
                                              onChange={(e) => {
                                                const checked = e.target.checked;
                                                updateCaseQuestion(index, (current) => {
                                                  const currentIndexes: number[] = Array.isArray(current.correctOptionIndexes)
                                                    ? [...current.correctOptionIndexes]
                                                    : [];
                                                  if (checked) {
                                                    if (!currentIndexes.includes(optIndex)) {
                                                      currentIndexes.push(optIndex);
                                                    }
                                                  } else {
                                                    const pos = currentIndexes.indexOf(optIndex);
                                                    if (pos !== -1) {
                                                      currentIndexes.splice(pos, 1);
                                                    }
                                                  }
                                                  return {
                                                    ...current,
                                                    correctOptionIndexes: currentIndexes,
                                                  };
                                                });
                                              }}
                                              title="Marquer comme bonne réponse"
                                            />
                                          )
                                        ) : (
                                          <input
                                            type="radio"
                                            name={`case-select-correct-${index}`}
                                            className="mt-0.5 h-4 w-4 text-medical-600 border-slate-300"
                                            checked={typeof q.correctOptionIndex === 'number' && q.correctOptionIndex === optIndex}
                                            onChange={() =>
                                              updateCaseQuestion(index, (current) => ({
                                                ...current,
                                                correctOptionIndex: optIndex
                                              }))
                                            }
                                            title="Réponse correcte"
                                          />
                                        )}
                                        <span className="w-7 shrink-0 text-center text-[11px] font-semibold text-slate-600 bg-slate-100 border border-slate-300 rounded-md py-1">
                                          {optLabel}
                                        </span>
                                        <input
                                          type="text"
                                          value={options[optIndex] || ''}
                                          onChange={(e) =>
                                            updateCaseQuestion(index, (current) => {
                                              const nextOptions: string[] = Array.isArray(current.options)
                                                ? [...current.options]
                                                : getDefaultCaseQuestionOptions();
                                              nextOptions[optIndex] = e.target.value;
                                              return {
                                                ...current,
                                                options: nextOptions
                                              };
                                            })
                                          }
                                          className="flex-1 px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all text-sm"
                                          placeholder={`Option ${optLabel}`}
                                        />
                                        <button
                                          type="button"
                                          onClick={() =>
                                            updateCaseQuestion(index, (current) => {
                                              const currentOptions = Array.isArray(current.options)
                                                ? [...current.options]
                                                : getDefaultCaseQuestionOptions();

                                              if (currentOptions.length <= 2) {
                                                return current;
                                              }

                                              const nextOptions = currentOptions.filter((_, idx) => idx !== optIndex);

                                              const nextQcmIndexes = Array.isArray(current.correctOptionIndexes)
                                                ? current.correctOptionIndexes
                                                    .filter((idx) => idx !== optIndex)
                                                    .map((idx) => (idx > optIndex ? idx - 1 : idx))
                                                : [];

                                              const rawCorrectSelect =
                                                typeof current.correctOptionIndex === 'number'
                                                  ? current.correctOptionIndex
                                                  : undefined;

                                              const nextCorrectSelect =
                                                rawCorrectSelect === undefined
                                                  ? undefined
                                                  : rawCorrectSelect === optIndex
                                                    ? undefined
                                                    : rawCorrectSelect > optIndex
                                                      ? rawCorrectSelect - 1
                                                      : rawCorrectSelect;

                                              return {
                                                ...current,
                                                options: nextOptions,
                                                correctOptionIndexes: nextQcmIndexes,
                                                correctOptionIndex: nextCorrectSelect,
                                              };
                                            })
                                          }
                                          disabled={options.length <= 2}
                                          className="rounded-lg border border-slate-300 p-2 text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                                          title="Supprimer cette option"
                                          aria-label="Supprimer cette option"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </button>
                                      </div>
                                    );})}
                                  </div>
                                  <p className="text-[11px] text-slate-500">
                                    {kind === 'qcm'
                                      ? (qcmMode === 'single'
                                        ? 'Choisissez une seule bonne réponse.'
                                        : 'Cochez une ou plusieurs bonnes réponses.')
                                      : 'Sélectionnez l’option correcte pour la liste déroulante.'} Minimum 2 options.
                                  </p>
                                </div>
                              )}

                              {kind === 'open' && (
                                <div className="space-y-1">
                                  <label className="text-xs font-medium text-slate-700">Réponse attendue</label>
                                  <textarea
                                    value={q.answer || ''}
                                    onChange={(e) =>
                                      updateCaseQuestion(index, (current) => ({
                                        ...current,
                                        answer: e.target.value
                                      }))
                                    }
                                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all text-sm min-h-[60px]"
                                    placeholder="Rédigez la réponse ou le corrigé qui pourra être affiché / masqué."
                                  />
                                </div>
                              )}

                              {(kind === 'qcm' || kind === 'select') && (
                                <div className="space-y-1">
                                  <label className="text-xs font-medium text-slate-700">Explication (optionnelle)</label>
                                  <textarea
                                    value={q.explanation || ''}
                                    onChange={(e) =>
                                      updateCaseQuestion(index, (current) => ({
                                        ...current,
                                        explanation: e.target.value
                                      }))
                                    }
                                    className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all text-sm min-h-[60px]"
                                    placeholder="Détaillez le raisonnement ou les points clés à rappeler."
                                  />
                                </div>
                              )}

                              <div className="space-y-1">
                                <label className="text-xs font-medium text-slate-700">
                                  Figures associées à la question (optionnel)
                                </label>
                                <div className="space-y-2">
                                  {Array.isArray(q.images) && q.images.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                      {q.images.map((img: string, imgIndex: number) => (
                                        <div
                                          key={imgIndex}
                                          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-xs text-slate-700 max-w-full"
                                        >
                                          <span className="font-semibold">Figure {imgIndex + 1}</span>
                                          <span
                                            className="truncate max-w-[160px]"
                                            title={img}
                                          >
                                            {img}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              updateCaseQuestion(index, (current) => {
                                                const currentImages: string[] = Array.isArray(current.images)
                                                  ? current.images
                                                  : [];
                                                return {
                                                  ...current,
                                                  images: currentImages.filter((_, i) => i !== imgIndex),
                                                };
                                              })
                                            }
                                            className="ml-1 text-red-600 hover:text-red-800"
                                            title="Supprimer la figure"
                                          >
                                            <X className="w-3 h-3" />
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  <div className="flex flex-col gap-2">
                                    <label className="cursor-pointer inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-xs font-medium transition-colors border border-slate-300 w-fit">
                                      {isUploading ? 'Téléchargement...' : 'Ajouter une figure'}
                                      <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => handleCaseQuestionImageUpload(index, e)}
                                        disabled={isUploading}
                                      />
                                    </label>
                                    {isUploading && (
                                      <p className="text-[11px] text-slate-500">
                                        Téléchargement de la figure : {uploadProgress}%
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
                {editingCaseId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCaseId(null);
                      setCaseData({
                        videoId: '',
                        title: '',
                        description: '',
                        patientHistory: '',
                        clinicalExamination: '',
                        additionalTests: '',
                        diagnosis: '',
                        treatment: '',
                        discussion: '',
                        images: [],
                        reference: '',
                        questions: []
                      });
                    }}
                    className="flex items-center gap-2 border border-slate-300 text-slate-700 px-6 py-3 rounded-xl font-medium hover:bg-slate-100 transition-colors"
                  >
                    <X className="w-5 h-5" />
                    Annuler l'édition
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 bg-medical-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-medical-700 transition-colors disabled:opacity-70"
                >
                  {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  {editingCaseId ? 'Mettre à jour le cas clinique' : 'Enregistrer le cas clinique'}
                </button>
              </div>
            </form>

            <div className="mt-12 border-t border-slate-200 pt-8">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Cas cliniques existants</h3>
              <div className="grid gap-4">
                {cases.map((c, index) => {
                  const video = videos.find(v => v.id === c.videoId);
                  return (
                    <div key={c.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                      <div>
                        <h4 className="font-medium text-slate-900">Cas Clinique #{index + 1}</h4>
                        <p className="text-sm text-slate-500">Vidéo: {video?.title || 'Inconnue'}</p>
                        {c.description && (
                          <p className="text-xs text-slate-400 mt-1 line-clamp-2 whitespace-pre-wrap">
                            {c.description}
                          </p>
                        )}
                        <p className="text-xs text-slate-400 mt-1">
                          Questions pédagogiques : {Array.isArray(c.questions) ? c.questions.length : 0}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => handleEditCase(c)}
                          className="p-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                          title="Modifier"
                        >
                          <Edit2 className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => handleDelete('clinicalCases', c.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {cases.length === 0 && (
                  <p className="text-slate-500 text-sm">Aucun cas clinique trouvé.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'diagram' && (
          <div className="space-y-10">
            <form onSubmit={handleDiagramSubmit} className="space-y-6 max-w-2xl">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-1">{editingDiagramId ? 'Modifier le Schéma' : 'Ajouter un Schéma'}</h3>
                  <p className="text-sm text-slate-500 mb-6">Ajoutez un schéma anatomique ou radiologique lié à une vidéo.</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Vidéo associée</label>
                  <select
                    required
                    value={diagramData.videoId}
                    onChange={(e) => setDiagramData({...diagramData, videoId: e.target.value})}
                    title="Vidéo associée au schéma"
                    aria-label="Vidéo associée au schéma"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all bg-white"
                  >
                    <option value="" disabled>Sélectionner une vidéo...</option>
                    {videos.map(v => (
                      <option key={v.id} value={v.id}>{v.title}</option>
                    ))}
                  </select>
                  {renderSelectedVideoPreview(diagramData.videoId)}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Titre du schéma</label>
                  <input
                    type="text"
                    required
                    value={diagramData.title}
                    onChange={(e) => setDiagramData({...diagramData, title: e.target.value})}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all"
                    placeholder="Ex: Scanner des rochers..."
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Référence (optionnel)</label>
                  <input
                    type="text"
                    value={diagramData.reference}
                    onChange={(e) => setDiagramData({...diagramData, reference: e.target.value})}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all"
                    placeholder="Ex: TDM ORL - Article / Page / DOI"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Schéma (upload d'image)</label>
                  <div className="space-y-3">
                    {diagramData.imageUrl && (
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-xs text-slate-700 max-w-full">
                        <span className="font-semibold">Schéma actuel</span>
                        <span className="truncate max-w-[200px]" title={diagramData.imageUrl}>{diagramData.imageUrl}</span>
                        <button
                          type="button"
                          onClick={() => setDiagramData(prev => ({ ...prev, imageUrl: '' }))}
                          className="ml-1 text-red-600 hover:text-red-800"
                          title="Supprimer le schéma"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}

                    <div className="flex flex-col gap-2">
                      <label className="cursor-pointer inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-slate-300 w-fit">
                        {isUploading ? 'Téléchargement...' : (diagramData.imageUrl ? 'Remplacer le schéma' : 'Uploader un schéma')}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleDiagramImageUpload}
                          disabled={isUploading}
                        />
                      </label>
                      {isUploading && (
                        <p className="text-xs text-slate-500">Téléchargement du schéma : {uploadProgress}%</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Marqueurs (Légendes numérotées)</label>
                  <div className="space-y-4">
                    {diagramData.markers.map((marker, index) => (
                      <div key={index} className="flex gap-4 items-start p-4 bg-slate-50 border border-slate-200 rounded-xl">
                        <div className="flex-1 space-y-4">
                          <div className="flex gap-4 items-center">
                            <div className="w-24 px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-300 text-xs font-semibold text-slate-700 text-center">
                              N° {index + 1}
                            </div>
                            <input
                              type="text"
                              placeholder="Titre de la légende"
                              value={marker.label}
                              onChange={(e) => {
                                const newMarkers = [...diagramData.markers];
                                newMarkers[index].label = e.target.value;
                                setDiagramData({...diagramData, markers: newMarkers});
                              }}
                              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all"
                            />
                          </div>
                          <textarea
                            placeholder="Description détaillée (optionnelle)"
                            value={marker.description}
                            onChange={(e) => {
                              const newMarkers = [...diagramData.markers];
                              newMarkers[index].description = e.target.value;
                              setDiagramData({...diagramData, markers: newMarkers});
                            }}
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medical-500 focus:border-transparent outline-none transition-all min-h-[80px]"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const newMarkers = diagramData.markers
                              .filter((_, i) => i !== index)
                              .map((m, i2) => ({ ...m, number: i2 + 1 }));
                            setDiagramData({...diagramData, markers: newMarkers});
                          }}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Supprimer ce marqueur"
                          aria-label="Supprimer ce marqueur"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        const nextMarkers = [
                          ...diagramData.markers,
                          { number: diagramData.markers.length + 1, x: 50, y: 50, label: '', description: '' },
                        ].map((m, i) => ({ ...m, number: i + 1 }));
                        setDiagramData({
                          ...diagramData,
                          markers: nextMarkers,
                        });
                      }}
                      className="flex items-center gap-2 text-medical-600 font-medium hover:text-medical-700 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Ajouter un marqueur
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
                {editingDiagramId && (
                      <button
                    type="button"
                    onClick={() => {
                      setEditingDiagramId(null);
                      setDiagramData({
                        videoId: '',
                        title: '',
                        imageUrl: '',
                        markers: [],
                        reference: '',
                      });
                    }}
                    className="flex items-center gap-2 border border-slate-300 text-slate-700 px-6 py-3 rounded-xl font-medium hover:bg-slate-100 transition-colors"
                  >
                    <X className="w-5 h-5" />
                    Annuler l'édition
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 bg-medical-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-medical-700 transition-colors disabled:opacity-70"
                >
                  {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  {editingDiagramId ? 'Mettre à jour le schéma' : 'Enregistrer le schéma'}
                </button>
              </div>
            </form>

            <div className="mt-12 border-t border-slate-200 pt-8">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Schémas existants</h3>
              <div className="grid gap-4">
                {diagrams.map(d => {
                  const video = videos.find(v => v.id === d.videoId);
                  return (
                    <div key={d.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                      <div>
                        <h4 className="font-medium text-slate-900">{d.title}</h4>
                        <p className="text-sm text-slate-500">Vidéo: {video?.title || 'Inconnue'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => handleEditDiagram(d)}
                          className="p-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                          title="Modifier"
                        >
                          <Edit2 className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => handleDelete('diagrams', d.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {diagrams.length === 0 && (
                  <p className="text-slate-500 text-sm">Aucun schéma trouvé.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
