import { useState, useEffect } from 'react';
import { Clock, Edit2, ToggleLeft, ToggleRight, Plus, X, Trash2, Loader2 } from 'lucide-react';
import { CategoryIcon, ClipperIcon } from '../../components/common/BarberIcons';
import { getAllServices, createService, updateService, deleteService } from '../../services/services';
import { formatCOP } from '../../data';
import type { Service } from '../../types';
import { Panel } from '../../components/admin/ui';
import DataTable, { type Column } from '../../components/admin/DataTable';

type ActiveService = Service & { active: boolean };

const CATEGORIES: Service['category'][] = [
  'cortes', 'barba', 'tratamientos', 'depilacion', 'masajes', 'cejas', 'manicura',
];

const categoryColors: Record<string, string> = {
  cortes: 'bg-blue-500/15 text-blue-400',
  barba: 'bg-amber-500/15 text-amber-400',
  tratamientos: 'bg-emerald-500/15 text-emerald-400',
  depilacion: 'bg-rose-500/15 text-rose-400',
  masajes: 'bg-cyan-500/15 text-cyan-400',
  cejas: 'bg-violet-500/15 text-violet-400',
  manicura: 'bg-pink-500/15 text-pink-400',
};

interface ServiceForm {
  name: string;
  category: Service['category'];
  duration: number;
  price: number;
  description: string;
  popular: boolean;
}

const emptyForm: ServiceForm = {
  name: '',
  category: 'cortes',
  duration: 30,
  price: 20000,
  description: '',
  popular: false,
};

