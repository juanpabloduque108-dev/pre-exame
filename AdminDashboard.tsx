import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  Edit3,
  FileSpreadsheet,
  FileUp,
  KeyRound,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  UserCheck,
  UserX,
  AlertTriangle,
  BookOpen,
  X,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo.tsx';
import { QuestionFormModal } from './QuestionFormModal.tsx';
import {
  bulkImportQuestions,
  createAccessKey,
  createQuestion,
  deleteAccessKey,
  deleteQuestion,
  extendAccessKey,
  subscribeToAccessKeys,
  subscribeToAllExamResults,
  subscribeToQuestions,
  syncLocalBackupToFirestore,
  toggleAccessKey,
  updateAccessKeyPassword,
  updateQuestion,
} from '../utils/api.ts';
import {
  parseDocxFile,
  parsePinBlocksFromText,
  previewToQuestionInput,
} from '../utils/docxParser.ts';
import type { ParsedQuestionPreview } from '../utils/docxParser.ts';
import type {
  AccessKey,
  BloqueCale,
  Question,
  SimulacroAttempt,
  TemaOficial,
} from '../types/cale.ts';
import { TEMA_DISPLAY_NAMES, TEMAS_OFICIALES } from '../types/cale.ts';

interface AdminDashboardProps {
  adminCode: string;
  onLogout: () => void;
}

type AdminTab = 'keys' | 'import' | 'bank';

