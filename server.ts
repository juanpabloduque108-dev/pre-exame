import express from 'express';
import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';
import { SEED_QUESTIONS } from './src/data/seedQuestions.ts';
import type {
  AccessKey,
  AttemptAnswerDetail,
  BloqueCale,
  MistakeRecord,
  Question,
  SimulacroAttempt,
  TemaOficial,
  ThemeBreakdown,
  ThemeProgress,
} from './src/types/cale.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ADMIN_MASTER_KEY = 'ADMIN2026';
const DEFAULT_TEST_KEY = 'PRUEBA123';
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(__dirname, 'data');
const DB_PATH = path.resolve(DATA_DIR, 'pre_examen_db.json');

interface DatabaseSchema {
  keys: AccessKey[];
  questions: Question[];
  attempts: SimulacroAttempt[];
  mistakes: MistakeRecord[];
}

function createInitialDb(): DatabaseSchema {
  const now = new Date();
  const expires = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  return {
    keys: [
      {
        id: 'key-prueba-123',
        code: DEFAULT_TEST_KEY,
        studentName: 'Estudiante de Prueba',
        daysValid: 365,
        createdAt: now.toISOString(),
        expiresAt: expires.toISOString(),
        active: true,
      },
    ],
    questions: [...SEED_QUESTIONS],
    attempts: [],
    mistakes: [],
  };
}

function readDb(): DatabaseSchema {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    const initial = createInitialDb();
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<DatabaseSchema>;
    const db: DatabaseSchema = {
      keys: Array.isArray(parsed.keys) ? parsed.keys : [],
      questions: Array.isArray(parsed.questions) ? parsed.questions : [],
      attempts: Array.isArray(parsed.attempts) ? parsed.attempts : [],
      mistakes: Array.isArray(parsed.mistakes) ? parsed.mistakes : [],
    };
    // Ensure default test key exists if database was emptied
    if (!db.keys.some((k) => k.code.toUpperCase() === DEFAULT_TEST_KEY)) {
      const now = new Date();
      const expires = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
      db.keys.unshift({
        id: 'key-prueba-123',
        code: DEFAULT_TEST_KEY,
        studentName: 'Estudiante de Prueba',
        daysValid: 365,
        createdAt: now.toISOString(),
        expiresAt: expires.toISOString(),
        active: true,
      });
      writeDb(db);
    }
    return db;
  } catch {
    const initial = createInitialDb();
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
}

function writeDb(db: DatabaseSchema): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
}

