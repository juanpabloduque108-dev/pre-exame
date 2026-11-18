export type BloqueCale = 'Conocimientos' | 'Actitudes';

export type TemaOficial =
  | 'Movilidad Segura'
  | 'Normas'
  | 'Señales'
  | 'Vehículo'
  | 'Actitudes';

export type TipoPregunta = 'multiple' | 'binary';

export interface QuestionOption {
  key: string; // 'A' | 'B' | 'C' | 'D' or 'De acuerdo' | 'En desacuerdo'
  text: string;
}

export interface Question {
  id: string;
  bloque: BloqueCale;
  tema: TemaOficial;
  tipo: TipoPregunta;
  caso?: string;
  enunciado: string;
  opciones: QuestionOption[];
  respuestaCorrecta: string; // matches option.key ('A'|'B'|'C'|'D' or 'De acuerdo'|'En desacuerdo')
  explicacion: string;
  moduloAulapp?: string;
  createdAt: string;
}

export interface AccessKey {
  id: string;
  code: string;
  studentName: string;
  daysValid: number;
  createdAt: string;
  expiresAt: string;
  active: boolean;
  attemptsCount?: number;
}

export interface AttemptAnswerDetail {
  questionId: string;
  bloque: BloqueCale;
  tema: TemaOficial;
  tipo: TipoPregunta;
  caso?: string;
  enunciado: string;
  opciones: QuestionOption[];
  selectedKey: string | null;
  correctKey: string;
  isCorrect: boolean;
  wasFlagged: boolean;
  explicacion: string;
}

export interface ThemeBreakdown {
  tema: TemaOficial;
  total: number;
  correct: number;
  percentage: number;
}

export interface SimulacroAttempt {
  id: string;
  accessKeyId?: string;
  accessCode: string;
  studentName: string;
  createdAt: string;
  durationSeconds: number;
  totalQuestions: number;
  conocimientosTotal: number;
  conocimientosCorrect: number;
  conocimientosPct: number;
  actitudesTotal: number;
  actitudesCorrect: number;
  actitudesPct: number;
  passed: boolean;
  themeBreakdown: ThemeBreakdown[];
  answers: AttemptAnswerDetail[];
}

export interface MistakeRecord {
  id: string;
  accessKeyId?: string;
  accessCode: string;
  questionId: string;
  bloque: BloqueCale;
  tema: TemaOficial;
  tipo: TipoPregunta;
  caso?: string;
  enunciado: string;
  opciones: QuestionOption[];
  wrongKey: string;
  correctKey: string;
  explicacion: string;
  failedCount: number;
  lastFailedAt: string;
  resolved: boolean;
}

export interface ThemeProgress {
  tema: TemaOficial;
  bloque: BloqueCale;
  answered: number;
  correct: number;
  percentage: number;
}

export interface StudentDashboardData {
  studentName: string;
  accessCode: string;
  expiresAt: string;
  daysRemaining: number;
  approvalProbability: number;
  avgConocimientosPct: number;
  avgActitudesPct: number;
  totalAttempts: number;
  passedAttempts: number;
  themeProgress: ThemeProgress[];
  attempts: SimulacroAttempt[];
  mistakes: MistakeRecord[];
}

export interface AuthSession {
  role: 'admin' | 'student';
  accessKeyId?: string;
  accessCode: string;
  studentName?: string;
  expiresAt?: string;
}

export const TEMAS_OFICIALES: TemaOficial[] = [
  'Movilidad Segura',
  'Normas',
  'Señales',
  'Vehículo',
  'Actitudes',
];

export const TEMA_DISPLAY_NAMES: Record<TemaOficial, string> = {
  'Movilidad Segura': 'Movilidad Segura y Sostenible',
  Normas: 'Normas de Tránsito',
  Señales: 'Señalización e Infraestructura',
  Vehículo: 'El Vehículo',
  Actitudes: 'Actitudes',
};

