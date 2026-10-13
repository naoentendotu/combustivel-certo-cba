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

    L.control.zoom({ position: 'topright' }).addTo(map);

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

    return map;
  }

  function renderMarkers(rows, bestId, activeId, brlFormatter) {
    if (!markerLayer) return;
    markerLayer.clearLayers();
    markersMap.clear();

    // Cor relativa ao conjunto: terço mais barato em verde, terço mais caro apagado
    const precos = rows.map(r => r.price).filter(p => p != null).sort((a, b) => a - b);
    const corteBaixo = precos[Math.floor((precos.length - 1) / 3)];
    const corteAlto = precos[Math.ceil(((precos.length - 1) * 2) / 3)];
    const faixa = p => (precos.length < 6 || corteAlto === corteBaixo ? "" : p <= corteBaixo ? " tier-low" : p >= corteAlto ? " tier-high" : "");
    const alertSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;

    for (const r of rows) {
      const isBest = r.id === bestId;
      const isActive = r.id === activeId;
      const classes = "map-pin"
        + (r.price == null ? " map-pin-none" : faixa(r.price))
        + (isBest ? " map-pin-best" : "")
        + (r.stale && !isBest ? " map-pin-stale" : "")
        + (isActive ? " is-active" : "");
      const label = r.price != null ? brlFormatter(r.price) : UI.esc(r.brand);

      const html = `<div class="${classes}" data-station-id="${r.id}">${r.stale ? alertSvg : ""}<span>${label}</span></div>`;

      const icon = L.divIcon({
        className: 'pin-wrap',
        iconSize: [0, 0],
        html
      });

      const marker = L.marker([r.lat, r.lng], {
        icon,
        zIndexOffset: isBest ? 1000 : 0,
        title: r.name + (r.stale ? ' (preço de ' + r.priceDate + ')' : ''),
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
    // No celular a folha cobre a parte de baixo do mapa: centraliza no espaço que sobra acima dela
    const folha = parseFloat(getComputedStyle(map.getContainer().parentElement).getPropertyValue('--sheet-h')) || 0;
    const alvo = map.unproject(map.project([lat, lng], zoom).add([0, folha / 2]), zoom);
    map.flyTo(alvo, zoom, { duration: 0.6 });
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

    if (userCircle) {
      userCircle.setLatLng([lat, lng]);
      userCircle.setRadius(radiusMeters);
    } else {
      userCircle = L.circle([lat, lng], {
        radius: radiusMeters,
        color: '#2563eb',
        weight: 1,
        fillColor: '#2563eb',
        fillOpacity: 0.08,
        interactive: false
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
