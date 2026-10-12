/**
 * Combustível Certo · Componente do Mapa (Leaflet Map & Marcadores Customizados)
 */
const MapView = (() => {
  let map = null;
  let markerLayer = null;
  const markersMap = new Map();
  let userMarker = null;
  let userCircle = null;
  let onSelectCallback = null;

  function init(containerId, onSelectStation) {
    onSelectCallback = onSelectStation;
    if (map) return map;

    map = L.map(containerId, {
      zoomControl: false,
      attributionControl: true
    }).setView([CUIABA.lat, CUIABA.lng], 14);

    // Controles de zoom no canto superior direito
    L.control.zoom({ position: 'topright' }).addTo(map);

    // Provedor de Mapa (OpenStreetMap com fallback para Esri)
    const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
    const TILE_PROVIDERS = [
      {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        opts: { maxZoom: 19, attribution: OSM_ATTR, referrerPolicy: 'strict-origin-when-cross-origin' }
      },
      {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
        opts: { maxZoom: 19, attribution: 'Tiles &copy; Esri' }
      }
    ];
    if (location.protocol === 'file:') TILE_PROVIDERS.reverse();

    (function loadTiles(index) {
      const p = TILE_PROVIDERS[index];
      let ok = 0, fail = 0;
      const layer = L.tileLayer(p.url, p.opts).addTo(map);
      layer.on('tileload', () => ok++);
      layer.on('tileerror', () => {
        if (++fail >= 4 && ok === 0 && index + 1 < TILE_PROVIDERS.length) {
          layer.off();
          map.removeLayer(layer);
          loadTiles(index + 1);
        }
      });
    })(0);

    markerLayer = L.layerGroup().addTo(map);

    // Quando clica no mapa vazio, deseleciona
    map.on('click', (e) => {
      if (e.originalEvent.target.closest('.map-pin')) return;
      // Pode manter o cartão ou fechar se desejar
    });

    return map;
  }

  function renderMarkers(rows, bestId, activeId, brlFormatter) {
    if (!markerLayer) return;
    markerLayer.clearLayers();
    markersMap.clear();

    for (const r of rows) {
      const isBest = r.id === bestId;
      const isActive = r.id === activeId;
      const priceText = r.price != null ? brlFormatter(r.price) : r.brand;

      // Pílula com Dot (conforme mock Mobile - mapa: branco padrão, verde no menor preço)
      const pinClass = isBest ? 'map-pin map-pin-best' : 'map-pin';
      const activeClass = isActive ? ' is-active' : '';
      const staleClass = r.stale ? ' map-pin-stale' : '';
      const starSvg = `<svg class="w-3.5 h-3.5 fill-amber-300 text-amber-300 inline shrink-0" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
      const alertSvg = `<svg class="w-3.5 h-3.5 text-amber-400 inline shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;

      const html = `<div class="${pinClass}${activeClass}${staleClass}" data-station-id="${r.id}">
        ${isBest ? starSvg + ' ' : ''}${r.stale ? alertSvg + ' ' : ''}<span>${priceText}</span>
      </div>`;

      const icon = L.divIcon({
        className: 'pin-wrap',
        iconSize: [0, 0],
        html
      });

      const marker = L.marker([r.lat, r.lng], {
        icon,
        zIndexOffset: isBest ? 1000 : 0,
        title: r.name,
        riseOnHover: true
      });

      marker.on('click', () => {
        if (typeof onSelectCallback === 'function') {
          onSelectCallback(r);
        }
      });

      marker.addTo(markerLayer);
      markersMap.set(r.id, marker);
    }
  }

  function setActivePin(id) {
    markersMap.forEach((m, mid) => {
      const el = m.getElement()?.querySelector('.map-pin');
      if (el) el.classList.toggle('is-active', mid === id);
    });
  }

  function focusLocation(lat, lng, zoom = 15) {
    if (!map) return;
    map.flyTo([lat, lng], zoom, { duration: 0.6 });
  }

  function updateUserLocation(lat, lng, radiusMeters = 500) {
    if (!map) return;
    if (userMarker) {
      userMarker.setLatLng([lat, lng]);
    } else {
      const icon = L.divIcon({
        className: 'pin-wrap',
        iconSize: [0, 0],
        html: '<div class="user-marker-dot"></div>'
      });
      userMarker = L.marker([lat, lng], { icon, zIndexOffset: 2000, title: 'Minha localização' }).addTo(map);
    }

    // Círculo de raio translúcido ao redor do usuário (conforme modelo "Mobile — mapa")
    if (userCircle) {
      userCircle.setLatLng([lat, lng]);
      userCircle.setRadius(radiusMeters);
    } else {
      userCircle = L.circle([lat, lng], {
        radius: radiusMeters,
        color: '#2563eb',
        weight: 1.5,
        dashArray: '5, 8',
        fillColor: '#3b82f6',
        fillOpacity: 0.08
      }).addTo(map);
    }
  }

  function invalidateSize() {
    if (map) {
      setTimeout(() => map.invalidateSize(), 50);
    }
  }

  return {
    init,
    renderMarkers,
    setActivePin,
    focusLocation,
    updateUserLocation,
    invalidateSize,
    getMap: () => map
  };
})();
