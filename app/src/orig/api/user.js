import request from './request'

export const login = (data) => request.post('/user/login', data)
export const register = (data) => request.post('/user/register', data)
export const getProfile = () => request.get('/user/profile')
export const updateProfile = (data) => request.put('/user/profile', data)
export const updatePassword = (data) => request.put('/user/password', data)
