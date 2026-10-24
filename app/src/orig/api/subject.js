import request from './request'

export const getSubjectList = () => request.get('/subject/list')
export const createSubject = (data) => request.post('/subject/create', data)
export const updateSubject = (id, data) => request.put(`/subject/${id}`, data)
export const deleteSubject = (id) => request.delete(`/subject/${id}`)
