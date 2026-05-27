/**
 * CARE-EMS — shared application state and constants
 */

export const DATA_PATHS = {
    predictions: './Data/predictions.csv',
    groundTruths: './Data/ground_truths.csv',
    zipCoordinates: './Data/ZIP_Coordinates.csv',
    neighborhoods: './Data/zip_neighborhoods.json'
};

export const MAP_CONFIG = {
    center: [40.7128, -73.95],
    zoom: 10,
    fitBounds: [[40.49, -74.26], [40.92, -73.70]]
};

export const POPULATION_BY_ZIP = {
    10001: 18400, 10002: 31200, 10003: 28500, 10011: 22400, 10018: 15600,
    10036: 12800, 11201: 24100, 10451: 19800, 11368: 35200, 11212: 42100
};

export const state = {
    timestamps: [],
    zipList: [],
    predictions: {},
    groundTruths: {},
    geometries: {},
    neighborhoods: {},
    centroids: {},
    neighborMap: {},
    activeIndices: [],
    forecastIndex: -1,
    selectedZip: 'all',
    focusZip: null,
    tableSort: { key: 'predicted', asc: false },
    dataLoaded: false
};
