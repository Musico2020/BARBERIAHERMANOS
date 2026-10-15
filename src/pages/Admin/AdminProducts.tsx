import { useState, useEffect, useRef } from 'react';
import { Plus, Edit2, Trash2, Eye, EyeOff, Loader2, X, ImagePlus, ShoppingBag, Package } from 'lucide-react';
import { getProducts, createProduct, updateProduct, deleteProduct, uploadProductImage } from '../../services/products';
import { formatCOP } from '../../data';
import { IMAGE_ACCEPT } from '../../lib/imageFile';
import type { Product } from '../../types';

type ProductForm = Omit<Product, 'id'>;

const emptyForm: ProductForm = { name: '', brand: '', price: 0, description: '', image: '', category: '', active: true };

export default function AdminProducts() {
  const [list, setList] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [editing, setEditing] = useState<Product | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getProducts()
      .then(setList)
      .catch((err) => {
        console.error('No se pudieron cargar los productos', err);
        setPageError('No se pudieron cargar los productos. Recarga la página para intentarlo de nuevo.');
      })
      .finally(() => setLoading(false));
  }, []);

  const categories = [...new Set(list.map((p) => p.category).filter(Boolean))];

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError('');
    setShowModal(true);
  };

  const openEdit = (product: Product) => {
    setEditing(product);
    setForm({
      name: product.name,
      brand: product.brand,
      price: product.price,
      description: product.description,
      image: product.image,
      category: product.category,
      active: product.active,
    });
    setFormError('');
    setShowModal(true);
  };

  const handleImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setFormError('');
    try {
      // Si la foto anterior era de este mismo formulario sin guardar, se reemplaza
      const previous = editing && form.image === editing.image ? '' : form.image;
      const url = await uploadProductImage(file, previous);
      setForm((f) => ({ ...f, image: url }));
    } catch (err) {
      console.error('No se pudo subir la foto', err);
      setFormError('No se pudo subir la foto. Usa una foto JPG, PNG, WEBP o HEIC (iPhone).');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError('Escribe el nombre del producto.'); return; }
    if (!(form.price > 0)) { setFormError('Escribe el precio.'); return; }
    setSaving(true);
    setFormError('');
    const clean = { ...form, name: form.name.trim(), brand: form.brand.trim(), category: form.category.trim(), description: form.description.trim() };
    try {
      if (editing) {
        await updateProduct(editing.id, clean);
        setList((prev) => prev.map((p) => (p.id === editing.id ? { ...p, ...clean } : p)));
      } else {
        const created = await createProduct(clean);
        setList((prev) => [...prev, created]);
      }
      setShowModal(false);
    } catch (err) {
      console.error('No se pudo guardar el producto', err);
      setFormError('No se pudo guardar. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (product: Product) => {
    const active = !product.active;
    setList((prev) => prev.map((p) => (p.id === product.id ? { ...p, active } : p)));
    try {
      await updateProduct(product.id, { active });
      setPageError('');
    } catch (err) {
      console.error('No se pudo cambiar el producto', err);
      setList((prev) => prev.map((p) => (p.id === product.id ? { ...p, active: !active } : p)));
      setPageError('No se pudo guardar el cambio. Intenta de nuevo.');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteProduct(deleteTarget);
      setList((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      setPageError('');
    } catch (err) {
      console.error('No se pudo eliminar el producto', err);
      setPageError('No se pudo eliminar el producto. Intenta de nuevo.');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const inputClass = 'w-full bg-white/5 border border-white/15 rounded-xl px-4 py-2.5 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-gold/60 transition-colors';

  return (
    <div className="space-y-5">
      {pageError && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{pageError}</div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-zinc-400 text-sm">
          {list.length} productos · {list.filter((p) => p.active).length} visibles en la Shop
        </p>
        <button onClick={openAdd} className="btn-gold px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-1.5">
          <Plus size={15} />
          <span>Agregar producto</span>
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-gold" /></div>
      ) : list.length === 0 ? (
        <div className="glass rounded-2xl border border-white/8 py-16 text-center">
          <Package size={30} className="mx-auto text-zinc-600 mb-3" />
          <p className="text-zinc-400 text-sm mb-4">Todavía no hay productos en la Shop.</p>
          <button onClick={openAdd} className="btn-gold px-5 py-2.5 rounded-full text-sm font-semibold"><span>Agregar el primero</span></button>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3 sm:gap-5">
          {list.map((product) => (
            <div
              key={product.id}
              className={`rounded-2xl overflow-hidden border bg-[#141414] flex flex-col ${product.active ? 'border-white/12' : 'border-white/8 opacity-70'}`}
            >
              <div className="relative aspect-square bg-zinc-100">
                {product.image ? (
                  <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-[#1c1c1c]"><ShoppingBag size={36} className="text-zinc-600" /></div>
                )}
                <span className={`absolute top-2 left-2 sm:top-3 sm:left-3 text-[10px] sm:text-xs font-semibold px-2 sm:px-2.5 py-1 rounded-full border ${
                  product.active ? 'bg-green-950/90 text-green-300 border-green-500/40' : 'bg-black/85 text-zinc-300 border-white/20'
                }`}>
                  {product.active ? 'Visible en la Shop' : 'Oculto'}
                </span>
              </div>
              <div className="p-3 sm:p-5 flex flex-col flex-1">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-1 sm:gap-3">
                  <div className="min-w-0">
                    <p className="text-gold/80 text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider truncate">{[product.brand, product.category].filter(Boolean).join(' · ') || 'Sin marca'}</p>
                    <h3 className="text-white font-semibold text-sm sm:text-lg leading-snug">{product.name}</h3>
                  </div>
                  <span className="font-mono text-base sm:text-lg font-bold gold-text shrink-0">{formatCOP(product.price)}</span>
                </div>
                <p className="hidden sm:block text-zinc-400 text-sm mt-2 line-clamp-2 flex-1">{product.description}</p>
                <div className="flex items-center gap-1.5 sm:gap-2 mt-auto pt-3 sm:pt-4">
                  <button
                    onClick={() => openEdit(product)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-white/15 text-zinc-300 hover:text-white hover:border-gold/40 text-xs sm:text-sm transition-colors"
                  >
                    <Edit2 size={14} /> Editar
                  </button>
                  <button
                    onClick={() => toggleActive(product)}
                    title={product.active ? 'Ocultar de la Shop' : 'Mostrar en la Shop'}
                    className="p-2 sm:p-2.5 rounded-xl border border-white/15 text-zinc-300 hover:text-white hover:border-gold/40 transition-colors"
                  >
                    {product.active ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                  <button
                    onClick={() => setDeleteTarget(product)}
                    title="Eliminar producto"
                    className="p-2 sm:p-2.5 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !deleting && setDeleteTarget(null)} />
          <div className="relative w-full max-w-sm bg-[#141414] border border-white/10 rounded-2xl p-6">
            <h2 className="font-semibold text-white mb-2">¿Eliminar {deleteTarget.name}?</h2>
            <p className="text-zinc-400 text-sm mb-6">Se borra de la Shop junto con su foto. Si solo quieres quitarlo por un tiempo, usa el botón de ocultar.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting} className="px-5 py-2 border border-white/10 rounded-xl text-zinc-400 hover:text-white text-sm">Cancelar</button>
              <button onClick={confirmDelete} disabled={deleting} className="px-5 py-2 rounded-xl bg-red-500/80 hover:bg-red-500 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-60">
                {deleting && <Loader2 size={14} className="animate-spin" />} Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => !saving && setShowModal(false)} />
          <div className="relative w-full max-w-2xl bg-[#141414] border border-white/10 rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <h2 className="font-semibold text-white">{editing ? 'Editar producto' : 'Nuevo producto'}</h2>
              <button onClick={() => setShowModal(false)} aria-label="Cerrar" className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/5"><X size={16} /></button>
            </div>

            <div className="overflow-y-auto p-6 grid sm:grid-cols-2 gap-5">
              <div>
                <p className="text-zinc-400 text-xs mb-1.5">Foto</p>
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  disabled={uploading}
                  className="relative w-full aspect-[4/3] rounded-xl overflow-hidden border-2 border-dashed border-white/15 hover:border-gold/50 bg-white/[0.03] flex items-center justify-center transition-colors group"
                >
                  {form.image ? (
                    <>
                      <img src={form.image} alt="" className="absolute inset-0 w-full h-full object-cover" />
                      <span className="absolute inset-x-0 bottom-0 py-2 bg-black/75 text-white text-xs flex items-center justify-center gap-1.5 opacity-90 group-hover:opacity-100">
                        <ImagePlus size={14} /> Cambiar foto
                      </span>
                    </>
                  ) : (
                    <span className="flex flex-col items-center gap-2 text-zinc-400 text-sm">
                      <ImagePlus size={26} className="text-gold" /> Subir foto
                    </span>
                  )}
                  {uploading && (
                    <span className="absolute inset-0 bg-black/70 flex items-center justify-center"><Loader2 size={22} className="animate-spin text-gold" /></span>
                  )}
                </button>
                <input ref={fileInput} type="file" accept={IMAGE_ACCEPT} className="hidden" onChange={handleImage} />
                <p className="text-zinc-600 text-[11px] mt-1.5">JPG, PNG, WEBP o HEIC (iPhone). Se ajusta automáticamente.</p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-zinc-400 text-xs mb-1.5 block" htmlFor="p-name">Nombre *</label>
                  <input id="p-name" className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej: Pomada Mate" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-zinc-400 text-xs mb-1.5 block" htmlFor="p-brand">Marca</label>
                    <input id="p-brand" className={inputClass} value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="Ej: American Crew" />
                  </div>
                  <div>
                    <label className="text-zinc-400 text-xs mb-1.5 block" htmlFor="p-category">Categoría</label>
                    <input id="p-category" list="product-categories" className={inputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Ej: Barba" />
                    <datalist id="product-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
                  </div>
                </div>
                <div>
                  <label className="text-zinc-400 text-xs mb-1.5 block" htmlFor="p-price">Precio (COP) *</label>
                  <input
                    id="p-price"
                    inputMode="numeric"
                    className={inputClass}
                    value={form.price ? form.price.toLocaleString('es-CO') : ''}
                    onChange={(e) => setForm({ ...form, price: Number(e.target.value.replace(/\D/g, '')) || 0 })}
                    placeholder="45.000"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 text-xs mb-1.5 block" htmlFor="p-desc">Descripción</label>
                  <textarea id="p-desc" rows={3} className={`${inputClass} resize-none`} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Para qué sirve, tamaño, aroma..." />
                </div>
                <label className="flex items-center gap-2.5 text-sm text-zinc-300 cursor-pointer">
                  <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="w-4 h-4 accent-[#D9AD50]" />
                  Mostrar en la Shop
                </label>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-white/10 flex items-center justify-end gap-3">
              {formError && <p className="text-red-400 text-xs mr-auto">{formError}</p>}
              <button onClick={() => setShowModal(false)} className="px-5 py-2 border border-white/10 rounded-xl text-zinc-400 hover:text-white text-sm">Cancelar</button>
              <button onClick={handleSave} disabled={saving || uploading} className="btn-gold px-5 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 disabled:opacity-60">
                {saving && <Loader2 size={14} className="animate-spin" />}
                <span>Guardar</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
