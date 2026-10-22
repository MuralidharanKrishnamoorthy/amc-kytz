const BASE_URL = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  constructor(message, status, fields) {
    super(message);
    this.status = status;
    this.fields = fields ?? {};
  }
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, options);
  } catch (err) {
    // A cancelled request (e.g. the page unmounted) is not a connection problem.
    if (err.name === 'AbortError') throw err;
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
  }

  // The Vite dev proxy answers 502/504 when the API process is not running.
  if (response.status === 502 || response.status === 504) {
    throw new ApiError('The API server is not reachable. Make sure it is running.', response.status);
  }

  const body = await response.json().catch(() => ({}));
  if (options.signal?.aborted) throw new DOMException('Request aborted', 'AbortError');
  if (!response.ok) {
    throw new ApiError(body.error || `Request failed (${response.status})`, response.status, body.fields);
  }
  return body;
}

export const api = {
  getOptions: (signal) => request('/api/options', { signal }),
  getDashboard: (signal) => request('/api/dashboard', { signal }),
  getSites: (signal) => request('/api/sites', { signal }),
  getSite: (id, signal) => request(`/api/sites/${encodeURIComponent(id)}`, { signal }),
  agreementUrl: (siteId, contractId) =>
    `${BASE_URL}/api/sites/${encodeURIComponent(siteId)}/contracts/${encodeURIComponent(contractId)}/agreement`,
  createAmc: (payload, agreementFile) => {
    const form = new FormData();
    form.append('data', JSON.stringify(payload));
    if (agreementFile) form.append('agreement', agreementFile);
    return request('/api/amcs', { method: 'POST', body: form });
  },
};
