/**
 * ST-GraphEMS Forecasting Dashboard
 */

const DATA_PATHS = {
    predictions: './Data/predictions.csv',
    groundTruths: './Data/ground_truths.csv',
    zipCoordinates: './Data/ZIP_Coordinates.csv',
    neighborhoods: './Data/zip_neighborhoods.json'
};

const MAP_CONFIG = {
    center: [40.7128, -73.95],
    zoom: 10,
    fitBounds: [[40.49, -74.26], [40.92, -73.70]]
};

const POPULATION_BY_ZIP = {
    10001: 18400, 10002: 31200, 10003: 28500, 10011: 22400, 10018: 15600,
    10036: 12800, 11201: 24100, 10451: 19800, 11368: 35200, 11212: 42100
};

const WEATHER_PRESETS = [
    'Clear, 72°F — no weather uplift',
    'Partly cloudy, 68°F — no weather uplift',
    'Overcast, 55°F — slight uplift',
    'Light rain, 48°F — moderate uplift',
    'Clear, 82°F — heat-related uplift'
];

const state = {
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
    map: null,
    geoLayer: null,
    chart: null,
    tableSort: { key: 'predicted', asc: false },
    dataLoaded: false
};

// --- Utilities ---

function showLoading(text) {
    const el = document.getElementById('loading');
    document.getElementById('loadingText').textContent = text || 'Loading...';
    el.classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loading').classList.add('hidden');
}

function parseTimestamp(ts) {
    const m = ts.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})$/);
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4]);
}

