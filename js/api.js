const TASKS_API = './data/student-tasks.json';

export async function fetchExternalTasks({ timeoutMs = 10000 } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(TASKS_API, { signal: controller.signal });
        if (!response.ok) throw new Error('The college library is unavailable. Please retry.');
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error('The college library has an invalid format.');
        const text = (value, fallback = '') => typeof value === 'string' && value.trim() ? value.trim() : fallback;
        return data.map((item, index) => {
            if (!item || typeof item !== 'object' || !text(item.title)) {
                throw new Error(`Library template ${index + 1} is missing a valid title.`);
            }
            const course = text(item.course, 'General');
            const category = text(item.category, 'College');
            return {
                externalId: index + 1,
                title: text(item.title),
                description: text(item.description),
                status: 'todo',
                priority: ['low', 'medium', 'high', 'urgent'].includes(item.priority) ? item.priority : 'medium',
                category,
                course,
                tags: [...new Set([course, category])]
            };
        });
    } catch (error) {
        if (controller.signal.aborted) throw new Error('Loading the college library timed out. Please retry.');
        if (error instanceof SyntaxError) throw new Error('The college library contains unreadable JSON.');
        if (error instanceof TypeError) throw new Error('Could not connect to the college library. Check your connection and retry.');
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

// Promise chaining demonstrates lectures 25–26. Every request settles with
// either validated weather or an actionable error; missing data is never 0°C.
export function fetchWeatherByLocation(latitude, longitude, { timeoutMs = 10000 } = {}) {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        return Promise.reject(new Error('Your location is invalid. Please try again.'));
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}&current=temperature_2m,weather_code&timezone=auto`;
    return Promise.resolve()
        .then(() => fetch(url, { signal: controller.signal }))
        .then(response => {
            if (!response.ok) throw new Error('The weather service is unavailable. Please retry.');
            return response.json();
        })
        .then(data => {
            const current = data?.current;
            if (!Number.isFinite(current?.temperature_2m) || !Number.isInteger(current?.weather_code)) {
                throw new Error('The weather service returned incomplete data. Please retry.');
            }
            return {
                temperature: Math.round(current.temperature_2m),
                code: current.weather_code,
                description: weatherDescription(current.weather_code)
            };
        })
        .catch(error => {
            if (controller.signal.aborted) throw new Error('The weather request timed out. Please retry.');
            if (error instanceof TypeError) throw new Error('Could not connect to the weather service. Check your connection and retry.');
            if (error instanceof SyntaxError) throw new Error('The weather service returned unreadable data. Please retry.');
            throw error;
        })
        .finally(() => clearTimeout(timer));
}

export function getWeatherLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Location is not supported by this browser.'));
            return;
        }
        navigator.geolocation.getCurrentPosition(
            position => resolve(position.coords),
            error => reject(new Error({
                1: 'Location permission was denied. Allow location access to use local weather.',
                2: 'Your location is unavailable. Please try again.',
                3: 'Finding your location timed out. Please try again.'
            }[error.code] || 'Could not find your location. Please retry.')),
            { timeout: 10000, maximumAge: 300000, enableHighAccuracy: false }
        );
    });
}

function weatherDescription(code) {
    if (code === 0) return 'Clear sky';

    if ([1, 2, 3].includes(code)) {
        return 'Partly cloudy';
    }

    if ([45, 48].includes(code)) {
        return 'Foggy';
    }

    if (
        [51, 53, 55, 61, 63, 65, 80, 81, 82]
            .includes(code)
    ) {
        return 'Rainy';
    }

    if (
        [71, 73, 75, 77, 85, 86]
            .includes(code)
    ) {
        return 'Snowy';
    }

    if ([95, 96, 99].includes(code)) {
        return 'Thunderstorm';
    }

    return 'Mixed conditions';
}
