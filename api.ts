import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase.ts';
const SEED_QUESTIONS: any[] = [];

import type {
  AccessKey,
  AttemptAnswerDetail,
  AuthSession,
  BloqueCale,
  MistakeRecord,
  Question,
  SimulacroAttempt,
  TemaOficial,
  ThemeBreakdown,
  ThemeProgress,
} from '../types/cale.ts';

const ADMIN_MASTER_KEY = 'ADMIN2026';
const DEFAULT_TEST_KEY = 'PRUEBA123';

const TEMA_BLOQUE_MAP: Record<TemaOficial, BloqueCale> = {
  'Movilidad Segura': 'Conocimientos',
  Normas: 'Conocimientos',
  Señales: 'Conocimientos',
  Vehículo: 'Conocimientos',
  Actitudes: 'Actitudes',
};

const ALL_TEMAS: TemaOficial[] = [
  'Movilidad Segura',
  'Normas',
  'Señales',
  'Vehículo',
  'Actitudes',
];

function sanitizeId(raw: string, fallbackPrefix: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
  if (cleaned) return cleaned;
  return `${fallbackPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function sanitizeQuestionForFirestore(q: Question): Record<string, unknown> {
  const id = sanitizeId(q.id, 'q');
  const tema: TemaOficial = ALL_TEMAS.includes(q.tema) ? q.tema : 'Normas';
  const bloque: BloqueCale =
    q.bloque === 'Actitudes' || tema === 'Actitudes' ? 'Actitudes' : 'Conocimientos';

  let enunciado = String(q.enunciado || '').trim().slice(0, 6000);
  if (enunciado.length < 3) {
    enunciado = 'Pregunta de práctica CALE';
  }

  const rawOptions = Array.isArray(q.opciones) ? q.opciones : [];
  const opciones = rawOptions.slice(0, 6).map((op, idx) => ({
    key: String(op.key || ['A', 'B', 'C', 'D'][idx] || idx + 1).slice(0, 50) || 'A',
    text: String(op.text || '').trim().slice(0, 1000) || `Opción ${idx + 1}`,
  }));

  const docData: Record<string, unknown> = {
    id,
    bloque,
    tema,
    tipo: q.tipo === 'binary' ? 'binary' : 'multiple',
    enunciado,
    opciones,
    respuestaCorrecta: String(q.respuestaCorrecta || opciones[0]?.key || 'A').trim().slice(0, 100) || 'A',
    explicacion:
      String(q.explicacion || '').trim().slice(0, 4000) ||
      'Revisa el Código Nacional de Tránsito de Colombia (Ley 769 de 2002).',
    createdAt: String(q.createdAt || new Date().toISOString()).slice(0, 64),
  };

  if (q.caso && q.caso.trim()) {
    docData.caso = q.caso.trim().slice(0, 4000);
  }
  if (q.moduloAulapp && q.moduloAulapp.trim()) {
    docData.moduloAulapp = q.moduloAulapp.trim().slice(0, 500);
  }

  return docData;
}

function sanitizeAccessKeyForFirestore(k: AccessKey): Record<string, unknown> {
  const id = sanitizeId(k.id, 'key');
  const code = String(k.code || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 40);

  return {
    id,
    code: code || `PRE-${Date.now().toString().slice(-4)}`,
    studentName: String(k.studentName || 'Estudiante').trim().slice(0, 120),
    daysValid: Math.max(1, Math.min(3650, Number(k.daysValid) || 30)),
    createdAt: String(k.createdAt || new Date().toISOString()).slice(0, 64),
    expiresAt: String(k.expiresAt || new Date().toISOString()).slice(0, 64),
    active: Boolean(k.active),
  };
}

function sanitizeAttemptForFirestore(att: SimulacroAttempt): Record<string, unknown> {
  const id = sanitizeId(att.id, 'att');
  const docData: Record<string, unknown> = {
    id,
    accessCode: String(att.accessCode || '').toUpperCase().slice(0, 40),
    studentName: String(att.studentName || 'Estudiante').slice(0, 120),
    createdAt: String(att.createdAt || new Date().toISOString()).slice(0, 64),
    durationSeconds: Math.max(0, Math.min(86400, Number(att.durationSeconds) || 0)),
    totalQuestions: Math.max(1, Math.min(60, Number(att.totalQuestions) || 1)),
    conocimientosTotal: Math.max(0, Math.min(60, Number(att.conocimientosTotal) || 0)),
    conocimientosCorrect: Math.max(0, Math.min(60, Number(att.conocimientosCorrect) || 0)),
    conocimientosPct: Math.max(0, Math.min(100, Number(att.conocimientosPct) || 0)),
    actitudesTotal: Math.max(0, Math.min(60, Number(att.actitudesTotal) || 0)),
    actitudesCorrect: Math.max(0, Math.min(60, Number(att.actitudesCorrect) || 0)),
    actitudesPct: Math.max(0, Math.min(100, Number(att.actitudesPct) || 0)),
    passed: Boolean(att.passed),
    themeBreakdown: (Array.isArray(att.themeBreakdown) ? att.themeBreakdown : []).slice(0, 10),
    answers: (Array.isArray(att.answers) ? att.answers : []).slice(0, 60).map((a) => {
      const cleanAns: Record<string, unknown> = {
        questionId: String(a.questionId || ''),
        bloque: a.bloque,
        tema: a.tema,
        tipo: a.tipo,
        enunciado: String(a.enunciado || '').slice(0, 6000),
        opciones: a.opciones || [],
        selectedKey: a.selectedKey ?? null,
        correctKey: String(a.correctKey || ''),
        isCorrect: Boolean(a.isCorrect),
        wasFlagged: Boolean(a.wasFlagged),
        explicacion: String(a.explicacion || '').slice(0, 4000),
      };
      if (a.caso && a.caso.trim()) {
        cleanAns.caso = a.caso.trim().slice(0, 4000);
      }
      return cleanAns;
    }),
  };

  if (att.accessKeyId) {
    docData.accessKeyId = sanitizeId(att.accessKeyId, 'key');
  }

  return docData;
}

function sanitizeMistakeForFirestore(m: MistakeRecord): Record<string, unknown> {
  const id = sanitizeId(m.id, 'err');
  const docData: Record<string, unknown> = {
    id,
    accessCode: String(m.accessCode || '').toUpperCase().slice(0, 40),
    questionId: sanitizeId(m.questionId, 'q'),
    bloque: m.bloque,
    tema: m.tema,
    tipo: m.tipo,
    enunciado: String(m.enunciado || '').slice(0, 6000),
    opciones: (Array.isArray(m.opciones) ? m.opciones : []).slice(0, 6),
    wrongKey: String(m.wrongKey || 'Sin responder').slice(0, 100),
    correctKey: String(m.correctKey || '').slice(0, 100),
    explicacion: String(m.explicacion || '').slice(0, 4000),
    failedCount: Math.max(1, Math.min(1000, Number(m.failedCount) || 1)),
    lastFailedAt: String(m.lastFailedAt || new Date().toISOString()).slice(0, 64),
    resolved: Boolean(m.resolved),
  };

  if (m.accessKeyId) {
    docData.accessKeyId = sanitizeId(m.accessKeyId, 'key');
  }
  if (m.caso && m.caso.trim()) {
    docData.caso = m.caso.trim().slice(0, 4000);
  }

  return docData;
}

async function commitBatchedWrites(
  ops: Array<{ path: string; id: string; data: Record<string, unknown> }>,
  onProgress?: (committed: number, total: number) => void
): Promise<void> {
  const CHUNK_SIZE = 40;
  let committed = 0;

  for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
    const chunk = ops.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const op of chunk) {
      batch.set(doc(db, op.path, op.id), op.data);
    }
    try {
      await batch.commit();
      committed += chunk.length;
      if (onProgress) {
        onProgress(committed, ops.length);
      }
      // Cede brevemente al hilo principal para no bloquear la interfaz en archivos grandes
      if (i + CHUNK_SIZE < ops.length) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, chunk[0]?.path || 'batch');
    }
  }
}

let initPromise: Promise<void> | null = null;

/**
 * Ensures Cloud Firestore is bootstrapped on first launch:
 * - If not initialized yet, migrates any existing local DB records (questions, accessKeys, attempts, mistakes)
 *   or seeds the 10 Colombian traffic questions + PRUEBA123 test key.
 */
export async function ensureFirestoreInitialized(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const bootstrapRef = doc(db, 'system', 'bootstrap');
      const bootstrapSnap = await getDoc(bootstrapRef).catch((err) => {
        handleFirestoreError(err, OperationType.GET, 'system/bootstrap');
      });

      if (bootstrapSnap && bootstrapSnap.exists()) {
        return;
      }

      // Check if Firestore already has data
      const [qSnap, kSnap] = await Promise.all([
        getDocs(query(collection(db, 'questions'), limit(1))).catch((err) => {
          handleFirestoreError(err, OperationType.LIST, 'questions');
        }),
        getDocs(query(collection(db, 'accessKeys'), limit(1))).catch((err) => {
          handleFirestoreError(err, OperationType.LIST, 'accessKeys');
        }),
      ]);

      const ops: Array<{ path: string; id: string; data: Record<string, unknown> }> = [];

      if (qSnap.empty || kSnap.empty) {
        let localData: {
          keys?: AccessKey[];
          questions?: Question[];
          attempts?: SimulacroAttempt[];
          mistakes?: MistakeRecord[];
        } | null = null;

        try {
          const res = await fetch('/api/migration/local-db');
          if (res.ok) {
            localData = (await res.json()) as {
              keys?: AccessKey[];
              questions?: Question[];
              attempts?: SimulacroAttempt[];
              mistakes?: MistakeRecord[];
            };
          }
        } catch {
          // Ignore if static hosting without local server
        }

        if (qSnap.empty) {
          const sourceQuestions =
            localData?.questions && localData.questions.length > 0
              ? localData.questions
              : SEED_QUESTIONS;
          for (const q of sourceQuestions) {
            const clean = sanitizeQuestionForFirestore(q);
            ops.push({ path: 'questions', id: String(clean.id), data: clean });
          }
        }

        if (kSnap.empty) {
          const now = new Date();
          const defaultKey: AccessKey = {
            id: 'key-prueba-123',
            code: DEFAULT_TEST_KEY,
            studentName: 'Estudiante de Prueba',
            daysValid: 365,
            createdAt: now.toISOString(),
            expiresAt: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString(),
            active: true,
          };
          const sourceKeys =
            localData?.keys && localData.keys.length > 0 ? localData.keys : [defaultKey];
          for (const k of sourceKeys) {
            const clean = sanitizeAccessKeyForFirestore(k);
            ops.push({ path: 'accessKeys', id: String(clean.id), data: clean });
          }
        }

        if (localData?.attempts && localData.attempts.length > 0) {
          for (const att of localData.attempts) {
            const clean = sanitizeAttemptForFirestore(att);
            ops.push({ path: 'examResults', id: String(clean.id), data: clean });
          }
        }

        if (localData?.mistakes && localData.mistakes.length > 0) {
          for (const m of localData.mistakes) {
            const clean = sanitizeMistakeForFirestore(m);
            ops.push({ path: 'mistakes', id: String(clean.id), data: clean });
          }
        }

        if (ops.length > 0) {
          await commitBatchedWrites(ops);
        }
      }

      try {
        await setDoc(bootstrapRef, {
          initialized: true,
          migratedAt: new Date().toISOString(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'system/bootstrap');
      }
    } catch (error) {
      initPromise = null;
      throw error;
    }
  })();

  return initPromise;
}

/**
 * Allows Admin to manually sync any remaining local DB questions/keys into Firestore without duplicating IDs.
 */
export async function syncLocalBackupToFirestore(): Promise<{
  questionsSynced: number;
  keysSynced: number;
}> {
  const res = await fetch('/api/migration/local-db');
  if (!res.ok) {
    throw new Error('No se encontró respaldo local para sincronizar.');
  }
  const localData = (await res.json()) as {
    keys?: AccessKey[];
    questions?: Question[];
  };

  const [existingQSnap, existingKSnap] = await Promise.all([
    getDocs(collection(db, 'questions')).catch((err) => {
      handleFirestoreError(err, OperationType.LIST, 'questions');
    }),
    getDocs(collection(db, 'accessKeys')).catch((err) => {
      handleFirestoreError(err, OperationType.LIST, 'accessKeys');
    }),
  ]);

  const existingQIds = new Set(existingQSnap.docs.map((d) => d.id));
  const existingCodes = new Set(
    existingKSnap.docs.map((d) => String((d.data() as AccessKey).code || '').toUpperCase())
  );

  const ops: Array<{ path: string; id: string; data: Record<string, unknown> }> = [];
  let questionsSynced = 0;
  let keysSynced = 0;

  for (const q of localData.questions || []) {
    const clean = sanitizeQuestionForFirestore(q);
    if (!existingQIds.has(String(clean.id))) {
      ops.push({ path: 'questions', id: String(clean.id), data: clean });
      questionsSynced += 1;
    }
  }

  for (const k of localData.keys || []) {
    const clean = sanitizeAccessKeyForFirestore(k);
    if (!existingCodes.has(String(clean.code))) {
      ops.push({ path: 'accessKeys', id: String(clean.id), data: clean });
      keysSynced += 1;
    }
  }

  if (ops.length > 0) {
    await commitBatchedWrites(ops);
  }

  return { questionsSynced, keysSynced };
}

// --- AUTH ---
export async function loginWithCode(code: string): Promise<AuthSession> {
  const rawCode = String(code || '').trim().toUpperCase();
  if (!rawCode) {
    throw new Error('Por favor ingresa una clave de acceso.');
  }

  // Always allow Master Admin entry from any mobile or PC device
  if (rawCode === ADMIN_MASTER_KEY) {
    void ensureFirestoreInitialized().catch(() => {});
    return {
      role: 'admin',
      accessCode: ADMIN_MASTER_KEY,
      studentName: 'Administrador Principal',
    };
  }

  await ensureFirestoreInitialized();

  let snap;
  try {
    const q = query(
      collection(db, 'accessKeys'),
      where('code', '==', rawCode),
      limit(1)
    );
    snap = await getDocs(q);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'accessKeys');
  }

  if (snap.empty) {
    throw new Error('La clave ingresada no es válida. Verifica con tu centro o instructor.');
  }

  const keyRecord = snap.docs[0].data() as AccessKey;

  if (!keyRecord.active) {
    throw new Error('Esta clave de acceso ha sido bloqueada por el administrador.');
  }

  const expiresAtMs = new Date(keyRecord.expiresAt).getTime();
  if (Number.isFinite(expiresAtMs) && Date.now() > expiresAtMs) {
    throw new Error('Esta clave de acceso ha vencido. Solicita una renovación al administrador.');
  }

  return {
    role: 'student',
    accessKeyId: keyRecord.id,
    accessCode: keyRecord.code,
    studentName: keyRecord.studentName,
    expiresAt: keyRecord.expiresAt,
  };
}

export function subscribeToStudentKey(
  accessKeyId: string,
  onUpdate: (key: AccessKey | null) => void
): () => void {
  const ref = doc(db, 'accessKeys', accessKeyId);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        onUpdate(null);
      } else {
        onUpdate(snap.data() as AccessKey);
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, `accessKeys/${accessKeyId}`);
    }
  );
}

// --- ADMIN: REAL-TIME ACCESS KEYS ---
function generateStudentCode(studentName: string, existingCodes: Set<string>): string {
  const cleanPrefix = studentName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase()
    .slice(0, 3)
    .padEnd(3, 'C');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 50; attempt++) {
    let suffix = '';
    for (let i = 0; i < 4; i++) {
      suffix += chars[Math.floor(Math.random() * chars.length)];
    }
    const candidate = `${cleanPrefix}-${suffix}`;
    if (!existingCodes.has(candidate)) {
      return candidate;
    }
  }
  return `PRE-${Date.now().toString().slice(-5)}`;
}

export function subscribeToAccessKeys(
  onUpdate: (keys: AccessKey[]) => void,
  onError?: (err: Error) => void
): () => void {
  void ensureFirestoreInitialized().catch((err) => {
    if (onError && err instanceof Error) onError(err);
  });

  return onSnapshot(
    collection(db, 'accessKeys'),
    (snap) => {
      const list = snap.docs
        .map((d) => d.data() as AccessKey)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      onUpdate(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'accessKeys');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) onError(wrapped);
      }
    }
  );
}

export function subscribeToAllExamResults(
  onUpdate: (attempts: SimulacroAttempt[]) => void
): () => void {
  return onSnapshot(
    collection(db, 'examResults'),
    (snap) => {
      const list = snap.docs.map((d) => d.data() as SimulacroAttempt);
      onUpdate(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'examResults');
    }
  );
}

export async function createAccessKey(
  _adminCode: string,
  payload: { studentName: string; daysValid: number; customCode?: string }
): Promise<AccessKey> {
  const studentName = String(payload.studentName || '').trim();
  const daysValid = Math.max(1, Math.min(3650, Number(payload.daysValid) || 30));
  const customCode = String(payload.customCode || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '');

  if (!studentName) {
    throw new Error('El nombre del estudiante es obligatorio.');
  }

  let existingSnap;
  try {
    existingSnap = await getDocs(collection(db, 'accessKeys'));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'accessKeys');
  }

  const existingCodes = new Set(
    existingSnap.docs.map((d) => String((d.data() as AccessKey).code || '').toUpperCase())
  );
  existingCodes.add(ADMIN_MASTER_KEY);

  if (customCode) {
    if (customCode.length < 3) {
      throw new Error('La clave personalizada debe tener al menos 3 caracteres.');
    }
    if (existingCodes.has(customCode)) {
      throw new Error(`La clave "${customCode}" ya existe.`);
    }
  }

  const code = customCode || generateStudentCode(studentName, existingCodes);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + daysValid * 24 * 60 * 60 * 1000);
  const id = `key-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const newKey: AccessKey = {
    id,
    code,
    studentName,
    daysValid,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    active: true,
  };

  try {
    await setDoc(doc(db, 'accessKeys', id), sanitizeAccessKeyForFirestore(newKey));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `accessKeys/${id}`);
  }

  return newKey;
}

