/** Cliente HTTP da API. Envia cookies de sessão e o cabeçalho anti-CSRF. */
export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data || {};
    this.fields = this.data.fields || {};
  }
}

export async function api(path, { method = 'GET', body, signal } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      signal,
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('Sem conexão com o servidor. Verifique sua internet e tente de novo.', 0);
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error || 'Não foi possível concluir agora. Tente novamente.', res.status, data);
  return data;
}

api.get = (path, opts) => api(path, { ...opts, method: 'GET' });
api.post = (path, body) => api(path, { method: 'POST', body: body ?? {} });
api.put = (path, body) => api(path, { method: 'PUT', body: body ?? {} });
api.patch = (path, body) => api(path, { method: 'PATCH', body: body ?? {} });
api.del = (path) => api(path, { method: 'DELETE', body: {} });

/** Envia uma imagem (JPG/PNG/WEBP) para o servidor e devolve a URL pública. */
export async function uploadImage(file) {
  if (file.size > 5 * 1024 * 1024) throw new ApiError('A imagem deve ter no máximo 5 MB.', 413);
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new ApiError('Não foi possível ler o arquivo.', 0));
    reader.readAsDataURL(file);
  });
  const res = await api.post('/admin/uploads', { data });
  return res.url;
}
