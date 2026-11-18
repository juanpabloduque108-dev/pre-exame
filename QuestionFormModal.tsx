import { useState } from 'react';
import type { FormEvent } from 'react';
import { X, Save } from 'lucide-react';
import type {
  BloqueCale,
  Question,
  QuestionOption,
  TemaOficial,
  TipoPregunta,
} from '../types/cale.ts';
import { TEMAS_OFICIALES } from '../types/cale.ts';

interface QuestionFormModalProps {
  initialQuestion?: Question | null;
  onClose: () => void;
  onSave: (payload: Omit<Question, 'id' | 'createdAt'>) => Promise<void>;
}

export function QuestionFormModal({
  initialQuestion,
  onClose,
  onSave,
}: QuestionFormModalProps) {
  const [tema, setTema] = useState<TemaOficial>(initialQuestion?.tema || 'Normas');
  const [bloque, setBloque] = useState<BloqueCale>(initialQuestion?.bloque || 'Conocimientos');
  const [tipo, setTipo] = useState<TipoPregunta>(initialQuestion?.tipo || 'multiple');
  const [caso, setCaso] = useState(initialQuestion?.caso || '');
  const [enunciado, setEnunciado] = useState(initialQuestion?.enunciado || '');
  const [moduloAulapp, setModuloAulapp] = useState(initialQuestion?.moduloAulapp || '');
  const [explicacion, setExplicacion] = useState(initialQuestion?.explicacion || '');

  const defaultOpts =
    initialQuestion?.tipo === 'multiple' && initialQuestion.opciones.length === 4
      ? initialQuestion.opciones
      : [
          { key: 'A', text: initialQuestion?.opciones[0]?.text || '' },
          { key: 'B', text: initialQuestion?.opciones[1]?.text || '' },
          { key: 'C', text: initialQuestion?.opciones[2]?.text || '' },
          { key: 'D', text: initialQuestion?.opciones[3]?.text || '' },
        ];

  const [optA, setOptA] = useState(defaultOpts[0]?.text || '');
  const [optB, setOptB] = useState(defaultOpts[1]?.text || '');
  const [optC, setOptC] = useState(defaultOpts[2]?.text || '');
  const [optD, setOptD] = useState(defaultOpts[3]?.text || '');

  const [respuestaCorrecta, setRespuestaCorrecta] = useState<string>(
    initialQuestion?.respuestaCorrecta || (tipo === 'binary' ? 'De acuerdo' : 'A')
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTemaChange = (nextTema: TemaOficial) => {
    setTema(nextTema);
    setBloque(nextTema === 'Actitudes' ? 'Actitudes' : 'Conocimientos');
  };

  const handleTipoChange = (nextTipo: TipoPregunta) => {
    setTipo(nextTipo);
    if (nextTipo === 'binary') {
      setRespuestaCorrecta('De acuerdo');
    } else {
      setRespuestaCorrecta('A');
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!enunciado.trim()) {
      setError('El enunciado de la pregunta es obligatorio.');
      return;
    }

    let opciones: QuestionOption[];
    if (tipo === 'binary') {
      opciones = [
        { key: 'De acuerdo', text: 'De acuerdo' },
        { key: 'En desacuerdo', text: 'En desacuerdo' },
      ];
    } else {
      if (!optA.trim() || !optB.trim() || !optC.trim() || !optD.trim()) {
        setError('Completa las cuatro opciones (A, B, C y D).');
        return;
      }
      opciones = [
        { key: 'A', text: optA.trim() },
        { key: 'B', text: optB.trim() },
        { key: 'C', text: optC.trim() },
        { key: 'D', text: optD.trim() },
      ];
    }

    setSaving(true);
    setError(null);
    try {
      await onSave({
        bloque,
        tema,
        tipo,
        caso: caso.trim() || undefined,
        enunciado: enunciado.trim(),
        opciones,
        respuestaCorrecta,
        explicacion:
          explicacion.trim() ||
          'Revisa la normativa colombiana vigente en el Código Nacional de Tránsito.',
        moduloAulapp: moduloAulapp.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la pregunta.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 p-4 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="question-modal-title"
    >
      <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 id="question-modal-title" className="font-display text-lg font-bold text-navy-900">
            {initialQuestion ? 'Editar Pregunta' : 'Agregar Pregunta Manualmente'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-navy-900 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Tema Oficial CALE
              </label>
              <select
                value={tema}
                onChange={(e) => handleTemaChange(e.target.value as TemaOficial)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-navy-900 focus:border-navy-800 focus:outline-none"
              >
                {TEMAS_OFICIALES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Bloque de Evaluación
              </label>
              <select
                value={bloque}
                onChange={(e) => setBloque(e.target.value as BloqueCale)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-navy-900 focus:border-navy-800 focus:outline-none"
              >
                <option value="Conocimientos">Bloque 1 · Conocimientos</option>
                <option value="Actitudes">Bloque 2 · Actitudes</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Formato de Respuesta
              </label>
              <select
                value={tipo}
                onChange={(e) => handleTipoChange(e.target.value as TipoPregunta)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-navy-900 focus:border-navy-800 focus:outline-none"
              >
                <option value="multiple">4 Opciones (A, B, C, D)</option>
                <option value="binary">2 Opciones (De acuerdo / En desacuerdo)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Evento / Caso (Opcional)
            </label>
            <textarea
              rows={2}
              value={caso}
              onChange={(e) => setCaso(e.target.value)}
              placeholder="Situación contextual previa a la pregunta (opcional)..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-navy-900 focus:border-navy-800 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Enunciado de la Pregunta *
            </label>
            <textarea
              rows={3}
              required
              value={enunciado}
              onChange={(e) => setEnunciado(e.target.value)}
              placeholder="Escribe el enunciado claro de la pregunta..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-navy-900 focus:border-navy-800 focus:outline-none"
            />
          </div>

          {tipo === 'multiple' ? (
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-700">
                Opciones de Respuesta (marca la correcta)
              </label>
              {(
                [
                  { key: 'A', val: optA, set: setOptA },
                  { key: 'B', val: optB, set: setOptB },
                  { key: 'C', val: optC, set: setOptC },
                  { key: 'D', val: optD, set: setOptD },
                ] as const
              ).map((item) => (
                <div key={item.key} className="flex items-center gap-3">
                  <label className="inline-flex items-center gap-2 shrink-0 cursor-pointer">
                    <input
                      type="radio"
                      name="correct-multiple"
                      checked={respuestaCorrecta === item.key}
                      onChange={() => setRespuestaCorrecta(item.key)}
                      className="h-4 w-4 accent-emerald-600"
                    />
                    <span className="font-mono text-sm font-bold text-navy-900 w-5">
                      {item.key})
                    </span>
                  </label>
                  <input
                    type="text"
                    required
                    value={item.val}
                    onChange={(e) => item.set(e.target.value)}
                    placeholder={`Texto de la opción ${item.key}`}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-navy-900 focus:border-navy-800 focus:outline-none"
                  />
                </div>
              ))}
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Respuesta Correcta (Formato Actitudinal)
              </label>
              <div className="grid grid-cols-2 gap-3">
                {(['De acuerdo', 'En desacuerdo'] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setRespuestaCorrecta(opt)}
                    className={`rounded-xl border px-4 py-3 text-sm font-semibold transition-colors cursor-pointer ${
                      respuestaCorrecta === opt
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Módulo / Referencia Aulapp (Opcional)
              </label>
              <input
                type="text"
                value={moduloAulapp}
                onChange={(e) => setModuloAulapp(e.target.value)}
                placeholder="Ej. Módulo 2 · Normas de Tránsito"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-navy-900 focus:border-navy-800 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Explicación Normativa (para Repaso de Errores)
              </label>
              <input
                type="text"
                value={explicacion}
                onChange={(e) => setExplicacion(e.target.value)}
                placeholder="Artículo o fundamento de la respuesta correcta..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-navy-900 focus:border-navy-800 focus:outline-none"
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors cursor-pointer"
            >
              <Save className="h-4 w-4" />
              <span>{saving ? 'Guardando...' : 'Guardar Pregunta'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
