/**
 * CARE-EMS — geometry helpers (WKT, centroids)
 */

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