export default function AdminServices() {
  const [list, setList] = useState<ActiveService[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<ActiveService | null>(null);
  const [form, setForm] = useState<ServiceForm>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof ServiceForm, string>>>({});
  const [formError, setFormError] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState('');

  useEffect(() => {
    getAllServices()
      .then(setList)
      .catch((err) => {
        console.error('No se pudieron cargar los servicios', err);
        setPageError('No se pudieron cargar los servicios. Recarga la página para intentarlo de nuevo.');
      })
      .finally(() => setLoading(false));
  }, []);

  const toggleActive = async (id: string) => {
    const service = list.find((s) => s.id === id);
    if (!service) return;
    const newVal = !service.active;
    setList((prev) => prev.map((s) => s.id === id ? { ...s, active: newVal } : s));
    try {
      await updateService(id, { active: newVal });
      setPageError('');
    } catch (err) {
      console.error('No se pudo cambiar el servicio', err);
      setList((prev) => prev.map((s) => s.id === id ? { ...s, active: !newVal } : s));
      setPageError('No se pudo guardar el cambio. Intenta de nuevo.');
    }
  };

  const openAdd = () => {
    setEditTarget(null);
    setForm(emptyForm);
    setErrors({});
    setFormError("");
    setShowModal(true);
  };

  const openEdit = (service: ActiveService) => {
    setEditTarget(service);
    setForm({
      name: service.name,
      category: service.category,
      duration: service.duration,
      price: service.price,
      description: service.description,
      popular: service.popular ?? false,
    });
    setErrors({});
    setFormError("");
    setShowModal(true);
  };

  const validate = (): boolean => {
    const e: Partial<Record<keyof ServiceForm, string>> = {};
    if (!form.name.trim()) e.name = 'Escribe el nombre del servicio';
    if (!Number.isFinite(form.duration) || form.duration < 5) e.duration = 'Duración mínima 5 min';
    if (!Number.isFinite(form.price) || form.price < 1000) e.price = 'Precio mínimo $1.000';
    setErrors(e);
    // El aviso sale también junto al botón, para que se vea aunque el campo quede arriba
    setFormError(Object.keys(e).length ? `No se guardó: ${Object.values(e).join(' · ')}.` : '');
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    // La descripción es opcional
    const data = { ...form, name: form.name.trim(), description: form.description.trim() };
    try {
      if (editTarget) {
        await updateService(editTarget.id, data);
        setList((prev) =>
          prev.map((s) =>
            s.id === editTarget.id
              ? { ...s, ...data }
              : s
          )
        );
      } else {
        const newService = await createService({ ...data, active: true });
        setList((prev) => [...prev, { ...newService, active: true }]);
      }
      setShowModal(false);
      setPageError('');
      setFormError('');
    } catch (err) {
      console.error('No se pudo guardar el servicio', err);
      // La ventana sigue abierta con lo escrito, para intentar de nuevo
      setFormError('No se pudo guardar el servicio. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteService(deleteId);
      setList((prev) => prev.filter((s) => s.id !== deleteId));
      setPageError('');
    } catch (err) {
      console.error('No se pudo eliminar el servicio', err);
      setPageError('No se pudo eliminar el servicio. Intenta de nuevo.');
    } finally {
      setDeleteId(null);
    }
  };

  const columns: Column<ActiveService>[] = [
    {
      key: 'name', header: 'Servicio', primary: true,
      render: (service) => (
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-gold/10 border border-gold/25 flex items-center justify-center text-gold shrink-0">
            <CategoryIcon category={service.category} size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm flex items-center gap-2 flex-wrap">
              {service.name}
              {service.popular && (
                <span className="text-[10px] px-2 py-0.5 bg-gold/15 text-gold rounded-full border border-gold/30 font-semibold tracking-wide">POPULAR</span>
              )}
            </p>
            <p className="text-zinc-500 text-xs mt-0.5 line-clamp-2 md:line-clamp-1 max-w-xs">{service.description}</p>
          </div>
        </div>
      ),
    },
    { key: 'price', header: 'Precio', aside: true, render: (s) => <span className="font-mono font-bold text-gold whitespace-nowrap">{formatCOP(s.price)}</span> },
    {
      key: 'category', header: 'Categoría',
      render: (s) => <span className={`text-xs px-2.5 py-1 rounded-full capitalize font-medium ${categoryColors[s.category] || 'text-zinc-400 bg-white/5'}`}>{s.category}</span>,
    },
    {
      key: 'duration', header: 'Duración',
      render: (s) => <span className="inline-flex items-center gap-1.5 text-zinc-300 text-xs font-mono"><Clock size={13} className="text-zinc-500" />{s.duration} min</span>,
    },
    {
      key: 'active', header: 'Disponible',
      render: (service) => (
        <button
          onClick={() => toggleActive(service.id)}
          aria-pressed={service.active}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
            service.active ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400' : 'bg-zinc-800/40 border-zinc-700/40 text-zinc-500'
          }`}
        >
          {service.active ? <><ToggleRight size={16} /><span>Activo</span></> : <><ToggleLeft size={16} /><span>Inactivo</span></>}
        </button>
      ),
    },
    {
      key: 'actions', header: 'Acciones',
      render: (service) => (
        <div className="flex items-center gap-2">
          <button onClick={() => openEdit(service)} className="btn-dark-glass px-3 py-1.5 rounded-lg text-xs font-medium hover:border-gold/40 hover:text-gold">
            <Edit2 size={12} /> Editar
          </button>
          <button onClick={() => setDeleteId(service.id)} className="btn-danger-glass p-2 rounded-lg text-xs" title="Eliminar servicio" aria-label={`Eliminar ${service.name}`}>
            <Trash2 size={12} />
          </button>
        </div>
      ),
    },
  ];

  const inputClass = (field: keyof ServiceForm) =>
    `w-full bg-white/5 border ${errors[field] ? 'border-red-500/60' : 'border-white/10'} rounded-xl px-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-gold/50 transition-colors`;

  return (
    <div className="space-y-5">
      {pageError && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{pageError}</div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-white text-base">Catálogo de Servicios</h3>
          <p className="text-zinc-500 text-xs mt-0.5">{list.length} servicios configurados en el sistema</p>
        </div>
        <button
          onClick={openAdd}
          className="btn-gold px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2"
        >
          <Plus size={16} />
          <span>Nuevo Servicio</span>
        </button>
      </div>

      <Panel
        title="Lista de servicios"
        subtitle="Lo que ven los clientes al reservar"
        action={<span className="text-[11px] font-mono text-zinc-400 bg-white/[0.04] border border-white/10 px-3 py-1 rounded-full">{list.filter((s) => s.active).length} activos</span>}
        bodyClassName="pt-4"
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 size={26} className="animate-spin text-gold" />
            <p className="text-zinc-500 text-xs">Cargando servicios...</p>
          </div>
        ) : (
          <DataTable
            rows={list}
            columns={columns}
            rowKey={(s) => s.id}
            rowClassName={(s) => (s.active ? '' : 'opacity-50')}
            empty="Todavía no hay servicios. Crea el primero con «Nuevo servicio»."
          />
        )}
      </Panel>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
          />
          <div className="relative w-full max-w-lg border border-white/10 rounded-2xl shadow-2xl overflow-hidden bg-[#1a1a1a]">
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/8">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-gold/15 border border-gold/20 flex items-center justify-center">
                  <ClipperIcon size={16} className="text-gold" />
                </div>
                <h2 className="font-semibold text-white">
                  {editTarget ? 'Editar Servicio' : 'Nuevo Servicio'}
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
                <label className="text-zinc-400 text-xs mb-1.5 block">Nombre del servicio</label>
                <input
                  className={inputClass('name')}
                  placeholder="Ej: Corte Fade Premium"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name}</p>}
              </div>

              <div>
                <label className="text-zinc-400 text-xs mb-1.5 block">Descripción <span className="text-zinc-600">(opcional)</span></label>
                <textarea
                  className={`${inputClass('description')} resize-none`}
                  rows={3}
                  placeholder="Describe el servicio brevemente..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
                {errors.description && <p className="text-red-400 text-xs mt-1">{errors.description}</p>}
              </div>

              <div>
                <label className="text-zinc-400 text-xs mb-1.5 block">Categoría</label>
                <select
                  className={`${inputClass('category')} cursor-pointer`}
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value as Service['category'] })}
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat} className="bg-zinc-900 capitalize">
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-zinc-400 text-xs mb-1.5 block">
                    Duración <span className="text-zinc-600">(minutos)</span>
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={180}
                    step={5}
                    className={inputClass('duration')}
                    value={form.duration}
                    onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })}
                  />
                  {errors.duration && <p className="text-red-400 text-xs mt-1">{errors.duration}</p>}
                </div>

                <div>
                  <label className="text-zinc-400 text-xs mb-1.5 block">
                    Precio <span className="text-zinc-600">(COP)</span>
                  </label>
                  <input
                    type="number"
                    min={1000}
                    step={1000}
                    className={inputClass('price')}
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                  />
                  {errors.price && <p className="text-red-400 text-xs mt-1">{errors.price}</p>}
                </div>
              </div>

              <div className="flex items-center justify-between py-2 px-4 bg-white/3 border border-white/8 rounded-xl">
                <div>
                  <p className="text-white text-sm">Marcar como popular</p>
                  <p className="text-zinc-600 text-xs">Aparecerá destacado en el sitio</p>
                </div>
                <button
                  onClick={() => setForm({ ...form, popular: !form.popular })}
                  className="transition-colors"
                >
                  {form.popular
                    ? <ToggleRight size={28} className="text-green-400" />
                    : <ToggleLeft size={28} className="text-zinc-600" />
                  }
                </button>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-white/8 flex flex-wrap items-center justify-end gap-3">
              {formError && <p className="w-full text-red-400 text-sm">{formError}</p>}
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
                {editTarget ? 'Guardar cambios' : 'Crear Servicio'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setDeleteId(null)}
          />
          <div className="relative w-full max-w-sm border border-white/10 rounded-2xl shadow-2xl p-6 bg-[#1a1a1a]">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
              <Trash2 size={18} className="text-red-400" />
            </div>
            <h3 className="text-white font-semibold text-center mb-1">Eliminar servicio</h3>
            <p className="text-zinc-500 text-sm text-center mb-5">
              Esta acción no se puede deshacer. El servicio será eliminado permanentemente.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 py-2 glass border border-white/10 rounded-xl text-zinc-400 hover:text-white text-sm transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-2 bg-red-500/15 border border-red-500/30 rounded-xl text-red-400 hover:bg-red-500/25 text-sm font-semibold transition-all"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