export async function updateAccessKeyPassword(
  _adminCode: string,
  id: string,
  newCodeInput: string,
  newStudentName?: string
): Promise<void> {
  const nextCode = String(newCodeInput || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '');

  if (nextCode.length < 3 || nextCode.length > 40) {
    throw new Error('La nueva contraseña debe tener entre 3 y 40 caracteres (letras, números, - o _).');
  }
  if (nextCode === ADMIN_MASTER_KEY) {
    throw new Error('No puedes asignar la clave maestra del administrador a un estudiante.');
  }

  let existingSnap;
  try {
    existingSnap = await getDocs(collection(db, 'accessKeys'));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'accessKeys');
  }

  const conflict = existingSnap.docs.find(
    (d) =>
      d.id !== id &&
      String((d.data() as AccessKey).code || '').toUpperCase() === nextCode
  );
  if (conflict) {
    throw new Error(`La contraseña "${nextCode}" ya está asignada a otro estudiante.`);
  }

  const patch: Record<string, unknown> = { code: nextCode };
  if (newStudentName && newStudentName.trim()) {
    patch.studentName = newStudentName.trim().slice(0, 120);
  }

  try {
    await updateDoc(doc(db, 'accessKeys', id), patch);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `accessKeys/${id}`);
  }
}

export async function toggleAccessKey(
  _adminCode: string,
  id: string,
  active: boolean
): Promise<void> {
  try {
    await updateDoc(doc(db, 'accessKeys', id), { active });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `accessKeys/${id}`);
  }
}

