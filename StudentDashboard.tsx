import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Clock,
  Eye,
  History,
  LogOut,
  Play,
  RefreshCw,
  RotateCcw,
  Target,
  XCircle,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo.tsx';
import { ExamSimulator } from './ExamSimulator.tsx';
import { PWAInstallButton } from './PWAInstallButton.tsx';
import {
  buildStudentDashboardStats,
  resolveMistake,
  subscribeToQuestions,
  subscribeToStudentExamResults,
  subscribeToStudentKey,
  subscribeToStudentMistakes,
} from '../utils/api.ts';
import type {
  AccessKey,
  MistakeRecord,
  Question,
  SimulacroAttempt,
  TemaOficial,
} from '../types/cale.ts';
import { TEMA_DISPLAY_NAMES, TEMAS_OFICIALES } from '../types/cale.ts';

interface StudentDashboardProps {
  accessKeyId?: string;
  accessCode: string;
  studentName: string;
  onLogout: () => void;
}

type StudentTab = 'resumen' | 'errores';

function CircularReadinessGauge({
  percentage,
  hasAttempts,
}: {
  percentage: number;
  hasAttempts: boolean;
}) {
  const size = 176;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = hasAttempts ? Math.max(0, Math.min(100, percentage)) : 0;
  const offset = circumference - (clamped / 100) * circumference;

  const strokeColor = !hasAttempts
    ? '#CBD5E1'
    : clamped >= 80
      ? '#10B981'
      : clamped >= 60
        ? '#1D4ED8'
        : '#EF4444';

  return (
    <div className="relative inline-flex items-center justify-center shrink-0">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#E2E8F0"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(0.16, 1, 0.3, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-3">
        <span className="font-display text-4xl font-extrabold text-slate-900 tabular-nums">
          {hasAttempts ? `${clamped}%` : '—'}
        </span>
        <span className="text-[11px] font-semibold text-slate-500 mt-0.5 leading-tight">
          Probabilidad
        </span>
      </div>
    </div>
  );
}

