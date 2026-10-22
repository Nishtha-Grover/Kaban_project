const TASKS_API = './data/student-tasks.json';

export async function fetchExternalTasks() {
    const response = await fetch(TASKS_API);

    if (!response.ok) {
        throw new Error(
            `College task library failed with status ${response.status}`
        );
    }

    const data = await response.json();

    return data.map((item, index) => ({
        externalId: index + 1,
        title: item.title,
        description: item.description || '',
        status: 'todo',
        priority: item.priority || 'medium',
        category: item.category || 'College',
        course: item.course || 'General',
        tags: [
            item.course || 'College',
            item.category || 'Task'
        ]
    }));
}

export function fetchWeatherByLocation(latitude, longitude) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}&current=temperature_2m,weather_code&timezone=auto`;

    return fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error('Weather API request failed');
            }

            return response.json();
        })
        .then(data => ({
            temperature: Math.round(
                data.current?.temperature_2m ?? 0
            ),
            code: data.current?.weather_code ?? 0,
            description: weatherDescription(
                data.current?.weather_code
            )
        }));
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
