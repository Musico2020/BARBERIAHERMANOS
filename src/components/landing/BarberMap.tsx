import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { businessConfig } from '../../config/business';

// Mapa real e interactivo con OpenStreetMap (sin llave ni costo). Los mosaicos se oscurecen
// con un filtro CSS (ver .sh-map en index.css) para que combine con la web; el marcador no se afecta.
// La rueda del mouse no hace zoom hasta hacer clic, para no "atrapar" el scroll de la página.

const PIN_HTML = `
  <div class="sh-pin">
    <span class="sh-pin__pulse"></span>
    <div class="sh-pin__body"><img src="/logo-salon-hermanos.png" alt="" /></div>
    <span class="sh-pin__tip"></span>
  </div>`;

export default function BarberMap() {
  // Sin el punto exacto del local, Google Maps busca la dirección
  if (!businessConfig.location) {
    const query = encodeURIComponent(`${businessConfig.address}, Colombia`);
    return (
      <iframe
        title={`Mapa de la ubicación de ${businessConfig.name}`}
        src={`https://maps.google.com/maps?q=${query}&z=16&output=embed`}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="sh-map absolute inset-0 w-full h-full border-0"
      />
    );
  }
  return <LeafletMap location={businessConfig.location} />;
}

function LeafletMap({ location }: { location: { lat: number; lng: number } }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const { lat, lng } = location;

    const map = L.map(containerRef.current, {
      center: [lat, lng],
      zoom: 17,
      scrollWheelZoom: false,
      zoomControl: false,
      attributionControl: true,
    });
    L.control.zoom({ position: 'topright' }).addTo(map);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    const icon = L.divIcon({ html: PIN_HTML, className: '', iconSize: [56, 70], iconAnchor: [28, 70], popupAnchor: [0, -66] });
    L.marker([lat, lng], { icon, title: businessConfig.name, keyboard: true })
      .addTo(map)
      .bindPopup(
        `<div class="sh-popup"><strong>${businessConfig.name}</strong><span>${businessConfig.address}</span></div>`,
        { closeButton: false },
      );

    const enableWheel = () => map.scrollWheelZoom.enable();
    const disableWheel = () => map.scrollWheelZoom.disable();
    map.on('click focus', enableWheel);
    map.on('mouseout blur', disableWheel);

    return () => {
      map.remove();
    };
  }, [location]);

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={`Mapa de la ubicación de ${businessConfig.name}`}
      className="sh-map absolute inset-0"
    />
  );
}
