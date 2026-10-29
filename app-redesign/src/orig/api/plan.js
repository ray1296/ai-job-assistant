import request from './request'

export const getPlanList = () => request.get('/plan/list')
export const createPlan = (data) => request.post('/plan/create', data)
export const updatePlan = (id, data) => request.put(`/plan/${id}`, data)
export const deletePlan = (id) => request.delete(`/plan/${id}`)
export const logStudy = (data) => request.post('/plan/log', data)
