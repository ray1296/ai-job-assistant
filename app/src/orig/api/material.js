import request from './request'

export const getMaterialList = (params) => request.get('/material/list', { params })
export const getMaterialDetail = (id) => request.get(`/material/${id}`)
export const createMaterial = (data) => request.post('/material/create', data)
export const updateMaterial = (id, data) => request.put(`/material/${id}`, data)
export const deleteMaterial = (id) => request.delete(`/material/${id}`)
export const getKnowledgePoints = (params) => request.get('/material/knowledge/list', { params })

// 上传知识点（结构化，自动制卡，可选出题）
export const uploadKnowledge = (data) => request.post('/material/upload-knowledge', data)

// 上传题库（结构化，直接存储）
export const uploadQuestions = (data) => request.post('/material/upload-questions', data)

// 获取科目复习数据
export const getSubjectReview = (subjectId, versionId) => {
  const params = {}
  if (versionId) params.versionId = versionId
  return request.get(`/material/subject/${subjectId}`, { params })
}

// 上传文件解析（Word/PDF/TXT/MD/JSON）
export const parseFile = (file) => {
  const formData = new FormData()
  formData.append('file', file)
  return request.post('/material/parse-file', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}

// 版本管理
export const getVersionList = (subjectId) => request.get(`/version/subject/${subjectId}`)
export const createVersion = (data) => request.post('/version/create', data)
export const renameVersion = (versionId, data) => request.put(`/version/${versionId}`, data)
export const deleteVersion = (versionId) => request.delete(`/version/${versionId}`)
