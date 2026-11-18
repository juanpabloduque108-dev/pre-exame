import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Award,
  CheckCircle2,
  Clock,
  Flag,
  HelpCircle,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo.tsx';
import { submitSimulacroAttempt } from '../utils/api.ts';
import type {
  BloqueCale,
  Question,
  SimulacroAttempt,
  TemaOficial,
} from '../types/cale.ts';
import { TEMA_DISPLAY_NAMES } from '../types/cale.ts';

interface ExamSimulatorProps {
  accessKeyId?: string;
  accessCode: string;
  studentName: string;
  questionBank: Question[];
  mode?: 'official' | 'theme';
  practiceTema?: TemaOficial;
  onFinishToDashboard: () => void;
  onGoToMistakes: () => void;
  onAttemptSaved: (attempt: SimulacroAttempt) => void;
}

const TOTAL_SECONDS = 70 * 60; // 70:00 minutos oficiales

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Selección oficial CALE de 40 preguntas:
 * - 28 de Conocimientos: 10 Movilidad Segura, 6 Normas, 6 Señales, 6 Vehículo
 * - 12 de Actitudes
 * Si faltan preguntas en alguna categoría, completa con las disponibles sin repetir.
 */
function buildOfficialExamQuestions(bank: Question[]): Question[] {
  const pools: Record<TemaOficial, Question[]> = {
    'Movilidad Segura': shuffleArray(bank.filter((q) => q.tema === 'Movilidad Segura')),
    Normas: shuffleArray(bank.filter((q) => q.tema === 'Normas')),
    Señales: shuffleArray(bank.filter((q) => q.tema === 'Señales')),
    Vehículo: shuffleArray(bank.filter((q) => q.tema === 'Vehículo')),
    Actitudes: shuffleArray(bank.filter((q) => q.tema === 'Actitudes')),
  };

  const takenIds = new Set<string>();
  const conocimientosSelected: Question[] = [];
  const actitudesSelected: Question[] = [];

  const takeFromPool = (pool: Question[], count: number, dest: Question[]) => {
    for (const q of pool) {
      if (dest.length >= count) break;
      if (!takenIds.has(q.id)) {
        takenIds.add(q.id);
        dest.push(q);
      }
    }
  };

  // 1. Cuotas exactas Bloque I: Conocimientos (10 + 6 + 6 + 6 = 28)
  const conQuotas: Array<[TemaOficial, number]> = [
    ['Movilidad Segura', 10],
    ['Normas', 6],
    ['Señales', 6],
    ['Vehículo', 6],
  ];

  for (const [tema, quota] of conQuotas) {
    let added = 0;
    for (const q of pools[tema]) {
      if (added >= quota) break;
      if (!takenIds.has(q.id)) {
        takenIds.add(q.id);
        conocimientosSelected.push(q);
        added += 1;
      }
    }
  }

  // Si faltaron preguntas para llegar a 28 en Conocimientos, completar con otras de Conocimientos disponibles
  if (conocimientosSelected.length < 28) {
    const remainingCon = shuffleArray(
      bank.filter((q) => q.bloque === 'Conocimientos' && !takenIds.has(q.id))
    );
    takeFromPool(remainingCon, 28, conocimientosSelected);
  }

  // 2. Cuota exacta Bloque II: Actitudes (12)
  takeFromPool(pools['Actitudes'], 12, actitudesSelected);

  // 3. Si el total aún es menor a 40, completar sin repetir con el resto del banco disponible
  const totalSelected = conocimientosSelected.length + actitudesSelected.length;
  if (totalSelected < 40) {
    const remainingAny = shuffleArray(bank.filter((q) => !takenIds.has(q.id)));
    for (const q of remainingAny) {
      if (conocimientosSelected.length + actitudesSelected.length >= 40) break;
      takenIds.add(q.id);
      if (q.bloque === 'Actitudes') {
        actitudesSelected.push(q);
      } else {
        conocimientosSelected.push(q);
      }
    }
  }

  // Orden oficial: Bloque I (1..28) seguido de Bloque II (29..40)
  return [...conocimientosSelected, ...actitudesSelected];
}

