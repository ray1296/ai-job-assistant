import request from './request'

// 优化心愿池
export const getSuggestions = () => request.get('/suggestion/list')
export const submitSuggestion = (title, content) => request.post('/suggestion/submit', { title, content })
export const likeSuggestion = (id) => request.post(`/suggestion/${id}/like`)
