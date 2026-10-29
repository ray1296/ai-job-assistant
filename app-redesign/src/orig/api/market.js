import request from './request'

// 市场列表
export const getMarketList = (keyword) => {
  const params = {}
  if (keyword) params.keyword = keyword
  return request.get('/market/list', { params })
}

// 市场科目详情（只读预览）
export const getMarketDetail = (subjectId) => request.get(`/market/detail/${subjectId}`)

// 收录科目
export const importSubject = (data) => request.post('/market/import', data)
