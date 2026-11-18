import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo.tsx';
import { PWAInstallButton } from './PWAInstallButton.tsx';
import { loginWithCode } from '../utils/api.ts';
import type { AuthSession } from '../types/cale.ts';

interface LoginScreenProps {
  onSuccess: (session: AuthSession) => void;
  sessionNotice?: string | null;
}

function formatLoginError(err: unknown): string {
  if (!(err instanceof Error)) return 'No fue posible validar la clave.';
  if (err.message.startsWith('{') && err.message.includes('operationType')) {
    return 'No se pudo conectar con Cloud Firestore. Verifica tu conexión a internet e intenta de nuevo.';
  }
  return err.message;
}

export function LoginScreen({ onSuccess, sessionNotice }: LoginScreenProps) {
  const [code, setCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(sessionNotice || null);
  const [imgFailed, setImgFailed] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      setError('Ingresa tu clave de acceso para continuar.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const session = await loginWithCode(code.trim());
      onSuccess(session);
    } catch (err) {
      setError(formatLoginError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemo = async () => {
    setCode('PRUEBA123');
    setLoading(true);
    setError(null);
    try {
      const session = await loginWithCode('PRUEBA123');
      onSuccess(session);
    } catch (err) {
      setError(formatLoginError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col lg:flex-row">
      {/* Left column: Access Form */}
      <div className="w-full lg:w-[52%] bg-white flex flex-col justify-between px-6 py-8 sm:px-12 lg:px-16 xl:px-24 border-r border-slate-200">
        <div className="flex items-center justify-between">
          <BrandLogo variant="dark" size="lg" />
          <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
            Colombia · Estándar CALE
          </span>
        </div>

        <main className="my-auto py-12 max-w-md w-full mx-auto lg:mx-0">
          <p className="text-sm font-semibold text-[#1D4ED8] mb-3">
            Simulador Oficial de Conducción Teórica
          </p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight leading-tight [text-wrap:balance]">
            Prepárate con Pre Examen para aprobar el teórico CALE
          </h1>
          <p className="mt-4 text-base text-slate-600 leading-relaxed">
            Entrena bajo la estructura oficial de evaluación en Colombia: 40 preguntas en 70
            minutos, división estricta entre Conocimientos y Actitudes, y revisión normativa
            detallada.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label
                htmlFor="access-code-input"
                className="block text-sm font-semibold text-slate-900 mb-2"
              >
                Clave de Acceso
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                  <KeyRound className="h-5 w-5" />
                </div>
                <input
                  id="access-code-input"
                  type={showCode ? 'text' : 'password'}
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase());
                    if (error) setError(null);
                  }}
                  placeholder="Ingresa tu clave (ej. PRUEBA123)"
                  autoComplete="off"
                  autoFocus
                  className="w-full rounded-xl border border-slate-300 bg-white pl-11 pr-12 py-3.5 font-mono text-base tracking-wider text-slate-900 placeholder:font-sans placeholder:tracking-normal placeholder:text-slate-400 focus:border-[#1D4ED8] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowCode((prev) => !prev)}
                  aria-label={showCode ? 'Ocultar clave' : 'Mostrar clave'}
                  className="absolute inset-y-0 right-0 flex items-center px-3.5 text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
                >
                  {showCode ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#EF4444]"
              >
                <AlertCircle className="h-5 w-5 shrink-0 text-[#EF4444] mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#1D4ED8] px-6 py-3.5 text-base font-semibold text-white hover:bg-[#1E40AF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] focus-visible:ring-offset-2 disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap"
            >
              <span>{loading ? 'Validando clave...' : 'Ingresar a Pre Examen'}</span>
              <ArrowRight className="h-5 w-5" />
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-sm text-slate-600">
              Clave de prueba activa:{' '}
              <span className="font-mono font-semibold text-slate-900">PRUEBA123</span>
            </div>
            <button
              type="button"
              onClick={handleQuickDemo}
              disabled={loading}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-600/30 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>Probar como estudiante</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-4">
            <PWAInstallButton variant="banner" />
          </div>
        </main>

        <footer className="pt-6 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <span>Pre Examen · Preparación Teórica CALE</span>
          <span>5 Núcleos Temáticos Oficiales · Ley 769 de 2002</span>
        </footer>
      </div>

      {/* Right column: Editorial Colombian Road Visual & Official Standard Summary */}
      <div className="w-full lg:w-[48%] bg-slate-900 relative min-h-[380px] lg:min-h-screen flex flex-col justify-end overflow-hidden">
        {!imgFailed ? (
          <img
            src="/src/assets/images/hero_cale_road_1794980901087.jpg"
            alt="Intersección vial en Colombia con demarcación peatonal, semáforos y señalización preventiva"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-950 to-emerald-950" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/75 to-slate-950/20" />

        <div className="relative z-10 p-8 sm:p-12 lg:p-14 text-white space-y-6">
          <div className="max-w-lg">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#10B981] mb-2">
              Estructura Oficial de Evaluación CALE
            </p>
            <h2 className="font-display text-2xl font-bold text-white leading-snug [text-wrap:balance]">
              Calificación independiente por bloques de competencia
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
            <div className="rounded-xl bg-slate-900/85 border border-white/15 p-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-[#10B981] text-sm font-semibold">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Bloque I · Conocimientos</span>
              </div>
              <p className="mt-1.5 text-xs text-slate-300 leading-relaxed">
                28 preguntas en 4 núcleos temáticos. Mínimo{' '}
                <span className="font-mono font-semibold text-white">80%</span> para aprobar.
              </p>
            </div>
            <div className="rounded-xl bg-slate-900/85 border border-white/15 p-4 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-[#10B981] text-sm font-semibold">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                <span>Bloque II · Actitudes</span>
              </div>
              <p className="mt-1.5 text-xs text-slate-300 leading-relaxed">
                12 preguntas de comportamiento seguro. Mínimo{' '}
                <span className="font-mono font-semibold text-white">80%</span> independiente.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