export async function extendAccessKey(
  _adminCode: string,
  k: AccessKey,
  extendDays: number
): Promise<void> {
  const base = Math.max(Date.now(), new Date(k.expiresAt).getTime());
  const nextExpiresAt = new Date(base + extendDays * 24 * 60 * 60 * 1000).toISOString();
  const nextDaysValid = Math.min(3650, (k.daysValid || 30) + extendDays);

  try {
    await updateDoc(doc(db, 'accessKeys', k.id), {
      expiresAt: nextExpiresAt,
      daysValid: nextDaysValid,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `accessKeys/${k.id}`);
  }
}

export async function deleteAccessKey(_adminCode: string, id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'accessKeys', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `accessKeys/${id}`);
  }
}

// --- QUESTIONS BANK (REAL-TIME FIRESTORE) ---
export function subscribeToQuestions(
  onUpdate: (questions: Question[]) => void,
  onError?: (err: Error) => void
): () => void {
  void ensureFirestoreInitialized().catch((err) => {
    if (onError && err instanceof Error) onError(err);
  });

  return onSnapshot(
    collection(db, 'questions'),
    (snap) => {
      const list = snap.docs
        .map((d) => d.data() as Question)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      onUpdate(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, 'questions');
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) onError(wrapped);
      }
    }
  );
}

