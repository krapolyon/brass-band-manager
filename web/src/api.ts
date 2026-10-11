// The only place where the front calls the API.
//
//   const songs = await api<Song[]>('/api/songs');
//   await api('/api/songs', { method: 'POST', body: { title } });
//
// A refusal of the API ({"error": "<key>"}) or a server that does not answer
// becomes an ApiError, which the calling screen shows through its key.

/** Sent on the window when the API says that nobody is signed in any more. */
export const SESSION_ENDED = 'sessionEnded';

export class ApiError extends Error {
  constructor(
    /** HTTP status, or 0 when the server could not be reached. */
    readonly status: number,
    /** Key sent by the API, for instance "notFound". */
    readonly error: string,
    /** For "invalidInput": the faulty fields. */
    readonly fields: Record<string, string> = {},
  ) {
    super(error);
  }
}

type Options = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
};

export async function api<T>(path: string, { method = 'GET', body }: Options = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'unreachable');
  }

  const data = await response.json().catch(() => null);
  if (response.status === 401 && path !== '/api/me' && path !== '/api/session') {
    // The session ended elsewhere: the app is told, and asks who is signed in.
    window.dispatchEvent(new Event(SESSION_ENDED));
  }
  if (!response.ok) {
    throw new ApiError(response.status, data?.error ?? 'serverError', data?.fields);
  }

  return data as T;
}
