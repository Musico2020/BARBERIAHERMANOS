import { useEffect, useRef, useState } from 'react';
import { Camera, Loader2, Trash2, ImagePlus } from 'lucide-react';
import { getGallery, GALLERY_CATEGORIES } from '../../services/gallery';
import { uploadBarberWork, deleteBarberWork } from '../../services/barberPortal';
import { IMAGE_ACCEPT } from '../../lib/imageFile';
import type { Barber, GalleryItem } from '../../types';

// «Mis trabajos»: el barbero sube fotos de sus cortes desde el teléfono. Salen en la Galería de la
// web con su nombre, y los clientes pueden ver sus trabajos y reservar con él.

interface Props {
  barber: Barber;
  pin: string;
}

export default function BarberWorks({ barber, pin }: Props) {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState(GALLERY_CATEGORIES[0]);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getGallery()
      .then((all) => setItems(all.filter((i) => i.barberId === barber.id)))
      .catch((err) => console.error('No se pudieron cargar tus fotos', err))
      .finally(() => setLoading(false));
  }, [barber.id]);

  const upload = async (files: FileList | null) => {
    const list = [...(files ?? [])].slice(0, 10);
    if (!list.length) return;
    setMessage(null);
    setUploading({ done: 0, total: list.length });
    let ok = 0;
    for (const file of list) {
      try {
        const item = await uploadBarberWork(barber.id, pin, file, category);
        setItems((prev) => [item, ...prev]);
        ok += 1;
      } catch (err) {
        console.error('No se pudo subir la foto', err);
      }
      setUploading((u) => (u ? { ...u, done: u.done + 1 } : u));
    }
    setUploading(null);
    setMessage(ok === list.length
      ? { ok: true, text: ok === 1 ? 'Foto publicada en la Galería.' : `${ok} fotos publicadas en la Galería.` }
      : { ok: false, text: `Se subieron ${ok} de ${list.length}. Usa fotos JPG, PNG o HEIC e intenta de nuevo.` });
  };

  const remove = async (item: GalleryItem) => {
    if (!window.confirm('¿Quitar esta foto de la Galería?')) return;
    setBusyId(item.id);
    try {
      await deleteBarberWork(barber.id, pin, item.id);
      setItems((prev) => prev.filter((x) => x.id !== item.id));
    } catch (err) {
      console.error('No se pudo borrar la foto', err);
      setMessage({ ok: false, text: 'No se pudo borrar la foto. Intenta de nuevo.' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="table-card rounded-3xl p-5 space-y-4">
        <p className="text-zinc-300 text-sm">Sube fotos de tus cortes. Salen en la <span className="text-gold font-semibold">Galería</span> de la página con tu nombre, y los clientes pueden reservar contigo desde ahí.</p>
        <label className="block">
          <span className="text-xs text-zinc-400 uppercase tracking-wider block mb-2">¿Qué trabajo es?</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-3 text-white text-sm focus:outline-none focus:border-gold/50">
            {GALLERY_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => input.current?.click()} disabled={!!uploading} className="btn-gold w-full min-h-[52px] rounded-2xl text-base font-bold disabled:opacity-60">
          {uploading ? <Loader2 size={19} className="animate-spin" /> : <ImagePlus size={19} />}
          <span>{uploading ? `Subiendo ${uploading.done + 1} de ${uploading.total}…` : 'Subir fotos de mis trabajos'}</span>
        </button>
        <input ref={input} type="file" accept={IMAGE_ACCEPT} multiple className="hidden" onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
        {message && <p className={`text-sm ${message.ok ? 'text-emerald-300' : 'text-rose-300'}`}>{message.text}</p>}
      </div>

      <h3 className="text-white font-semibold">Mis fotos en la Galería ({items.length})</h3>
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-gold" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 rounded-3xl border border-dashed border-white/15">
          <Camera size={32} className="mx-auto mb-2 text-zinc-600" />
          <p className="text-zinc-400 text-sm">Todavía no has subido fotos.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {items.map((item) => (
            <div key={item.id} className="relative rounded-2xl overflow-hidden border border-white/10 aspect-square bg-black">
              <img src={item.url} alt={item.alt} loading="lazy" className="w-full h-full object-cover" />
              <span className="keep-dark absolute bottom-2 left-2 text-[11px] font-semibold text-gold bg-black/75 px-2 py-0.5 rounded-full">{item.category}</span>
              <button
                type="button"
                onClick={() => remove(item)}
                disabled={busyId === item.id}
                aria-label="Quitar foto"
                className="keep-dark absolute top-2 right-2 w-9 h-9 rounded-full bg-black/70 text-rose-300 flex items-center justify-center disabled:opacity-50"
              >
                {busyId === item.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
