import { useState, useEffect, useRef } from 'react';
import { Star, Phone, Edit2, ToggleLeft, ToggleRight, X, Plus, User, Loader2, Camera, Trash2, Clock } from 'lucide-react';
import { getBarbers, updateBarberAvailability, createBarber, updateBarber, uploadBarberPhoto, deleteBarberWithPhoto } from '../../services/barbers';
import { getBookingsByMonth, getBookingsInRange, getBusySlots, type BusySlot } from '../../services/bookings';
import BarberAgenda from '../../components/admin/BarberAgenda';
import { getAllServices } from '../../services/services';
import BarberServicesModal from '../../components/admin/BarberServicesModal';
import { formatCOP } from '../../data';
import { todayKey, addDays } from '../../lib/dates';
import { barberMonthStats } from '../../lib/stats';
import { isBarberOwner, getBarberOwnerKey, getOwnerBeneficiary } from '../../lib/earnings';
import { splitTotals } from '../../components/admin/ServiceSplit';
import type { Barber, Booking, StaffRole, WorkHours } from '../../types';
import { IMAGE_ACCEPT } from '../../lib/imageFile';
import BarberAvatar from '../../components/common/BarberAvatar';
import WorkHoursEditor, { validWorkHours, workHoursSummary } from '../../components/admin/WorkHoursEditor';

interface BarberForm {
  name: string;
  role: StaffRole;
  phone: string;
  bio: string;
  specialties: string;
  commission: number;
  pin: string;
  workHours: WorkHours;
  isOwner: boolean;
  ownerName: 'walter' | 'daniel';
  ownerBeneficiary: 'walter' | 'daniel' | 'general';
}