export async function fetchQuestions(): Promise<Question[]> {
  await ensureFirestoreInitialized();
  try {
    const snap = await getDocs(collection(db, 'questions'));
    return snap.docs
      .map((d) => d.data() as Question)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'questions');
  }
}

export async function createQuestion(
  _adminCode: string,
  payload: Omit<Question, 'id' | 'createdAt'>
): Promise<Question> {
  const id = `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const tema: TemaOficial = ALL_TEMAS.includes(payload.tema) ? payload.tema : 'Normas';
  const bloque: BloqueCale =
    payload.bloque === 'Actitudes' || tema === 'Actitudes' ? 'Actitudes' : 'Conocimientos';

  const question: Question = {
    id,
    bloque,
    tema,
    tipo: payload.tipo === 'binary' ? 'binary' : 'multiple',
    ...(payload.caso?.trim() ? { caso: payload.caso.trim() } : {}),
    enunciado: payload.enunciado.trim(),
    opciones: payload.opciones,
    respuestaCorrecta: String(payload.respuestaCorrecta || payload.opciones[0]?.key || 'A'),
    explicacion:
      payload.explicacion?.trim() ||
      'Revisa el Código Nacional de Tránsito de Colombia (Ley 769 de 2002).',
    ...(payload.moduloAulapp?.trim() ? { moduloAulapp: payload.moduloAulapp.trim() } : {}),
    createdAt: new Date().toISOString(),
  };

  try {
    await setDoc(doc(db, 'questions', id), sanitizeQuestionForFirestore(question));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `questions/${id}`);
  }

  return question;
}

export async function bulkImportQuestions(
  _adminCode: string,
  questions: Array<Omit<Question, 'id' | 'createdAt'>>,
  onProgress?: (saved: number, total: number) => void
): Promise<{ importedCount: number; questions: Question[] }> {
  const created: Question[] = [];
  const ops: Array<{ path: string; id: string; data: Record<string, unknown> }> = [];
  const nowIso = new Date().toISOString();

  for (let i = 0; i < questions.length; i++) {
    const item = questions[i];
    if (!item.enunciado || !Array.isArray(item.opciones) || item.opciones.length < 2) {
      continue;
    }
    const id = `q-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`;
    const tema: TemaOficial = ALL_TEMAS.includes(item.tema) ? item.tema : 'Normas';
    const bloque: BloqueCale =
      item.bloque === 'Actitudes' || tema === 'Actitudes' ? 'Actitudes' : 'Conocimientos';

    const q: Question = {
      id,
      bloque,
      tema,
      tipo: item.tipo === 'binary' ? 'binary' : 'multiple',
      ...(item.caso?.trim() ? { caso: item.caso.trim() } : {}),
      enunciado: item.enunciado.trim(),
      opciones: item.opciones,
      respuestaCorrecta: String(item.respuestaCorrecta || item.opciones[0].key),
      explicacion:
        item.explicacion?.trim() ||
        'Pregunta importada desde archivo Word (.docx). Consulta la norma CALE vigente.',
      ...(item.moduloAulapp?.trim() ? { moduloAulapp: item.moduloAulapp.trim() } : {}),
      createdAt: nowIso,
    };

    created.push(q);
    ops.push({ path: 'questions', id, data: sanitizeQuestionForFirestore(q) });
  }

  if (ops.length > 0) {
    await commitBatchedWrites(ops, onProgress);
  }

  return { importedCount: created.length, questions: created };
}

export async function updateQuestion(
  _adminCode: string,
  id: string,
  payload: Partial<Omit<Question, 'id' | 'createdAt'>>
): Promise<void> {
  const patch: Record<string, unknown> = {};

  if (payload.tema !== undefined) {
    const tema: TemaOficial = ALL_TEMAS.includes(payload.tema) ? payload.tema : 'Normas';
    patch.tema = tema;
    patch.bloque =
      payload.bloque === 'Actitudes' || tema === 'Actitudes' ? 'Actitudes' : 'Conocimientos';
  } else if (payload.bloque !== undefined) {
    patch.bloque = payload.bloque;
  }

  if (payload.tipo !== undefined) {
    patch.tipo = payload.tipo === 'binary' ? 'binary' : 'multiple';
  }
  if (payload.caso !== undefined) {
    patch.caso = payload.caso.trim().slice(0, 4000);
  }
  if (payload.enunciado !== undefined) {
    patch.enunciado = payload.enunciado.trim().slice(0, 6000);
  }
  if (payload.opciones !== undefined) {
    patch.opciones = payload.opciones.slice(0, 6);
  }
  if (payload.respuestaCorrecta !== undefined) {
    patch.respuestaCorrecta = String(payload.respuestaCorrecta).slice(0, 100);
  }
  if (payload.explicacion !== undefined) {
    patch.explicacion = payload.explicacion.trim().slice(0, 4000);
  }
  if (payload.moduloAulapp !== undefined) {
    patch.moduloAulapp = payload.moduloAulapp.trim().slice(0, 500);
  }

  try {
    await updateDoc(doc(db, 'questions', id), patch);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `questions/${id}`);
  }
}

export async function deleteQuestion(_adminCode: string, id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'questions', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `questions/${id}`);
  }
}

// --- STUDENT DASHBOARD, EXAM RESULTS & MISTAKES (REAL-TIME FIRESTORE) ---
export function buildStudentDashboardStats(
  keyRecord: AccessKey,
  attempts: SimulacroAttempt[],
  mistakes: MistakeRecord[]
): {
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
} {
  const sortedAttempts = [...attempts].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const activeMistakes = mistakes
    .filter((m) => !m.resolved)
    .sort((a, b) => new Date(b.lastFailedAt).getTime() - new Date(a.lastFailedAt).getTime());

  const themeMap = new Map<TemaOficial, { answered: number; correct: number }>();
  for (const tema of ALL_TEMAS) {
    themeMap.set(tema, { answered: 0, correct: 0 });
  }
  for (const attempt of sortedAttempts) {
    for (const ans of attempt.answers) {
      const entry = themeMap.get(ans.tema);
      if (entry) {
        entry.answered += 1;
        if (ans.isCorrect) entry.correct += 1;
      }
    }
  }

  const themeProgress: ThemeProgress[] = ALL_TEMAS.map((tema) => {
    const stats = themeMap.get(tema) || { answered: 0, correct: 0 };
    const percentage = stats.answered > 0 ? Math.round((stats.correct / stats.answered) * 100) : 0;
    return {
      tema,
      bloque: TEMA_BLOQUE_MAP[tema],
      answered: stats.answered,
      correct: stats.correct,
      percentage,
    };
  });

  const totalAttempts = sortedAttempts.length;
  const passedAttempts = sortedAttempts.filter((a) => a.passed).length;

  const avgConocimientosPct =
    totalAttempts > 0
      ? Math.round(sortedAttempts.reduce((acc, a) => acc + a.conocimientosPct, 0) / totalAttempts)
      : 0;
  const avgActitudesPct =
    totalAttempts > 0
      ? Math.round(sortedAttempts.reduce((acc, a) => acc + a.actitudesPct, 0) / totalAttempts)
      : 0;

  let approvalProbability = 0;
  if (totalAttempts > 0) {
    const recent = sortedAttempts.slice(0, 5);
    const minBlockScores = recent.map((a) => Math.min(a.conocimientosPct, a.actitudesPct));
    const avgMinBlock = minBlockScores.reduce((s, v) => s + v, 0) / minBlockScores.length;
    const passRate = (recent.filter((a) => a.passed).length / recent.length) * 100;
    const distanceFactor = Math.max(0, Math.min(100, Math.round((avgMinBlock / 80) * 82)));
    approvalProbability = Math.max(
      5,
      Math.min(99, Math.round(distanceFactor * 0.65 + passRate * 0.35))
    );
  }

  const daysRemaining = Math.max(
    0,
    Math.ceil((new Date(keyRecord.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
  );

  return {
    studentName: keyRecord.studentName,
    accessCode: keyRecord.code,
    expiresAt: keyRecord.expiresAt,
    daysRemaining,
    approvalProbability,
    avgConocimientosPct,
    avgActitudesPct,
    totalAttempts,
    passedAttempts,
    themeProgress,
    attempts: sortedAttempts,
    mistakes: activeMistakes,
  };
}

export function subscribeToStudentExamResults(
  accessKeyId: string | undefined,
  accessCode: string,
  onUpdate: (attempts: SimulacroAttempt[]) => void
): () => void {
  const upperCode = accessCode.toUpperCase();
  const q = accessKeyId
    ? query(collection(db, 'examResults'), where('accessKeyId', '==', accessKeyId))
    : query(collection(db, 'examResults'), where('accessCode', '==', upperCode));

  // Also listen by accessCode if accessKeyId is provided so migrated legacy records appear
  if (accessKeyId) {
    let byId: SimulacroAttempt[] = [];
    let byCode: SimulacroAttempt[] = [];
    const emitMerged = () => {
      const map = new Map<string, SimulacroAttempt>();
      for (const a of [...byCode, ...byId]) {
        map.set(a.id, a);
      }
      onUpdate(Array.from(map.values()));
    };

    const unsub1 = onSnapshot(
      query(collection(db, 'examResults'), where('accessKeyId', '==', accessKeyId)),
      (snap) => {
        byId = snap.docs.map((d) => d.data() as SimulacroAttempt);
        emitMerged();
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'examResults');
      }
    );

    const unsub2 = onSnapshot(
      query(collection(db, 'examResults'), where('accessCode', '==', upperCode)),
      (snap) => {
        byCode = snap.docs.map((d) => d.data() as SimulacroAttempt);
        emitMerged();
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'examResults');
      }
    );

    return () => {
      unsub1();
      unsub2();
    };
  }

  return onSnapshot(
    q,
    (snap) => {
      onUpdate(snap.docs.map((d) => d.data() as SimulacroAttempt));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'examResults');
    }
  );
}

export function subscribeToStudentMistakes(
  accessKeyId: string | undefined,
  accessCode: string,
  onUpdate: (mistakes: MistakeRecord[]) => void
): () => void {
  const upperCode = accessCode.toUpperCase();

  if (accessKeyId) {
    let byId: MistakeRecord[] = [];
    let byCode: MistakeRecord[] = [];
    const emitMerged = () => {
      const map = new Map<string, MistakeRecord>();
      for (const m of [...byCode, ...byId]) {
        map.set(m.id, m);
      }
      onUpdate(Array.from(map.values()));
    };

    const unsub1 = onSnapshot(
      query(collection(db, 'mistakes'), where('accessKeyId', '==', accessKeyId)),
      (snap) => {
        byId = snap.docs.map((d) => d.data() as MistakeRecord);
        emitMerged();
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'mistakes');
      }
    );

    const unsub2 = onSnapshot(
      query(collection(db, 'mistakes'), where('accessCode', '==', upperCode)),
      (snap) => {
        byCode = snap.docs.map((d) => d.data() as MistakeRecord);
        emitMerged();
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'mistakes');
      }
    );

    return () => {
      unsub1();
      unsub2();
    };
  }

  return onSnapshot(
    query(collection(db, 'mistakes'), where('accessCode', '==', upperCode)),
    (snap) => {
      onUpdate(snap.docs.map((d) => d.data() as MistakeRecord));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'mistakes');
    }
  );
}

export async function submitSimulacroAttempt(payload: {
  accessKeyId?: string;
  accessCode: string;
  studentName: string;
  questionBank: Question[];
  durationSeconds: number;
  submissions: Array<{ questionId: string; selectedKey: string | null; wasFlagged: boolean }>;
}): Promise<SimulacroAttempt> {
  const upperCode = payload.accessCode.trim().toUpperCase();
  const questionMap = new Map(payload.questionBank.map((q) => [q.id, q]));
  const answers: AttemptAnswerDetail[] = [];

  for (const sub of payload.submissions) {
    const q = questionMap.get(sub.questionId);
    if (!q) continue;
    const selectedKey = sub.selectedKey ?? null;
    const isCorrect =
      selectedKey !== null &&
      selectedKey.trim().toLowerCase() === q.respuestaCorrecta.trim().toLowerCase();

    answers.push({
      questionId: q.id,
      bloque: q.bloque,
      tema: q.tema,
      tipo: q.tipo,
      ...(q.caso ? { caso: q.caso } : {}),
      enunciado: q.enunciado,
      opciones: q.opciones,
      selectedKey,
      correctKey: q.respuestaCorrecta,
      isCorrect,
      wasFlagged: Boolean(sub.wasFlagged),
      explicacion: q.explicacion,
    });
  }

  const conocimientosAnswers = answers.filter((a) => a.bloque === 'Conocimientos');
  const actitudesAnswers = answers.filter((a) => a.bloque === 'Actitudes');

  const conocimientosTotal = conocimientosAnswers.length;
  const conocimientosCorrect = conocimientosAnswers.filter((a) => a.isCorrect).length;
  const conocimientosPct =
    conocimientosTotal > 0 ? Math.round((conocimientosCorrect / conocimientosTotal) * 100) : 100;

  const actitudesTotal = actitudesAnswers.length;
  const actitudesCorrect = actitudesAnswers.filter((a) => a.isCorrect).length;
  const actitudesPct =
    actitudesTotal > 0 ? Math.round((actitudesCorrect / actitudesTotal) * 100) : 100;

  const passed =
    (conocimientosTotal === 0 || conocimientosPct >= 80) &&
    (actitudesTotal === 0 || actitudesPct >= 80);

  const themeBreakdown: ThemeBreakdown[] = ALL_TEMAS.map((tema) => {
    const items = answers.filter((a) => a.tema === tema);
    const correct = items.filter((a) => a.isCorrect).length;
    return {
      tema,
      total: items.length,
      correct,
      percentage: items.length > 0 ? Math.round((correct / items.length) * 100) : 0,
    };
  }).filter((tb) => tb.total > 0);

  const attemptId = `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const attempt: SimulacroAttempt = {
    id: attemptId,
    ...(payload.accessKeyId ? { accessKeyId: payload.accessKeyId } : {}),
    accessCode: upperCode,
    studentName: payload.studentName,
    createdAt: new Date().toISOString(),
    durationSeconds: Math.max(1, payload.durationSeconds),
    totalQuestions: answers.length,
    conocimientosTotal,
    conocimientosCorrect,
    conocimientosPct,
    actitudesTotal,
    actitudesCorrect,
    actitudesPct,
    passed,
    themeBreakdown,
    answers,
  };

  try {
    await setDoc(doc(db, 'examResults', attemptId), sanitizeAttemptForFirestore(attempt));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `examResults/${attemptId}`);
  }

  // Record failed questions in Cloud Firestore `mistakes`
  const nowIso = new Date().toISOString();
  const ownerKeyPrefix = sanitizeId(payload.accessKeyId || upperCode, 'stu');

  for (const ans of answers) {
    if (!ans.isCorrect) {
      const mistakeId = `err-${ownerKeyPrefix}-${sanitizeId(ans.questionId, 'q')}`.slice(0, 120);
      const mistakeRef = doc(db, 'mistakes', mistakeId);
      const wrongLabel = ans.selectedKey || 'Sin responder';

      try {
        const existingSnap = await getDoc(mistakeRef);
        if (existingSnap.exists()) {
          const prev = existingSnap.data() as MistakeRecord;
          await updateDoc(mistakeRef, {
            accessCode: upperCode,
            wrongKey: wrongLabel.slice(0, 100),
            correctKey: ans.correctKey.slice(0, 100),
            explicacion: ans.explicacion.slice(0, 4000),
            failedCount: Math.min(1000, (prev.failedCount || 1) + 1),
            lastFailedAt: nowIso,
            resolved: false,
          });
        } else {
          const mistakeRecord: MistakeRecord = {
            id: mistakeId,
            ...(payload.accessKeyId ? { accessKeyId: payload.accessKeyId } : {}),
            accessCode: upperCode,
            questionId: ans.questionId,
            bloque: ans.bloque,
            tema: ans.tema,
            tipo: ans.tipo,
            ...(ans.caso ? { caso: ans.caso } : {}),
            enunciado: ans.enunciado,
            opciones: ans.opciones,
            wrongKey: wrongLabel,
            correctKey: ans.correctKey,
            explicacion: ans.explicacion,
            failedCount: 1,
            lastFailedAt: nowIso,
            resolved: false,
          };
          await setDoc(mistakeRef, sanitizeMistakeForFirestore(mistakeRecord));
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `mistakes/${mistakeId}`);
      }
    }
  }

  return attempt;
}

export async function resolveMistake(_accessCode: string, id: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'mistakes', id), { resolved: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `mistakes/${id}`);
  }
}
