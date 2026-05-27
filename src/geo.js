/**
 * CARE-EMS — geometry helpers (WKT, centroids, neighbor map)
 */

import { state } from './state.js';

export function wktToGeoJSON(wkt) {
    if (!wkt || !wkt.trim()) return null;
    try {
        const wicked = new Wkt.Wkt();
        wicked.read(wkt.trim());
        return wicked.toJson();
    } catch (e) {
        return null;
    }
}

export function geometryCentroid(geometry) {
    const coords = geometry.type === 'MultiPolygon'
        ? geometry.coordinates[0][0]
        : geometry.coordinates[0];

    let latSum = 0;
    let lonSum = 0;
    coords.forEach(([lon, lat]) => {
        lonSum += lon;
        latSum += lat;
    });
    return [latSum / coords.length, lonSum / coords.length];
}

export function computeNeighborMap() {
    const entries = state.zipList.map(zip => ({
        zip,
        centroid: state.centroids[zip]
    })).filter(e => e.centroid);

    const neighborMap = {};

    entries.forEach(({ zip, centroid: [lat, lon] }) => {
        const distances = entries
            .filter(e => e.zip !== zip)
            .map(e => {
                const dLat = e.centroid[0] - lat;
                const dLon = e.centroid[1] - lon;
                return { zip: e.zip, dist: Math.sqrt(dLat * dLat + dLon * dLon) };
            })
            .sort((a, b) => a.dist - b.dist);

        neighborMap[zip] = distances.slice(0, 3).map(d => d.zip);
    });

    state.neighborMap = neighborMap;
}
