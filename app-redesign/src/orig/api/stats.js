import request from './request'

export const getStatsOverview = () => request.get('/stats/overview')
