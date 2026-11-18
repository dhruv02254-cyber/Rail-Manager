const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api').replace(/\/$/, '');

async function request(endpoint, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
  } catch {
    throw new Error(`Cannot reach API at ${API_BASE}. Check the backend URL and whether the service is running.`);
  }
  if (!response.ok) {
    let detail = response.statusText || 'API request failed';
    try { const body = await response.json(); detail = body.detail || JSON.stringify(body); } catch { /* keep status text */ }
    throw new Error(detail);
  }
  return response.json();
}

export const api = {
  getMaintenanceRequests: () => request('/maintenance-requests'),
  getAssets: () => request('/assets'),
  getTrains: () => request('/trains'),
  getBlocks: () => request('/blocks'),
  getModelStatus: () => request('/ai/model-status'),
  getIntelligentPlan: (requestId) => request(`/ai/intelligent-plan/${encodeURIComponent(requestId)}`, { method: 'POST' }),
  createOrApproveBlock: (data) => request('/blocks', { method: 'POST', body: JSON.stringify(data) }),
};