export function StudentDashboard({
  accessKeyId,
  accessCode,
  studentName,
  onLogout,
}: StudentDashboardProps) {
  const [activeTab, setActiveTab] = useState<StudentTab>('resumen');
  const [liveKey, setLiveKey] = useState<AccessKey | null>(null);
  const [attempts, setAttempts] = useState<SimulacroAttempt[]>([]);
  const [mistakes, setMistakes] = useState<MistakeRecord[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [loadingAttempts, setLoadingAttempts] = useState(true);

  const [examSession, setExamSession] = useState<{
    mode: 'official' | 'theme';
    tema?: TemaOficial;
  } | null>(null);
  const [selectedPracticeTema, setSelectedPracticeTema] =
    useState<TemaOficial>('Movilidad Segura');
  const [selectedAttempt, setSelectedAttempt] = useState<SimulacroAttempt | null>(null);

  // Mistakes practice state
  const [mistakeThemeFilter, setMistakeThemeFilter] = useState<'Todos' | TemaOficial>('Todos');
  const [practiceSelections, setPracticeSelections] = useState<Record<string, string>>({});
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  useEffect(() => {
    setLoadingQuestions(true);
    const unsubQuestions = subscribeToQuestions((qs) => {
      setQuestions(qs);
      setLoadingQuestions(false);
    });

    setLoadingAttempts(true);
    const unsubAttempts = subscribeToStudentExamResults(accessKeyId, accessCode, (atts) => {
      setAttempts(atts);
      setLoadingAttempts(false);
    });

    const unsubMistakes = subscribeToStudentMistakes(accessKeyId, accessCode, (ms) => {
      setMistakes(ms);
    });

    let unsubKey: (() => void) | undefined;
    if (accessKeyId) {
      unsubKey = subscribeToStudentKey(accessKeyId, (k) => {
        setLiveKey(k);
      });
    }

    return () => {
      unsubQuestions();
      unsubAttempts();
      unsubMistakes();
      if (unsubKey) unsubKey();
    };
  }, [accessKeyId, accessCode]);

  const effectiveKey: AccessKey = useMemo(
    () =>
      liveKey ?? {
        id: accessKeyId || `key-${accessCode}`,
        code: accessCode,
        studentName,
        daysValid: 30,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        active: true,
      },
    [liveKey, accessKeyId, accessCode, studentName]
  );

  const dashboard = useMemo(
    () => buildStudentDashboardStats(effectiveKey, attempts, mistakes),
    [effectiveKey, attempts, mistakes]
  );

  const loading = loadingQuestions || loadingAttempts;

  const handleResolveMistake = async (m: MistakeRecord) => {
    setResolvingId(m.id);
    try {
      await resolveMistake(accessCode, m.id);
    } finally {
      setResolvingId(null);
    }
  };

  const themeQuestionCounts = useMemo(() => {
    const counts: Record<TemaOficial, number> = {
      'Movilidad Segura': 0,
      Normas: 0,
      Señales: 0,
      Vehículo: 0,
      Actitudes: 0,
    };
    for (const q of questions) {
      if (counts[q.tema] !== undefined) counts[q.tema] += 1;
    }
    return counts;
  }, [questions]);

  const filteredMistakes = useMemo(() => {
    if (mistakeThemeFilter === 'Todos') return dashboard.mistakes;
    return dashboard.mistakes.filter((m) => m.tema === mistakeThemeFilter);
  }, [dashboard, mistakeThemeFilter]);

  if (examSession) {
    return (
      <ExamSimulator
        accessKeyId={accessKeyId}
        accessCode={accessCode}
        studentName={effectiveKey.studentName}
        questionBank={questions}
        mode={examSession.mode}
        practiceTema={examSession.tema}
        onFinishToDashboard={() => {
          setExamSession(null);
        }}
        onGoToMistakes={() => {
          setExamSession(null);
          setActiveTab('errores');
        }}
        onAttemptSaved={() => {
          // Firestore real-time listeners update attempts and mistakes automatically
        }}
      />
    );
  }

  const officialCount = Math.min(40, questions.length);
  const selectedThemeCount = themeQuestionCounts[selectedPracticeTema] || 0;

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      {/* Top Bar (Strict 3-zone contract) */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          <BrandLogo variant="dark" size="md" />

          <nav className="flex items-center gap-6 overflow-x-auto" aria-label="Estudiante">
            <button
              type="button"
              onClick={() => {
                setActiveTab('resumen');
                setSelectedAttempt(null);
              }}
              className={`py-5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'resumen'
                  ? 'border-[#1D4ED8] text-[#1D4ED8]'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Panel Principal
            </button>
            <button
              type="button"
              onClick={() => setExamSession({ mode: 'official' })}
              className="py-5 text-sm font-semibold border-b-2 border-transparent text-slate-600 hover:text-[#1D4ED8] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Simulacro Oficial
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('errores');
                setSelectedAttempt(null);
              }}
              className={`py-5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'errores'
                  ? 'border-[#1D4ED8] text-[#1D4ED8]'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Repasar Errores ({dashboard?.mistakes.length ?? 0})
            </button>
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <PWAInstallButton variant="header" />
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Cerrar sesión</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 flex-1">
        {loading || !dashboard ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-sm text-slate-500">
            Cargando tu panel de entrenamiento Pre Examen...
          </div>
        ) : activeTab === 'resumen' ? (
          selectedAttempt ? (
            /* Past Attempt Detail Review */
            <section className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
                <div>
                  <p className="text-xs text-slate-500">
                    Intento del {new Date(selectedAttempt.createdAt).toLocaleString('es-CO')}
                  </p>
                  <h1 className="font-display text-xl font-bold text-slate-900 mt-0.5">
                    Revisión de Simulacro ·{' '}
                    <span
                      className={
                        selectedAttempt.passed ? 'text-[#10B981]' : 'text-[#EF4444]'
                      }
                    >
                      {selectedAttempt.passed ? 'APROBADO' : 'REPROBADO'}
                    </span>
                  </h1>
                  <p className="text-xs text-slate-600 mt-1 font-mono tabular-nums">
                    Conocimientos: {selectedAttempt.conocimientosCorrect}/
                    {selectedAttempt.conocimientosTotal} ({selectedAttempt.conocimientosPct}%) ·
                    Actitudes: {selectedAttempt.actitudesCorrect}/
                    {selectedAttempt.actitudesTotal} ({selectedAttempt.actitudesPct}%)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedAttempt(null)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Volver al Panel
                </button>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-200 shadow-xs">
                {selectedAttempt.answers.map((ans, idx) => (
                  <div key={ans.questionId} className="p-6 space-y-2.5">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-mono font-bold text-slate-900">
                        #{idx + 1} · {ans.bloque} · {TEMA_DISPLAY_NAMES[ans.tema]}
                      </span>
                      {ans.isCorrect ? (
                        <span className="text-[#10B981] font-bold inline-flex items-center gap-1">
                          <CheckCircle2 className="h-4 w-4" /> Correcta
                        </span>
                      ) : (
                        <span className="text-[#EF4444] font-bold inline-flex items-center gap-1">
                          <XCircle className="h-4 w-4" /> Incorrecta
                        </span>
                      )}
                    </div>
                    {ans.caso && (
                      <p className="text-xs text-slate-600 bg-[#F8FAFC] rounded-lg px-3.5 py-2.5 border border-slate-200">
                        <strong className="text-slate-900">Evento / Caso:</strong> {ans.caso}
                      </p>
                    )}
                    <p className="text-sm font-bold text-slate-900 whitespace-pre-line">
                      {ans.enunciado}
                    </p>
                    <div className="text-xs text-slate-700 space-y-1.5">
                      <p>
                        <strong>Tu respuesta:</strong>{' '}
                        <span className={ans.isCorrect ? 'text-[#10B981]' : 'text-[#EF4444]'}>
                          {ans.selectedKey || 'Sin responder'}
                        </span>{' '}
                        · <strong>Correcta:</strong>{' '}
                        <span className="text-[#10B981] font-semibold">{ans.correctKey}</span>
                      </p>
                      <p className="text-slate-600 bg-[#F8FAFC] rounded-lg p-3 border border-slate-200">
                        <strong>Sustento normativo:</strong> {ans.explicacion}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <>
              {/* Personalized Greeting */}
              <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-1">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#1D4ED8]">
                    Pre Examen · Centro de Preparación Teórica CALE
                  </p>
                  <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
                    Hola, {dashboard.studentName}
                  </h1>
                </div>
                <div className="text-xs text-slate-500 font-mono tabular-nums">
                  Clave: <strong className="text-slate-800">{dashboard.accessCode}</strong> ·{' '}
                  {dashboard.daysRemaining} días de vigencia · Banco: {questions.length} preguntas
                </div>
              </section>

              {/* Top Grid: Center-Left Circular Gauge + Right 2 Primary Action Cards */}
              <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                {/* Circular Readiness Gauge */}
                <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-6 sm:p-7 flex flex-col justify-between shadow-xs">
                  <div>
                    <h2 className="font-display text-base font-bold text-slate-900">
                      Índice de Preparación / Probabilidad de Aprobación
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">
                      Calculado según tus últimos simulacros bajo la regla del 80% independiente por
                      bloque.
                    </p>
                  </div>

                  <div className="my-6 flex flex-col sm:flex-row items-center gap-6">
                    <CircularReadinessGauge
                      percentage={dashboard.approvalProbability}
                      hasAttempts={dashboard.totalAttempts > 0}
                    />

                    <div className="space-y-3 w-full text-sm">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <span className="text-slate-600 text-xs">Conocimientos prom.</span>
                        <span className="font-mono font-bold text-slate-900 tabular-nums">
                          {dashboard.totalAttempts > 0 ? `${dashboard.avgConocimientosPct}%` : '—'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <span className="text-slate-600 text-xs">Actitudes prom.</span>
                        <span className="font-mono font-bold text-slate-900 tabular-nums">
                          {dashboard.totalAttempts > 0 ? `${dashboard.avgActitudesPct}%` : '—'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600 text-xs">Simulacros aprobados</span>
                        <span className="font-mono font-bold text-[#10B981] tabular-nums">
                          {dashboard.passedAttempts} / {dashboard.totalAttempts}
                        </span>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-slate-500">
                    {dashboard.totalAttempts === 0
                      ? 'Completa tu primer Simulacro Oficial CALE para calcular tu índice de preparación.'
                      : dashboard.approvalProbability >= 80
                        ? 'Nivel óptimo para presentar la prueba teórica oficial.'
                        : 'Refuerza los núcleos por debajo del 80% antes de presentar el examen.'}
                  </p>
                </div>

                {/* Two Primary Action Cards */}
                <div className="lg:col-span-7 grid grid-cols-1 gap-5">
                  {/* Action Card 1: Simulacro Oficial CALE */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-5 shadow-xs">
                    <div className="space-y-2 max-w-md">
                      <div className="inline-flex items-center gap-2 text-xs font-bold text-[#1D4ED8]">
                        <Target className="h-4 w-4" />
                        <span>Evaluación Completa Cronometrada</span>
                      </div>
                      <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900">
                        Iniciar Simulacro Oficial CALE (40 preguntas · 70 min)
                      </h2>
                      <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                        Distribución oficial: 28 preguntas de Conocimientos y 12 de Actitudes
                        {questions.length < 40
                          ? ` (actualmente ${officialCount} disponibles en el banco)`
                          : ''}
                        . Aprobación estricta ≥ 80% en cada bloque.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setExamSession({ mode: 'official' })}
                      disabled={officialCount === 0}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1D4ED8] px-6 py-3.5 text-sm font-bold text-white hover:bg-[#1E40AF] disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Play className="h-4 w-4 fill-current" />
                      <span>Iniciar Simulacro</span>
                    </button>
                  </div>

                  {/* Action Card 2: Práctica por Núcleo Temático */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="inline-flex items-center gap-2 text-xs font-bold text-[#1D4ED8]">
                          <BookOpen className="h-4 w-4" />
                          <span>Entrenamiento Enfocado</span>
                        </div>
                        <h2 className="font-display text-lg font-bold text-slate-900 mt-0.5">
                          Práctica por Núcleo Temático
                        </h2>
                      </div>
                      <span className="text-xs font-mono text-slate-500 tabular-nums">
                        {selectedThemeCount}{' '}
                        {selectedThemeCount === 1 ? 'pregunta disponible' : 'preguntas disponibles'}
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                      <select
                        aria-label="Seleccionar núcleo temático"
                        value={selectedPracticeTema}
                        onChange={(e) => setSelectedPracticeTema(e.target.value as TemaOficial)}
                        className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
                      >
                        {TEMAS_OFICIALES.map((tema) => (
                          <option key={tema} value={tema}>
                            {TEMA_DISPLAY_NAMES[tema]} ({themeQuestionCounts[tema]} preg.)
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() =>
                          setExamSession({ mode: 'theme', tema: selectedPracticeTema })
                        }
                        disabled={selectedThemeCount === 0}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1D4ED8] px-5 py-3 text-sm font-semibold text-white hover:bg-[#1E40AF] disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <Play className="h-4 w-4" />
                        <span>Practicar Núcleo</span>
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              {/* Horizontal Bar Chart: 5 Official Themes */}
              <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-7 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
                  <div>
                    <h2 className="font-display text-lg font-bold text-slate-900">
                      Desempeño por los 5 Núcleos Temáticos Oficiales
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Porcentaje de acierto acumulado frente al umbral mínimo requerido del 80%.
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-600">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-xs bg-[#10B981] inline-block" /> ≥ 80%
                      Aprobado
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-xs bg-[#1D4ED8] inline-block" /> 60–79% En
                      progreso
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-xs bg-[#EF4444] inline-block" /> &lt; 60%
                      Reforzar
                    </span>
                  </div>
                </div>

                <div className="space-y-4">
                  {dashboard.themeProgress.map((tp) => {
                    const hasData = tp.answered > 0;
                    const barColor = !hasData
                      ? 'bg-slate-200'
                      : tp.percentage >= 80
                        ? 'bg-[#10B981]'
                        : tp.percentage >= 60
                          ? 'bg-[#1D4ED8]'
                          : 'bg-[#EF4444]';

                    return (
                      <div
                        key={tp.tema}
                        className="grid grid-cols-1 md:grid-cols-12 items-center gap-2 md:gap-4"
                      >
                        <div className="md:col-span-4 flex items-center justify-between md:justify-start gap-2">
                          <span className="text-sm font-semibold text-slate-800">
                            {TEMA_DISPLAY_NAMES[tp.tema]}
                          </span>
                          <span className="md:hidden font-mono text-xs font-bold text-slate-900 tabular-nums">
                            {hasData ? `${tp.percentage}%` : '—'}
                          </span>
                        </div>

                        <div className="md:col-span-6 relative h-4 rounded-full bg-slate-100 border border-slate-200 overflow-hidden">
                          {/* 80% Threshold Marker */}
                          <div
                            className="absolute top-0 bottom-0 w-0.5 bg-slate-400/80 z-10"
                            style={{ left: '80%' }}
                            title="Mínimo 80%"
                          />
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                            style={{ width: `${hasData ? tp.percentage : 0}%` }}
                          />
                        </div>

                        <div className="md:col-span-2 hidden md:flex items-center justify-end gap-2 font-mono text-xs tabular-nums">
                          <span className="text-slate-500">
                            {tp.correct}/{tp.answered}
                          </span>
                          <span className="font-bold text-slate-900 w-10 text-right">
                            {hasData ? `${tp.percentage}%` : '—'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* History Table */}
              <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <History className="h-5 w-5 text-[#1D4ED8]" />
                    <h2 className="font-display text-base font-bold text-slate-900">
                      Historial de Simulacros Oficiales ({dashboard.attempts.length})
                    </h2>
                  </div>
                </div>

                {dashboard.attempts.length === 0 ? (
                  <div className="p-10 text-center space-y-3">
                    <p className="text-sm text-slate-600">
                      Aún no has completado ningún Simulacro Oficial CALE.
                    </p>
                    <button
                      type="button"
                      onClick={() => setExamSession({ mode: 'official' })}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#1D4ED8] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#1E40AF] cursor-pointer"
                    >
                      <Play className="h-3.5 w-3.5" />
                      <span>Iniciar primer simulacro</span>
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-[#F8FAFC] text-xs font-semibold text-slate-600">
                          <th className="py-3.5 px-6">Fecha</th>
                          <th className="py-3.5 px-4 text-right">Puntaje Conocimientos</th>
                          <th className="py-3.5 px-4 text-right">Puntaje Actitudes</th>
                          <th className="py-3.5 px-4">Resultado</th>
                          <th className="py-3.5 px-6 text-right">Revisión</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-sm">
                        {dashboard.attempts.map((att) => (
                          <tr key={att.id} className="hover:bg-slate-50/70">
                            <td className="py-3.5 px-6 text-slate-700 whitespace-nowrap tabular-nums">
                              {new Date(att.createdAt).toLocaleString('es-CO', {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })}
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                              <span
                                className={`font-bold ${
                                  att.conocimientosPct >= 80
                                    ? 'text-[#10B981]'
                                    : 'text-[#EF4444]'
                                }`}
                              >
                                {att.conocimientosCorrect}/{att.conocimientosTotal || 28}
                              </span>{' '}
                              <span className="text-xs text-slate-500">
                                ({att.conocimientosPct}%)
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                              <span
                                className={`font-bold ${
                                  att.actitudesPct >= 80 ? 'text-[#10B981]' : 'text-[#EF4444]'
                                }`}
                              >
                                {att.actitudesCorrect}/{att.actitudesTotal || 12}
                              </span>{' '}
                              <span className="text-xs text-slate-500">({att.actitudesPct}%)</span>
                            </td>
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              {att.passed ? (
                                <span className="inline-flex items-center gap-1.5 rounded-md border border-[#10B981]/30 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-[#10B981]">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  APROBADO
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 rounded-md border border-[#EF4444]/30 bg-red-50 px-2.5 py-1 text-xs font-bold text-[#EF4444]">
                                  <XCircle className="h-3.5 w-3.5" />
                                  REPROBADO
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-6 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => setSelectedAttempt(att)}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                <span>Ver revisión</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )
        ) : (
          /* TAB 2: REPASAR ERRORES */
          <section className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-wrap items-center justify-between gap-4 shadow-xs">
              <div>
                <h1 className="font-display text-xl font-bold text-slate-900">
                  Repasar Errores ({filteredMistakes.length})
                </h1>
                <p className="text-sm text-slate-600 mt-0.5">
                  Preguntas falladas en tus Simulacros Oficiales con su explicación normativa para
                  reforzar antes del examen real.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <select
                  value={mistakeThemeFilter}
                  onChange={(e) =>
                    setMistakeThemeFilter(e.target.value as 'Todos' | TemaOficial)
                  }
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#1D4ED8] focus:outline-none"
                >
                  <option value="Todos">Todos los núcleos temáticos</option>
                  {TEMAS_OFICIALES.map((t) => (
                    <option key={t} value={t}>
                      {TEMA_DISPLAY_NAMES[t]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setPracticeSelections({})}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reiniciar</span>
                </button>
              </div>
            </div>

            {filteredMistakes.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3 shadow-xs">
                <CheckCircle2 className="h-10 w-10 text-[#10B981] mx-auto" />
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Sin errores pendientes por repasar
                </h2>
                <p className="text-sm text-slate-600 max-w-md mx-auto">
                  Cada pregunta que falles en un Simulacro Oficial se guardará aquí automáticamente.
                </p>
                <button
                  type="button"
                  onClick={() => setExamSession({ mode: 'official' })}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#1D4ED8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1E40AF] cursor-pointer"
                >
                  <Play className="h-4 w-4" />
                  <span>Iniciar Simulacro Oficial</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredMistakes.map((m, idx) => {
                  const chosen = practiceSelections[m.id];
                  const answeredRight =
                    chosen !== undefined &&
                    chosen.toLowerCase() === m.correctKey.toLowerCase();

                  return (
                    <article
                      key={m.id}
                      className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-bold text-slate-900">#{idx + 1}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-semibold text-[#1D4ED8]">
                            {TEMA_DISPLAY_NAMES[m.tema]}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="text-[#EF4444] font-medium tabular-nums">
                            Fallada {m.failedCount} {m.failedCount === 1 ? 'vez' : 'veces'}
                          </span>
                        </div>
                        <span className="inline-flex items-center gap-1 text-slate-500 tabular-nums">
                          <Clock className="h-3.5 w-3.5" />
                          Último fallo: {new Date(m.lastFailedAt).toLocaleDateString('es-CO')}
                        </span>
                      </div>

                      {m.caso && (
                        <p className="text-xs text-slate-600 bg-[#F8FAFC] border border-slate-200 rounded-lg px-3.5 py-2.5">
                          <strong className="text-slate-900">Evento / Caso:</strong> {m.caso}
                        </p>
                      )}

                      <h3 className="font-display text-base font-bold text-slate-900 whitespace-pre-line">
                        {m.enunciado}
                      </h3>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {m.opciones.map((op) => {
                          const isChosen = chosen === op.key;
                          const isCorrect = op.key === m.correctKey;

                          let btnClass =
                            'border-slate-200 bg-white text-slate-800 hover:bg-slate-50';
                          if (chosen !== undefined) {
                            if (isCorrect) {
                              btnClass =
                                'border-[#10B981] bg-emerald-50 text-emerald-950 font-semibold';
                            } else if (isChosen) {
                              btnClass = 'border-[#EF4444] bg-red-50 text-red-900';
                            }
                          }

                          return (
                            <button
                              key={op.key}
                              type="button"
                              onClick={() =>
                                setPracticeSelections((prev) => ({ ...prev, [m.id]: op.key }))
                              }
                              className={`text-left rounded-xl border px-4 py-3 text-xs sm:text-sm transition-colors cursor-pointer ${btnClass}`}
                            >
                              {m.tipo === 'multiple' ? (
                                <strong className="font-mono mr-1.5">{op.key})</strong>
                              ) : null}
                              <span>{op.text}</span>
                            </button>
                          );
                        })}
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-4 text-xs text-slate-700 space-y-1.5">
                        <p>
                          <strong className="text-[#EF4444]">Tu fallo anterior:</strong>{' '}
                          <span className="font-mono">{m.wrongKey}</span>
                          {chosen !== undefined && (
                            <>
                              {' '}
                              · <strong className="text-[#10B981]">Respuesta correcta:</strong>{' '}
                              <span className="font-mono">{m.correctKey}</span>
                            </>
                          )}
                        </p>
                        <p className="leading-relaxed">
                          <strong className="text-slate-900">Sustento normativo:</strong>{' '}
                          {m.explicacion}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                        <span className="text-xs text-slate-500">
                          {chosen === undefined
                            ? 'Selecciona la respuesta correcta arriba para comprobar tu repaso.'
                            : answeredRight
                              ? 'Correcto. Ya puedes marcar esta pregunta como superada.'
                              : 'Revisa el sustento normativo e inténtalo de nuevo.'}
                        </span>

                        <button
                          type="button"
                          onClick={() => handleResolveMistake(m)}
                          disabled={resolvingId === m.id}
                          className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                            answeredRight
                              ? 'bg-[#10B981] text-white hover:bg-emerald-600'
                              : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          <span>
                            {resolvingId === m.id ? 'Guardando...' : 'Marcar como superada'}
                          </span>
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
