import { useEffect, useState } from 'react';
import { LoginScreen } from './components/LoginScreen.tsx';
import { AdminDashboard } from './components/AdminDashboard.tsx';
import { StudentDashboard } from './components/StudentDashboard.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { OfflineIndicator } from './components/OfflineIndicator.tsx';
import { loginWithCode, subscribeToStudentKey } from './utils/api.ts';
import type { AuthSession } from './types/cale.ts';

const SESSION_STORAGE_KEY = 'pre_examen_session_v1';

function AppContent() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (!raw) {
          setInitializing(false);
          return;
        }
        const saved = JSON.parse(raw) as AuthSession;
        if (saved?.accessCode) {
          const verified = await loginWithCode(saved.accessCode);
          setSession(verified);
        }
      } catch {
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
      } finally {
        setInitializing(false);
      }
    };
    void restoreSession();
  }, []);

  // Real-time enforcement: if admin blocks, deletes, or changes a student's password remotely,
  // apply immediately to active sessions
  useEffect(() => {
    if (!session || session.role !== 'student' || !session.accessKeyId) return;

    const unsub = subscribeToStudentKey(session.accessKeyId, (liveKey) => {
      if (!liveKey) {
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
        setSession(null);
        setSessionNotice('Tu clave de acceso fue eliminada por el administrador.');
        return;
      }
      if (!liveKey.active) {
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
        setSession(null);
        setSessionNotice('Tu acceso fue bloqueado por el administrador.');
        return;
      }
      if (liveKey.code.toUpperCase() !== session.accessCode.toUpperCase()) {
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
        setSession(null);
        setSessionNotice(
          'Tu contraseña de acceso fue actualizada por el administrador. Ingresa con tu nueva clave.'
        );
        return;
      }
      const expiresMs = new Date(liveKey.expiresAt).getTime();
      if (Number.isFinite(expiresMs) && Date.now() > expiresMs) {
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
        setSession(null);
        setSessionNotice('Tu clave de acceso ha vencido.');
        return;
      }

      if (
        liveKey.studentName !== session.studentName ||
        liveKey.expiresAt !== session.expiresAt
      ) {
        const updated: AuthSession = {
          ...session,
          studentName: liveKey.studentName,
          expiresAt: liveKey.expiresAt,
        };
        setSession(updated);
        try {
          sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(updated));
        } catch {
          // ignore
        }
      }
    });

    return () => unsub();
  }, [session?.role, session?.accessKeyId, session?.accessCode]);

  const handleLoginSuccess = (newSession: AuthSession) => {
    setSessionNotice(null);
    setSession(newSession);
    try {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(newSession));
    } catch {
      // ignore storage errors
    }
  };

  const handleLogout = () => {
    setSession(null);
    setSessionNotice(null);
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
  };

  if (initializing) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <p className="text-sm font-medium text-slate-600">
          Conectando con Pre Examen en la nube...
        </p>
      </div>
    );
  }

  if (!session) {
    return <LoginScreen onSuccess={handleLoginSuccess} sessionNotice={sessionNotice} />;
  }

  if (session.role === 'admin') {
    return <AdminDashboard adminCode={session.accessCode} onLogout={handleLogout} />;
  }

  return (
    <StudentDashboard
      accessKeyId={session.accessKeyId}
      accessCode={session.accessCode}
      studentName={session.studentName || 'Estudiante'}
      onLogout={handleLogout}
    />
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
      <OfflineIndicator />
    </ErrorBoundary>
  );
}
