import { useState } from 'react';
import { Eye, EyeOff, Loader2, Mail, Lock, AlertCircle } from 'lucide-react';
import AuthLayout from '../../components/layout/AuthLayout';
import { signInAdmin, AdminAuthError } from '../../services/adminAuth';

interface Props {
  onLogin: () => void;
}

export default function AdminLogin({ onLogin }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) { setError('Ingresa tu email y tu contraseña.'); return; }
    setLoading(true);
    setError('');
    try {
      await signInAdmin(email, password);
      onLogin();
    } catch (err) {
      console.error('Error al iniciar sesión', err);
      const code = err instanceof AdminAuthError ? err.code : 'UNKNOWN';
      setError(
        code === 'INVALID_CREDENTIALS' ? 'Email o contraseña incorrectos.'
        : code === 'NOT_ADMIN' ? 'Esta cuenta no tiene permisos de administrador.'
        : 'No se pudo iniciar sesión. Revisa tu conexión e intenta de nuevo.',
      );
    } finally {
      setLoading(false);
    }
  };

  const fieldClass =
    'w-full pl-11 pr-4 py-3.5 rounded-xl bg-white/[0.04] border border-white/12 text-white text-base placeholder-zinc-600 focus:outline-none focus:border-gold/60 focus:bg-white/[0.06] transition-colors';

  return (
    <AuthLayout role="admin" title="Panel de administración" subtitle="Ingresa con tu cuenta para gestionar reservas, clientes y la web.">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="admin-email" className="text-xs text-zinc-400 uppercase tracking-wider block mb-2">Email</label>
          <div className="relative">
            <Mail size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-gold/70 pointer-events-none" />
            <input
              id="admin-email"
              type="email"
              autoComplete="username"
              placeholder="tu@correo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={fieldClass}
            />
          </div>
        </div>

        <div>
          <label htmlFor="admin-password" className="text-xs text-zinc-400 uppercase tracking-wider block mb-2">Contraseña</label>
          <div className="relative">
            <Lock size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-gold/70 pointer-events-none" />
            <input
              id="admin-password"
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Tu contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${fieldClass} pr-12`}
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              aria-label={showPw ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center text-zinc-500 hover:text-white"
            >
              {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="flex items-start gap-2 text-red-300 text-sm bg-red-500/10 border border-red-500/25 rounded-xl px-3.5 py-2.5">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full btn-gold py-3.5 rounded-full font-semibold flex items-center justify-center gap-2 mt-2 disabled:opacity-70"
        >
          {loading ? (<><Loader2 size={17} className="animate-spin" /><span>Entrando...</span></>) : <span>Entrar al panel</span>}
        </button>
      </form>
    </AuthLayout>
  );
}