function formatTimestamp(ts) {
    const d = parseTimestamp(ts);
    if (!d) return ts;
    return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${formatHourRange(ts)}`;
}

function formatHourRange(ts) {
    const d = parseTimestamp(ts);
    if (!d) return ts;
    const h0 = String(d.getHours()).padStart(2, '0');
    const h1 = String((d.getHours() + 1) % 24).padStart(2, '0');
    return `${h0}:00–${h1}:00`;
}

function dateToInputValue(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function inputValueToDate(val) {
    const [y, m, d] = val.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function mean(arr) {
    if (!arr.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr) {
    if (arr.length < 2) return 0;
    const m = mean(arr);
    return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

function getPopulation(zip) {
    return POPULATION_BY_ZIP[zip] || (12000 + (parseInt(zip, 10) % 50) * 420);
}

function getNeighborhood(zip) {
    return state.neighborhoods[zip] || 'NYC';
}

function mockWeather(zip) {
    const idx = parseInt(zip, 10) % WEATHER_PRESETS.length;
    return WEATHER_PRESETS[idx];
}

function temporalContext(ts) {
    const d = parseTimestamp(ts);
    if (!d) return '—';
    const day = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()];
    const hour = d.getHours();
    let window = 'Off-peak';
    if (hour >= 7 && hour <= 9) window = 'Morning peak window';
    else if (hour >= 11 && hour <= 14) window = 'Afternoon peak window';
    else if (hour >= 17 && hour <= 20) window = 'Evening peak window';
    else if (hour >= 22 || hour <= 5) window = 'Overnight low window';
    const type = (d.getDay() === 0 || d.getDay() === 6) ? 'Weekend' : 'Weekday';
    return `${type} · ${window}`;
}

// --- CSV Parsing ---

function parseCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    result.push(current);
    return result;
}

async function loadTimeseriesCsv(url) {
    const response = await fetch(url);
    const text = await response.text();
    const lines = text.trim().split('\n');
    const headers = parseCsvLine(lines[0]);
    const timestamps = headers.slice(1);
    const data = {};

    for (let i = 1; i < lines.length; i++) {
        const values = parseCsvLine(lines[i]);
        const zip = values[0];
        data[zip] = values.slice(1).map(v => parseFloat(v) || 0);
    }

    return { timestamps, data };
}

async function loadZipCoordinates() {
    const response = await fetch(DATA_PATHS.zipCoordinates);
    const text = await response.text();
    const lines = text.trim().split('\n');
    const geometries = {};

    for (let i = 1; i < lines.length; i++) {
        const values = parseCsvLine(lines[i]);
        const zip = values[0];
        const wkt = values[1];
        geometries[zip] = wktToGeoJSON(wkt);
    }

    return geometries;
}

// --- WKT to GeoJSON ---

function wktToGeoJSON(wkt) {
    try {
        const wicked = new Wkt.Wkt();
        wicked.read(wkt.trim());
        return wicked.toJson();
    } catch (e) {
        return null;
    }
}

function geometryCentroid(geometry) {
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

function computeNeighborMap() {
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

// --- Demand classification ---

function rollingStats(zip, endIndex, windowSize = 24) {
    const start = Math.max(0, endIndex - windowSize + 1);
    const preds = [];
    for (let i = start; i <= endIndex; i++) {
        const idx = state.activeIndices[i];
        if (idx !== undefined) preds.push(state.predictions[zip][idx]);
    }
    return { avg: mean(preds), std: stdDev(preds), values: preds };
}

function classifyDemand(predicted, avg, std) {
    if (predicted > avg + std) return 'HIGH';
    if (predicted > avg) return 'MED';
    if (predicted >= avg - 0.5 * std) return 'NOR';
    return 'LOW';
}

function statusClass(status) {
    return status.toLowerCase();
}

function demandColor(value, minVal, maxVal) {
    if (maxVal === minVal) return '#f97316';
    const t = (value - minVal) / (maxVal - minVal);
    const r = Math.round(254 + t * (220 - 254));
    const g = Math.round(240 + t * (38 - 240));
    const b = Math.round(138 + t * (38 - 138));
    return `rgb(${r},${g},${b})`;
}

function computeConfidenceInterval(zip, endIndex, predicted) {
    const stats = rollingStats(zip, endIndex, 168);
    const residualStd = computeResidualStd(zip);
    const spread = Math.max(residualStd, stats.std, 0.5);
    const margin = 1.96 * spread;
    return {
        low: Math.max(0, Math.round(predicted - margin)),
        high: Math.round(predicted + margin)
    };
}

function computeResidualStd(zip) {
    const residuals = [];
    state.activeIndices.forEach(idx => {
        const p = state.predictions[zip][idx];
        const a = state.groundTruths[zip][idx];
        if (Number.isFinite(p) && Number.isFinite(a)) {
            residuals.push(p - a);
        }
    });
    return stdDev(residuals) || 1;
}

// --- Metrics ---

function computeMetrics(zipFilter) {
    const zips = zipFilter === 'all' ? state.zipList : [zipFilter];
    const pairs = [];

    zips.forEach(zip => {
        state.activeIndices.forEach(idx => {
            const p = state.predictions[zip][idx];
            const a = state.groundTruths[zip][idx];
            if (Number.isFinite(p) && Number.isFinite(a)) {
                pairs.push({ p, a });
            }
        });
    });

    if (!pairs.length) {
        return { mae: null, rmse: null, mape: null, r2: null };
    }

    const errors = pairs.map(({ p, a }) => p - a);
    const absErrors = errors.map(e => Math.abs(e));
    const mae = mean(absErrors);
    const rmse = Math.sqrt(mean(errors.map(e => e * e)));

    const mapeValues = pairs
        .filter(({ a }) => a > 0)
        .map(({ p, a }) => Math.abs((p - a) / a) * 100);
    const mape = mapeValues.length ? mean(mapeValues) : null;

    const actuals = pairs.map(({ a }) => a);
    const preds = pairs.map(({ p }) => p);
    const meanActual = mean(actuals);
    const ssTot = actuals.reduce((s, a) => s + (a - meanActual) ** 2, 0);
    const ssRes = errors.reduce((s, e) => s + e * e, 0);
    const r2 = ssTot > 0 ? 1 - ssRes / ssTot : null;

    return { mae, rmse, mape, r2 };
}

// --- Data loading ---

async function loadAllData() {
    showLoading('Loading EMS data...');

    try {
        const [predResult, truthResult, geometries, neighborhoods] = await Promise.all([
            loadTimeseriesCsv(DATA_PATHS.predictions),
            loadTimeseriesCsv(DATA_PATHS.groundTruths),
            loadZipCoordinates(),
            fetch(DATA_PATHS.neighborhoods).then(r => r.json())
        ]);

        state.timestamps = predResult.timestamps;
        state.predictions = predResult.data;
        state.groundTruths = truthResult.data;
        state.geometries = geometries;
        state.neighborhoods = neighborhoods;
        state.zipList = Object.keys(predResult.data).sort();

        state.zipList.forEach(zip => {
            if (geometries[zip]) {
                state.centroids[zip] = geometryCentroid(geometries[zip]);
            }
        });

        computeNeighborMap();
        populateZipSelect();
        setDefaultDateRange();
        state.dataLoaded = true;
        document.getElementById('runForecast').disabled = false;
    } catch (err) {
        console.error(err);
        document.getElementById('loadingText').textContent = 'Failed to load data. Check console.';
        return;
    }

    hideLoading();
    initMap();
    runForecast();
}

function populateZipSelect() {
    const select = document.getElementById('zipSelect');
    select.innerHTML = '<option value="all">ZIP: all</option>';
    state.zipList.forEach(zip => {
        const opt = document.createElement('option');
        opt.value = zip;
        opt.textContent = `ZIP ${zip} — ${getNeighborhood(zip)}`;
        select.appendChild(opt);
    });
}

function setDefaultDateRange() {
    const firstTs = parseTimestamp(state.timestamps[0]);
    const lastTs = parseTimestamp(state.timestamps[state.timestamps.length - 1]);

    const endDate = new Date(lastTs);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 1);

    if (startDate < firstTs) startDate.setTime(firstTs.getTime());

    document.getElementById('startDate').min = dateToInputValue(firstTs);
    document.getElementById('startDate').max = dateToInputValue(lastTs);
    document.getElementById('endDate').min = dateToInputValue(firstTs);
    document.getElementById('endDate').max = dateToInputValue(lastTs);
    document.getElementById('startDate').value = dateToInputValue(startDate);
    document.getElementById('endDate').value = dateToInputValue(endDate);
}

function resolveActiveIndices() {
    const startVal = document.getElementById('startDate').value;
    const endVal = document.getElementById('endDate').value;
    const startDate = inputValueToDate(startVal);
    const endDate = inputValueToDate(endVal);
    endDate.setHours(23, 59, 59, 999);

    state.activeIndices = state.timestamps
        .map((ts, idx) => ({ ts, idx }))
        .filter(({ ts }) => {
            const d = parseTimestamp(ts);
            return d >= startDate && d <= endDate;
        })
        .map(({ idx }) => idx);

    state.forecastIndex = state.activeIndices.length - 1;
}

function getFocusZip() {
    if (state.selectedZip !== 'all') return state.selectedZip;

    const idx = state.activeIndices[state.forecastIndex];
    if (idx === undefined) return state.zipList[0];

    return state.zipList.reduce((best, zip) =>
        state.predictions[zip][idx] > state.predictions[best][idx] ? zip : best
    , state.zipList[0]);
}

function selectZip(zip) {
    state.selectedZip = zip;
    state.focusZip = zip;
    document.getElementById('zipSelect').value = zip;
    document.getElementById('mapBadge').textContent = `ZIP: ${zip}`;
    renderDashboard();
}

// --- Map ---

function initMap() {
    if (state.map) return;

    state.map = L.map('emsMap', {
        center: MAP_CONFIG.center,
        zoom: MAP_CONFIG.zoom,
        zoomControl: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 18
    }).addTo(state.map);

    state.map.fitBounds(MAP_CONFIG.fitBounds);
}

function updateMap() {
    if (!state.map) return;

    const idx = state.activeIndices[state.forecastIndex];
    if (idx === undefined) return;

    const values = state.zipList.map(zip => state.predictions[zip][idx]);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const focusZip = state.focusZip || getFocusZip();

    if (state.geoLayer) {
        state.map.removeLayer(state.geoLayer);
    }

    const features = state.zipList
        .filter(zip => state.geometries[zip])
        .map(zip => ({
            type: 'Feature',
            properties: {
                zip,
                value: state.predictions[zip][idx],
                selected: zip === focusZip
            },
            geometry: state.geometries[zip]
        }));

    state.geoLayer = L.geoJSON({ type: 'FeatureCollection', features }, {
        style: (feature) => {
            const val = feature.properties.value;
            const selected = feature.properties.selected;
            return {
                fillColor: demandColor(val, minVal, maxVal),
                fillOpacity: selected ? 0.85 : 0.65,
                color: selected ? '#1e293b' : '#64748b',
                weight: selected ? 2.5 : 1,
                opacity: 0.9
            };
        },
        onEachFeature: (feature, layer) => {
            const zip = feature.properties.zip;
            layer.bindTooltip(`ZIP ${zip}<br>${feature.properties.value} calls`, {
                sticky: true
            });
            layer.on('click', () => selectZip(zip));
        }
    }).addTo(state.map);
}

// --- Prediction card ---

function updatePredictionCard() {
    const idx = state.activeIndices[state.forecastIndex];
    if (idx === undefined) return;

    const zip = state.focusZip || getFocusZip();
    const ts = state.timestamps[idx];
    const predicted = state.predictions[zip][idx];
    const relIndex = state.forecastIndex;
    const stats = rollingStats(zip, relIndex, 24);
    const status = classifyDemand(predicted, stats.avg, stats.std);
    const ci = computeConfidenceInterval(zip, relIndex, predicted);

    document.getElementById('predictionZip').textContent = `ZIP ${zip}`;
    document.getElementById('predictionValue').textContent = Math.round(predicted);
    document.getElementById('predictionHour').textContent = formatHourRange(ts);

    const alertEl = document.getElementById('demandAlert');
    if (status === 'HIGH') {
        alertEl.textContent = `HIGH demand — above 24-hr rolling avg of ${stats.avg.toFixed(1)} calls/hr`;
        alertEl.classList.remove('hidden');
    } else {
        alertEl.classList.add('hidden');
    }

    document.getElementById('confidenceInterval').textContent =
        `95% CI: [${ci.low}, ${ci.high}] calls`;

    document.getElementById('ctxPopulation').textContent = getPopulation(zip).toLocaleString();
    const riskEl = document.getElementById('ctxRiskTier');
    riskEl.textContent = status === 'HIGH' ? 'High' : status === 'MED' ? 'Medium' : status === 'NOR' ? 'Normal' : 'Low';
    riskEl.className = `risk-badge ${statusClass(status)}`;

    const neighbors = state.neighborMap[zip] || [];
    document.getElementById('ctxNeighbors').textContent = neighbors.join(', ') || '—';
    document.getElementById('ctxRollingAvg').textContent = `${stats.avg.toFixed(1)} calls/hr`;
    document.getElementById('ctxTemporal').textContent = temporalContext(ts);
    document.getElementById('ctxWeather').textContent = mockWeather(zip);
}

// --- Metrics panel ---

function updateMetricsPanel() {
    const zipFilter = state.selectedZip;
    const metrics = computeMetrics(zipFilter);

    document.getElementById('perfScope').textContent = zipFilter === 'all'
        ? 'Test set — all ZIP zones'
        : `Test set — ZIP ${zipFilter}`;

    document.getElementById('metricMae').textContent =
        metrics.mae !== null ? metrics.mae.toFixed(2) : '—';
    document.getElementById('metricRmse').textContent =
        metrics.rmse !== null ? metrics.rmse.toFixed(2) : '—';
    document.getElementById('metricMape').textContent =
        metrics.mape !== null ? `${metrics.mape.toFixed(1)}%` : '—';
    document.getElementById('metricR2').textContent =
        metrics.r2 !== null ? metrics.r2.toFixed(2) : '—';
}

// --- Table ---

function buildTableRows() {
    const idx = state.activeIndices[state.forecastIndex];
    if (idx === undefined) return [];

    return state.zipList.map(zip => {
        const predicted = state.predictions[zip][idx];
        const relIndex = state.forecastIndex;
        const stats = rollingStats(zip, relIndex, 24);
        const status = classifyDemand(predicted, stats.avg, stats.std);
        return {
            zip,
            neighborhood: getNeighborhood(zip),
            predicted,
            delta: predicted - stats.avg,
            status,
            stats
        };
    });
}

function updateTable() {
    const tbody = document.getElementById('zipTableBody');
    let rows = buildTableRows();
    const { key, asc } = state.tableSort;

    rows.sort((a, b) => {
        let va = a[key];
        let vb = b[key];
        if (key === 'status') {
            const order = { HIGH: 4, MED: 3, NOR: 2, LOW: 1 };
            va = order[a.status];
            vb = order[b.status];
        }
        if (typeof va === 'string') {
            return asc ? va.localeCompare(vb) : vb.localeCompare(va);
        }
        return asc ? va - vb : vb - va;
    });

    const maxPred = Math.max(...rows.map(r => r.predicted), 1);
    const focusZip = state.focusZip || getFocusZip();

    tbody.innerHTML = rows.map(row => {
        const barWidth = Math.round((row.predicted / maxPred) * 100);
        const selected = row.zip === focusZip ? 'selected' : '';
        const deltaSign = row.delta >= 0 ? '+' : '';
        return `<tr data-zip="${row.zip}" class="${selected}">
            <td>${row.zip}</td>
            <td>${row.neighborhood}</td>
            <td>${Math.round(row.predicted)}</td>
            <td>${deltaSign}${row.delta.toFixed(1)}</td>
            <td><div class="demand-bar-wrap"><div class="demand-bar ${statusClass(row.status)}" style="width:${barWidth}%"></div></div></td>
            <td><span class="status-badge ${statusClass(row.status)}">${row.status}</span></td>
        </tr>`;
    }).join('');

    tbody.querySelectorAll('tr').forEach(tr => {
        tr.addEventListener('click', () => selectZip(tr.dataset.zip));
    });
}

// --- Chart ---

function updateChart() {
    const zip = state.focusZip || getFocusZip();
    const endRel = state.forecastIndex;
    if (endRel < 0) return;

    const labels = [];
    const observed = [];
    const forecast = [];

    const historyStart = Math.max(0, endRel - 23);
    for (let r = historyStart; r <= endRel; r++) {
        const dataIdx = state.activeIndices[r];
        const ts = state.timestamps[dataIdx];
        labels.push(r === endRel ? 'fcst' : `-${endRel - r}h`);
        observed.push(state.groundTruths[zip][dataIdx]);
        forecast.push(null);
    }

    const fcIdx = state.activeIndices[endRel];
    const fcVal = state.predictions[zip][fcIdx];
    const ci = computeConfidenceInterval(zip, endRel, fcVal);
    forecast[forecast.length - 1] = fcVal;

    const ciBarData = labels.map((_, i) =>
        i === labels.length - 1 ? [ci.low, ci.high] : [null, null]
    );

    const ctx = document.getElementById('demandChart').getContext('2d');

    if (state.chart) {
        state.chart.destroy();
    }

    state.chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Observed',
                    data: observed,
                    borderColor: '#16a34a',
                    backgroundColor: 'rgba(22, 163, 74, 0.1)',
                    borderWidth: 2,
                    pointRadius: 2,
                    tension: 0.3,
                    fill: false,
                    order: 2
                },
                {
                    type: 'bar',
                    label: '95% CI',
                    data: ciBarData,
                    backgroundColor: 'rgba(148, 163, 184, 0.35)',
                    borderColor: 'rgba(100, 116, 139, 0.5)',
                    borderWidth: 1,
                    barPercentage: 0.35,
                    order: 3
                },
                {
                    label: 'Forecast',
                    data: forecast,
                    borderColor: '#f97316',
                    backgroundColor: '#f97316',
                    borderWidth: 0,
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    showLine: false,
                    order: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: { boxWidth: 12, font: { size: 11 } }
                },
                tooltip: {
                    callbacks: {
                        label(ctx) {
                            if (ctx.dataset.label === '95% CI' && Array.isArray(ctx.raw)) {
                                return `95% CI: [${ctx.raw[0]}, ${ctx.raw[1]}]`;
                            }
                            if (ctx.parsed.y === null) return null;
                            return `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { size: 10 } }
                },
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Calls', font: { size: 11 } },
                    ticks: { font: { size: 10 } }
                }
            }
        }
    });
}

