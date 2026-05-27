/**
 * CARE-EMS — Leaflet map initialization and updates
 */

import { state, MAP_CONFIG } from './state.js';
import { statusColor, classifyDemand } from './classify.js';
import { statusLabel } from './utils.js';

let _map = null;
let _geoLayer = null;

export function initMap() {
    if (_map) return;

    // L is the Leaflet global from the classic script tag in ems.html
    _map = L.map('emsMap', {
        center: MAP_CONFIG.center,
        zoom: MAP_CONFIG.zoom,
        zoomControl: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 18
    }).addTo(_map);

    _map.fitBounds(MAP_CONFIG.fitBounds);
}

export function updateMap(onZipClick) {
    if (!_map) return;

    const idx = state.activeIndices[state.forecastIndex];
    if (idx === undefined) return;

    const focusZip = state.focusZip;

    if (_geoLayer) {
        _map.removeLayer(_geoLayer);
    }

    const features = state.zipList
        .filter(zip => state.geometries[zip])
        .map(zip => {
            const val = state.predictions[zip][idx];
            const status = classifyDemand(val, zip);
            return {
                type: 'Feature',
                properties: {
                    zip,
                    value: val,
                    status,
                    selected: zip === focusZip
                },
                geometry: state.geometries[zip]
            };
        });

    _geoLayer = L.geoJSON({ type: 'FeatureCollection', features }, {
        style: (feature) => {
            const status = feature.properties.status;
            const selected = feature.properties.selected;
            return {
                fillColor: statusColor(status),
                fillOpacity: selected ? 0.85 : 0.65,
                color: selected ? '#1e293b' : '#64748b',
                weight: selected ? 2.5 : 1,
                opacity: 0.9
            };
        },
        onEachFeature: (feature, layer) => {
            const zip = feature.properties.zip;
            const val = feature.properties.value;
            const status = feature.properties.status;
            layer.bindTooltip(
                `ZIP ${zip}<br>${Math.round(val)} calls \u2014 ${statusLabel(status)}`,
                { sticky: true }
            );
            layer.on('click', () => onZipClick(zip));
        }
    }).addTo(_map);
}