function isAdminAuthorized(req: Request): boolean {
  const headerKey = String(req.headers['x-admin-key'] || '').trim().toUpperCase();
  return headerKey === ADMIN_MASTER_KEY;
}

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

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // Ensure DB exists on startup
  readDb();

  // --- MIGRATION SOURCE (read-only export of local DB for initial Firestore sync) ---
  app.get('/api/migration/local-db', (_req: Request, res: Response) => {
    const db = readDb();
    res.json(db);
  });

  // --- ADMIN: DOWNLOAD FULL SOURCE CODE AS ZIP ---
  app.get('/api/admin/download-source', (req: Request, res: Response) => {
    const queryKey = String(req.query.key || '').trim().toUpperCase();
    if (!isAdminAuthorized(req) && queryKey !== ADMIN_MASTER_KEY) {
      res.status(403).json({ error: 'Acceso denegado.' });
      return;
    }

    const EXCLUDED_DIRS = new Set([
      'node_modules',
      '.git',
      'dist',
      'dev-dist',
      '.vite',
      '.aistudio',
      'data',
    ]);
    const EXCLUDED_FILES = new Set(['.DS_Store', '.env', 'bun.lock']);

    const collectedFiles: Array<{ relPath: string; content: Buffer }> = [];
    const walk = (dirPath: string, relBase: string) => {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (EXCLUDED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
          const nextRel = relBase ? `${relBase}/${entry.name}` : entry.name;
          walk(path.join(dirPath, entry.name), nextRel);
        } else if (entry.isFile()) {
          if (EXCLUDED_FILES.has(entry.name)) continue;
          const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
          collectedFiles.push({
            relPath,
            content: fs.readFileSync(path.join(dirPath, entry.name)),
          });
        }
      }
    };

    walk(__dirname, '');

    // Build standards-compliant ZIP archive using Node built-in zlib (deflate + crc32)
    const localParts: Buffer[] = [];
    const centralParts: Buffer[] = [];
    let offset = 0;

    const now = new Date();
    const dosTime =
      ((now.getHours() & 0x1f) << 11) |
      ((now.getMinutes() & 0x3f) << 5) |
      ((now.getSeconds() >> 1) & 0x1f);
    const dosDate =
      (((Math.max(1980, now.getFullYear()) - 1980) & 0x7f) << 9) |
      (((now.getMonth() + 1) & 0x0f) << 5) |
      (now.getDate() & 0x1f);

    for (const file of collectedFiles) {
      const nameBuf = Buffer.from(file.relPath, 'utf8');
      const crc = zlib.crc32(file.content) >>> 0;
      const compressed = zlib.deflateRawSync(file.content);

      const localHeader = Buffer.alloc(30);
      localHeader.writeUInt32LE(0x04034b50, 0);
      localHeader.writeUInt16LE(20, 4);
      localHeader.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
      localHeader.writeUInt16LE(8, 8); // deflate
      localHeader.writeUInt16LE(dosTime, 10);
      localHeader.writeUInt16LE(dosDate, 12);
      localHeader.writeUInt32LE(crc, 14);
      localHeader.writeUInt32LE(compressed.length, 18);
      localHeader.writeUInt32LE(file.content.length, 22);
      localHeader.writeUInt16LE(nameBuf.length, 26);
      localHeader.writeUInt16LE(0, 28);

      localParts.push(localHeader, nameBuf, compressed);

      const centralHeader = Buffer.alloc(46);
      centralHeader.writeUInt32LE(0x02014b50, 0);
      centralHeader.writeUInt16LE(20, 4);
      centralHeader.writeUInt16LE(20, 6);
      centralHeader.writeUInt16LE(0x0800, 8);
      centralHeader.writeUInt16LE(8, 10);
      centralHeader.writeUInt16LE(dosTime, 12);
      centralHeader.writeUInt16LE(dosDate, 14);
      centralHeader.writeUInt32LE(crc, 16);
      centralHeader.writeUInt32LE(compressed.length, 20);
      centralHeader.writeUInt32LE(file.content.length, 24);
      centralHeader.writeUInt16LE(nameBuf.length, 28);
      centralHeader.writeUInt16LE(0, 30);
      centralHeader.writeUInt16LE(0, 32);
      centralHeader.writeUInt16LE(0, 34);
      centralHeader.writeUInt16LE(0, 36);
      centralHeader.writeUInt32LE(0, 38);
      centralHeader.writeUInt32LE(offset, 42);

      centralParts.push(centralHeader, nameBuf);
      offset += localHeader.length + nameBuf.length + compressed.length;
    }

    const centralDirSize = centralParts.reduce((acc, b) => acc + b.length, 0);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(collectedFiles.length, 8);
    eocd.writeUInt16LE(collectedFiles.length, 10);
    eocd.writeUInt32LE(centralDirSize, 12);
    eocd.writeUInt32LE(offset, 16);
    eocd.writeUInt16LE(0, 20);

    const zipBuffer = Buffer.concat([...localParts, ...centralParts, eocd]);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="pre-examen-codigo-fuente.zip"'
    );
    res.setHeader('Content-Length', String(zipBuffer.length));
    res.send(zipBuffer);
  });

  // --- AUTH ---
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const rawCode = String(req.body?.code || '').trim().toUpperCase();
    if (!rawCode) {
      res.status(400).json({ error: 'Por favor ingresa una clave de acceso.' });
      return;
    }

    if (rawCode === ADMIN_MASTER_KEY) {
      res.json({
        role: 'admin',
        accessCode: ADMIN_MASTER_KEY,
        studentName: 'Administrador Principal',
      });
      return;
    }

    const db = readDb();
    const keyRecord = db.keys.find((k) => k.code.toUpperCase() === rawCode);
    if (!keyRecord) {
      res.status(401).json({
        error: 'La clave ingresada no es válida. Verifica con tu centro o instructor.',
      });
      return;
    }

    if (!keyRecord.active) {
      res.status(403).json({
        error: 'Esta clave de acceso ha sido desactivada por el administrador.',
      });
      return;
    }

    const now = Date.now();
    const expiresAtMs = new Date(keyRecord.expiresAt).getTime();
    if (Number.isFinite(expiresAtMs) && now > expiresAtMs) {
      res.status(403).json({
        error: 'Esta clave de acceso ha vencido. Solicita una renovación al administrador.',
      });
      return;
    }

    res.json({
      role: 'student',
      accessCode: keyRecord.code,
      studentName: keyRecord.studentName,
      expiresAt: keyRecord.expiresAt,
    });
  });

  // --- ADMIN: ACCESS KEYS ---
  app.get('/api/keys', (req: Request, res: Response) => {
    if (!isAdminAuthorized(req)) {
      res.status(403).json({ error: 'Acceso denegado.' });
      return;
    }
    const db = readDb();
    const enriched = db.keys.map((k) => ({
      ...k,
      attemptsCount: db.attempts.filter((a) => a.accessCode === k.code).length,
    }));
    res.json(enriched);
  });

  app.post('/api/keys', (req: Request, res: Response) => {
    if (!isAdminAuthorized(req)) {
      res.status(403).json({ error: 'Acceso denegado.' });
      return;
    }
    const studentName = String(req.body?.studentName || '').trim();
    const daysValid = Math.max(1, Math.min(3650, Number(req.body?.daysValid) || 30));
    const customCode = String(req.body?.customCode || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '');

    if (!studentName) {
      res.status(400).json({ error: 'El nombre del estudiante es obligatorio.' });
      return;
    }

    const db = readDb();
    const existingCodes = new Set(db.keys.map((k) => k.code.toUpperCase()));
    existingCodes.add(ADMIN_MASTER_KEY);

    if (customCode) {
      if (customCode.length < 4) {
        res.status(400).json({ error: 'La clave personalizada debe tener al menos 4 caracteres.' });
        return;
      }
      if (existingCodes.has(customCode)) {
        res.status(409).json({ error: `La clave "${customCode}" ya existe.` });
        return;
      }
    }

    const code = customCode || generateStudentCode(studentName, existingCodes);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + daysValid * 24 * 60 * 60 * 1000);

    const newKey: AccessKey = {
      id: `key-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      code,
      studentName,
      daysValid,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      active: true,
    };

    db.keys.unshift(newKey);
    writeDb(db);
    res.status(201).json({ ...newKey, attemptsCount: 0 });
  });

  app.patch('/api/keys/:id', (req: Request, res: Response) => {
    if (!isAdminAuthorized(req)) {
      res.status(403).json({ error: 'Acceso denegado.' });
      return;
    }
    const db = readDb();
    const idx = db.keys.findIndex((k) => k.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Clave no encontrada.' });
      return;
    }
    const current = db.keys[idx];
    const nextActive = typeof req.body?.active === 'boolean' ? req.body.active : current.active;
    let nextExpiresAt = current.expiresAt;
    let nextDaysValid = current.daysValid;
    if (typeof req.body?.extendDays === 'number' && req.body.extendDays > 0) {
      const base = Math.max(Date.now(), new Date(current.expiresAt).getTime());
      nextExpiresAt = new Date(base + req.body.extendDays * 24 * 60 * 60 * 1000).toISOString();
      nextDaysValid = current.daysValid + req.body.extendDays;
    }

    db.keys[idx] = {
      ...current,
      active: nextActive,
      expiresAt: nextExpiresAt,
      daysValid: nextDaysValid,
    };
    writeDb(db);
    res.json({
      ...db.keys[idx],
      attemptsCount: db.attempts.filter((a) => a.accessCode === db.keys[idx].code).length,
    });
  });

  app.delete('/api/keys/:id', (req: Request, res: Response) => {
    if (!isAdminAuthorized(req)) {
      res.status(403).json({ error: 'Acceso denegado.' });
      return;
    }
    const db = readDb();
    const idx = db.keys.findIndex((k) => k.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Clave no encontrada.' });
      return;
    }
    db.keys.splice(idx, 1);
    writeDb(db);
    res.json({ ok: true });
  });

  // --- QUESTIONS BANK ---
  app.get('/api/questions', (_req: Request, res: Response) => {
    const db = readDb();
    res.json(db.questions);
  });

  app.post('/api/questions', (req: Request, res: Response) => {
    if (!isAdminAuthorized(req)) {
      res.status(403).json({ error: 'Acceso denegado.' });
      return;
    }
    const payload = req.body as Partial<Question>;
    if (!payload.enunciado || !Array.isArray(payload.opciones) || payload.opciones.length < 2) {
      res.status(400).json({ error: 'Enunciado y opciones válidas son obligatorios.' });
      return;
    }
    const tema: TemaOficial = ALL_TEMAS.includes(payload.tema as TemaOficial)
      ? (payload.tema as TemaOficial)
      : 'Normas';
    const bloque: BloqueCale =
      payload.bloque === 'Actitudes' || tema === 'Actitudes' ? 'Actitudes' : 'Conocimientos';

    const question: Question = {
      id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      bloque,
      tema,
      tipo: payload.tipo === 'binary' ? 'binary' : 'multiple',
      caso: payload.caso?.trim() || undefined,
      enunciado: payload.enunciado.trim(),
      opciones: payload.opciones,
      respuestaCorrecta: String(payload.respuestaCorrecta || payload.opciones[0].key),
      explicacion: payload.explicacion?.trim() || 'Revisa el Código Nacional de Tránsito de Colombia (Ley 769 de 2002).',
      moduloAulapp: payload.moduloAulapp?.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    const db = readDb();
    db.questions.unshift(question);
    writeDb(db);
    res.status(201).json(question);
  });

  app.post('/api/questions/bulk', (req: Request, res: Response) => {
    if (!isAdminAuthorized(req)) {
      res.status(403).json({ error: 'Acceso denegado.' });
      return;
    }
    const incoming = Array.isArray(req.body?.questions) ? (req.body.questions as Partial<Question>[]) : [];
    if (incoming.length === 0) {
      res.status(400).json({ error: 'No se recibieron preguntas para importar.' });
      return;
    }

    const db = readDb();
    const created: Question[] = [];
    const nowIso = new Date().toISOString();

    for (const item of incoming) {
      if (!item.enunciado || !Array.isArray(item.opciones) || item.opciones.length < 2) {
        continue;
      }
      const tema: TemaOficial = ALL_TEMAS.includes(item.tema as TemaOficial)
        ? (item.tema as TemaOficial)
        : 'Normas';
      const bloque: BloqueCale =
        item.bloque === 'Actitudes' || tema === 'Actitudes' ? 'Actitudes' : 'Conocimientos';

      const q: Question = {
        id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        bloque,
        tema,
        tipo: item.tipo === 'binary' ? 'binary' : 'multiple',
        caso: item.caso?.trim() || undefined,
        enunciado: item.enunciado.trim(),
        opciones: item.opciones,
        respuestaCorrecta: String(item.respuestaCorrecta || item.opciones[0].key),
        explicacion:
          item.explicacion?.trim() ||
          'Pregunta importada desde banco oficial Word (.docx). Consulta la norma CALE vigente.',
        moduloAulapp: item.moduloAulapp?.trim() || undefined,
        createdAt: nowIso,
      };
      created.push(q);
    }

    db.questions = [...created, ...db.questions];
    writeDb(db);
    res.status(201).json({ importedCount: created.length, questions: created });
  });

  app.put('/api/questions/:id', (req: Request, res: Response) => {
    if (!isAdminAuthorized(req)) {
      res.status(403).json({ error: 'Acceso denegado.' });
      return;
    }
    const db = readDb();
    const idx = db.questions.findIndex((q) => q.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Pregunta no encontrada.' });
      return;
    }
    const payload = req.body as Partial<Question>;
    const current = db.questions[idx];
    const tema: TemaOficial = ALL_TEMAS.includes(payload.tema as TemaOficial)
      ? (payload.tema as TemaOficial)
      : current.tema;
    const bloque: BloqueCale =
      payload.bloque === 'Actitudes' || tema === 'Actitudes' ? 'Actitudes' : 'Conocimientos';

    db.questions[idx] = {
      ...current,
      bloque,
      tema,
      tipo: payload.tipo === 'binary' ? 'binary' : payload.tipo === 'multiple' ? 'multiple' : current.tipo,
      caso: payload.caso !== undefined ? payload.caso.trim() || undefined : current.caso,
      enunciado: payload.enunciado ? payload.enunciado.trim() : current.enunciado,
      opciones: Array.isArray(payload.opciones) && payload.opciones.length >= 2 ? payload.opciones : current.opciones,
      respuestaCorrecta: payload.respuestaCorrecta ? String(payload.respuestaCorrecta) : current.respuestaCorrecta,
      explicacion: payload.explicacion !== undefined ? payload.explicacion.trim() : current.explicacion,
      moduloAulapp: payload.moduloAulapp !== undefined ? payload.moduloAulapp.trim() || undefined : current.moduloAulapp,
    };

    writeDb(db);
    res.json(db.questions[idx]);
  });

  app.delete('/api/questions/:id', (req: Request, res: Response) => {
    if (!isAdminAuthorized(req)) {
      res.status(403).json({ error: 'Acceso denegado.' });
      return;
    }
    const db = readDb();
    const idx = db.questions.findIndex((q) => q.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Pregunta no encontrada.' });
      return;
    }
    db.questions.splice(idx, 1);
    writeDb(db);
    res.json({ ok: true });
  });

  // --- STUDENT DASHBOARD, ATTEMPTS & MISTAKES ---
  app.get('/api/student/dashboard', (req: Request, res: Response) => {
    const code = String(req.query.code || '').trim().toUpperCase();
    if (!code) {
      res.status(400).json({ error: 'Clave de acceso requerida.' });
      return;
    }
    const db = readDb();
    const keyRecord = db.keys.find((k) => k.code.toUpperCase() === code);
    if (!keyRecord) {
      res.status(404).json({ error: 'Clave no encontrada.' });
      return;
    }

    const attempts = db.attempts
      .filter((a) => a.accessCode.toUpperCase() === code)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const mistakes = db.mistakes
      .filter((m) => m.accessCode.toUpperCase() === code && !m.resolved)
      .sort((a, b) => new Date(b.lastFailedAt).getTime() - new Date(a.lastFailedAt).getTime());

    // Compute progress across the 5 official themes
    const themeMap = new Map<TemaOficial, { answered: number; correct: number }>();
    for (const tema of ALL_TEMAS) {
      themeMap.set(tema, { answered: 0, correct: 0 });
    }
    for (const attempt of attempts) {
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

    const totalAttempts = attempts.length;
    const passedAttempts = attempts.filter((a) => a.passed).length;

    const avgConocimientosPct =
      totalAttempts > 0
        ? Math.round(attempts.reduce((acc, a) => acc + a.conocimientosPct, 0) / totalAttempts)
        : 0;
    const avgActitudesPct =
      totalAttempts > 0
        ? Math.round(attempts.reduce((acc, a) => acc + a.actitudesPct, 0) / totalAttempts)
        : 0;

    // Probability of approval weighted towards recent attempts & strict 80/80 threshold
    let approvalProbability = 0;
    if (totalAttempts > 0) {
      const recent = attempts.slice(0, 5);
      const minBlockScores = recent.map((a) => Math.min(a.conocimientosPct, a.actitudesPct));
      const avgMinBlock = minBlockScores.reduce((s, v) => s + v, 0) / minBlockScores.length;
      const passRate = (recent.filter((a) => a.passed).length / recent.length) * 100;
      // Blend readiness relative to the 80% dual threshold
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

    res.json({
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
      attempts,
      mistakes,
    });
  });

  app.post('/api/student/attempts', (req: Request, res: Response) => {
    const code = String(req.body?.accessCode || '').trim().toUpperCase();
    const durationSeconds = Math.max(1, Number(req.body?.durationSeconds) || 0);
    const submissions = Array.isArray(req.body?.submissions)
      ? (req.body.submissions as Array<{
          questionId: string;
          selectedKey: string | null;
          wasFlagged?: boolean;
        }>)
      : [];

    if (!code || submissions.length === 0) {
      res.status(400).json({ error: 'Datos de simulacro incompletos.' });
      return;
    }

    const db = readDb();
    const keyRecord = db.keys.find((k) => k.code.toUpperCase() === code);
    if (!keyRecord || !keyRecord.active) {
      res.status(403).json({ error: 'Clave inválida o desactivada.' });
      return;
    }

    const questionMap = new Map(db.questions.map((q) => [q.id, q]));
    const answers: AttemptAnswerDetail[] = [];

    for (const sub of submissions) {
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
        caso: q.caso,
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

    // Strict CALE rule: minimum 80% in Conocimientos AND minimum 80% in Actitudes separately
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

    const attempt: SimulacroAttempt = {
      id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      accessCode: keyRecord.code,
      studentName: keyRecord.studentName,
      createdAt: new Date().toISOString(),
      durationSeconds,
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

    db.attempts.unshift(attempt);

    // Automatically record failed questions into mistakes bank
    const nowIso = new Date().toISOString();
    for (const ans of answers) {
      if (!ans.isCorrect) {
        const existingIdx = db.mistakes.findIndex(
          (m) => m.accessCode.toUpperCase() === code && m.questionId === ans.questionId
        );
        const wrongLabel = ans.selectedKey || 'Sin responder';
        if (existingIdx >= 0) {
          db.mistakes[existingIdx] = {
            ...db.mistakes[existingIdx],
            wrongKey: wrongLabel,
            correctKey: ans.correctKey,
            explicacion: ans.explicacion,
            failedCount: db.mistakes[existingIdx].failedCount + 1,
            lastFailedAt: nowIso,
            resolved: false,
          };
        } else {
          db.mistakes.unshift({
            id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            accessCode: keyRecord.code,
            questionId: ans.questionId,
            bloque: ans.bloque,
            tema: ans.tema,
            tipo: ans.tipo,
            caso: ans.caso,
            enunciado: ans.enunciado,
            opciones: ans.opciones,
            wrongKey: wrongLabel,
            correctKey: ans.correctKey,
            explicacion: ans.explicacion,
            failedCount: 1,
            lastFailedAt: nowIso,
            resolved: false,
          });
        }
      }
    }

    writeDb(db);
    res.status(201).json(attempt);
  });

  app.post('/api/student/mistakes/resolve', (req: Request, res: Response) => {
    const id = String(req.body?.id || '');
    const code = String(req.body?.accessCode || '').trim().toUpperCase();
    if (!id || !code) {
      res.status(400).json({ error: 'Parámetros inválidos.' });
      return;
    }
    const db = readDb();
    const idx = db.mistakes.findIndex(
      (m) => m.id === id && m.accessCode.toUpperCase() === code
    );
    if (idx === -1) {
      res.status(404).json({ error: 'Registro no encontrado.' });
      return;
    }
    db.mistakes[idx].resolved = true;
    writeDb(db);
    res.json({ ok: true });
  });

  // --- VITE / STATIC SERVING ---
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Pre Examen server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