// --- Analysis tabs ---

function initAnalysisTabs() {
    document.querySelectorAll('.analysis-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.analysis-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.analysis-pane').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`pane-${tab.dataset.tab}`).classList.add('active');
        });
    });
}

// --- Table sorting ---

function initTableSort() {
    document.querySelectorAll('#zipTable th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const key = th.dataset.sort;
            if (state.tableSort.key === key) {
                state.tableSort.asc = !state.tableSort.asc;
            } else {
                state.tableSort.key = key;
                state.tableSort.asc = key === 'neighborhood' || key === 'zip';
            }
            updateTable();
        });
    });
}

// --- Main render ---

function renderDashboard() {
    if (!state.dataLoaded || state.forecastIndex < 0) return;

    state.focusZip = state.selectedZip === 'all' ? getFocusZip() : state.selectedZip;

    document.getElementById('mapBadge').textContent =
        state.selectedZip === 'all' ? 'ZIP: all' : `ZIP: ${state.selectedZip}`;

    updateMetricsPanel();
    updatePredictionCard();
    updateMap();
    updateTable();
    updateChart();
}

function runForecast() {
    if (!state.dataLoaded) return;

    state.selectedZip = document.getElementById('zipSelect').value;
    resolveActiveIndices();

    if (!state.activeIndices.length) {
        alert('No data in selected date range. Please adjust dates.');
        return;
    }

    state.focusZip = state.selectedZip === 'all' ? null : state.selectedZip;
    renderDashboard();
}

// --- Init ---

function initEventListeners() {
    document.getElementById('runForecast').addEventListener('click', runForecast);
    document.getElementById('zipSelect').addEventListener('change', () => {
        state.selectedZip = document.getElementById('zipSelect').value;
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    initAnalysisTabs();
    initTableSort();
    loadAllData();
});
