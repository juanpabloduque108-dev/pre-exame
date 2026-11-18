import mammoth from 'mammoth';
import type {
  BloqueCale,
  Question,
  QuestionOption,
  TemaOficial,
  TipoPregunta,
} from '../types/cale.ts';

export interface ParsedQuestionPreview {
  tempId: string;
  sourceFormat: 'texto' | 'tabla';
  bloque: BloqueCale;
  tema: TemaOficial;
  tipo: TipoPregunta;
  caso?: string;
  enunciado: string;
  opciones: QuestionOption[];
  respuestaCorrecta: string;
  explicacion: string;
  moduloAulapp?: string;
  warning?: string;
}

function normalizeStr(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Asigna el texto de "Módulo y Tema" a una de las 5 categorías oficiales:
 * - Movilidad Segura
 * - Normas de Tránsito ('Normas')
 * - Señalización ('Señales')
 * - El Vehículo ('Vehículo')
 * - Actitudes ('Actitudes')
 * Si no coincide, asigna por defecto "Normas de Tránsito" ('Normas').
 */
export function inferBloqueAndTema(rawTopic: string): {
  bloque: BloqueCale;
  tema: TemaOficial;
} {
  const fullNorm = normalizeStr(rawTopic);
  if (!fullNorm) {
    return { bloque: 'Conocimientos', tema: 'Normas' };
  }

  const primaryPart = fullNorm.split(/[—–|]/)[0]?.trim() || fullNorm;

  const matchCategory = (text: string): { bloque: BloqueCale; tema: TemaOficial } | null => {
    if (
      text.includes('actitud') ||
      text.includes('comportamiento') ||
      text.includes('etica') ||
      text.includes('convivencia') ||
      text.includes('factor humano') ||
      text.includes('cultura ciudadana') ||
      text.includes('bloque 2') ||
      text.includes('bloque ii')
    ) {
      return { bloque: 'Actitudes', tema: 'Actitudes' };
    }

    if (
      text.includes('vehiculo') ||
      text.includes('mecanica') ||
      text.includes('tecnico') ||
      text.includes('llanta') ||
      text.includes('freno') ||
      text.includes('motor') ||
      text.includes('equipo de prevencion')
    ) {
      return { bloque: 'Conocimientos', tema: 'Vehículo' };
    }

    if (
      text.includes('senalizacion') ||
      text.includes('senal') ||
      text.includes('demarcacion') ||
      text.includes('semaforo') ||
      text.includes('infraestructura')
    ) {
      return { bloque: 'Conocimientos', tema: 'Señales' };
    }

    if (
      text.includes('movilidad segura') ||
      text.includes('movilidad') ||
      text.includes('sostenible') ||
      text.includes('vulnerable')
    ) {
      return { bloque: 'Conocimientos', tema: 'Movilidad Segura' };
    }

    if (
      text.includes('normas de transito') ||
      text.includes('norma') ||
      text.includes('codigo nacional') ||
      text.includes('ley 769') ||
      text.includes('autoridades de transito')
    ) {
      return { bloque: 'Conocimientos', tema: 'Normas' };
    }

    if (text.includes('seguridad vial')) {
      return { bloque: 'Conocimientos', tema: 'Movilidad Segura' };
    }

    return null;
  };

  return (
    matchCategory(primaryPart) ??
    matchCategory(fullNorm) ?? { bloque: 'Conocimientos', tema: 'Normas' }
  );
}

/**
 * Busca opciones A), B), C), D) o A., B., C., D. en cualquier parte del bloque,
 * sin importar si están en una tabla, separadas por saltos o pegadas sin espacios.
 * También detecta formato binario "De acuerdo / En desacuerdo".
 */
export function parseOptionsText(rawOptions: string): {
  tipo: TipoPregunta;
  opciones: QuestionOption[];
  valid: boolean;
} {
  const cleaned = rawOptions
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();

  if (!cleaned) {
    return { tipo: 'multiple', opciones: [], valid: false };
  }

  const letters = ['A', 'B', 'C', 'D'] as const;

  const findOptionMarkers = (preferMode: 'paren' | 'dot' | 'mixed') => {
    const markers: Array<{ letter: string; matchStart: number; contentStart: number }> = [];
    let cursor = 0;

    for (const letter of letters) {
      const slice = cleaned.slice(cursor);
      let match: RegExpExecArray | null = null;

      if (preferMode === 'paren' || preferMode === 'mixed') {
        const parenRegex = new RegExp(`(?<!\\()${letter}\\)\\s*`);
        match = parenRegex.exec(slice);
      }

      if (!match && (preferMode === 'dot' || preferMode === 'mixed')) {
        const dotPattern =
          letter === 'C'
            ? `(?<!D\\.)C\\.\\s*`
            : letter === 'D'
              ? `D\\.(?!C\\.)\\s*`
              : letter === 'A'
                ? `(?<!S\\.)A\\.(?!C\\.)\\s*`
                : `${letter}\\.\\s*`;
        const dotRegex = new RegExp(dotPattern);
        match = dotRegex.exec(slice);
      }

      if (!match) {
        break;
      }

      markers.push({
        letter,
        matchStart: cursor + match.index,
        contentStart: cursor + match.index + match[0].length,
      });
      cursor = cursor + match.index + match[0].length;
    }

    return markers;
  };

  let markers = findOptionMarkers('paren');
  if (markers.length < 2) {
    const dotMarkers = findOptionMarkers('dot');
    if (dotMarkers.length > markers.length) {
      markers = dotMarkers;
    }
  }
  if (markers.length < 2) {
    const mixedMarkers = findOptionMarkers('mixed');
    if (mixedMarkers.length > markers.length) {
      markers = mixedMarkers;
    }
  }

  if (markers.length >= 2) {
    const opciones: QuestionOption[] = markers.map((m, idx) => {
      const endIdx = idx + 1 < markers.length ? markers[idx + 1].matchStart : cleaned.length;
      const text = cleaned
        .slice(m.contentStart, endIdx)
        .replace(/\s+/g, ' ')
        .trim();
      return {
        key: m.letter,
        text: text || `Opción ${m.letter}`,
      };
    });

    const norm0 = normalizeStr(opciones[0]?.text || '');
    const norm1 = normalizeStr(opciones[1]?.text || '');
    if (opciones.length === 2 && norm0.includes('de acuerdo') && norm1.includes('en desacuerdo')) {
      return {
        tipo: 'binary',
        opciones: [
          { key: 'De acuerdo', text: 'De acuerdo' },
          { key: 'En desacuerdo', text: 'En desacuerdo' },
        ],
        valid: true,
      };
    }

    return { tipo: 'multiple', opciones, valid: true };
  }

  // Formato binario "De acuerdo / En desacuerdo"
  const norm = normalizeStr(cleaned);
  if (norm.includes('de acuerdo') && norm.includes('en desacuerdo')) {
    return {
      tipo: 'binary',
      opciones: [
        { key: 'De acuerdo', text: 'De acuerdo' },
        { key: 'En desacuerdo', text: 'En desacuerdo' },
      ],
      valid: true,
    };
  }

  return { tipo: 'multiple', opciones: [], valid: false };
}

/**
 * Toma la letra (A, B, C o D) que sigue inmediatamente después de "Respuesta Correcta:".
 */
export function resolveCorrectAnswer(
  rawAnswer: string,
  tipo: TipoPregunta,
  opciones: QuestionOption[]
): string {
  const cleaned = rawAnswer.replace(/\u00a0/g, ' ').trim();

  if (tipo === 'binary') {
    const norm = normalizeStr(cleaned);
    if (norm.includes('desacuerdo') || norm === 'b' || norm === '2') {
      return 'En desacuerdo';
    }
    return 'De acuerdo';
  }

  const trimmed = cleaned.replace(/^[\s:\-*("']+/, '').replace(/^opci[oó]n\s*/i, '');
  const immediateLetter = trimmed.match(/^([A-Da-d])/);
  if (immediateLetter) {
    const letter = immediateLetter[1].toUpperCase();
    if (opciones.some((o) => o.key === letter)) {
      return letter;
    }
    return letter;
  }

  const anyLetter = trimmed.match(/([A-Da-d])\s*[).:\-\s]/);
  if (anyLetter) {
    const letter = anyLetter[1].toUpperCase();
    if (opciones.some((o) => o.key === letter)) {
      return letter;
    }
  }

  const norm = normalizeStr(cleaned);
  if (norm.length >= 3) {
    const byText = opciones.find(
      (o) =>
        normalizeStr(o.text) === norm ||
        normalizeStr(o.text).includes(norm) ||
        norm.includes(normalizeStr(o.text))
    );
    if (byText) return byText.key;
  }

  return opciones[0]?.key || 'A';
}

/**
 * Busca la primera posición donde comienzan las opciones dentro de un bloque:
 * ya sea "Opciones:", o directamente "A)" / "A.", o "De acuerdo / En desacuerdo".
 */
function findOptionsRegionStart(block: string): {
  headerStart: number;
  contentStart: number;
} | null {
  const opcionesLabelMatch = /Opciones\s*:/i.exec(block);
  if (opcionesLabelMatch && opcionesLabelMatch.index !== undefined) {
    return {
      headerStart: opcionesLabelMatch.index,
      contentStart: opcionesLabelMatch.index + opcionesLabelMatch[0].length,
    };
  }

  // Respaldo flexible si en tabla no aparece la etiqueta "Opciones:"
  const standaloneOpciones = /(?:^|\n)\s*Opciones\s*\n/i.exec(block);
  if (standaloneOpciones && standaloneOpciones.index !== undefined) {
    return {
      headerStart: standaloneOpciones.index,
      contentStart: standaloneOpciones.index + standaloneOpciones[0].length,
    };
  }

  // Si aparecen "A)" o "A." directamente después del enunciado
  const directParenA = /(?<!\()A\)\s*/.exec(block);
  if (directParenA && directParenA.index !== undefined && directParenA.index > 8) {
    return {
      headerStart: directParenA.index,
      contentStart: directParenA.index,
    };
  }

  const directDotA = /(?<![A-Za-z])A\.\s+/.exec(block);
  if (directDotA && directDotA.index !== undefined && directDotA.index > 8) {
    return {
      headerStart: directDotA.index,
      contentStart: directDotA.index,
    };
  }

  // Actitudes binarias en bloque de texto
  const binaryMatch = /De\s+acuerdo\s*(?:\/|\||\n)\s*En\s+desacuerdo/i.exec(block);
  if (binaryMatch && binaryMatch.index !== undefined && binaryMatch.index > 8) {
    return {
      headerStart: binaryMatch.index,
      contentStart: binaryMatch.index,
    };
  }

  return null;
}

/**
 * Divide texto plano completo buscando cada "Evento / Caso:" o "Pregunta X:"
 * (sin depender del emoji 📌) y fusiona pares Evento/Caso + Pregunta X en un solo bloque.
 */
export function parsePinBlocksFromText(rawText: string): {
  questions: ParsedQuestionPreview[];
  skipped: number;
} {
  const results: ParsedQuestionPreview[] = [];
  let skipped = 0;

  const cleanText = rawText
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/📌/g, '\n');

  // 1. Divide buscando cada vez que aparezca "Evento / Caso:" o "Pregunta [número]:"
  const boundaryRegex =
    /(?=(?:Evento\s*\/\s*Caso|Evento\s+o\s+Caso|Pregunta\s*(?:n[°ºo.]*|#)?\s*\d+)\s*:)/gi;

  const rawChunks = cleanText
    .split(boundaryRegex)
    .map((c) => c.trim())
    .filter(Boolean);

  // Descarta el preámbulo inicial del documento si no empieza por Evento/Caso o Pregunta X:
  const startsWithMarker = (s: string) =>
    /^(?:Evento\s*\/\s*Caso|Evento\s+o\s+Caso|Pregunta\s*(?:n[°ºo.]*|#)?\s*\d+)\s*:/i.test(s);

  const markerChunks = rawChunks.filter((chunk, i) => !(i === 0 && !startsWithMarker(chunk)));

  // 2. Agrupa pares consecutivos (Evento / Caso: ... + Pregunta X: ...) dentro del mismo bloque
  const hasAnyOptions = (s: string) =>
    /Opciones\s*:/i.test(s) ||
    (/(?<!\()A\)/.test(s) && /(?<!\()B\)/.test(s)) ||
    (/(?<![A-Za-z])A\./.test(s) && /(?<![A-Za-z])B\./.test(s)) ||
    (/de\s+acuerdo/i.test(s) && /en\s+desacuerdo/i.test(s));

  const blocks: string[] = [];
  for (const chunk of markerChunks) {
    const prev = blocks[blocks.length - 1];
    if (
      prev &&
      !hasAnyOptions(prev) &&
      /^Pregunta\s*(?:n[°ºo.]*|#)?\s*\d+\s*:/i.test(chunk)
    ) {
      blocks[blocks.length - 1] = `${prev}\n\n${chunk}`;
    } else if (
      prev &&
      !hasAnyOptions(prev) &&
      /^Pregunta\s*(?:n[°ºo.]*|#)?\s*\d+\s*:/i.test(prev) &&
      /^(?:Evento\s*\/\s*Caso|Evento\s+o\s+Caso)\s*:/i.test(chunk)
    ) {
      blocks[blocks.length - 1] = `${prev}\n\n${chunk}`;
    } else {
      blocks.push(chunk);
    }
  }

  blocks.forEach((block, idx) => {
    try {
      const optionsLoc = findOptionsRegionStart(block);
      if (!optionsLoc) {
        skipped += 1;
        return;
      }

      // Enunciado: todo antes de las opciones, uniendo texto de "Evento / Caso:" y "Pregunta X:"
      let rawEnunciado = block.slice(0, optionsLoc.headerStart);
      rawEnunciado = rawEnunciado.replace(
        /^(?:Evento\s*\/\s*Caso|Evento\s+o\s+Caso)\s*:\s*/i,
        ''
      );

      const enunciado = rawEnunciado
        .split('\n')
        .map((line) => line.replace(/[ \t]+/g, ' ').trim())
        .filter(Boolean)
        .join('\n')
        .replace(/\s+(?=Pregunta\s*(?:n[°ºo.]*|#)?\s*\d+\s*:)/gi, '\n\n')
        .trim();

      if (!enunciado || enunciado.length < 4) {
        skipped += 1;
        return;
      }

      const afterOptionsStart = block.slice(optionsLoc.contentStart);

      // Respuesta Correcta (case-insensitive)
      const respuestaMatch =
        /Respuesta\s*Correcta\s*:/i.exec(afterOptionsStart) ||
        /\n\s*Respuesta\s*:/i.exec(afterOptionsStart);

      // Módulo y Tema (si existe)
      const moduloMatchInBlock = /M[oó]dulo\s*y\s*Tema(?:\s*Aulapp)?\s*:/i.exec(
        afterOptionsStart
      );

      let rawOptionsSection = afterOptionsStart;
      let rawRespuestaSlice = '';
      let rawModulo = '';

      if (respuestaMatch && respuestaMatch.index !== undefined) {
        rawOptionsSection = afterOptionsStart.slice(0, respuestaMatch.index).trim();
        const afterRespuesta = afterOptionsStart.slice(
          respuestaMatch.index + respuestaMatch[0].length
        );
        const modAfterResp = /M[oó]dulo\s*y\s*Tema(?:\s*Aulapp)?\s*:/i.exec(afterRespuesta);
        if (modAfterResp && modAfterResp.index !== undefined) {
          rawRespuestaSlice = afterRespuesta.slice(0, modAfterResp.index).trim();
          rawModulo = afterRespuesta
            .slice(modAfterResp.index + modAfterResp[0].length)
            .split(/\n\s*(?:Explicaci[oó]n|Justificaci[oó]n)\s*:/i)[0]
            .replace(/\s+/g, ' ')
            .trim();
        } else {
          rawRespuestaSlice = afterRespuesta.trim();
        }
      } else if (moduloMatchInBlock && moduloMatchInBlock.index !== undefined) {
        rawOptionsSection = afterOptionsStart.slice(0, moduloMatchInBlock.index).trim();
        rawModulo = afterOptionsStart
          .slice(moduloMatchInBlock.index + moduloMatchInBlock[0].length)
          .replace(/\s+/g, ' ')
          .trim();
      }

      const { tipo, opciones, valid } = parseOptionsText(rawOptionsSection);
      if (!valid || opciones.length < 2) {
        skipped += 1;
        return;
      }

      const respuestaCorrecta = resolveCorrectAnswer(rawRespuestaSlice, tipo, opciones);
      const inferred = inferBloqueAndTema(rawModulo || '');
      const bloque: BloqueCale = tipo === 'binary' && !rawModulo ? 'Actitudes' : inferred.bloque;
      const tema: TemaOficial = tipo === 'binary' && !rawModulo ? 'Actitudes' : inferred.tema;

      let warning: string | undefined;
      if (!rawRespuestaSlice) {
        warning = 'Sin "Respuesta Correcta:" explícita; se asignó la primera opción.';
      }

      results.push({
        tempId: `txt-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        sourceFormat: 'texto',
        bloque,
        tema,
        tipo,
        enunciado,
        opciones,
        respuestaCorrecta,
        explicacion: `Pregunta de ${
          tema === 'Normas'
            ? 'Normas de Tránsito'
            : tema === 'Señales'
              ? 'Señalización'
              : tema === 'Vehículo'
                ? 'El Vehículo'
                : tema
        } (${bloque}) cargada desde Word.`,
        moduloAulapp: rawModulo || undefined,
        warning,
      });
    } catch {
      skipped += 1;
    }
  });

  return { questions: results, skipped };
}

/**
 * Mantiene detección para documentos estructurados como tablas de Actitudes
 * ("De acuerdo / En desacuerdo") u otras tablas clásicas de Word.
 */
function parseTablesFromHtml(html: string): {
  questions: ParsedQuestionPreview[];
  skipped: number;
} {
  const results: ParsedQuestionPreview[] = [];
  let skipped = 0;

  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const tables = Array.from(doc.querySelectorAll('table'));

    tables.forEach((table, tIdx) => {
      const rows = Array.from(table.querySelectorAll('tr'));
      rows.forEach((row, rIdx) => {
        try {
          const cells = Array.from(row.querySelectorAll('td, th')).map((cell) => {
            const clone = cell.cloneNode(true) as HTMLElement;
            clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
            clone.querySelectorAll('p, li').forEach((p) => {
              p.append('\n');
            });
            return (clone.textContent || '').replace(/\n{2,}/g, '\n').trim();
          });

          if (cells.length < 4) return;

          // Ignora subtablas internas de opciones (ej. | A) ... | B) ... | C) ... | D) ... |)
          if (/^[A-Da-d]\s*[).:]/.test(cells[0]) || /^opciones\s*:?$/i.test(cells[0])) {
            return;
          }

          const offset = cells.length >= 5 ? 1 : 0;
          const rawTopic = cells[offset] || '';
          const rawEnunciado = cells[offset + 1] || '';
          const rawOpciones = cells[offset + 2] || '';
          const rawRespuesta = cells[offset + 3] || '';
          const rawExplicacion = cells[offset + 4] || '';

          const headerTest = normalizeStr(
            `${rawTopic} ${rawEnunciado} ${rawOpciones} ${rawRespuesta}`
          );
          if (
            rIdx === 0 &&
            (headerTest.includes('enunciado') ||
              headerTest.includes('pregunta') ||
              headerTest.includes('respuesta correcta') ||
              headerTest.includes('opciones'))
          ) {
            return;
          }

          if (!rawEnunciado || rawEnunciado.length < 6) {
            skipped += 1;
            return;
          }

          const { bloque, tema } = inferBloqueAndTema(rawTopic);
          const { tipo, opciones, valid } = parseOptionsText(rawOpciones);
          if (!valid || opciones.length < 2) {
            skipped += 1;
            return;
          }

          const respuestaCorrecta = resolveCorrectAnswer(rawRespuesta, tipo, opciones);
          const finalBloque: BloqueCale =
            tipo === 'binary' ||
            normalizeStr(rawTopic).includes('actitud') ||
            normalizeStr(rawTopic).includes('bloque 2')
              ? 'Actitudes'
              : bloque;
          const finalTema: TemaOficial = finalBloque === 'Actitudes' ? 'Actitudes' : tema;

          results.push({
            tempId: `tbl-${tIdx}-${rIdx}-${Math.random().toString(36).slice(2, 6)}`,
            sourceFormat: 'tabla',
            bloque: finalBloque,
            tema: finalTema,
            tipo,
            enunciado: rawEnunciado,
            opciones,
            respuestaCorrecta,
            explicacion:
              rawExplicacion ||
              `Pregunta de ${finalTema} (${finalBloque}) importada desde tabla Word.`,
            moduloAulapp: rawTopic || undefined,
          });
        } catch {
          skipped += 1;
        }
      });
    });
  } catch {
    // Continúa con el resultado de texto plano
  }

  return { questions: results, skipped };
}

function buildRawTextPreview(rawText: string): string {
  const lines = rawText
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return '(El archivo .docx no devolvió texto legible con mammoth.extractRawText)';
  }

  return lines.slice(0, 18).join('\n').slice(0, 1200);
}

export async function parseDocxFile(file: File): Promise<{
  questions: ParsedQuestionPreview[];
  textCount: number;
  tableCount: number;
  skippedCount: number;
  rawTextPreview: string;
}> {
  const arrayBuffer = await file.arrayBuffer();

  const [textResult, htmlResult] = await Promise.all([
    mammoth.extractRawText({ arrayBuffer }),
    mammoth.convertToHtml({ arrayBuffer }).catch(() => ({ value: '' })),
  ]);

  const rawTextPreview = buildRawTextPreview(textResult.value || '');
  const textParsed = parsePinBlocksFromText(textResult.value || '');
  const tableParsed = htmlResult.value
    ? parseTablesFromHtml(htmlResult.value)
    : { questions: [], skipped: 0 };

  const seen = new Set<string>();
  const combined: ParsedQuestionPreview[] = [];

  for (const q of [...textParsed.questions, ...tableParsed.questions]) {
    const key = normalizeStr(q.enunciado).slice(0, 140);
    if (!seen.has(key)) {
      seen.add(key);
      combined.push(q);
    }
  }

  return {
    questions: combined,
    textCount: textParsed.questions.length,
    tableCount: tableParsed.questions.length,
    skippedCount: textParsed.skipped + tableParsed.skipped,
    rawTextPreview,
  };
}

export function previewToQuestionInput(
  p: ParsedQuestionPreview
): Omit<Question, 'id' | 'createdAt'> {
  return {
    bloque: p.bloque,
    tema: p.tema,
    tipo: p.tipo,
    caso: p.caso,
    enunciado: p.enunciado,
    opciones: p.opciones,
    respuestaCorrecta: p.respuestaCorrecta,
    explicacion: p.explicacion,
    moduloAulapp: p.moduloAulapp,
  };
}
