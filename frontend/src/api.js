export async function api(path = '', options = {}) {
  let response;
  try {
    response = await fetch(`/api/shortcuts${path}`, options);
  } catch {
    throw new Error("L’API est injoignable. Vérifiez que Flask est démarré.");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `Erreur API (${response.status}).`);
  if (data === null) throw new Error("Réponse API invalide. Vérifiez le proxy Vite.");
  return data;
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}
