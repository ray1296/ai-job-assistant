import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { login as loginApi, register as registerApi, getProfile, updateProfile as updateProfileApi } from '../api/user'
import { getSubjectList, createSubject as createSubjectApi, deleteSubject as deleteSubjectApi } from '../api/subject'
import { getToken, setToken, removeToken, getUser, setUser, removeUser } from '../utils/auth'

export const useUserStore = defineStore('user', () => {
  const token = ref(getToken() || '')
  const userInfo = ref(getUser() || {})
  const subjects = ref([])

  const isLogin = computed(() => !!token.value)

  async function login(form) {
    const res = await loginApi(form)
    token.value = res.data.token
    userInfo.value = res.data
    setToken(res.data.token)
    setUser(res.data)
    return res
  }

  async function register(form) {
    const res = await registerApi(form)
    token.value = res.data.token
    userInfo.value = res.data
    setToken(res.data.token)
    setUser(res.data)
    return res
  }

  async function fetchProfile() {
    const res = await getProfile()
    userInfo.value = { ...userInfo.value, ...res.data }
    setUser(userInfo.value)
    return res.data
  }

  async function saveProfile(data) {
    await updateProfileApi(data)
    await fetchProfile()
  }

  async function fetchSubjects() {
    const res = await getSubjectList()
    subjects.value = res.data
    return res.data
  }

  async function addSubject(data) {
    await createSubjectApi(data)
    await fetchSubjects()
  }

  async function removeSubject(id) {
    await deleteSubjectApi(id)
    await fetchSubjects()
  }

  function logout() {
    token.value = ''
    userInfo.value = {}
    subjects.value = []
    removeToken()
    removeUser()
  }

  return {
    token, userInfo, subjects, isLogin,
    login, register, fetchProfile, saveProfile,
    fetchSubjects, addSubject, removeSubject, logout
  }
})
