import { showToast } from 'vant'

// 用 fetch 适配原项目的 axios 调用：统一返回 { code: 200, data }
async function request(method, url, { params, body } = {}) {
  let full = '/api' + url
  if (params && Object.keys(params).length) {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) q.set(k, String(v))
    full += '?' + q.toString()
  }
  // 原项目用 FormData 传文件，这里转成 JSON（只取文件名和文本内容）
  if (body && typeof FormData !== "undefined" && body instanceof FormData) {
    const file = body.get("file")
    if (file && file.text) {
      const text = await file.text()
      body = { name: file.name, text }
    } else {
      body = {}
    }
  }
  const csrf = (window.__zgCsrf || '')
  const res = await fetch(full, {
    method,
    headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let json = null
  try { json = await res.json() } catch {}
  if (!res.ok) {
    const msg = json?.error || '请求失败'
    showToast(msg)
    return Promise.reject(new Error(msg))
  }
  return { code: 200, data: json, message: 'ok' }
}

const service = {
  get: (url, opts = {}) => request('GET', url, { params: opts.params }),
  post: (url, body, opts = {}) => request('POST', url, { body }),
  put: (url, body) => request('PUT', url, { body }),
  delete: (url) => request('DELETE', url),
}
export default service
