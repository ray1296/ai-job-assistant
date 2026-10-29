import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getPlanList, createPlan, updatePlan, deletePlan, logStudy } from '../api/plan'

export const usePlanStore = defineStore('plan', () => {
  const list = ref([])
  const loading = ref(false)

  async function fetchList() {
    loading.value = true
    try {
      const res = await getPlanList()
      list.value = res.data
    } finally {
      loading.value = false
    }
  }

  async function create(data) {
    await createPlan(data)
    await fetchList()
  }

  async function update(id, data) {
    await updatePlan(id, data)
    await fetchList()
  }

  async function remove(id) {
    await deletePlan(id)
    await fetchList()
  }

  async function log(data) {
    return await logStudy(data)
  }

  return { list, loading, fetchList, create, update, remove, log }
})
