import { useState, useEffect, useRef } from 'react';
import { ImagePlus, Loader2, Trash2, Expand, Images, AlertCircle, CheckCircle2 } from 'lucide-react';
import { getGallery, uploadGalleryPhoto, updateGalleryItem, deleteGalleryItem, GALLERY_CATEGORIES } from '../../services/gallery';
import { Panel, EmptyState } from '../../components/admin/ui';
import Lightbox from '../../components/common/Lightbox';
import { IMAGE_ACCEPT } from '../../lib/imageFile';
import type { GalleryItem } from '../../types';

// Fotos de la galería pública (/galeria): subir varias a la vez, cambiar su categoría y borrarlas.

export default function AdminGallery() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState(GALLERY_CATEGORIES[0]);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [toDelete, setToDelete] = useState<GalleryItem | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getGallery()
      .then(setItems)
      .catch((err) => {
        console.error('No se pudo cargar la galería', err);
        setStatus({ ok: false, text: 'No se pudo cargar la galería. Recarga la página.' });
      })
      .finally(() => setLoading(false));
  }, []);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = [...files];
    setUploading({ done: 0, total: list.length });
    setStatus(null);
    let failed = 0;
    for (const file of list) {
      try {
        const item = await uploadGalleryPhoto(file, category, '');
        setItems((prev) => [item, ...prev]);
      } catch (err) {
        console.error('No se pudo subir la foto', err);
        failed++;
      }
      setUploading((u) => (u ? { ...u, done: u.done + 1 } : u));
    }
    setUploading(null);
    if (fileInput.current) fileInput.current.value = '';
    const ok = list.length - failed;
    setStatus(failed
      ? { ok: false, text: `Se subieron ${ok} de ${list.length}. Usa fotos JPG, PNG, WEBP o HEIC (iPhone).` }
      : { ok: true, text: ok === 1 ? 'Foto subida. Ya se ve en la galería.' : `${ok} fotos subidas. Ya se ven en la galería.` });
  };

  const changeCategory = async (item: GalleryItem, value: string) => {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, category: value } : i)));
    try {
      await updateGalleryItem(item.id, { category: value });
    } catch (err) {
      console.error('No se pudo cambiar la categoría', err);
      setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
      setStatus({ ok: false, text: 'No se pudo cambiar la categoría.' });
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    const item = toDelete;
    setToDelete(null);
    try {
      await deleteGalleryItem(item);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setStatus({ ok: true, text: 'Foto eliminada.' });
    } catch (err) {
      console.error('No se pudo eliminar la foto', err);
      setStatus({ ok: false, text: 'No se pudo eliminar la foto. Intenta de nuevo.' });
    }
  };

  const categoryOptions = [...new Set([...GALLERY_CATEGORIES, ...items.map((i) => i.category)])];

  return (
    <div className="space-y-5">
      <Panel title="Subir fotos" subtitle="Puedes elegir varias a la vez desde el celular o el computador. Se ajustan solas para cargar rápido.">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <label className="sm:w-56">
            <span className="text-xs text-zinc-400 font-medium block mb-1.5">Categoría de las fotos</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:border-gold/50"
            >
              {GALLERY_CATEGORIES.map((c) => <option key={c} value={c} className="bg-[#141414]">{c}</option>)}
            </select>
          </label>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={!!uploading}
            className="btn-gold px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
            {uploading ? `Subiendo ${uploading.done + 1} de ${uploading.total}...` : 'Elegir fotos'}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept={IMAGE_ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
        {status && (
          <p role="status" className={`flex items-center gap-2 text-sm mt-4 ${status.ok ? 'text-emerald-400' : 'text-red-400'}`}>
            {status.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />} {status.text}
          </p>
        )}
      </Panel>

      <Panel
        title="Fotos publicadas"
        subtitle="Las más nuevas salen primero en la web"
        action={<span className="text-[11px] font-mono text-zinc-400 bg-white/[0.04] border border-white/10 px-3 py-1 rounded-full">{items.length} fotos</span>}
      >
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 size={26} className="animate-spin text-gold" /></div>
        ) : items.length === 0 ? (
          <EmptyState icon={Images}>Todavía no hay fotos. Sube las primeras con «Elegir fotos».</EmptyState>
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {items.map((item, i) => (
              <li key={item.id} className="rounded-2xl overflow-hidden border border-white/10 bg-white/[0.03] flex flex-col">
                <button type="button" onClick={() => setOpen(i)} className="group relative aspect-square overflow-hidden" aria-label="Ver foto en grande">
                  <img src={item.url} alt={item.alt} loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  <span className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
                    <Expand size={14} />
                  </span>
                </button>
                <div className="flex items-center gap-1.5 p-2">
                  <select
                    value={item.category}
                    onChange={(e) => changeCategory(item, e.target.value)}
                    aria-label="Categoría"
                    className="flex-1 min-w-0 bg-white/[0.04] border border-white/10 rounded-lg px-2 py-1.5 text-zinc-200 text-xs focus:outline-none focus:border-gold/50"
                  >
                    {categoryOptions.map((c) => <option key={c} value={c} className="bg-[#141414]">{c}</option>)}
                  </select>
                  <button type="button" onClick={() => setToDelete(item)} aria-label="Eliminar foto" className="btn-danger-glass p-2 rounded-lg shrink-0">
                    <Trash2 size={13} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {toDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setToDelete(null)} />
          <div role="dialog" aria-modal="true" className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-[#141414] p-6 text-center">
            <img src={toDelete.url} alt="" className="w-28 h-28 object-cover rounded-xl mx-auto mb-4" />
            <p className="text-white font-semibold">¿Eliminar esta foto?</p>
            <p className="text-zinc-500 text-sm mt-1">Dejará de verse en la galería de la web.</p>
            <div className="grid grid-cols-2 gap-2 mt-5">
              <button onClick={() => setToDelete(null)} className="btn-dark-glass py-2.5 rounded-xl text-sm justify-center">Cancelar</button>
              <button onClick={confirmDelete} className="py-2.5 rounded-xl text-sm font-semibold bg-rose-500/90 hover:bg-rose-500 text-white">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {open !== null && (
        <Lightbox
          items={items.map((i) => ({ url: i.url, alt: i.alt, caption: i.category }))}
          index={open}
          onClose={() => setOpen(null)}
          onNavigate={setOpen}
        />
      )}
    </div>
  );
}
