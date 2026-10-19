import { useState, useEffect, useRef } from 'react';
import { Star, Phone, Edit2, ToggleLeft, ToggleRight, X, Plus, User, Loader2, Camera, Trash2 } from 'lucide-react';
import { getBarbers, updateBarberAvailability, createBarber, updateBarber, uploadBarberPhoto, deleteBarberWithPhoto } from '../../services/barbers';
import { getBookingsByMonth } from '../../services/bookings';
import { formatCOP } from '../../data';
import { todayKey } from '../../lib/dates';
import { barberMonthStats } from '../../lib/stats';
import type { Barber, Booking, StaffRole } from '../../types';
import { IMAGE_ACCEPT } from '../../lib/imageFile';
import BarberAvatar from '../../components/common/BarberAvatar';

interface BarberForm {
  name: string;
  role: StaffRole;
  phone: string;
  bio: string;
  specialties: string;
  commission: number;
  pin: string;
}

const emptyForm: BarberForm = {
  name: '',
  role: 'barbero',
  phone: '',
  bio: '',
  specialties: '',
  commission: 77,
  pin: '',
};

export default function AdminBarbers() {
  const [list, setList] = useState<Barber[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Barber | null>(null);
  const [form, setForm] = useState<BarberForm>(emptyForm);
  const [errors, setErrors] = useState<Partial<BarberForm>>({});
  const [saving, setSaving] = useState(false);
  const [monthBookings, setMonthBookings] = useState<Booking[]>([]);
  const [pageError, setPageError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Barber | null>(null);
  const [deleting, setDeleting] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const photoTarget = useRef<Barber | null>(null);

  const choosePhoto = (barber: Barber) => {
    photoTarget.current = barber;
    photoInput.current?.click();
  };

  const handlePhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const barber = photoTarget.current;
    if (!file || !barber) return;
    setUploadingId(barber.id);
    try {
      const photoUrl = await uploadBarberPhoto(barber, file);
      setList((prev) => prev.map((b) => b.id === barber.id ? { ...b, photoUrl } : b));
      setPageError('');
    } catch (err) {
      console.error('No se pudo subir la foto', err);
      setPageError('No se pudo subir la foto. Usa una foto JPG, PNG, WEBP o HEIC (iPhone).');
    } finally {
      setUploadingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteBarberWithPhoto(deleteTarget);
      setList((prev) => prev.filter((b) => b.id !== deleteTarget.id));
      setPageError('');
    } catch (err) {
      console.error('No se pudo eliminar el barbero', err);
      setPageError('No se pudo eliminar el barbero. Intenta de nuevo.');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  useEffect(() => {
    const [year, month] = todayKey().split('-').map(Number);
    Promise.all([getBarbers(), getBookingsByMonth(year, month)])
      .then(([barbers, bookings]) => {
        setList(barbers);
        setMonthBookings(bookings);
      })
      .catch((err) => {
        console.error('No se pudieron cargar los barberos', err);
        setPageError('No se pudieron cargar los barberos. Recarga la página para intentarlo de nuevo.');
      })
      .finally(() => setLoading(false));
  }, []);

  const toggleAvailable = async (id: string) => {
    const barber = list.find((b) => b.id === id);
    if (!barber) return;
    const newVal = !barber.available;
    setList((prev) => prev.map((b) => b.id === id ? { ...b, available: newVal } : b));
    try {
      await updateBarberAvailability(id, newVal);
      setPageError('');
    } catch (err) {
      console.error('No se pudo cambiar la disponibilidad', err);
      setList((prev) => prev.map((b) => b.id === id ? { ...b, available: !newVal } : b));
      setPageError('No se pudo cambiar la disponibilidad. Intenta de nuevo.');
    }
  };

  const openAdd = () => {
    setEditTarget(null);
    setForm(emptyForm);
    setErrors({});
    setSaveError('');
    setShowModal(true);
  };

  const openEdit = (barber: Barber) => {
    setEditTarget(barber);
    setForm({
      name: barber.name,
      role: barber.role,
      phone: barber.phone,
      bio: barber.bio,
      specialties: barber.specialties.join(', '),
      commission: barber.commission,
      pin: '',
    });
    setErrors({});
    setSaveError('');
    setShowModal(true);
  };

  const validate = (): boolean => {
    const e: Partial<BarberForm> = {};
    if (!form.name.trim()) e.name = 'Nombre requerido';
    if (!form.phone.trim()) e.phone = 'Teléfono requerido';
    if (!form.bio.trim()) e.bio = 'Descripción requerida';
    if (!editTarget && !form.pin.trim()) e.pin = 'PIN requerido';
    // El portal del barbero usa un teclado de 4 dígitos
    if (form.pin && !/^\d{4}$/.test(form.pin)) e.pin = 'El PIN debe tener exactamente 4 números';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    setSaveError('');

    const specialties = form.specialties
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      if (editTarget) {
        const updates: Partial<Barber> = {
          name: form.name,
          role: form.role,
          phone: form.phone,
          bio: form.bio,
          specialties,
          commission: form.commission,
        };
        if (form.pin) updates.pin = form.pin;
        await updateBarber(editTarget.id, updates);
        setList((prev) =>
          prev.map((b) =>
            b.id === editTarget.id
              ? { ...b, ...updates }
              : b
          )
        );
      } else {
        const initials = form.name
          .split(' ')
          .slice(0, 2)
          .map((w) => w[0])
          .join('')
          .toUpperCase();

        const newBarber = await createBarber({
          name: form.name,
          shortName: form.name.split(' ')[0],
          role: form.role,
          avatar: initials,
          phone: form.phone,
          bio: form.bio,
          specialties,
          rating: 5.0,
          available: true,
          commission: form.commission,
          pin: form.pin,
        });
        setList((prev) => [...prev, newBarber]);
      }
      setShowModal(false);
    } catch (err) {
      console.error('No se pudo guardar el barbero', err);
      setSaveError('No se pudo guardar. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = (field: keyof BarberForm) =>
    `w-full bg-white/5 border ${errors[field] ? 'border-red-500/60' : 'border-white/10'} rounded-xl px-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-gold/50 transition-colors`;

  return (
    <div className="space-y-5">
      {pageError && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{pageError}</div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-white text-base">Equipo</h3>
          <p className="text-zinc-500 text-xs mt-0.5">{list.filter((b) => b.role === 'barbero').length} barberos · {list.filter((b) => b.role === 'manicurista').length} manicuristas</p>
        </div>
        <button
          onClick={openAdd}
          className="btn-gold px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2"
        >
          <Plus size={16} />
          <span>Agregar al equipo</span>
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 size={28} className="animate-spin text-gold" />
          <p className="text-zinc-500 text-xs font-mono">Cargando equipo de barberos...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {list.map((barber) => (
            <div key={barber.id} className="table-card p-6 border border-white/[0.08] hover:border-gold/30 transition-all duration-200">
              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => choosePhoto(barber)}
                    disabled={uploadingId === barber.id}
                    title={barber.photoUrl ? 'Cambiar foto' : 'Subir foto'}
                    className="group relative shrink-0 flex flex-col items-center gap-1.5"
                  >
                    <span className="relative block">
                      <BarberAvatar barber={barber} className="w-20 h-20 rounded-full text-xl border-2 border-gold/40" />
                      <span className={`absolute inset-0 rounded-full bg-black/55 flex items-center justify-center text-white transition-opacity ${uploadingId === barber.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                        {uploadingId === barber.id ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}
                      </span>
                      <span className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-gold text-dark border-2 border-[#121212] flex items-center justify-center">
                        <Camera size={13} />
                      </span>
                    </span>
                    <span className="text-[11px] font-semibold text-gold">{barber.photoUrl ? 'Cambiar foto' : 'Subir foto'}</span>
                  </button>
                  <div>
                    <p className="text-white font-semibold">{barber.name}</p>
                    <span className={`inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full mt-0.5 ${barber.role === 'manicurista' ? 'bg-pink-500/15 text-pink-300' : 'bg-gold/15 text-gold'}`}>{barber.role === 'manicurista' ? 'Manicurista' : 'Barbero'}</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Star size={12} className="text-gold fill-gold" />
                      <span className="text-xs text-zinc-300 font-mono font-medium">{barber.rating}</span>
                      <span className="text-xs text-zinc-500">({barber.reviewCount} reseñas)</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => toggleAvailable(barber.id)}
                  title={barber.available ? 'Marcar no disponible' : 'Marcar disponible'}
                  className="transition-transform active:scale-95"
                >
                  {barber.available
                    ? <ToggleRight size={30} className="text-emerald-400" />
                    : <ToggleLeft size={30} className="text-zinc-600" />
                  }
                </button>
              </div>

              <div className="space-y-3 mb-5">
                <div className="flex items-center gap-2 text-xs">
                  <Phone size={13} className="text-zinc-500" />
                  <span className="text-zinc-300 font-mono">{barber.phone}</span>
                </div>
                <p className="text-zinc-400 text-xs leading-relaxed line-clamp-2">{barber.bio}</p>
              </div>

              <div className="flex flex-wrap gap-1.5 mb-5">
                {barber.specialties.map((s) => (
                  <span key={s} className="text-[11px] px-2.5 py-0.5 bg-white/[0.04] border border-white/[0.08] rounded-full text-zinc-300">
                    {s}
                  </span>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-2 mb-5">
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-2.5 text-center">
                  <p className="font-mono text-base font-bold text-white">{barberMonthStats(monthBookings, barber.id).services}</p>
                  <p className="text-zinc-500 text-[10px] uppercase font-medium mt-0.5">Servicios</p>
                </div>
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-2.5 text-center">
                  <p className="font-mono text-xs font-bold text-gold">{formatCOP(barberMonthStats(monthBookings, barber.id).revenue)}</p>
                  <p className="text-zinc-500 text-[10px] uppercase font-medium mt-0.5">Ingresos</p>
                </div>
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-2.5 text-center">
                  <p className="font-mono text-base font-bold text-gold">{100 - barber.commission}%</p>
                  <p className="text-zinc-500 text-[10px] uppercase font-medium mt-0.5">Entrega al salón</p>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
                <button
                  onClick={() => openEdit(barber)}
                  className="flex-1 btn-dark-glass py-2 rounded-xl text-xs font-medium hover:border-gold/40 hover:text-gold"
                >
                  <Edit2 size={13} />
                  Editar
                </button>
                <button
                  onClick={() => choosePhoto(barber)}
                  disabled={uploadingId === barber.id}
                  title={barber.photoUrl ? 'Cambiar foto' : 'Subir foto'}
                  className="btn-dark-glass px-3 py-2 rounded-xl text-xs font-medium hover:border-gold/40 hover:text-gold disabled:opacity-50"
                >
                  {uploadingId === barber.id ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                  Foto
                </button>
                <button
                  onClick={() => setDeleteTarget(barber)}
                  title="Eliminar barbero"
                  className="btn-danger-glass p-2 rounded-xl text-xs"
                >
                  <Trash2 size={14} />
                </button>
                <div className="flex items-center gap-1.5 px-3 py-2 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                  <span className="text-zinc-500 text-[10px] font-mono">PIN:</span>
                  <span className="font-mono text-xs text-zinc-300">••••</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <input
        ref={photoInput}
        type="file"
        accept={IMAGE_ACCEPT}
        className="hidden"
        onChange={handlePhotoSelected}
      />

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !deleting && setDeleteTarget(null)} />
          <div className="relative w-full max-w-sm glass border border-white/10 rounded-2xl p-6">
            <h2 className="font-semibold text-white mb-2">¿Eliminar a {deleteTarget.name}?</h2>
            <p className="text-zinc-400 text-sm mb-6">
              Dejará de aparecer en la web y no podrá entrar al portal. Sus citas pasadas se conservan con su nombre.
              Esta acción no se puede deshacer.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-5 py-2 glass border border-white/10 rounded-xl text-zinc-400 hover:text-white text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="px-5 py-2 rounded-xl bg-red-500/80 hover:bg-red-500 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-60"
              >
                {deleting && <Loader2 size={14} className="animate-spin" />}
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
          />
          <div className="relative w-full max-w-lg glass border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/8">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-gold/15 border border-gold/20 flex items-center justify-center">
                  <User size={15} className="text-gold" />
                </div>
                <h2 className="font-semibold text-white">
                  {editTarget ? 'Editar perfil' : 'Nuevo integrante del equipo'}
                </h2>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="w-7 h-7 rounded-lg glass border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4 max-h-[65vh] overflow-y-auto">
              <div>
                <label className="text-zinc-400 text-xs mb-1.5 block">Nombre completo</label>
                <input
                  className={inputClass('name')}
                  placeholder="Ej: Juan Pérez"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name}</p>}
              </div>

              <div>
                <span className="text-zinc-400 text-xs mb-1.5 block">Rol</span>
                <div className="grid grid-cols-2 gap-2">
                  {([['barbero', 'Barbero', 'Cortes, barba y demás'], ['manicurista', 'Manicurista', 'Servicios de manicura']] as const).map(([value, label, hint]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setForm({ ...form, role: value })}
                      aria-pressed={form.role === value}
                      className={`text-left px-3.5 py-2.5 rounded-xl border transition-colors ${form.role === value ? 'border-gold bg-gold/10' : 'border-white/10 hover:border-gold/40'}`}
                    >
                      <span className={`block text-sm font-semibold ${form.role === value ? 'text-gold' : 'text-white'}`}>{label}</span>
                      <span className="block text-[11px] text-zinc-500">{hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-zinc-400 text-xs mb-1.5 block">Teléfono</label>
                <input
                  className={inputClass('phone')}
                  placeholder="Ej: +57 300 000 0000"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
                {errors.phone && <p className="text-red-400 text-xs mt-1">{errors.phone}</p>}
              </div>

              <div>
                <label className="text-zinc-400 text-xs mb-1.5 block">Descripción / Bio</label>
                <textarea
                  className={`${inputClass('bio')} resize-none`}
                  rows={3}
                  placeholder="Describe al barbero, su experiencia..."
                  value={form.bio}
                  onChange={(e) => setForm({ ...form, bio: e.target.value })}
                />
                {errors.bio && <p className="text-red-400 text-xs mt-1">{errors.bio}</p>}
              </div>

              <div>
                <label className="text-zinc-400 text-xs mb-1.5 block">
                  Especialidades <span className="text-zinc-600">(separadas por coma)</span>
                </label>
                <input
                  className={inputClass('specialties')}
                  placeholder="Ej: Fade, Barba clásica, Navaja"
                  value={form.specialties}
                  onChange={(e) => setForm({ ...form, specialties: e.target.value })}
                />
              </div>

              {/* En la base se guarda lo que se queda el barbero (commission); aquí se escribe lo que entrega al salón */}
              <div>
                <label htmlFor="barber-share" className="text-zinc-400 text-xs mb-1.5 block">
                  Porcentaje que entrega al salón
                </label>
                <div className="flex items-center gap-3">
                  <div className="relative w-28">
                    <input
                      id="barber-share"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={100}
                      step={1}
                      value={100 - form.commission}
                      onChange={(e) => {
                        const toSalon = Math.min(100, Math.max(0, Math.round(Number(e.target.value) || 0)));
                        setForm({ ...form, commission: 100 - toSalon });
                      }}
                      className="w-full bg-white/5 border border-white/10 rounded-xl pl-3 pr-8 py-2.5 text-white font-mono text-base focus:outline-none focus:border-gold/50"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">%</span>
                  </div>
                  <p className="text-zinc-400 text-sm">
                    El barbero se queda con <span className="text-emerald-400 font-mono font-bold">{form.commission}%</span>
                  </p>
                </div>
                <p className="text-zinc-600 text-xs mt-1.5">Para el dueño del salón: 0 % (se queda con todo).</p>
              </div>

              <div>
                <label className="text-zinc-400 text-xs mb-1.5 block">
                  PIN de acceso{' '}
                  {editTarget && <span className="text-zinc-600">(dejar vacío para no cambiar)</span>}
                </label>
                <input
                  className={inputClass('pin')}
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="4 números"
                  value={form.pin}
                  onChange={(e) => setForm({ ...form, pin: e.target.value })}
                />
                {errors.pin && <p className="text-red-400 text-xs mt-1">{errors.pin}</p>}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-white/8 flex items-center justify-end gap-3">
              {saveError && <p className="text-red-400 text-xs mr-auto">{saveError}</p>}
              <button
                onClick={() => setShowModal(false)}
                className="px-5 py-2 glass border border-white/10 rounded-xl text-zinc-400 hover:text-white text-sm transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="btn-gold px-5 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 disabled:opacity-60"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {editTarget ? 'Guardar cambios' : 'Crear barbero'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
