import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const pin = (emoji) => L.divIcon({ className: 'pin-icon', html: emoji, iconSize: [34, 34], iconAnchor: [17, 32] });

// Draggable / tap-to-place pin. `others` are read-only markers (e.g. the worker on the way).
export default function MapPin({ lat, lng, onMove, others = [], height = 220 }) {
  const el = useRef(null);
  const map = useRef(null);
  const me = useRef(null);
  const layer = useRef(null);

  useEffect(() => {
    map.current = L.map(el.current, { zoomControl: false, attributionControl: true }).setView([lat, lng], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map.current);
    me.current = L.marker([lat, lng], { icon: pin('📍'), draggable: !!onMove }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    if (onMove) {
      me.current.on('dragend', () => { const p = me.current.getLatLng(); onMove(p.lat, p.lng); });
      map.current.on('click', (e) => onMove(e.latlng.lat, e.latlng.lng));
    }
    return () => map.current.remove();
  }, []); // eslint-disable-line

  useEffect(() => {
    me.current.setLatLng([lat, lng]);
    if (!others.length) map.current.panTo([lat, lng]);
  }, [lat, lng]); // eslint-disable-line

  useEffect(() => {
    layer.current.clearLayers();
    others.forEach((o) => {
      L.polyline([[o.lat, o.lng], [lat, lng]], { color: '#15130f', weight: 3, dashArray: '6 8' }).addTo(layer.current);
      L.marker([o.lat, o.lng], { icon: pin(o.emoji) }).addTo(layer.current);
    });
    if (others.length) map.current.fitBounds(L.latLngBounds([[lat, lng], ...others.map((o) => [o.lat, o.lng])]).pad(0.3), { maxZoom: 16 });
  }, [JSON.stringify(others)]); // eslint-disable-line

  return <div ref={el} style={{ height }} className="w-full rounded-2xl overflow-hidden z-0" />;
}