function buildThemePracticeQuestions(bank: Question[], tema: TemaOficial): Question[] {
  return shuffleArray(bank.filter((q) => q.tema === tema));
}

function splitContextAndPrompt(q: { caso?: string; enunciado: string }): {
  contexto?: string;
  pregunta: string;
} {
  if (q.caso && q.caso.trim()) {
    return { contexto: q.caso.trim(), pregunta: q.enunciado.trim() };
  }
  const parts = q.enunciado
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    return {
      contexto: parts.slice(0, -1).join('\n\n'),
      pregunta: parts[parts.length - 1],
    };
  }
  return { contexto: undefined, pregunta: q.enunciado.trim() };
}

function formatTimeMMSS(totalSec: number): string {
  const clamped = Math.max(0, totalSec);
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function ExamSimulator({
  accessKeyId,
  accessCode,
  studentName,
  questionBank,
  mode = 'official',
  practiceTema,
  onFinishToDashboard,
  onGoToMistakes,
  onAttemptSaved,
}: ExamSimulatorProps) {
  const [examQuestions] = useState<Question[]>(() =>
    mode === 'theme' && practiceTema
      ? buildThemePracticeQuestions(questionBank, practiceTema)
      : buildOfficialExamQuestions(questionBank)
  );
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const [secondsLeft, setSecondsLeft] = useState(TOTAL_SECONDS);
  const [elapsedPracticeSec, setElapsedPracticeSec] = useState(0);
  const [confirmFinishOpen, setConfirmFinishOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<SimulacroAttempt | null>(null);
  const [reviewFilter, setReviewFilter] = useState<'all' | 'wrong' | 'flagged'>('all');

  useEffect(() => {
    if (result) return;
    const timer = setInterval(() => {
      if (mode === 'official') {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      } else {
        setElapsedPracticeSec((prev) => prev + 1);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [result, mode]);

  useEffect(() => {
    if (mode === 'official' && secondsLeft === 0 && !result && !submitting) {
      void handleSubmitExam();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, mode]);

  const currentQuestion = examQuestions[currentIdx];

  const { conList, actList } = useMemo(() => {
    const con: Array<{ q: Question; idx: number }> = [];
    const act: Array<{ q: Question; idx: number }> = [];
    examQuestions.forEach((q, idx) => {
      if (q.bloque === 'Conocimientos') con.push({ q, idx });
      else act.push({ q, idx });
    });
    return { conList: con, actList: act };
  }, [examQuestions]);

  const answeredCount = Object.keys(answers).length;
  const flaggedCount = Object.values(flagged).filter(Boolean).length;

  const handleSelectOption = (questionId: string, optionKey: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: optionKey }));
  };

  const handleToggleFlag = (questionId: string) => {
    setFlagged((prev) => ({ ...prev, [questionId]: !prev[questionId] }));
  };

  const jumpToBlock = (bloque: BloqueCale) => {
    const first = examQuestions.findIndex((q) => q.bloque === bloque);
    if (first >= 0) setCurrentIdx(first);
  };

  const handleSubmitExam = async () => {
    setConfirmFinishOpen(false);
    setSubmitting(true);
    setSubmitError(null);
    const elapsedSeconds =
      mode === 'official' ? Math.max(1, TOTAL_SECONDS - secondsLeft) : Math.max(1, elapsedPracticeSec);

    if (mode === 'theme') {
      // Local grading for thematic practice so official /28 and /12 history stays clean
      const gradedAnswers = examQuestions.map((q) => {
        const selectedKey = answers[q.id] ?? null;
        const isCorrect =
          selectedKey !== null &&
          selectedKey.trim().toLowerCase() === q.respuestaCorrecta.trim().toLowerCase();
        return {
          questionId: q.id,
          bloque: q.bloque,
          tema: q.tema,
          tipo: q.tipo,
          caso: q.caso,
          enunciado: q.enunciado,
          opciones: q.opciones,
          selectedKey,
          correctKey: q.respuestaCorrecta,
          isCorrect,
          wasFlagged: Boolean(flagged[q.id]),
          explicacion: q.explicacion,
        };
      });

      const conAns = gradedAnswers.filter((a) => a.bloque === 'Conocimientos');
      const actAns = gradedAnswers.filter((a) => a.bloque === 'Actitudes');
      const conOk = conAns.filter((a) => a.isCorrect).length;
      const actOk = actAns.filter((a) => a.isCorrect).length;
      const conPct = conAns.length > 0 ? Math.round((conOk / conAns.length) * 100) : 100;
      const actPct = actAns.length > 0 ? Math.round((actOk / actAns.length) * 100) : 100;

      const localAttempt: SimulacroAttempt = {
        id: `prac-${Date.now()}`,
        accessCode,
        studentName,
        createdAt: new Date().toISOString(),
        durationSeconds: elapsedSeconds,
        totalQuestions: gradedAnswers.length,
        conocimientosTotal: conAns.length,
        conocimientosCorrect: conOk,
        conocimientosPct: conPct,
        actitudesTotal: actAns.length,
        actitudesCorrect: actOk,
        actitudesPct: actPct,
        passed: conPct >= 80 && actPct >= 80,
        themeBreakdown: practiceTema
          ? [
              {
                tema: practiceTema,
                total: gradedAnswers.length,
                correct: gradedAnswers.filter((a) => a.isCorrect).length,
                percentage:
                  gradedAnswers.length > 0
                    ? Math.round(
                        (gradedAnswers.filter((a) => a.isCorrect).length /
                          gradedAnswers.length) *
                          100
                      )
                    : 0,
              },
            ]
          : [],
        answers: gradedAnswers,
      };
      setResult(localAttempt);
      setSubmitting(false);
      return;
    }

    try {
      const attempt = await submitSimulacroAttempt({
        accessKeyId,
        accessCode,
        studentName,
        questionBank: examQuestions,
        durationSeconds: elapsedSeconds,
        submissions: examQuestions.map((q) => ({
          questionId: q.id,
          selectedKey: answers[q.id] ?? null,
          wasFlagged: Boolean(flagged[q.id]),
        })),
      });
      setResult(attempt);
      onAttemptSaved(attempt);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Ocurrió un error al calificar el examen.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  // --- RESULT SCREEN ---
  if (result) {
    const filteredReview = result.answers.filter((a) => {
      if (reviewFilter === 'wrong') return !a.isCorrect;
      if (reviewFilter === 'flagged') return a.wasFlagged;
      return true;
    });

    const wrongCount = result.answers.filter((a) => !a.isCorrect).length;
    const conPassed = result.conocimientosTotal === 0 || result.conocimientosPct >= 80;
    const actPassed = result.actitudesTotal === 0 || result.actitudesPct >= 80;
    const totalCorrect = result.answers.filter((a) => a.isCorrect).length;
    const totalPct =
      result.totalQuestions > 0 ? Math.round((totalCorrect / result.totalQuestions) * 100) : 0;

    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-6">
            <BrandLogo
              variant="dark"
              size="md"
              suffix={mode === 'theme' ? 'Práctica Temática' : 'Resultado Oficial'}
            />
            <span className="hidden sm:inline text-xs font-medium text-slate-500 truncate">
              Practicante: {studentName}
            </span>
            <button
              type="button"
              onClick={onFinishToDashboard}
              className="rounded-lg bg-[#1D4ED8] px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-[#1E40AF] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Volver al Panel
            </button>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
          {/* Official Stamp & Block Comparison */}
          <section className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-start gap-4">
                {result.passed ? (
                  <div className="h-14 w-14 rounded-2xl bg-emerald-50 border border-[#10B981]/30 flex items-center justify-center shrink-0">
                    <Award className="h-8 w-8 text-[#10B981]" />
                  </div>
                ) : (
                  <div className="h-14 w-14 rounded-2xl bg-red-50 border border-[#EF4444]/30 flex items-center justify-center shrink-0">
                    <XCircle className="h-8 w-8 text-[#EF4444]" />
                  </div>
                )}

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {mode === 'theme' && practiceTema
                      ? `Resultado Práctica · ${TEMA_DISPLAY_NAMES[practiceTema]}`
                      : 'Resultado Oficial Pre Examen CALE'}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-3">
                    <h1
                      className={`font-display text-2xl sm:text-3xl font-extrabold tracking-tight ${
                        result.passed ? 'text-[#10B981]' : 'text-[#EF4444]'
                      }`}
                    >
                      {mode === 'theme'
                        ? result.passed
                          ? 'NÚCLEO SUPERADO'
                          : 'NÚCLEO EN REFUERZO'
                        : result.passed
                          ? 'EXAMEN APROBADO'
                          : 'EXAMEN REPROBADO'}
                    </h1>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-bold ${
                        result.passed
                          ? 'border-[#10B981]/40 bg-emerald-50 text-emerald-800'
                          : 'border-[#EF4444]/40 bg-red-50 text-red-800'
                      }`}
                    >
                      {result.passed ? '≥ 80% en ambos bloques' : 'Requiere ≥ 80% por bloque'}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600 max-w-2xl">
                    {mode === 'theme'
                      ? `Obtuviste ${totalCorrect} de ${result.totalQuestions} aciertos (${totalPct}%).`
                      : result.passed
                        ? 'Cumpliste el criterio oficial CALE al superar el 80% de forma independiente en el Bloque I de Conocimientos y en el Bloque II de Actitudes.'
                        : 'La normativa oficial CALE exige aprobar ambos bloques de forma independiente (mínimo 80% en Conocimientos y mínimo 80% en Actitudes).'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 shrink-0">
                {mode === 'official' && wrongCount > 0 && (
                  <button
                    type="button"
                    onClick={onGoToMistakes}
                    className="rounded-xl bg-[#1D4ED8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1E40AF] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Repasar {wrongCount} {wrongCount === 1 ? 'error' : 'errores'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onFinishToDashboard}
                  className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
                >
                  Ir al Panel Principal
                </button>
              </div>
            </div>

            {/* Two large comparison cards: Bloque I vs Bloque II */}
            {mode === 'official' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-7 pt-6 border-t border-slate-200">
                <div
                  className={`rounded-xl border p-6 ${
                    conPassed
                      ? 'border-[#10B981]/40 bg-emerald-50/40'
                      : 'border-[#EF4444]/40 bg-red-50/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-display text-base font-bold text-slate-900">
                      Bloque I: Conocimientos (Mínimo 80%)
                    </h2>
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-bold ${
                        conPassed ? 'text-[#10B981]' : 'text-[#EF4444]'
                      }`}
                    >
                      {conPassed ? (
                        <>
                          <CheckCircle2 className="h-4 w-4" /> Aprobado
                        </>
                      ) : (
                        <>
                          <XCircle className="h-4 w-4" /> Reprobado
                        </>
                      )}
                    </span>
                  </div>
                  <div className="mt-4 flex items-baseline justify-between">
                    <span className="font-display text-4xl font-extrabold text-slate-900 tabular-nums">
                      {result.conocimientosPct}%
                    </span>
                    <span className="font-mono text-sm font-semibold text-slate-700 tabular-nums">
                      {result.conocimientosCorrect} / {result.conocimientosTotal} correctas
                    </span>
                  </div>
                  <div className="mt-4 relative h-3 w-full rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        conPassed ? 'bg-[#10B981]' : 'bg-[#EF4444]'
                      }`}
                      style={{ width: `${result.conocimientosPct}%` }}
                    />
                  </div>
                </div>

                <div
                  className={`rounded-xl border p-6 ${
                    actPassed
                      ? 'border-[#10B981]/40 bg-emerald-50/40'
                      : 'border-[#EF4444]/40 bg-red-50/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-display text-base font-bold text-slate-900">
                      Bloque II: Actitudes (Mínimo 80%)
                    </h2>
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-bold ${
                        actPassed ? 'text-[#10B981]' : 'text-[#EF4444]'
                      }`}
                    >
                      {actPassed ? (
                        <>
                          <CheckCircle2 className="h-4 w-4" /> Aprobado
                        </>
                      ) : (
                        <>
                          <XCircle className="h-4 w-4" /> Reprobado
                        </>
                      )}
                    </span>
                  </div>
                  <div className="mt-4 flex items-baseline justify-between">
                    <span className="font-display text-4xl font-extrabold text-slate-900 tabular-nums">
                      {result.actitudesPct}%
                    </span>
                    <span className="font-mono text-sm font-semibold text-slate-700 tabular-nums">
                      {result.actitudesCorrect} / {result.actitudesTotal} correctas
                    </span>
                  </div>
                  <div className="mt-4 relative h-3 w-full rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        actPassed ? 'bg-[#10B981]' : 'bg-[#EF4444]'
                      }`}
                      style={{ width: `${result.actitudesPct}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Detailed Question-by-Question Review */}
          <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Revisión Detallada ({filteredReview.length} preguntas)
                </h2>
                <p className="text-xs text-slate-500">
                  Verifica tu respuesta, la opción correcta y el sustento normativo de cada pregunta.
                </p>
              </div>
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                {(
                  [
                    { id: 'all', label: `Todas (${result.answers.length})` },
                    { id: 'wrong', label: `Incorrectas (${wrongCount})` },
                    {
                      id: 'flagged',
                      label: `Revisar (${result.answers.filter((a) => a.wasFlagged).length})`,
                    },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setReviewFilter(tab.id)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      reviewFilter === tab.id
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-slate-200">
              {filteredReview.map((ans, idx) => {
                const { contexto, pregunta } = splitContextAndPrompt({
                  caso: ans.caso,
                  enunciado: ans.enunciado,
                });

                return (
                  <div key={ans.questionId} className="p-6 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-mono font-bold text-slate-900">#{idx + 1}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          Bloque {ans.bloque === 'Conocimientos' ? 'I: Conocimientos' : 'II: Actitudes'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-[#1D4ED8]">
                          {TEMA_DISPLAY_NAMES[ans.tema]}
                        </span>
                        {ans.wasFlagged && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-amber-700 font-semibold inline-flex items-center gap-1">
                              <Flag className="h-3 w-3" /> Marcada para revisar
                            </span>
                          </>
                        )}
                      </div>
                      {ans.isCorrect ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-[#10B981]">
                          <CheckCircle2 className="h-4 w-4" /> Correcta
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-[#EF4444]">
                          <XCircle className="h-4 w-4" /> Incorrecta
                        </span>
                      )}
                    </div>

                    {contexto && (
                      <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-700">
                        <strong className="text-slate-900">Evento / Caso:</strong> {contexto}
                      </div>
                    )}

                    <p className="text-sm font-bold text-slate-900 whitespace-pre-line">
                      {pregunta}
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {ans.opciones.map((op) => {
                        const isCorrectOpt = op.key === ans.correctKey;
                        const isUserOpt = op.key === ans.selectedKey;
                        let style = 'border-slate-200 bg-white text-slate-700';
                        if (isCorrectOpt) {
                          style = 'border-[#10B981] bg-emerald-50 text-emerald-950 font-semibold';
                        } else if (isUserOpt && !isCorrectOpt) {
                          style = 'border-[#EF4444] bg-red-50 text-red-900 font-medium';
                        }

                        return (
                          <div key={op.key} className={`rounded-lg border px-3.5 py-2.5 text-xs ${style}`}>
                            <span className="font-mono font-bold mr-1.5">
                              {ans.tipo === 'multiple' ? `${op.key})` : ''}
                            </span>
                            <span>{op.text}</span>
                            {isCorrectOpt && (
                              <span className="ml-2 text-[#10B981] font-bold">· Correcta</span>
                            )}
                            {isUserOpt && !isCorrectOpt && (
                              <span className="ml-2 text-[#EF4444] font-bold">· Tu selección</span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {!ans.selectedKey && (
                      <p className="text-xs text-amber-700 font-medium">
                        No marcaste ninguna opción en esta pregunta.
                      </p>
                    )}

                    <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-700 leading-relaxed">
                      <strong className="text-slate-900">Sustento normativo:</strong> {ans.explicacion}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </main>
      </div>
    );
  }

  // --- EMPTY BANK GUARD ---
  if (!currentQuestion) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 max-w-md text-center space-y-4 shadow-xs">
          <ShieldAlert className="h-10 w-10 text-amber-600 mx-auto" />
          <h1 className="font-display text-lg font-bold text-slate-900">
            No hay preguntas disponibles en este núcleo
          </h1>
          <p className="text-sm text-slate-600">
            El banco aún no tiene preguntas cargadas para esta categoría.
          </p>
          <button
            type="button"
            onClick={onFinishToDashboard}
            className="rounded-lg bg-[#1D4ED8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1E40AF] cursor-pointer"
          >
            Volver al Panel
          </button>
        </div>
      </div>
    );
  }

  const timeUrgent = mode === 'official' && secondsLeft <= 180;
  const timeWarning = mode === 'official' && secondsLeft <= 600 && secondsLeft > 180;
  const currentSelected = answers[currentQuestion.id];
  const isCurrentFlagged = Boolean(flagged[currentQuestion.id]);
  const { contexto, pregunta } = splitContextAndPrompt(currentQuestion);

  const conRangeLabel = conList.length > 0 ? `1-${conList.length}` : '0';
  const actRangeLabel =
    actList.length > 0 ? `${conList.length + 1}-${examQuestions.length}` : '0';

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      {/* Sticky Official Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <BrandLogo
              variant="dark"
              size="sm"
              suffix={
                mode === 'theme' && practiceTema
                  ? `Práctica · ${TEMA_DISPLAY_NAMES[practiceTema]}`
                  : 'Simulacro Oficial'
              }
            />
          </div>

          {/* Current Block Indicator */}
          <div className="hidden md:flex items-center gap-2">
            {mode === 'official' ? (
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => jumpToBlock('Conocimientos')}
                  disabled={conList.length === 0}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    currentQuestion.bloque === 'Conocimientos'
                      ? 'bg-[#1D4ED8] text-white'
                      : 'text-slate-600 hover:text-slate-900 disabled:opacity-40'
                  }`}
                >
                  Bloque 1: Conocimientos
                </button>
                <button
                  type="button"
                  onClick={() => jumpToBlock('Actitudes')}
                  disabled={actList.length === 0}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    currentQuestion.bloque === 'Actitudes'
                      ? 'bg-[#1D4ED8] text-white'
                      : 'text-slate-600 hover:text-slate-900 disabled:opacity-40'
                  }`}
                >
                  Bloque 2: Actitudes
                </button>
              </div>
            ) : (
              <span className="text-xs font-semibold text-[#1D4ED8]">
                Bloque {currentQuestion.bloque === 'Conocimientos' ? '1: Conocimientos' : '2: Actitudes'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Countdown Clock */}
            <div
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 font-mono text-sm font-bold tabular-nums border ${
                timeUrgent
                  ? 'bg-red-50 border-[#EF4444] text-[#EF4444]'
                  : timeWarning
                    ? 'bg-amber-50 border-amber-500 text-amber-800'
                    : 'bg-slate-100 border-slate-300 text-slate-900'
              }`}
            >
              <Clock className="h-4 w-4" />
              <span>
                {mode === 'official'
                  ? formatTimeMMSS(secondsLeft)
                  : formatTimeMMSS(elapsedPracticeSec)}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setConfirmFinishOpen(true)}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#EF4444] px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-red-600 transition-colors cursor-pointer whitespace-nowrap"
            >
              <span>{mode === 'theme' ? 'Finalizar Práctica' : 'Finalizar Examen'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main 2-Column Layout: 70% Left / 30% Right */}
      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 flex flex-col lg:flex-row gap-6 items-start flex-1">
        {/* Left Column (70%) */}
        <section className="w-full lg:w-[70%] bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 flex flex-col justify-between min-h-[540px] shadow-xs">
          <div className="space-y-5">
            {/* Question Header: Number + Theme Badge + Flag Button */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                  Pregunta {currentIdx + 1} de {examQuestions.length}
                </span>
                <span className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-[#1D4ED8]">
                  {TEMA_DISPLAY_NAMES[currentQuestion.tema]}
                </span>
              </div>

              <button
                type="button"
                onClick={() => handleToggleFlag(currentQuestion.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  isCurrentFlagged
                    ? 'border-amber-500 bg-amber-100 text-amber-900'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Flag className="h-3.5 w-3.5" />
                <span>{isCurrentFlagged ? 'Marcada para revisar' : 'Marcar para revisar'}</span>
              </button>
            </div>

            {/* Optional Case / Event Soft Box */}
            {contexto && (
              <div className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-4 sm:p-5 text-sm text-slate-700 leading-relaxed">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                  Evento / Caso
                </p>
                <p className="whitespace-pre-line">{contexto}</p>
              </div>
            )}

            {/* Bold Question Statement */}
            <h1 className="font-display text-lg sm:text-xl font-bold text-slate-900 leading-snug whitespace-pre-line">
              {pregunta}
            </h1>

            {/* Large Clickable Option Cards */}
            <div className="space-y-3 pt-2" role="radiogroup" aria-label="Opciones de respuesta">
              {currentQuestion.opciones.map((opt) => {
                const isSelected = currentSelected === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => handleSelectOption(currentQuestion.id, opt.key)}
                    className={`w-full text-left rounded-xl border p-4 sm:p-5 flex items-start gap-4 transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-[#1D4ED8] bg-blue-50/70 text-slate-950 ring-1 ring-[#1D4ED8]'
                        : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span
                      className={`shrink-0 inline-flex items-center justify-center rounded-lg font-mono text-sm font-bold transition-colors ${
                        currentQuestion.tipo === 'binary' ? 'w-7 h-7 mt-0.5' : 'w-8 h-8'
                      } ${
                        isSelected
                          ? 'bg-[#1D4ED8] text-white'
                          : 'bg-slate-100 text-slate-800 border border-slate-200'
                      }`}
                    >
                      {currentQuestion.tipo === 'binary' ? (isSelected ? '✓' : '') : opt.key}
                    </span>
                    <span className="text-sm sm:text-base leading-relaxed pt-0.5">{opt.text}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bottom Controls */}
          <div className="pt-6 mt-8 border-t border-slate-200 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
              disabled={currentIdx === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Anterior</span>
            </button>

            <span className="text-xs text-slate-500 font-mono tabular-nums">
              {answeredCount} / {examQuestions.length} respondidas
            </span>

            {currentIdx < examQuestions.length - 1 ? (
              <button
                type="button"
                onClick={() => setCurrentIdx((i) => Math.min(examQuestions.length - 1, i + 1))}
                className="inline-flex items-center gap-2 rounded-xl bg-[#1D4ED8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1E40AF] transition-colors cursor-pointer"
              >
                <span>Siguiente</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmFinishOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-[#EF4444] px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-600 transition-colors cursor-pointer"
              >
                <span>{mode === 'theme' ? 'Finalizar Práctica' : 'Finalizar Examen'}</span>
              </button>
            )}
          </div>
        </section>

        {/* Right Column (30%): Navigation Map */}
        <aside className="w-full lg:w-[30%] bg-white rounded-2xl border border-slate-200 p-5 space-y-5 lg:sticky lg:top-22 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h2 className="font-display text-sm font-bold text-slate-900">Mapa de Navegación</h2>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {answeredCount}/{examQuestions.length}
            </span>
          </div>

          {/* Section 1: Bloque I: Conocimientos */}
          {conList.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-900">
                  Bloque I: Conocimientos ({conRangeLabel})
                </span>
                <span className="text-slate-500 tabular-nums">Mín. 80%</span>
              </div>
              <div className="grid grid-cols-5 sm:grid-cols-7 lg:grid-cols-5 xl:grid-cols-6 gap-1.5">
                {conList.map(({ q, idx }) => {
                  const isCurrent = idx === currentIdx;
                  const isAnswered = Boolean(answers[q.id]);
                  const isFlag = Boolean(flagged[q.id]);

                  // Flagged (yellow/amber) > Answered (blue) > Unanswered (gray)
                  let btnColors = 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200';
                  if (isFlag) {
                    btnColors = 'bg-amber-400 text-slate-950 border-amber-500 hover:bg-amber-500';
                  } else if (isAnswered) {
                    btnColors = 'bg-[#1D4ED8] text-white border-[#1D4ED8] hover:bg-[#1E40AF]';
                  }

                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setCurrentIdx(idx)}
                      aria-label={`Pregunta ${idx + 1}${isFlag ? ' marcada para revisar' : ''}${
                        isAnswered ? ' respondida' : ' sin responder'
                      }`}
                      className={`h-9 rounded-md font-mono text-xs font-bold tabular-nums border transition-colors cursor-pointer flex items-center justify-center ${btnColors} ${
                        isCurrent ? 'ring-2 ring-slate-900 ring-offset-1' : ''
                      }`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section 2: Bloque II: Actitudes */}
          {actList.length > 0 && (
            <div className="space-y-2.5 pt-3 border-t border-slate-200">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-900">
                  Bloque II: Actitudes ({actRangeLabel})
                </span>
                <span className="text-slate-500 tabular-nums">Mín. 80%</span>
              </div>
              <div className="grid grid-cols-5 sm:grid-cols-7 lg:grid-cols-5 xl:grid-cols-6 gap-1.5">
                {actList.map(({ q, idx }) => {
                  const isCurrent = idx === currentIdx;
                  const isAnswered = Boolean(answers[q.id]);
                  const isFlag = Boolean(flagged[q.id]);

                  let btnColors = 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200';
                  if (isFlag) {
                    btnColors = 'bg-amber-400 text-slate-950 border-amber-500 hover:bg-amber-500';
                  } else if (isAnswered) {
                    btnColors = 'bg-[#1D4ED8] text-white border-[#1D4ED8] hover:bg-[#1E40AF]';
                  }

                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setCurrentIdx(idx)}
                      aria-label={`Pregunta ${idx + 1}${isFlag ? ' marcada para revisar' : ''}${
                        isAnswered ? ' respondida' : ' sin responder'
                      }`}
                      className={`h-9 rounded-md font-mono text-xs font-bold tabular-nums border transition-colors cursor-pointer flex items-center justify-center ${btnColors} ${
                        isCurrent ? 'ring-2 ring-slate-900 ring-offset-1' : ''
                      }`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Explanatory Legend */}
          <div className="pt-4 border-t border-slate-200 space-y-2 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">Leyenda de estado</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded border border-slate-300 bg-slate-100 inline-block shrink-0" />
                <span>Sin responder</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded bg-[#1D4ED8] inline-block shrink-0" />
                <span>Respondida</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded border border-amber-500 bg-amber-400 inline-block shrink-0" />
                <span>Revisar ({flaggedCount})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded border border-slate-400 bg-white ring-2 ring-slate-900 inline-block shrink-0" />
                <span>Actual</span>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={onFinishToDashboard}
              className="w-full rounded-lg border border-slate-200 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Salir al Panel Principal
            </button>
          </div>
        </aside>
      </main>

      {/* Confirm Finish Modal */}
      {confirmFinishOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-start gap-3">
              <HelpCircle className="h-6 w-6 text-[#1D4ED8] shrink-0 mt-0.5" />
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  {mode === 'theme' ? '¿Finalizar Práctica Temática?' : '¿Finalizar Examen Oficial?'}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Has respondido{' '}
                  <strong className="font-mono tabular-nums text-slate-900">
                    {answeredCount} de {examQuestions.length}
                  </strong>{' '}
                  preguntas
                  {flaggedCount > 0 ? ` (${flaggedCount} marcadas para revisar)` : ''}.
                </p>
                {answeredCount < examQuestions.length && (
                  <p className="mt-2 text-xs text-amber-700 flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>Las preguntas sin responder se calificarán como incorrectas.</span>
                  </p>
                )}
              </div>
            </div>

            {submitError && (
              <p className="text-xs text-[#EF4444] bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {submitError}
              </p>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmFinishOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Seguir respondiendo
              </button>
              <button
                type="button"
                onClick={handleSubmitExam}
                disabled={submitting}
                className="rounded-lg bg-[#EF4444] px-5 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-60 cursor-pointer"
              >
                {submitting ? 'Calificando...' : 'Confirmar y Calificar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
