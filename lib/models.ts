export type QcmMode = 'single' | 'multiple';

export interface VideoModel {
  id: string;
  title: string;
  description: string;
  url: string;
  subspecialty: string;
  section: string;
  isFreeDemo: boolean;
  price: number;
  packId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface QcmModel {
  id: string;
  videoId: string;
  question: string;
  options: string[];
  mode?: QcmMode;
  correctOptionIndex?: number;
  correctOptionIndexes?: number[];
  explanation?: string;
  reference?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type CaseQuestionKind = 'qcm' | 'select' | 'open';

interface CaseQuestionBase {
  id: string;
  kind: CaseQuestionKind;
  prompt: string;
  images?: string[];
}

export interface CaseQuestionQcm extends CaseQuestionBase {
  kind: 'qcm';
  options: string[];
  qcmMode?: QcmMode;
  correctOptionIndexes?: number[];
  correctOptionIndex?: number;
  explanation?: string;
}

export interface CaseQuestionSelect extends CaseQuestionBase {
  kind: 'select';
  options: string[];
  correctOptionIndex?: number;
  explanation?: string;
}

export interface CaseQuestionOpen extends CaseQuestionBase {
  kind: 'open';
  answer?: string;
}

export type CaseQuestionModel = CaseQuestionQcm | CaseQuestionSelect | CaseQuestionOpen;

export interface ClinicalCaseModel {
  id: string;
  videoId: string;
  title?: string;
  description?: string;
  patientHistory?: string;
  clinicalExamination?: string;
  additionalTests?: string;
  diagnosis?: string;
  treatment?: string;
  discussion?: string;
  images?: string[];
  reference?: string;
  questions?: CaseQuestionModel[];
  createdAt?: string;
  updatedAt?: string;
}

export interface OpenQuestionModel {
  id: string;
  videoId: string;
  question: string;
  answer: string;
  reference?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DiagramMarkerModel {
  number: number;
  x: number;
  y: number;
  label: string;
  description: string;
}

export interface DiagramModel {
  id: string;
  videoId: string;
  title: string;
  imageUrl: string;
  markers: DiagramMarkerModel[];
  description?: string;
  reference?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CaseQuestionUiState {
  selectedIndexes?: number[];
  selectedIndex?: number | null;
  answerText?: string;
  feedbackText?: string;
  validated?: boolean;
  isCorrect?: boolean | null;
  showExplanation?: boolean;
  showFeedback?: boolean;
}
