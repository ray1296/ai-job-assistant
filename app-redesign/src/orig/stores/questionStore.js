import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'
import {
  getQuestionList, getQuestionDetail, createQuestion,
  deleteQuestion, toggleFavorite, getFavoriteList
} from '../api/question'

export const useQuestionStore = defineStore('question', () => {
  const list = ref([])
  const total = ref(0)
  const current = ref(null)
  const favorites = ref([])
  const loading = ref(false)
  const query = reactive({
    subjectId: '', type: '', difficulty: '', keyword: '', page: 1, pageSize: 20
  })

  async function fetchList() {
    loading.value = true
    try {
      const res = await getQuestionList(query)
      list.value = res.data.list
      total.value = res.data.total
    } finally {
      loading.value = false
    }
  }

  async function fetchDetail(id) {
    const res = await getQuestionDetail(id)
    current.value = res.data
    return res.data
  }

  async function create(data) {
    return await createQuestion(data)
  }

  async function remove(id) {
    await deleteQuestion(id)
    await fetchList()
  }

  async function favorite(id) {
    await toggleFavorite(id)
    if (current.value && current.value.id === id) {
      current.value.favorited = !current.value.favorited
    }
  }

  async function fetchFavorites() {
    const res = await getFavoriteList()
    favorites.value = res.data
    return res.data
  }

  function resetQuery() {
    query.subjectId = ''
    query.type = ''
    query.difficulty = ''
    query.keyword = ''
    query.page = 1
  }

  return {
    list, total, current, favorites, loading, query,
    fetchList, fetchDetail, create, remove, favorite, fetchFavorites, resetQuery
  }
})
