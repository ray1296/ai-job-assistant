import request from './request'

export const getQuestionList = (params) => request.get('/question/list', { params })
export const getQuestionDetail = (id) => request.get(`/question/${id}`)
export const createQuestion = (data) => request.post('/question/create', data)
export const deleteQuestion = (id) => request.delete(`/question/${id}`)
export const toggleFavorite = (id) => request.post(`/question/${id}/favorite`)
export const getFavoriteList = () => request.get('/question/favorites/list')
export const getRandomQuestions = (params) => request.get('/question/random', { params })
export const getQuestionStats = (params) => request.get('/question/stats/overview', { params })
