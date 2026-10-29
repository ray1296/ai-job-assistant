import request from './request'

export const generateExam = (data) => request.post('/exam/generate', data)
export const submitExam = (data) => request.post('/exam/submit', data)
export const getExamRecords = () => request.get('/exam/records')
export const getWrongQuestions = () => request.get('/exam/wrong-questions')
export const removeWrongQuestion = (questionId) => request.delete(`/exam/wrong-questions/${questionId}`)
export const addWrongQuestion = (questionId) => request.post(`/exam/wrong-questions/${questionId}`)
