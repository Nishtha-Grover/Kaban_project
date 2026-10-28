// Shared JSON transport. Domain-specific validation belongs in each service.
export class ApiError extends Error {
    constructor(message, { code, status = 0 } = {}) {
        super(message);
        this.name = 'ApiError';
        this.code = code;
        this.status = status;
    }
}

export async function requestJson(url, {
    method = 'GET', json, headers = {}, timeoutMs = 30000,
    label = 'Request'
} = {}) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        throw new ApiError('Request timeout must be a positive number.', { code: 'CONFIG' });
    }
    const requestHeaders = new Headers(headers);
    requestHeaders.set('Accept', 'application/json');
    let body;
    if (json !== undefined) {
        body = JSON.stringify(json);
        requestHeaders.set('Content-Type', 'application/json');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            method, headers: requestHeaders, body, signal: controller.signal,
            credentials: 'same-origin'
        });
        if (!response.ok) {
            let message = response.status === 401 ? 'Please log in to continue.'
                : response.status === 403 ? 'You do not have access to this resource.'
                : response.status === 429 ? 'Too many requests. Wait a moment and retry.'
                : `${label} failed (HTTP ${response.status}). Please retry.`;
            // Only display structured validation messages from our task endpoint.
            if (typeof url === 'string' && url.startsWith('/api/tasks') && [400, 409].includes(response.status)) {
                const detail = await response.json().catch(() => null);
                if (typeof detail?.error?.message === 'string') message = detail.error.message;
                const fields = detail?.error?.fields;
                if (fields && typeof fields === 'object') message += ' ' + Object.entries(fields)
                    .filter(([, value]) => typeof value === 'string').map(([key, value]) => `${key}: ${value}`).join(' ');
            }
            throw new ApiError(message, { code: 'HTTP', status: response.status });
        }
        if (response.status === 204 || method.toUpperCase() === 'HEAD') return null;
        return await response.json();
    } catch (error) {
        if (controller.signal.aborted) throw new ApiError(`${label} timed out. Please retry.`, { code: 'TIMEOUT' });
        if (error instanceof ApiError) throw error;
        if (error instanceof SyntaxError) throw new ApiError(`${label} returned unreadable JSON.`, { code: 'PARSE' });
        if (error instanceof TypeError) throw new ApiError(`${label} could not connect. Check your connection and retry.`, { code: 'NETWORK' });
        throw error;
    } finally {
        clearTimeout(timer);
    }
}