const emptyForm: BarberForm = {
  name: '',
  role: 'barbero',
  phone: '',
  bio: '',
  specialties: '',
  commission: 77,
  pin: '',
  workHours: {},
  isOwner: false,
  ownerName: 'walter',
  ownerBeneficiary: 'walter',
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
  const [upcoming, setUpcoming] = useState<Booking[]>([]);
  const [servicesTarget, setServicesTarget] = useState<Barber | null>(null);
  // Recalcula «Servicios» e «Ingresos» después de cambiar algo en la lista de servicios
  const reloadMonth = () => {
    const [year, month] = todayKey().split('-').map(Number);
    getBookingsByMonth(year, month).then(setMonthBookings).catch((err) => console.error('No se pudieron recargar los servicios', err));
  };
  const [busyToday, setBusyToday] = useState<BusySlot[] | null>(null);
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

  // Los porcentajes de cada servicio, para calcular en dinero lo que entrega cada barbero
  const [, setRatesLoaded] = useState(false);
  useEffect(() => { getAllServices().then(() => setRatesLoaded(true)).catch(() => undefined); }, []);

  useEffect(() => {
    const [year, month] = todayKey().split('-').map(Number);
    const today = todayKey();
    Promise.all([getBarbers(), getBookingsByMonth(year, month), getBookingsInRange(today, addDays(today, 90)), getBusySlots(today)])
      .then(([barbers, bookings, ahead, busy]) => {
        setList(barbers);
        setMonthBookings(bookings);
        // Reservas activas de hoy en adelante (sin las que vencieron esperando el anticipo)
        const now = Date.now();
        setUpcoming(ahead.filter((b) =>
          (b.status === 'pending' || b.status === 'confirmed') &&
          !(b.depositStatus === 'awaiting' && b.depositExpiresAt && new Date(b.depositExpiresAt).getTime() < now)));
        setBusyToday(busy);
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
      workHours: barber.workHours ?? {},
      isOwner: barber.isOwner ?? isBarberOwner(barber),
      ownerName: barber.ownerName ?? (getBarberOwnerKey(barber) || 'walter'),
      ownerBeneficiary: barber.ownerBeneficiary ?? getOwnerBeneficiary(barber),
    });
    setErrors({});
    setSaveError('');
    setShowModal(true);
  };

  const validate = (): boolean => {
    const e: Partial<BarberForm> = {};
    // Teléfono y descripción son opcionales: solo el nombre (y el PIN al crear) son obligatorios
    if (!form.name.trim()) e.name = 'Nombre requerido';
    if (form.phone.trim() && form.phone.replace(/\D/g, '').length < 7) e.phone = 'Revisa el teléfono o déjalo vacío';
    if (!editTarget && !form.pin.trim()) e.pin = 'PIN requerido';
    // El portal del barbero usa un teclado de 4 dígitos
    if (form.pin && !/^\d{4}$/.test(form.pin)) e.pin = 'El PIN debe tener exactamente 4 números';
    setErrors(e);
    if (!validWorkHours(form.workHours)) {
      setSaveError('Revisa el horario: la hora de salida debe ser después de la de entrada.');
      return false;
    }
    const missing = Object.values(e);
    if (missing.length) {
      // El aviso sale junto al botón y el formulario sube hasta el primer campo con problema
      setSaveError(`No se guardó: ${missing.join(' · ')}.`);
      const first = Object.keys(e)[0];
      window.setTimeout(() => document.getElementById(`barber-${first}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      return false;
    }
    return true;
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
          workHours: form.workHours,
          isOwner: form.isOwner,
          ownerName: form.isOwner ? form.ownerName : undefined,
          ownerBeneficiary: !form.isOwner ? form.ownerBeneficiary : undefined,
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
          workHours: form.workHours,
          isOwner: form.isOwner,
          ownerName: form.isOwner ? form.ownerName : undefined,
          ownerBeneficiary: !form.isOwner ? form.ownerBeneficiary : undefined,
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
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-white font-semibold">{barber.name}</p>
                      {isBarberOwner(barber) ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          👑 Dueño ({getBarberOwnerKey(barber) === 'daniel' ? 'Daniel' : 'Walter'})
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/5 text-zinc-300 border border-white/10">
                          Rinde a {getOwnerBeneficiary(barber) === 'daniel' ? 'Daniel' : getOwnerBeneficiary(barber) === 'general' ? 'Caja General' : 'Walter'}
                        </span>
                      )}
                    </div>
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
                <div className="flex items-start gap-2 text-xs">
                  <Clock size={13} className="text-zinc-500 mt-0.5 shrink-0" />
                  {workHoursSummary(barber.workHours).length === 0 ? (
                    <span className="text-zinc-400">Horario del salón</span>
                  ) : (
                    <span className="text-zinc-300 leading-relaxed">{workHoursSummary(barber.workHours).join(' · ')}</span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 mb-5">
                {barber.specialties.map((s) => (
                  <span key={s} className="text-[11px] px-2.5 py-0.5 bg-white/[0.04] border border-white/[0.08] rounded-full text-zinc-300">
                    {s}
                  </span>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-2 mb-5">
                <button
                  type="button"
                  onClick={() => setServicesTarget(barber)}
                  title="Ver y administrar sus servicios del mes"
                  className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-2.5 text-center hover:border-gold/50 hover:bg-gold/5 transition-colors"
                >
                  <p className="font-mono text-base font-bold text-white">{barberMonthStats(monthBookings, barber.id).services}</p>
                  <p className="text-gold text-[10px] uppercase font-semibold mt-0.5 underline decoration-dotted underline-offset-2">Servicios</p>
                </button>
                <button
                  type="button"
                  onClick={() => setServicesTarget(barber)}
                  title="Ver y administrar sus servicios del mes"
                  className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-2.5 text-center hover:border-gold/50 hover:bg-gold/5 transition-colors"
                >
                  <p className="font-mono text-xs font-bold text-gold">{formatCOP(barberMonthStats(monthBookings, barber.id).revenue)}</p>
                  <p className="text-gold text-[10px] uppercase font-semibold mt-0.5 underline decoration-dotted underline-offset-2">Ingresos</p>
                </button>
                <button
                  type="button"
                  onClick={() => setServicesTarget(barber)}
                  title="Ver cuánto entrega por cada servicio"
                  className="bg-gold/[0.06] border border-gold/25 rounded-xl p-2.5 text-center hover:border-gold/50 transition-colors"
                >
                  {/* Lo que entrega este mes en dinero (servicios completados), y el porcentaje debajo */}
                  <p className="font-mono text-xs font-bold text-gold">
                    {formatCOP(isBarberOwner(barber)
                      ? barberMonthStats(monthBookings, barber.id).revenue
                      : splitTotals(monthBookings.filter((b) => b.barberId === barber.id && b.status === 'completed' && b.date.startsWith(todayKey().slice(0, 7))), barber).boss)}
                  </p>
                  <p className="text-zinc-400 text-[10px] font-mono mt-0.5">{isBarberOwner(barber) ? '100%' : `${100 - barber.commission}%`}</p>
                  <p className="text-zinc-500 text-[10px] uppercase font-medium mt-0.5">
                    {isBarberOwner(barber) 
                      ? `100% Salón (${getBarberOwnerKey(barber) === 'daniel' ? 'Daniel' : 'Walter'})` 
                      : `Entrega a ${getOwnerBeneficiary(barber) === 'daniel' ? 'Daniel' : getOwnerBeneficiary(barber) === 'general' ? 'Caja General' : 'Walter'}`}
                  </p>
                </button>
              </div>

              <BarberAgenda barber={barber} upcoming={upcoming.filter((b) => b.barberId === barber.id)} busyToday={busyToday} />

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

      {servicesTarget && (
        <BarberServicesModal barber={servicesTarget} onClose={() => setServicesTarget(null)} onChanged={reloadMonth} />
      )}

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
                  id="barber-name"
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
                <label htmlFor="barber-phone" className="text-zinc-400 text-xs mb-1.5 block">Teléfono <span className="text-zinc-600">(opcional)</span></label>
                <input
                  id="barber-phone"
                  className={inputClass('phone')}
                  placeholder="Ej: +57 300 000 0000"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
                {errors.phone && <p className="text-red-400 text-xs mt-1">{errors.phone}</p>}
              </div>

              <div>
                <label className="text-zinc-400 text-xs mb-1.5 block">Descripción / Bio <span className="text-zinc-600">(opcional)</span></label>
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

              {/* Dueño del salón vs Barbero / Colaborador */}
              <div className="p-3.5 rounded-2xl bg-gold/5 border border-gold/25 space-y-2.5">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.isOwner}
                    onChange={(e) => setForm({ ...form, isOwner: e.target.checked })}
                    className="w-4 h-4 rounded text-gold focus:ring-gold/30 bg-black/40 border-white/20 accent-amber-500"
                  />
                  <span className="text-sm font-semibold text-white">
                    👑 Es Dueño / Propietario del Salón (Walter o Daniel)
                  </span>
                </label>
                <p className="text-zinc-400 text-xs pl-7 leading-relaxed">
                  Al marcarlo como dueño, no rinde cuentas de comisión: el 100% de lo que produce entra directamente a la administración y no genera cuentas de nómina por pagar.
                </p>

                {form.isOwner && (
                  <div className="pt-2 pl-7 space-y-1.5 border-t border-gold/20">
                    <label className="text-zinc-300 text-xs font-semibold block">¿Cuál socio / dueño es?</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, ownerName: 'walter' })}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
                          form.ownerName === 'walter'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : 'bg-white/5 text-zinc-400 border-white/10 hover:text-white'
                        }`}
                      >
                        👑 Walter (Dueño 1)
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, ownerName: 'daniel' })}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
                          form.ownerName === 'daniel'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : 'bg-white/5 text-zinc-400 border-white/10 hover:text-white'
                        }`}
                      >
                        👑 Daniel (Dueño 2)
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Si es barbero colaborador (Gerardo, Nelson, etc.) */}
              {!form.isOwner && (
                <div className="space-y-4">
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
                    <p className="text-zinc-600 text-xs mt-1.5">
                      Entrega al salón: <span className="text-gold font-bold">{100 - form.commission}%</span>
                    </p>
                  </div>

                  {/* Asignación de a qué dueño le rinde cuentas */}
                  <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                    <label className="text-xs font-semibold text-white block">
                      ¿A qué socio / dueño le entrega su porcentaje ({100 - form.commission}%)?
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, ownerBeneficiary: 'walter' })}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors text-center ${
                          form.ownerBeneficiary === 'walter'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : 'bg-white/5 text-zinc-400 border-white/10 hover:text-white'
                        }`}
                      >
                        A Walter
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, ownerBeneficiary: 'daniel' })}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors text-center ${
                          form.ownerBeneficiary === 'daniel'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : 'bg-white/5 text-zinc-400 border-white/10 hover:text-white'
                        }`}
                      >
                        A Daniel
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, ownerBeneficiary: 'general' })}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors text-center ${
                          form.ownerBeneficiary === 'general'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-white/5 text-zinc-400 border-white/10 hover:text-white'
                        }`}
                      >
                        Caja General
                      </button>
                    </div>
                    <p className="text-zinc-400 text-xs leading-relaxed">
                      {form.ownerBeneficiary === 'daniel'
                        ? `El ${100 - form.commission}% retenido de este barbero (ej. Nelson) se acreditará a Daniel y quedará registrado en el sistema.`
                        : form.ownerBeneficiary === 'walter'
                        ? `El ${100 - form.commission}% retenido de este barbero (ej. Gerardo) se acreditará a Walter y quedará registrado en el sistema.`
                        : `El ${100 - form.commission}% retenido ingresará a la Caja General de la administración.`}
                    </p>
                  </div>
                </div>
              )}

              <div>
                <span className="text-zinc-400 text-xs mb-1.5 block">Horario de trabajo</span>
                <WorkHoursEditor value={form.workHours} onChange={(workHours) => { setForm({ ...form, workHours }); setSaveError(''); }} />
              </div>

              <div>
                <label className="text-zinc-400 text-xs mb-1.5 block">
                  PIN de acceso{' '}
                  {editTarget && <span className="text-zinc-600">(dejar vacío para no cambiar)</span>}
                </label>
                <input
                  id="barber-pin"
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
