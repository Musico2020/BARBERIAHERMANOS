import { supabase } from '../lib/supabase';

// Acceso de administrador con Supabase Auth. Además de tener usuario, el correo
// debe estar en la tabla admin_users (lo revisa la función is_admin del servidor).

export type AdminLoginError = 'INVALID_CREDENTIALS' | 'NOT_ADMIN' | 'UNKNOWN';

export class AdminAuthError extends Error {
  constructor(public code: AdminLoginError, public cause?: unknown) {
    super(code);
    this.name = 'AdminAuthError';
  }
}

async function isAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_admin');
  if (error) throw error;
  return data === true;
}

export async function signInAdmin(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) {
    throw new AdminAuthError(error.status === 400 ? 'INVALID_CREDENTIALS' : 'UNKNOWN', error);
  }
  if (!(await isAdmin())) {
    await supabase.auth.signOut();
    throw new AdminAuthError('NOT_ADMIN');
  }
}

/** true si ya hay una sesión guardada de un administrador (por ejemplo, al recargar la página). */
export async function hasAdminSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return false;
  try {
    return await isAdmin();
  } catch (err) {
    console.error('No se pudo verificar la sesión de administrador', err);
    return false;
  }
}

export async function signOutAdmin(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) console.error('Error al cerrar sesión', error);
}


/** Cambia la contraseña del administrador. Pide la actual para confirmar que es la misma persona. */
export async function changeAdminPassword(currentPassword: string, newPassword: string): Promise<void> {
  if (newPassword.length < 8) throw new Error('La contraseña nueva debe tener al menos 8 caracteres');
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email;
  if (!email) throw new AdminAuthError('UNKNOWN');
  const check = await supabase.auth.signInWithPassword({ email, password: currentPassword });
  if (check.error) throw new AdminAuthError('INVALID_CREDENTIALS', check.error);
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new AdminAuthError('UNKNOWN', error);
}

export async function currentAdminEmail(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  return data.user?.email ?? '';
}
