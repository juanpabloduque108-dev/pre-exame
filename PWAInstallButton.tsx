import { useState } from 'react';
import { CheckCircle2, Download, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';

interface PWAInstallButtonProps {
  variant?: 'banner' | 'header';
}

export function PWAInstallButton({ variant = 'banner' }: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  const handleClick = async () => {
    if (isInstallable && !isInstalled && !isIOS) {
      const accepted = await install();
      if (accepted) return;
    }
    setShowGuideModal(true);
  };

  return (
    <>
      {variant === 'banner' ? (
        <button
          type="button"
          onClick={handleClick}
          className="w-full inline-flex items-center justify-center gap-2.5 rounded-xl border border-[#1D4ED8]/25 bg-blue-50/80 px-4 py-3 text-sm font-semibold text-[#1D4ED8] hover:bg-blue-100/80 transition-colors cursor-pointer"
        >
          <Download className="h-4 w-4 shrink-0" />
          <span>Instalar App en tu Celular o PC</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          title="Instalar App en tu Celular o PC"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#1D4ED8] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1E40AF] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Download className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden lg:inline">Instalar App en tu Celular o PC</span>
          <span className="lg:hidden">Instalar App</span>
        </button>
      )}

      {showGuideModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-guide-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="h-10 w-10 rounded-xl bg-[#1D4ED8] text-white flex items-center justify-center font-display font-extrabold text-sm shrink-0">
                  PE
                </div>
                <div>
                  <h2 id="pwa-guide-title" className="font-display text-base font-bold text-slate-900">
                    Instalar Pre Examen en tu dispositivo
                  </h2>
                  <p className="text-xs text-slate-500">
                    Acceso directo desde tu pantalla de inicio
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                aria-label="Cerrar"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {isInstalled ? (
              <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-900">
                <CheckCircle2 className="h-4 w-4 text-[#10B981] shrink-0 mt-0.5" />
                <span>
                  <strong>Pre Examen ya está instalada</strong> o ejecutándose como aplicación en
                  este dispositivo.
                </span>
              </div>
            ) : null}

            <div className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-4 space-y-3 text-sm text-slate-700">
              <p className="font-semibold text-slate-900 flex items-center gap-2 text-xs uppercase tracking-wide">
                <Smartphone className="h-4 w-4 text-[#1D4ED8]" />
                <span>
                  {isIOS
                    ? 'Cómo instalar en iPhone / iPad (Safari)'
                    : 'Cómo instalar en iPhone, Android o PC'}
                </span>
              </p>

              <p className="text-sm text-slate-800 leading-relaxed">
                Toca el botón <strong>Compartir</strong> abajo y elige{' '}
                <strong>&apos;Agregar a pantalla de inicio&apos;</strong>.
              </p>

              <ol className="space-y-2 text-xs text-slate-600 pt-1">
                <li className="flex items-start gap-2.5">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#1D4ED8] text-white font-bold shrink-0">
                    1
                  </span>
                  <span>
                    En iPhone (Safari): toca el ícono{' '}
                    <Share className="inline h-3.5 w-3.5 text-[#1D4ED8] mx-0.5" />{' '}
                    <strong>Compartir</strong> en la barra inferior del navegador.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#1D4ED8] text-white font-bold shrink-0">
                    2
                  </span>
                  <span>
                    Desliza hacia abajo y selecciona{' '}
                    <strong>&quot;Agregar a pantalla de inicio&quot;</strong> →{' '}
                    <strong>Agregar</strong>.
                  </span>
                </li>
              </ol>

              {!isIOS && !isInstalled && (
                <p className="pt-2 border-t border-slate-200 text-xs text-slate-500">
                  En Android (Chrome) o PC (Chrome / Edge): también puedes abrir el menú del
                  navegador (⋮) y elegir <strong>&quot;Instalar aplicación&quot;</strong>.
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="w-full rounded-xl bg-[#1D4ED8] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1E40AF] transition-colors cursor-pointer"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
}
