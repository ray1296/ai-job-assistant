import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getStatsOverview } from '../api/stats'

export const useStatsStore = defineStore('stats', () => {
  const overview = ref(null)
  const loading = ref(false)

  async function fetchOverview() {
    loading.value = true
    try {
      const res = await getStatsOverview()
      overview.value = res.data
      return res.data
    } finally {
      loading.value = false
    }
  }

  return { overview, loading, fetchOverview }
})
