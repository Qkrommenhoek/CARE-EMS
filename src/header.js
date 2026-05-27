/**
 * CARE-EMS — citywide status banner
 */

import { state } from './state.js';
import { classifyDemand } from './classify.js';
import { statusLabel, statusClass } from './utils.js';

export function computeCitywideStatus(forecastIndex) {
    const idx = state.activeIndices[forecastIndex];
    if (idx === undefined) return null;

    let highCount = 0;
    let modCount = 0;

    state.zipList.forEach(zip => {
        const predicted = state.predictions[zip][idx];
        const status = classifyDemand(predicted, zip);
        if (status === 'HIGH') highCount++;
        else if (status === 'MED') modCount++;
    });

    const elevated = highCount + modCount;
    let overall;
    if (highCount > 0) overall = 'HIGH';
    else if (modCount > 0) overall = 'MED';
    else overall = 'NOR';

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    return { overall, elevated, timeStr };
}

export function renderCitywideStatus(vm) {
    const banner = document.getElementById('nycStatusBanner');
    if (!banner || !vm) return;

    banner.textContent = `NYC Overall: ${statusLabel(vm.overall)} \u00b7 ${vm.elevated} zone${vm.elevated !== 1 ? 's' : ''} elevated \u00b7 As of ${vm.timeStr}`;
    banner.className = `nyc-status ${statusClass(vm.overall)}`;
}

export function updateCitywideStatus() {
    renderCitywideStatus(computeCitywideStatus(state.forecastIndex));
}
