function xsrfToken(): string {
    const match = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]*)/);

    return match ? decodeURIComponent(match[1]) : '';
}

/**
 * Small JSON fetch helper for the game's non-Inertia endpoints
 * (matchmaking, heartbeats), using Laravel's XSRF cookie.
 */
export async function sendJson<T = unknown>(
    route: { url: string; method: string },
    body?: Record<string, unknown>,
    init: RequestInit = {},
): Promise<T> {
    const response = await fetch(route.url, {
        method: route.method.toUpperCase(),
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-XSRF-TOKEN': xsrfToken(),
        },
        credentials: 'same-origin',
        body: body ? JSON.stringify(body) : undefined,
        ...init,
    });

    if (!response.ok) {
        throw new Error(
            `Request to ${route.url} failed with ${response.status}`,
        );
    }

    return response.status === 204
        ? (undefined as T)
        : ((await response.json()) as T);
}