export function AdminDashboard({ adminCode, onLogout }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('keys');

  // Keys state
  const [rawKeys, setRawKeys] = useState<AccessKey[]>([]);
  const [examResults, setExamResults] = useState<SimulacroAttempt[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [studentName, setStudentName] = useState('');
  const [daysValid, setDaysValid] = useState<number>(30);
  const [customCode, setCustomCode] = useState('');
  const [creatingKey, setCreatingKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmDeleteKeyId, setConfirmDeleteKeyId] = useState<string | null>(null);

  // Remote Password Edit Modal state
  const [editingKey, setEditingKey] = useState<AccessKey | null>(null);
  const [editKeyStudentName, setEditKeyStudentName] = useState('');
  const [editKeyPassword, setEditKeyPassword] = useState('');
  const [editKeyError, setEditKeyError] = useState<string | null>(null);
  const [savingEditKey, setSavingEditKey] = useState(false);

  // Local backup sync state
  const [syncingBackup, setSyncingBackup] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Questions state
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBloque, setFilterBloque] = useState<'Todas' | BloqueCale>('Todas');
  const [filterTema, setFilterTema] = useState<'Todos' | TemaOficial>('Todos');
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [confirmDeleteQId, setConfirmDeleteQId] = useState<string | null>(null);

  // Word (.docx) import state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [parsingDocx, setParsingDocx] = useState(false);
  const [docxFileName, setDocxFileName] = useState<string | null>(null);
  const [docxSummary, setDocxSummary] = useState<{
    textCount: number;
    tableCount: number;
    skippedCount: number;
  } | null>(null);
  const [rawTextPreview, setRawTextPreview] = useState<string | null>(null);
  const [parsedPreview, setParsedPreview] = useState<ParsedQuestionPreview[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [importingBulk, setImportingBulk] = useState(false);
  const [importProgress, setImportProgress] = useState<{ saved: number; total: number } | null>(
    null
  );
  const [showTextTester, setShowTextTester] = useState(false);
  const [samplePinText, setSamplePinText] = useState('');
  const [downloadingSource, setDownloadingSource] = useState(false);
  const [downloadSourceError, setDownloadSourceError] = useState<string | null>(null);

  useEffect(() => {
    setLoadingKeys(true);
    setLoadingQuestions(true);

    const unsubKeys = subscribeToAccessKeys(
      (list) => {
        setRawKeys(list);
        setLoadingKeys(false);
      },
      (err) => {
        setKeyError(err.message);
        setLoadingKeys(false);
      }
    );

    const unsubResults = subscribeToAllExamResults((list) => {
      setExamResults(list);
    });

    const unsubQuestions = subscribeToQuestions(
      (list) => {
        setQuestions(list);
        setLoadingQuestions(false);
      },
      (err) => {
        setImportError(err.message);
        setLoadingQuestions(false);
      }
    );

    return () => {
      unsubKeys();
      unsubResults();
      unsubQuestions();
    };
  }, [adminCode]);

  const keys = useMemo(() => {
    return rawKeys.map((k) => {
      const upperCode = k.code.toUpperCase();
      const attemptsCount = examResults.filter(
        (a) => a.accessKeyId === k.id || a.accessCode.toUpperCase() === upperCode
      ).length;
      return { ...k, attemptsCount };
    });
  }, [rawKeys, examResults]);

  // --- Key handlers ---
  const handleCreateKey = async (e: FormEvent) => {
    e.preventDefault();
    if (!studentName.trim()) {
      setKeyError('Escribe el nombre del estudiante.');
      return;
    }
    setCreatingKey(true);
    setKeyError(null);
    try {
      await createAccessKey(adminCode, {
        studentName: studentName.trim(),
        daysValid,
        customCode: customCode.trim() || undefined,
      });
      setStudentName('');
      setCustomCode('');
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : 'No se pudo generar la clave.');
    } finally {
      setCreatingKey(false);
    }
  };

  const handleCopyKey = async (id: string, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      setTimeout(() => setCopiedId((curr) => (curr === id ? null : curr)), 2000);
    } catch {
      // fallback ignored
    }
  };

  const handleToggleKey = async (k: AccessKey) => {
    try {
      await toggleAccessKey(adminCode, k.id, !k.active);
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : 'No se pudo actualizar el estado.');
    }
  };

  const handleExtendKey = async (k: AccessKey, days: number) => {
    try {
      await extendAccessKey(adminCode, k, days);
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : 'No se pudo extender la vigencia.');
    }
  };

  const handleDeleteKey = async (id: string) => {
    try {
      await deleteAccessKey(adminCode, id);
      setConfirmDeleteKeyId(null);
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : 'No se pudo eliminar la clave.');
    }
  };

  const openEditPasswordModal = (k: AccessKey) => {
    setEditingKey(k);
    setEditKeyStudentName(k.studentName);
    setEditKeyPassword(k.code);
    setEditKeyError(null);
  };

  const handleSaveEditedPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingKey) return;
    setSavingEditKey(true);
    setEditKeyError(null);
    try {
      await updateAccessKeyPassword(
        adminCode,
        editingKey.id,
        editKeyPassword,
        editKeyStudentName
      );
      setEditingKey(null);
    } catch (err) {
      setEditKeyError(
        err instanceof Error ? err.message : 'No se pudo actualizar la contraseña.'
      );
    } finally {
      setSavingEditKey(false);
    }
  };

  const handleSyncLocalBackup = async () => {
    setSyncingBackup(true);
    setSyncMessage(null);
    try {
      const res = await syncLocalBackupToFirestore();
      setSyncMessage(
        res.questionsSynced === 0 && res.keysSynced === 0
          ? 'Todo el banco local ya está sincronizado en la nube.'
          : `Sincronizado en Firestore: ${res.questionsSynced} preguntas y ${res.keysSynced} claves.`
      );
    } catch (err) {
      setSyncMessage(
        err instanceof Error ? err.message : 'No se pudo sincronizar el respaldo local.'
      );
    } finally {
      setSyncingBackup(false);
    }
  };

  // --- Docx handlers ---
  const handleFileSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.docx')) {
      setImportError('Por favor selecciona un archivo Word válido con extensión .docx.');
      setRawTextPreview(null);
      return;
    }
    setParsingDocx(true);
    setImportError(null);
    setImportSuccess(null);
    setRawTextPreview(null);
    setDocxFileName(file.name);

    try {
      const result = await parseDocxFile(file);
      setParsedPreview(result.questions);
      setDocxSummary({
        textCount: result.textCount,
        tableCount: result.tableCount,
        skippedCount: result.skippedCount,
      });
      if (result.questions.length === 0) {
        setRawTextPreview(result.rawTextPreview);
        setImportError(
          'No se detectaron preguntas válidas con "Pregunta X:", "Evento / Caso:" ni tablas de Actitudes en este documento.'
        );
      }
    } catch (err) {
      setImportError(
        err instanceof Error
          ? `Error al leer el archivo Word: ${err.message}`
          : 'No fue posible procesar el archivo .docx.'
      );
      setParsedPreview([]);
    } finally {
      setParsingDocx(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleParseRawSample = () => {
    if (!samplePinText.trim()) return;
    setImportError(null);
    setImportSuccess(null);
    setRawTextPreview(null);
    const parsed = parsePinBlocksFromText(samplePinText);
    setDocxFileName('Texto pegado manualmente');
    setDocxSummary({
      textCount: parsed.questions.length,
      tableCount: 0,
      skippedCount: parsed.skipped,
    });
    setParsedPreview(parsed.questions);
    if (parsed.questions.length === 0) {
      setRawTextPreview(samplePinText.trim().split('\n').slice(0, 15).join('\n').slice(0, 1000));
      setImportError(
        'No se detectaron preguntas válidas. Verifica que incluya "Evento / Caso:" o "Pregunta X:", opciones A/B/C/D y "Respuesta Correcta:".'
      );
    }
  };

  const handleUpdatePreviewField = (
    tempId: string,
    patch: Partial<ParsedQuestionPreview>
  ) => {
    setParsedPreview((prev) =>
      prev.map((item) => (item.tempId === tempId ? { ...item, ...patch } : item))
    );
  };

  const handleRemovePreviewItem = (tempId: string) => {
    setParsedPreview((prev) => prev.filter((item) => item.tempId !== tempId));
  };

  const handleConfirmBulkImport = async () => {
    if (parsedPreview.length === 0) return;
    setImportingBulk(true);
    setImportProgress({ saved: 0, total: parsedPreview.length });
    setImportError(null);
    const skipped = docxSummary?.skippedCount ?? 0;
    try {
      const payload = parsedPreview.map(previewToQuestionInput);
      const res = await bulkImportQuestions(adminCode, payload, (saved, total) => {
        setImportProgress({ saved, total });
      });
      setImportSuccess(
        skipped > 0
          ? `Se guardaron en la nube ${res.importedCount} preguntas en Firestore (${skipped} fragmentos con formato distinto fueron omitidos).`
          : `Se guardaron en la nube ${res.importedCount} preguntas en Firestore.`
      );
      setParsedPreview([]);
      setDocxFileName(null);
      setDocxSummary(null);
      setRawTextPreview(null);
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : 'Error al guardar las preguntas en Firestore.'
      );
    } finally {
      setImportingBulk(false);
      setImportProgress(null);
    }
  };

  const handleDownloadSource = async () => {
    setDownloadingSource(true);
    setDownloadSourceError(null);
    try {
      const res = await fetch('/api/admin/download-source', {
        headers: { 'x-admin-key': adminCode },
      });
      if (!res.ok) {
        throw new Error(
          res.status === 404
            ? 'Este botón solo funciona desde el servidor de desarrollo de Google AI Studio.'
            : 'No se pudo generar el archivo ZIP del proyecto.'
        );
      }
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('zip')) {
        throw new Error('Este botón requiere ejecutarse desde el servidor de desarrollo local.');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'pre-examen-codigo-fuente.zip';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadSourceError(
        err instanceof Error ? err.message : 'Error al descargar el código fuente.'
      );
    } finally {
      setDownloadingSource(false);
    }
  };

  // --- Question bank CRUD ---
  const handleSaveManualQuestion = async (payload: Omit<Question, 'id' | 'createdAt'>) => {
    if (editingQuestion) {
      await updateQuestion(adminCode, editingQuestion.id, payload);
      setEditingQuestion(null);
    } else {
      await createQuestion(adminCode, payload);
    }
  };

  const handleDeleteQuestion = async (id: string) => {
    await deleteQuestion(adminCode, id);
    setConfirmDeleteQId(null);
  };

  const filteredQuestions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return questions.filter((q) => {
      if (filterBloque !== 'Todas' && q.bloque !== filterBloque) return false;
      if (filterTema !== 'Todos' && q.tema !== filterTema) return false;
      if (query) {
        const hay = `${q.enunciado} ${q.caso || ''} ${q.tema} ${q.moduloAulapp || ''}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }, [questions, searchQuery, filterBloque, filterTema]);

  const bankStats = useMemo(() => {
    const conocimientos = questions.filter((q) => q.bloque === 'Conocimientos').length;
    const actitudes = questions.filter((q) => q.bloque === 'Actitudes').length;
    const activeKeys = keys.filter(
      (k) => k.active && new Date(k.expiresAt).getTime() > Date.now()
    ).length;
    return { total: questions.length, conocimientos, actitudes, activeKeys };
  }, [questions, keys]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Bar (Strict 3-zone contract) */}
      <header className="bg-navy-900 text-white border-b border-navy-800 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          <BrandLogo variant="light" size="md" />

          <nav className="flex items-center gap-6 overflow-x-auto" aria-label="Administración">
            <button
              type="button"
              onClick={() => setActiveTab('keys')}
              className={`py-5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'keys'
                  ? 'border-emerald-400 text-white'
                  : 'border-transparent text-slate-300 hover:text-white'
              }`}
            >
              Claves de Acceso
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('import')}
              className={`py-5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'import'
                  ? 'border-emerald-400 text-white'
                  : 'border-transparent text-slate-300 hover:text-white'
              }`}
            >
              Importar Word (.docx)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('bank')}
              className={`py-5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'bank'
                  ? 'border-emerald-400 text-white'
                  : 'border-transparent text-slate-300 hover:text-white'
              }`}
            >
              Banco de Preguntas
            </button>
          </nav>

          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3.5 py-2 text-xs font-semibold text-white hover:bg-white/15 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </header>

      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 flex-1">
        {/* Summary Strip */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-xs font-medium text-slate-500">Claves Activas</p>
            <p className="mt-1 font-display text-2xl font-bold text-navy-900 tabular-nums">
              {bankStats.activeKeys}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-xs font-medium text-slate-500">Total Preguntas</p>
            <p className="mt-1 font-display text-2xl font-bold text-navy-900 tabular-nums">
              {bankStats.total}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-xs font-medium text-slate-500">Bloque 1 · Conocimientos</p>
            <p className="mt-1 font-display text-2xl font-bold text-navy-900 tabular-nums">
              {bankStats.conocimientos}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-xs font-medium text-slate-500">Bloque 2 · Actitudes</p>
            <p className="mt-1 font-display text-2xl font-bold text-emerald-700 tabular-nums">
              {bankStats.actitudes}
            </p>
          </div>
        </section>

        {/* Export / Netlify Deploy Bar */}
        <section className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-navy-900">
              Exportar proyecto para publicar en Netlify
            </p>
            <p className="text-xs text-slate-500">
              Descarga todo el código fuente en un ZIP listo con netlify.toml y conexión a Cloud Firestore.
            </p>
            {downloadSourceError && (
              <p className="mt-1.5 text-xs font-medium text-red-600">{downloadSourceError}</p>
            )}
          </div>
          <button
            type="button"
            onClick={handleDownloadSource}
            disabled={downloadingSource}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#1D4ED8] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#1E40AF] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="h-4 w-4" />
            <span>{downloadingSource ? 'Empaquetando ZIP...' : 'Descargar Código Fuente'}</span>
          </button>
        </section>

        {/* TAB 1: ACCESS KEYS */}
        {activeTab === 'keys' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Key Generator Form */}
            <section className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center gap-2.5 mb-1">
                <KeyRound className="h-5 w-5 text-emerald-600" />
                <h1 className="font-display text-lg font-bold text-navy-900">
                  Generar Clave de Practicante
                </h1>
              </div>
              <p className="text-sm text-slate-500 mb-5">
                Crea un acceso temporal para que el estudiante realice simulacros CALE.
              </p>

              <form onSubmit={handleCreateKey} className="space-y-4">
                <div>
                  <label
                    htmlFor="student-name"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Nombre completo del estudiante
                  </label>
                  <input
                    id="student-name"
                    type="text"
                    required
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    placeholder="Ej. Laura Camila Gómez"
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-navy-900 focus:border-navy-800 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Días de vigencia
                  </label>
                  <div className="grid grid-cols-4 gap-2 mb-2">
                    {[15, 30, 60, 90].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDaysValid(d)}
                        className={`rounded-lg border py-2 text-xs font-semibold tabular-nums transition-colors cursor-pointer ${
                          daysValid === d
                            ? 'border-navy-900 bg-navy-900 text-white'
                            : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {d} días
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={3650}
                    value={daysValid}
                    onChange={(e) => setDaysValid(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm font-mono tabular-nums text-navy-900 focus:border-navy-800 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="custom-code"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Clave personalizada (opcional)
                  </label>
                  <input
                    id="custom-code"
                    type="text"
                    value={customCode}
                    onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                    placeholder="Se genera automáticamente si la dejas vacía"
                    className="w-full rounded-lg border border-slate-300 px-3.5 py-2 font-mono text-sm uppercase text-navy-900 placeholder:font-sans placeholder:normal-case focus:border-navy-800 focus:outline-none"
                  />
                </div>

                {keyError && (
                  <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {keyError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={creatingKey}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  <span>{creatingKey ? 'Generando...' : 'Crear Clave de Acceso'}</span>
                </button>
              </form>
            </section>

            {/* Keys List */}
            <section className="lg:col-span-8 bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-base font-bold text-navy-900">
                    Claves Registradas en la Nube ({keys.length})
                  </h2>
                  <p className="text-xs text-slate-500">
                    Edita contraseñas, bloquea o activa accesos en tiempo real desde cualquier dispositivo.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSyncLocalBackup}
                  disabled={syncingBackup}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${syncingBackup ? 'animate-spin' : ''}`} />
                  <span>{syncingBackup ? 'Sincronizando...' : 'Sincronizar respaldo local'}</span>
                </button>
              </div>

              {syncMessage && (
                <div className="mx-6 mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-900">
                  {syncMessage}
                </div>
              )}

              {loadingKeys ? (
                <div className="p-8 text-center text-sm text-slate-500">Cargando claves...</div>
              ) : keys.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  Aún no hay claves creadas. Usa el formulario para generar la primera.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                        <th className="py-3 px-4">Clave</th>
                        <th className="py-3 px-4">Estudiante</th>
                        <th className="py-3 px-4">Vigencia</th>
                        <th className="py-3 px-4 text-right">Intentos</th>
                        <th className="py-3 px-4">Estado</th>
                        <th className="py-3 px-4 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-sm">
                      {keys.map((k) => {
                        const expiresMs = new Date(k.expiresAt).getTime();
                        const daysLeft = Math.ceil(
                          (expiresMs - Date.now()) / (24 * 60 * 60 * 1000)
                        );
                        const isExpired = daysLeft <= 0;

                        return (
                          <tr key={k.id} className="hover:bg-slate-50/70">
                            <td className="py-3 px-4 whitespace-nowrap">
                              <div className="inline-flex items-center gap-2">
                                <span className="font-mono font-bold text-navy-900 tabular-nums">
                                  {k.code}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyKey(k.id, k.code)}
                                  title="Copiar clave"
                                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                                >
                                  {copiedId === k.id ? (
                                    <>
                                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                                      <span className="text-emerald-700">Copiada</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="h-3.5 w-3.5" />
                                      <span>Copiar</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-medium text-navy-900">{k.studentName}</div>
                              <div className="text-xs text-slate-500 tabular-nums">
                                Creada {new Date(k.createdAt).toLocaleDateString('es-CO')}
                              </div>
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap tabular-nums">
                              <div className="text-slate-700">
                                {isExpired ? 'Vencida' : `${daysLeft} días restantes`}
                              </div>
                              <div className="text-xs text-slate-500">
                                Hasta {new Date(k.expiresAt).toLocaleDateString('es-CO')}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                              {k.attemptsCount ?? 0}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              {!k.active ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600">
                                  <UserX className="h-3.5 w-3.5 text-slate-500" />
                                  Bloqueada
                                </span>
                              ) : isExpired ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700">
                                  <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                                  Vencida
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                                  <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
                                  Activa
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openEditPasswordModal(k)}
                                  className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-[#1D4ED8] hover:bg-blue-100 transition-colors cursor-pointer"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                  <span>Editar / Cambiar Contraseña</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleKey(k)}
                                  className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                                    k.active
                                      ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                                      : 'border-emerald-600 text-emerald-700 hover:bg-emerald-50'
                                  }`}
                                >
                                  {k.active ? 'Bloquear' : 'Activar'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleExtendKey(k, 15)}
                                  title="Sumar 15 días de vigencia"
                                  className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 cursor-pointer tabular-nums"
                                >
                                  +15d
                                </button>
                                {confirmDeleteKeyId === k.id ? (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteKey(k.id)}
                                    className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 cursor-pointer"
                                  >
                                    Confirmar
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteKeyId(k.id)}
                                    aria-label="Eliminar clave"
                                    className="rounded-md p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}

        {/* TAB 2: WORD (.docx) IMPORTER */}
        {activeTab === 'import' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Upload dropzone */}
              <section className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-center gap-2.5 mb-2">
                  <FileUp className="h-5 w-5 text-emerald-600" />
                  <h1 className="font-display text-lg font-bold text-navy-900">
                    Cargar Banco de Preguntas desde Word (.docx)
                  </h1>
                </div>
                <p className="text-sm text-slate-600 mb-5">
                  Lectura flexible con{' '}
                  <span className="font-mono text-xs">mammoth.extractRawText</span> para{' '}
                  <strong>SIMULACRO TIPO CALES / AULAPP</strong> y tablas de{' '}
                  <strong>Actitudes</strong>. Detecta automáticamente cada{' '}
                  <span className="font-mono text-xs">Pregunta X:</span> o{' '}
                  <span className="font-mono text-xs">Evento / Caso:</span> sin depender de emojis.
                </p>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".docx"
                  onChange={handleFileSelected}
                  className="hidden"
                />

                <div
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
                  }}
                  className="border-2 border-dashed border-slate-300 hover:border-emerald-600 rounded-xl p-8 text-center bg-slate-50 hover:bg-emerald-50/30 transition-colors cursor-pointer"
                >
                  <Upload className="h-9 w-9 text-navy-800 mx-auto mb-3" />
                  <p className="font-display text-base font-semibold text-navy-900">
                    {parsingDocx
                      ? 'Extrayendo preguntas del archivo Word (.docx)...'
                      : 'Haz clic para seleccionar tu archivo .docx'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Compatible con A/B/C/D (con paréntesis o punto) y tablas de Actitudes (De
                    acuerdo / En desacuerdo)
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setShowTextTester((v) => !v)}
                    className="text-xs font-semibold text-navy-800 hover:underline cursor-pointer"
                  >
                    {showTextTester
                      ? 'Ocultar pegado rápido de texto'
                      : '¿Prefieres pegar el texto de las preguntas directamente?'}
                  </button>
                </div>

                {showTextTester && (
                  <div className="mt-4 pt-4 border-t border-slate-200 space-y-3">
                    <textarea
                      rows={5}
                      value={samplePinText}
                      onChange={(e) => setSamplePinText(e.target.value)}
                      placeholder={`Pega preguntas aquí:\nEvento / Caso: Circulas por zona escolar...\nPregunta 1: ¿Cuál es el límite máximo de velocidad?\nOpciones: A) 30 km/hB) 50 km/hC) 60 km/hD) 80 km/h\nRespuesta Correcta: A) 30 km/h\nMódulo y Tema Aulapp: Movilidad Segura`}
                      className="w-full rounded-lg border border-slate-300 p-3 text-xs font-mono text-navy-900 focus:border-navy-800 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleParseRawSample}
                      className="rounded-lg bg-navy-900 px-4 py-2 text-xs font-semibold text-white hover:bg-navy-800 cursor-pointer"
                    >
                      Procesar texto pegado
                    </button>
                  </div>
                )}

                {importError && (
                  <div className="mt-4 space-y-3">
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                      {importError}
                    </div>
                    {rawTextPreview && (
                      <div className="rounded-lg border border-slate-300 bg-slate-50 p-3.5 space-y-1.5">
                        <p className="text-xs font-bold text-slate-800">
                          Primeras líneas leídas del documento (.docx):
                        </p>
                        <pre className="text-[11px] font-mono text-slate-700 whitespace-pre-wrap break-words max-h-56 overflow-y-auto bg-white border border-slate-200 rounded p-2.5">
                          {rawTextPreview}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

                {importSuccess && (
                  <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                    <span>{importSuccess}</span>
                  </div>
                )}
              </section>

              {/* Supported Formats Guide */}
              <section className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-navy-800" />
                  <h2 className="font-display text-base font-bold text-navy-900">
                    Detección Flexible en Word
                  </h2>
                </div>

                <div className="space-y-3 text-xs text-slate-600">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-1.5">
                    <p className="font-semibold text-navy-900">
                      1. Texto o tablas CALES / AULAPP
                    </p>
                    <p className="font-mono text-[11px] leading-relaxed text-slate-700 whitespace-pre-line">
                      {`Evento / Caso: ...\nPregunta X: ...\nA) ... B) ... C) ... D) ...\nRespuesta Correcta: C\nMódulo y Tema: Normas de Tránsito`}
                    </p>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                    <p className="font-semibold text-navy-900 mb-1">
                      2. Tablas de Actitudes y 5 Categorías
                    </p>
                    <p className="leading-relaxed">
                      Soporta tablas de Actitudes (De acuerdo / En desacuerdo). Si no encuentra
                      Módulo y Tema, asigna automáticamente <strong>Normas de Tránsito</strong>.
                    </p>
                  </div>
                </div>
              </section>
            </div>

            {/* Preview Table */}
            {parsedPreview.length > 0 && (
              <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="font-display text-base font-bold text-navy-900">
                      Vista Previa: {parsedPreview.length} preguntas detectadas
                    </h2>
                    <p className="text-xs text-slate-500">
                      Archivo: {docxFileName} · Texto: {docxSummary?.textCount ?? 0} · Tablas:{' '}
                      {docxSummary?.tableCount ?? 0}
                      {docxSummary && docxSummary.skippedCount > 0
                        ? ` · Omitidos por formato distinto: ${docxSummary.skippedCount}`
                        : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setParsedPreview([])}
                      disabled={importingBulk}
                      className="rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                    >
                      Descartar todo
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmBulkImport}
                      disabled={importingBulk}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>
                        {importingBulk
                          ? importProgress
                            ? `Guardando en la nube (${importProgress.saved}/${importProgress.total})...`
                            : 'Guardando en la nube...'
                          : `Guardar todas en la nube (${parsedPreview.length})`}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="divide-y divide-slate-200 max-h-[540px] overflow-y-auto">
                  {parsedPreview.map((item, index) => (
                    <div key={item.tempId} className="p-5 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="font-mono font-bold text-navy-900">#{index + 1}</span>
                          <span aria-hidden="true">·</span>
                          <span>{item.sourceFormat === 'tabla' ? 'Tabla Word' : 'Bloque Word'}</span>
                          <span aria-hidden="true">·</span>
                          <select
                            value={item.tema}
                            onChange={(e) => {
                              const nextTema = e.target.value as TemaOficial;
                              handleUpdatePreviewField(item.tempId, {
                                tema: nextTema,
                                bloque: nextTema === 'Actitudes' ? 'Actitudes' : 'Conocimientos',
                              });
                            }}
                            className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-semibold text-navy-900"
                          >
                            {TEMAS_OFICIALES.map((t) => (
                              <option key={t} value={t}>
                                {TEMA_DISPLAY_NAMES[t]}
                              </option>
                            ))}
                          </select>
                          <span aria-hidden="true">·</span>
                          <span className="font-medium text-emerald-700">
                            Bloque {item.bloque === 'Conocimientos' ? '1' : '2'}: {item.bloque}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemovePreviewItem(item.tempId)}
                          className="text-xs font-medium text-red-600 hover:underline cursor-pointer"
                        >
                          Quitar
                        </button>
                      </div>

                      {item.caso && (
                        <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
                          <strong className="text-navy-900">Caso:</strong> {item.caso}
                        </p>
                      )}

                      <p className="text-sm font-medium text-navy-900 whitespace-pre-line">
                        {item.enunciado}
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        {item.opciones.map((op) => {
                          const isCorrect = op.key === item.respuestaCorrecta;
                          return (
                            <button
                              key={op.key}
                              type="button"
                              onClick={() =>
                                handleUpdatePreviewField(item.tempId, {
                                  respuestaCorrecta: op.key,
                                })
                              }
                              className={`text-left rounded-lg border px-3 py-2 text-xs transition-colors cursor-pointer ${
                                isCorrect
                                  ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-semibold'
                                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              {item.tipo === 'multiple' ? `${op.key}) ` : ''}
                              {op.text}
                            </button>
                          );
                        })}
                      </div>

                      {item.warning && (
                        <p className="text-xs text-amber-700 flex items-center gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          <span>{item.warning}</span>
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* TAB 3: SAVED QUESTION BANK */}
        {activeTab === 'bank' && (
          <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-200 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <BookOpen className="h-5 w-5 text-navy-800" />
                  <div>
                    <h1 className="font-display text-lg font-bold text-navy-900">
                      Banco de Preguntas Guardadas ({filteredQuestions.length})
                    </h1>
                    <p className="text-xs text-slate-500">
                      Administra, edita o agrega nuevas preguntas para los simulacros CALE.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Plus className="h-4 w-4" />
                  <span>Agregar pregunta</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div className="md:col-span-6 relative">
                  <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar por enunciado, caso o tema..."
                    className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm text-navy-900 focus:border-navy-800 focus:outline-none"
                  />
                </div>
                <div className="md:col-span-3">
                  <select
                    value={filterBloque}
                    onChange={(e) => setFilterBloque(e.target.value as 'Todas' | BloqueCale)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-navy-900 focus:border-navy-800 focus:outline-none"
                  >
                    <option value="Todas">Todos los bloques</option>
                    <option value="Conocimientos">Bloque 1 · Conocimientos</option>
                    <option value="Actitudes">Bloque 2 · Actitudes</option>
                  </select>
                </div>
                <div className="md:col-span-3">
                  <select
                    value={filterTema}
                    onChange={(e) => setFilterTema(e.target.value as 'Todos' | TemaOficial)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-navy-900 focus:border-navy-800 focus:outline-none"
                  >
                    <option value="Todos">Todos los 5 temas</option>
                    {TEMAS_OFICIALES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {loadingQuestions ? (
              <div className="p-8 text-center text-sm text-slate-500">Cargando preguntas...</div>
            ) : filteredQuestions.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">
                No hay preguntas que coincidan con los filtros seleccionados.
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {filteredQuestions.map((q, idx) => (
                  <div key={q.id} className="p-5 hover:bg-slate-50/60 transition-colors">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="font-mono font-semibold text-navy-900 tabular-nums">
                            #{idx + 1}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-semibold text-navy-800">
                            Bloque {q.bloque === 'Conocimientos' ? '1' : '2'} ({q.bloque})
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{q.tema}</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {q.tipo === 'binary' ? 'De acuerdo / En desacuerdo' : '4 opciones (A-D)'}
                          </span>
                        </div>

                        {q.caso && (
                          <p className="text-xs text-slate-600 bg-slate-100 rounded-lg px-3 py-2">
                            <strong className="text-navy-900">Caso:</strong> {q.caso}
                          </p>
                        )}

                        <p className="text-sm font-semibold text-navy-900 whitespace-pre-line">
                          {q.enunciado}
                        </p>

                        <div className="flex flex-wrap gap-x-5 gap-y-1 pt-1 text-xs text-slate-600">
                          {q.opciones.map((op) => (
                            <span
                              key={op.key}
                              className={
                                op.key === q.respuestaCorrecta
                                  ? 'font-semibold text-emerald-700'
                                  : ''
                              }
                            >
                              {op.key === q.respuestaCorrecta ? '✓ ' : ''}
                              {q.tipo === 'multiple' ? `${op.key}) ` : ''}
                              {op.text}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setEditingQuestion(q)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-navy-900 hover:bg-slate-100 cursor-pointer"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          <span>Editar</span>
                        </button>
                        {confirmDeleteQId === q.id ? (
                          <button
                            type="button"
                            onClick={() => handleDeleteQuestion(q.id)}
                            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 cursor-pointer"
                          >
                            Confirmar
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteQId(q.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-red-700 hover:border-red-200 hover:bg-red-50 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Eliminar</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {(showAddModal || editingQuestion) && (
        <QuestionFormModal
          initialQuestion={editingQuestion}
          onClose={() => {
            setShowAddModal(false);
            setEditingQuestion(null);
          }}
          onSave={handleSaveManualQuestion}
        />
      )}

      {editingKey && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-[#1D4ED8]" />
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Editar / Cambiar Contraseña
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setEditingKey(null)}
                aria-label="Cerrar"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Cambia la clave de acceso del practicante en Firestore. El cambio surte efecto de
              inmediato en cualquier celular o computador.
            </p>

            <form onSubmit={handleSaveEditedPassword} className="space-y-4">
              <div>
                <label
                  htmlFor="edit-key-student"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Nombre del estudiante
                </label>
                <input
                  id="edit-key-student"
                  type="text"
                  required
                  value={editKeyStudentName}
                  onChange={(e) => setEditKeyStudentName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#1D4ED8] focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="edit-key-password"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Nueva contraseña / clave de acceso
                </label>
                <input
                  id="edit-key-password"
                  type="text"
                  required
                  value={editKeyPassword}
                  onChange={(e) => setEditKeyPassword(e.target.value.toUpperCase())}
                  placeholder="Ej. CARLOS2026"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 font-mono text-sm uppercase tracking-wider text-slate-900 focus:border-[#1D4ED8] focus:outline-none"
                />
              </div>

              {editKeyError && (
                <p className="text-xs text-[#EF4444] bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {editKeyError}
                </p>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingKey(null)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEditKey}
                  className="rounded-lg bg-[#1D4ED8] px-5 py-2 text-sm font-semibold text-white hover:bg-[#1E40AF] disabled:opacity-60 cursor-pointer"
                >
                  {savingEditKey ? 'Guardando...' : 'Guardar Nueva Contraseña'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
