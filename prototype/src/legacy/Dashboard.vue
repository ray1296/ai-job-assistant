<template>
  <div class="dashboard-container">
    <!-- 顶部标题 -->
    <div class="dashboard-header">
      <h1>求职大数据可视化分析平台</h1>
      <div class="header-time">{{ currentTime }}</div>
    </div>

    <div class="dashboard-selector">
      <div class="selector-label">城市</div>
      <div class="city-wheel">
        <button v-for="(c, i) in cityList" :key="i" class="city-wheel-item" :class="{ active: selectedCity === c }" @click="selectedCity = c">{{ c }}</button>
      </div>
      <div class="selector-label">方向</div>
      <select v-model="selectedDirection" class="direction-wheel">
        <option v-for="(d, i) in directionList" :key="i">{{ d }}</option>
      </select>
    </div>

    <!-- 主体内容 -->
    <div class="dashboard-main">
      <!-- 左侧面板 -->
      <div class="panel-left">
        <!-- 岗位分布 -->
        <div class="panel-item">
          <div class="panel-title">
            <span class="icon">📊</span>
            <span>岗位城市分布</span>
          </div>
          <div class="panel-content" ref="cityChartRef"></div>
        </div>

        <!-- 薪资分布 -->
        <div class="panel-item">
          <div class="panel-title">
            <span class="icon">💰</span>
            <span>薪资水平分析</span>
          </div>
          <div class="panel-content" ref="salaryChartRef"></div>
        </div>

        <!-- 学历要求 -->
        <div class="panel-item">
          <div class="panel-title">
            <span class="icon">🎓</span>
            <span>学历要求分布</span>
          </div>
          <div class="panel-content" ref="educationChartRef"></div>
        </div>
      </div>

      <!-- 中间地图 -->
      <div class="panel-center">
        <div class="panel-item map-panel">
          <div class="panel-title">
            <span class="icon">🗺️</span>
            <span>全国岗位分布</span>
          </div>
          <div class="panel-content" ref="mapChartRef"></div>
        </div>

        <!-- 滚动数据 -->
        <div class="scroll-data" 
             @mouseenter="pauseScroll" 
             @mouseleave="resumeScroll"
             @wheel="handleWheel">
          <div class="scroll-title">实时岗位动态</div>
          <div class="scroll-content" ref="scrollContentRef">
            <div class="scroll-list" :style="{ transform: `translateY(-${scrollY}px)` }">
              <div 
                v-for="(job, index) in displayJobsList" 
                :key="index" 
                class="scroll-item"
                @click="showJobDetail(job)">
                <span class="job-name">{{ job.workname }}</span>
                <span class="job-city">{{ job.city }}</span>
                <span class="job-salary">{{ job.salary }}</span>
                <el-button type="primary" size="small" class="view-btn" @click.stop="showJobDetail(job)">
                  查看
                </el-button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧面板 -->
      <div class="panel-right">
        <!-- 词云 -->
        <div class="panel-item">
          <div class="panel-title">
            <span class="icon">☁️</span>
            <span>热门技能词云</span>
          </div>
          <div class="panel-content" ref="wordCloudRef"></div>
        </div>

        <!-- 工作年限 -->
        <div class="panel-item">
          <div class="panel-title">
            <span class="icon">📅</span>
            <span>工作经验要求</span>
          </div>
          <div class="panel-content" ref="experienceChartRef"></div>
        </div>

        <!-- 热门岗位 -->
        <div class="panel-item">
          <div class="panel-title">
            <span class="icon">🔥</span>
            <span>热门岗位TOP10</span>
          </div>
          <div class="panel-content">
            <div class="rank-list">
              <div v-for="(job, index) in topJobs" :key="index" class="rank-item">
                <span class="rank-num" :class="'rank-' + (index + 1)">{{ index + 1 }}</span>
                <span class="rank-name">{{ job.name }}</span>
                <span class="rank-count">{{ job.count }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 岗位详情弹窗 -->
    <el-dialog
      v-model="showDetailModal"
      :title="currentJobDetail?.workname"
      width="500px"
      class="job-detail-dialog"
    >
      <div v-if="currentJobDetail" class="job-detail-content">
        <div class="detail-row">
          <span class="label">薪资：</span>
          <span class="value salary">{{ currentJobDetail.salary }}</span>
        </div>
        <div class="detail-row">
          <span class="label">城市：</span>
          <span class="value">{{ currentJobDetail.city }}</span>
        </div>
        <div class="detail-row">
          <span class="label">公司：</span>
          <span class="value">{{ currentJobDetail.company }}</span>
        </div>
        <div class="detail-row">
          <span class="label">来源：</span>
          <span class="value source">{{ currentJobDetail.source }}</span>
        </div>
        <div class="detail-row">
          <span class="label">发布时间：</span>
          <span class="value">{{ currentJobDetail.publishTime }}</span>
        </div>
        <div class="detail-tags">
          <el-tag v-for="tag in currentJobDetail.tags" :key="tag" type="success">{{ tag }}</el-tag>
        </div>
      </div>
      <template #footer>
        <el-button @click="closeDetailModal">关闭</el-button>
        <el-button type="primary" @click="goToApply">立即投递</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import * as echarts from 'echarts'
import { ElMessage } from './preview.js'

// 图表引用
const cityChartRef = ref<HTMLElement>()
const salaryChartRef = ref<HTMLElement>()
const educationChartRef = ref<HTMLElement>()
const mapChartRef = ref<HTMLElement>()
const wordCloudRef = ref<HTMLElement>()
const experienceChartRef = ref<HTMLElement>()
const scrollContentRef = ref<HTMLElement>()

// 当前时间
const currentTime = ref('')
let timeInterval: number

// 滚动数据
const scrollY = ref(0)
const jobsList = ref<any[]>([])
let scrollInterval: number
let isScrollPaused = false
const itemHeight = 40  // 每行高度

// 无限循环：复制两份数据实现无缝滚动
const displayJobsList = computed(() => {
  return [...jobsList.value, ...jobsList.value]
})

// 当前选中的岗位详情
const currentJobDetail = ref<any>(null)
const showDetailModal = ref(false)

// 城市与方向筛选（横向滚轮）
const cityList = ref([
  '全国', '北京', '上海', '广州', '深圳', '杭州', '成都', '南京', '武汉',
  '西安', '苏州', '长沙', '重庆', '天津', '合肥', '郑州', '厦门', '济南',
  '青岛', '宁波', '大连', '无锡', '福州', '昆明', '沈阳', '佛山', '东莞',
  '珠海', '石家庄', '太原', '南昌', '贵阳', '南宁', '哈尔滨', '长春', '兰州'
])
const directionList = ref([
  '全部方向', 'Agent 开发', 'Java 后端', '前端开发', '数据分析',
  '软件测试', '运维 / 网络', '算法', '产品经理'
])
const selectedCity = ref('全国')
const selectedDirection = ref('全部方向')

// 热门岗位
const topJobs = ref([
  { name: '大数据开发工程师', count: 1280 },
  { name: 'Java开发工程师', count: 1156 },
  { name: '前端开发工程师', count: 982 },
  { name: '网络工程师', count: 920 },
  { name: 'Python开发工程师', count: 876 },
  { name: '数据分析师', count: 754 },
  { name: '网络安全工程师', count: 720 },
  { name: '算法工程师', count: 689 },
  { name: '运维工程师', count: 645 },
  { name: '产品经理', count: 623 }
])

// 图表实例
let cityChart: echarts.ECharts
let salaryChart: echarts.ECharts
let educationChart: echarts.ECharts
let mapChart: echarts.ECharts
let experienceChart: echarts.ECharts

// 更新时间
const updateTime = () => {
  const now = new Date()
  currentTime.value = now.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'long'
  })
}

// 初始化城市分布图
const initCityChart = () => {
  if (!cityChartRef.value) return
  cityChart = echarts.init(cityChartRef.value)
  
  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: ['北京', '上海', '深圳', '广州', '杭州', '成都', '南京', '武汉'],
      axisLine: { lineStyle: { color: '#4fd1c5' } },
      axisLabel: { color: '#a0aec0', fontSize: 11 }
    },
    yAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: '#4fd1c5' } },
      axisLabel: { color: '#a0aec0' },
      splitLine: { lineStyle: { color: 'rgba(79, 209, 197, 0.1)' } }
    },
    series: [{
      data: [1200, 980, 890, 760, 650, 540, 430, 320],
      type: 'bar',
      barWidth: '50%',
      itemStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: '#4fd1c5' },
          { offset: 1, color: '#3182ce' }
        ])
      }
    }]
  }
  
  cityChart.setOption(option)
}

// 初始化薪资图
const initSalaryChart = () => {
  if (!salaryChartRef.value) return
  salaryChart = echarts.init(salaryChartRef.value)
  
  const option = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item' },
    legend: {
      orient: 'vertical',
      right: '5%',
      top: 'center',
      textStyle: { color: '#a0aec0' }
    },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['40%', '50%'],
      avoidLabelOverlap: false,
      itemStyle: {
        borderRadius: 10,
        borderColor: '#1a202c',
        borderWidth: 2
      },
      label: { show: false },
      emphasis: {
        label: { show: true, fontSize: 14, fontWeight: 'bold', color: '#fff' }
      },
      labelLine: { show: false },
      data: [
        { value: 1048, name: '10-15K', itemStyle: { color: '#4fd1c5' } },
        { value: 735, name: '15-25K', itemStyle: { color: '#63b3ed' } },
        { value: 580, name: '25-35K', itemStyle: { color: '#805ad5' } },
        { value: 484, name: '35K+', itemStyle: { color: '#f687b3' } },
        { value: 300, name: '10K以下', itemStyle: { color: '#fc8181' } }
      ]
    }]
  }
  
  salaryChart.setOption(option)
}

// 初始化学历图
const initEducationChart = () => {
  if (!educationChartRef.value) return
  educationChart = echarts.init(educationChartRef.value)
  
  const option = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    radar: {
      indicator: [
        { name: '本科', max: 1000 },
        { name: '硕士', max: 1000 },
        { name: '大专', max: 1000 },
        { name: '不限', max: 1000 },
        { name: '博士', max: 1000 }
      ],
      axisName: { color: '#a0aec0' },
      splitArea: { areaStyle: { color: ['rgba(79, 209, 197, 0.1)', 'rgba(79, 209, 197, 0.2)'] } },
      splitLine: { lineStyle: { color: 'rgba(79, 209, 197, 0.3)' } }
    },
    series: [{
      type: 'radar',
      data: [{
        value: [850, 420, 380, 280, 85],
        name: '学历要求',
        areaStyle: { color: 'rgba(79, 209, 197, 0.3)' },
        lineStyle: { color: '#4fd1c5' },
        itemStyle: { color: '#4fd1c5' }
      }]
    }]
  }
  
  educationChart.setOption(option)
}

// 初始化地图 - 3D立体圆柱效果
const initMapChart = async () => {
  if (!mapChartRef.value) return
  mapChart = echarts.init(mapChartRef.value)
  
  // 加载中国地图数据
  try {
    const response = await fetch('/china.json')
    const chinaJson = await response.json()
    echarts.registerMap('china', chinaJson)
  } catch (e) {
    console.error('地图数据加载失败:', e)
    return
  }
  
  // 省份数据
  const provinceData = [
    { name: '北京', value: 1580, coord: [116.46, 39.92] },
    { name: '上海', value: 1350, coord: [121.48, 31.22] },
    { name: '广东', value: 1280, coord: [113.23, 23.16] },
    { name: '浙江', value: 980, coord: [120.19, 30.26] },
    { name: '江苏', value: 920, coord: [118.78, 32.04] },
    { name: '四川', value: 850, coord: [104.06, 30.67] },
    { name: '山东', value: 780, coord: [117.00, 36.65] },
    { name: '湖北', value: 720, coord: [114.31, 30.52] },
    { name: '河南', value: 680, coord: [113.65, 34.76] },
    { name: '福建', value: 650, coord: [119.30, 26.08] },
    { name: '湖南', value: 620, coord: [112.98, 28.21] },
    { name: '安徽', value: 580, coord: [117.27, 31.86] },
    { name: '陕西', value: 540, coord: [108.95, 34.27] },
    { name: '重庆', value: 520, coord: [106.54, 29.59] },
    { name: '天津', value: 480, coord: [117.19, 39.13] },
    { name: '河北', value: 450, coord: [114.48, 38.03] },
    { name: '辽宁', value: 420, coord: [123.43, 41.80] },
    { name: '云南', value: 380, coord: [102.71, 25.04] },
    { name: '广西', value: 350, coord: [108.32, 22.82] },
    { name: '江西', value: 320, coord: [115.89, 28.68] },
    { name: '山西', value: 300, coord: [112.55, 37.87] },
    { name: '贵州', value: 280, coord: [106.71, 26.57] },
    { name: '黑龙江', value: 260, coord: [126.63, 45.75] },
    { name: '吉林', value: 240, coord: [125.32, 43.82] },
    { name: '甘肃', value: 220, coord: [103.82, 36.06] },
    { name: '内蒙古', value: 200, coord: [111.75, 40.84] },
    { name: '新疆', value: 180, coord: [87.62, 43.83] },
    { name: '海南', value: 160, coord: [110.35, 20.02] },
    { name: '宁夏', value: 140, coord: [106.27, 38.47] },
    { name: '青海', value: 120, coord: [101.78, 36.62] },
    { name: '西藏', value: 100, coord: [91.11, 29.65] }
  ]
  
  // 数据映射
  const dataMap = new Map(provinceData.map(p => [p.name, p.value]))
  
  // 根据数值获取颜色
  const getBarColor = (value: number) => {
    if (value >= 1000) return '#ffd700'
    if (value >= 600) return '#ff6b6b'
    if (value >= 300) return '#4fd1c5'
    return '#63b3ed'
  }
  
  // 获取渐变色（模拟3D立体效果）
  const getGradientColor = (color: string) => {
    return new echarts.graphic.LinearGradient(0, 0, 1, 0, [
      { offset: 0, color: color },
      { offset: 0.3, color: lightenColor(color, 30) },  // 高光
      { offset: 0.5, color: lightenColor(color, 50) },  // 最亮
      { offset: 0.7, color: lightenColor(color, 30) },
      { offset: 1, color: darkenColor(color, 20) }  // 阴影
    ])
  }
  
  // 颜色变亮
  const lightenColor = (color: string, percent: number) => {
    const num = parseInt(color.replace('#', ''), 16)
    const amt = Math.round(2.55 * percent)
    const R = Math.min(255, (num >> 16) + amt)
    const G = Math.min(255, ((num >> 8) & 0x00FF) + amt)
    const B = Math.min(255, (num & 0x0000FF) + amt)
    return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)
  }
  
  // 颜色变暗
  const darkenColor = (color: string, percent: number) => {
    const num = parseInt(color.replace('#', ''), 16)
    const amt = Math.round(2.55 * percent)
    const R = Math.max(0, (num >> 16) - amt)
    const G = Math.max(0, ((num >> 8) & 0x00FF) - amt)
    const B = Math.max(0, (num & 0x0000FF) - amt)
    return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)
  }
  
  const hasRipple = (value: number) => value >= 1000
  
  // 柱子宽度（和底座实心圆一致）
  const barWidth = 10
  
  const option: any = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(26, 32, 44, 0.95)',
      borderColor: '#4fd1c5',
      borderWidth: 1,
      textStyle: { color: '#fff' },
      formatter: (params: any) => {
        const name = params.name || ''
        const value = dataMap.get(name) || '-'
        return `<div style="font-weight:bold;color:#ffd700;font-size:14px;margin-bottom:6px;">${name}</div>
                <div style="font-size:13px;">岗位数: <span style="color:#4fd1c5;font-weight:bold;">${value}</span></div>`
      }
    },
    geo: {
      map: 'china',
      roam: true,
      zoom: 1.2,
      center: [105, 36],
      label: { show: false },
      itemStyle: {
        areaColor: '#1a365d',
        borderColor: '#4fd1c5',
        borderWidth: 1
      },
      emphasis: {
        itemStyle: { areaColor: '#2a4a6d' },
        label: { show: false }
      }
    },
    series: [
      // 柱子 - 3D立体圆柱（使用渐变模拟）
      {
        type: 'scatter',
        coordinateSystem: 'geo',
        data: provinceData.map(item => {
          const color = getBarColor(item.value)
          const height = Math.max(item.value / 15, 15)
          return {
            name: item.name,
            value: [...item.coord, item.value],
            symbol: 'rect',
            symbolSize: [barWidth, height],
            symbolOffset: [0, -height / 2],
            itemStyle: {
              color: getGradientColor(color),  // 渐变模拟3D效果
              opacity: 0.5,
              shadowBlur: 8,
              shadowColor: 'rgba(0, 0, 0, 0.3)',
              shadowOffsetX: 2,
              shadowOffsetY: 2
            },
            tooltip: { show: false }
          }
        }),
        z: 2
      },
      // 底座 - 实心圆（和柱子同宽）
      {
        type: 'scatter',
        coordinateSystem: 'geo',
        data: provinceData.map(item => ({
          name: item.name,
          value: [...item.coord, item.value],
          symbolSize: barWidth,  // 和柱子同宽
          itemStyle: { 
            color: getBarColor(item.value),
            opacity: 0.6
          },
          tooltip: { show: false }
        })),
        z: 1
      },
      // 金色涟漪 - 柱子宽度的两倍
      {
        type: 'effectScatter',
        coordinateSystem: 'geo',
        data: provinceData
          .filter(p => hasRipple(p.value))
          .map(item => ({
            name: item.name,
            value: [...item.coord, item.value]
          })),
        symbolSize: barWidth * 2,
        rippleEffect: {
          brushType: 'stroke',
          scale: 2,
          period: 3
        },
        itemStyle: {
          color: '#ffd700',
          shadowBlur: 6,
          shadowColor: '#ffd700'
        },
        tooltip: { show: false },
        z: 3
      }
    ]
  }
  
  mapChart.setOption(option)
}

// 获取渐变颜色
const getGradientColor = (index: number): string => {
  const colors = ['#4fd1c5', '#63b3ed', '#805ad5', '#f687b3', '#f6e05e', '#68d391', '#fc8181']
  return colors[index % colors.length]
}

// 获取城市坐标
const getCityCoord = (city: string): number[] => {
  const coords: Record<string, number[]> = {
    '北京': [116.46, 39.92],
    '上海': [121.48, 31.22],
    '深圳': [114.07, 22.62],
    '广州': [113.23, 23.16],
    '杭州': [120.19, 30.26],
    '成都': [104.06, 30.67],
    '南京': [118.78, 32.04],
    '武汉': [114.31, 30.52],
    '西安': [108.95, 34.27],
    '重庆': [106.54, 29.59]
  }
  return coords[city] || [0, 0]
}

// 初始化词云 - 3D球形旋转效果
let wordCloudTimer: number
let wordCloudAngle = 0
let wordCloudCanvas: HTMLCanvasElement | null = null

const initWordCloud = () => {
  if (!wordCloudRef.value) return

  const container = wordCloudRef.value
  let width = container.clientWidth
  let height = container.clientHeight

  if (width <= 0 || height <= 0) {
    width = 300
    height = 250
  }

  container.innerHTML = ''
  container.style.position = 'relative'
  container.style.overflow = 'hidden'

  const words = [
    { text: 'Java', size: 26 }, { text: 'Python', size: 25 },
    { text: 'SQL', size: 23 }, { text: 'Hadoop', size: 20 },
    { text: 'Spark', size: 19 }, { text: 'Flink', size: 18 },
    { text: 'Kafka', size: 17 }, { text: 'Hive', size: 15 },
    { text: 'HBase', size: 14 }, { text: 'Redis', size: 14 },
    { text: 'MySQL', size: 14 }, { text: 'Vue', size: 22 },
    { text: 'React', size: 20 }, { text: 'TypeScript', size: 18 },
    { text: 'Node.js', size: 17 }, { text: 'Docker', size: 16 },
    { text: 'K8s', size: 14 }, { text: 'Spring', size: 18 },
    { text: 'MongoDB', size: 14 }, { text: 'Linux', size: 16 },
    { text: 'Go', size: 19 }, { text: 'Rust', size: 13 },
    { text: 'Cisco', size: 17 }, { text: 'Huawei', size: 17 },
    { text: 'TCP/IP', size: 19 }, { text: 'BGP', size: 13 },
    { text: 'OSPF', size: 13 }, { text: 'DNS', size: 15 },
    { text: 'VPN', size: 15 }, { text: 'SDN', size: 16 },
    { text: '防火墙', size: 15 }, { text: '负载均衡', size: 14 }
  ]

  const colors = ['#4fd1c5', '#63b3ed', '#805ad5', '#f687b3', '#fc8181', '#f6e05e', '#68d391']

  const cx = width / 2
  const cy = height / 2
  const R = Math.min(width, height) * 0.5

  // 云朵剪影：平底圆角矩形 + 顶部三个蓬松凸起，单一 SVG 联合填充（无内部线条）
  const rxb = cx - 0.95 * R
  const ryb = cy - 0.06 * R
  const rw = 1.9 * R
  const rh = 0.6 * R
  const rr = 0.3 * R
  const cloudSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%"><g fill="rgba(255,255,255,0.4)"><rect x="${rxb}" y="${ryb}" width="${rw}" height="${rh}" rx="${rr}"/><circle cx="${cx - 0.58 * R}" cy="${cy - 0.06 * R}" r="${0.42 * R}"/><circle cx="${cx}" cy="${cy - 0.24 * R}" r="${0.5 * R}"/><circle cx="${cx + 0.58 * R}" cy="${cy - 0.06 * R}" r="${0.42 * R}"/></g></svg>`

  const bg = document.createElement('div')
  bg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:0;filter:drop-shadow(0 2px 8px rgba(255,255,255,0.12))'
  bg.innerHTML = cloudSvg
  container.appendChild(bg)

  wordCloudCanvas = document.createElement('canvas')
  wordCloudCanvas.width = width
  wordCloudCanvas.height = height
  wordCloudCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:1'
  container.appendChild(wordCloudCanvas)

  const ctx = wordCloudCanvas.getContext('2d')
  if (!ctx) return

  // 词：横向宽椭圆散布（贴合云朵横向轮廓），无发光、仅轻微浮动
  const placements = words.map((w, i) => {
    const angle = (i / words.length) * Math.PI * 2 + i * 0.53
    const rx = R * 0.82 * (0.32 + (i % 6) * 0.13)
    const ry = R * 0.34 * (0.3 + (i % 5) * 0.16)
    return {
      ...w,
      color: colors[i % colors.length],
      bx: cx + Math.cos(angle) * rx,
      by: cy + Math.sin(angle) * ry + 0.02 * R,
      phase: (i * 0.7) % (Math.PI * 2)
    }
  })

  const animate = () => {
    if (!ctx || !wordCloudCanvas) return

    ctx.clearRect(0, 0, width, height)

    const t = performance.now() / 1000
    for (const p of placements) {
      const fy = Math.sin(t * 0.6 + p.phase) * 2.5
      const fx = Math.cos(t * 0.5 + p.phase) * 2
      ctx.save()
      ctx.translate(p.bx + fx, p.by + fy)
      ctx.font = `bold ${p.size}px Arial`
      ctx.fillStyle = p.color
      ctx.globalAlpha = 0.95
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
      ctx.fillText(p.text, 0, 0)
      ctx.restore()
    }

    wordCloudTimer = requestAnimationFrame(animate)
  }

  animate()
}

// 初始化经验图
const initExperienceChart = () => {
  if (!experienceChartRef.value) return
  experienceChart = echarts.init(experienceChartRef.value)
  
  const option = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item' },
    series: [{
      type: 'pie',
      radius: ['30%', '60%'],
      center: ['50%', '50%'],
      roseType: 'area',
      itemStyle: {
        borderRadius: 5,
        borderColor: '#1a202c',
        borderWidth: 2
      },
      label: {
        color: '#a0aec0',
        fontSize: 11
      },
      labelLine: {
        lineStyle: { color: '#4a5568' }
      },
      data: [
        { value: 420, name: '1-3年', itemStyle: { color: '#4fd1c5' } },
        { value: 380, name: '3-5年', itemStyle: { color: '#63b3ed' } },
        { value: 280, name: '5-10年', itemStyle: { color: '#805ad5' } },
        { value: 180, name: '不限', itemStyle: { color: '#f687b3' } },
        { value: 120, name: '应届', itemStyle: { color: '#fc8181' } }
      ]
    }]
  }
  
  experienceChart.setOption(option)
}

// 加载数据
const loadData = async () => {
  try {
    const response = await fetch('/dashboard-preview.json')
    const data = await response.json()
    if (data.zong) {
      jobsList.value = data.zong.slice(0, 50)
    }
  } catch (error) {
    console.error('加载数据失败:', error)
    // 使用模拟数据
    const positions = [
      '大数据开发工程师', 'Java开发工程师', '前端开发工程师', 'Python开发工程师',
      '网络工程师', '网络安全工程师', '云计算运维工程师', 'DevOps工程师',
      '算法工程师', '数据分析师', '产品经理', '测试工程师'
    ]
    const cities = ['北京', '上海', '深圳', '广州', '杭州', '成都', '南京', '武汉']
    
    jobsList.value = Array(30).fill(0).map((_, i) => ({
      workname: positions[i % positions.length],
      city: cities[i % cities.length],
      salary: `${10 + (i % 5) * 5}k-${20 + (i % 5) * 8}k`
    }))
  }
}

// 开始滚动 - 无限循环滚动
const startScroll = () => {
  scrollInterval = window.setInterval(() => {
    if (isScrollPaused) return
    
    scrollY.value += 1
    // 当滚动到第一份数据末尾时，瞬间跳回开头（无缝循环）
    if (scrollY.value >= jobsList.value.length * itemHeight) {
      scrollY.value = 0
    }
  }, 50)
}

// 鼠标悬停暂停
const pauseScroll = () => {
  isScrollPaused = true
}

// 鼠标移出继续
const resumeScroll = () => {
  isScrollPaused = false
}

// 鼠标滚轮控制
const handleWheel = (e: WheelEvent) => {
  e.preventDefault()
  const delta = e.deltaY > 0 ? 10 : -10
  scrollY.value = Math.max(0, Math.min(scrollY.value + delta, jobsList.value.length * itemHeight - itemHeight))
}

// 显示岗位详情
const showJobDetail = (job: any) => {
  currentJobDetail.value = {
    ...job,
    id: Math.random().toString(36).substr(2, 9),
    company: ['字节跳动', '阿里巴巴', '腾讯', '美团', '百度', '华为', '小米'][Math.floor(Math.random() * 7)],
    tags: ['急招', '五险一金', '股票期权', '免费三餐'].slice(0, Math.floor(Math.random() * 3) + 1),
    publishTime: '刚刚',
    source: 'Boss直聘',
    sourceUrl: 'https://www.zhipin.com/job_detail/' + Math.random().toString(36).substr(2, 9)
  }
  showDetailModal.value = true
}

// 关闭详情弹窗
const closeDetailModal = () => {
  showDetailModal.value = false
  currentJobDetail.value = null
}

// 跳转到投递页面
const goToApply = () => {
  if (currentJobDetail.value?.sourceUrl) {
    window.open(currentJobDetail.value.sourceUrl, '_blank')
    ElMessage.success('已跳转到投递页面')
  }
}

// 窗口大小变化
const handleResize = () => {
  cityChart?.resize()
  salaryChart?.resize()
  educationChart?.resize()
  mapChart?.resize()
  experienceChart?.resize()
}

onMounted(async () => {
  // 更新时间
  updateTime()
  timeInterval = window.setInterval(updateTime, 1000)
  
  // 初始化图表（增加延迟确保 DOM 完全渲染）
  setTimeout(async () => {
    try {
      console.log('开始初始化图表...')
      
      // 左侧图表
      initCityChart()
      console.log('城市分布图初始化完成')
      
      initSalaryChart()
      console.log('薪资图初始化完成')
      
      initEducationChart()
      console.log('学历图初始化完成')
      
      // 中间地图
      await initMapChart()
      console.log('地图初始化完成')
      
      // 右侧图表
      initWordCloud()
      console.log('词云初始化完成')
      
      initExperienceChart()
      console.log('工作经验图初始化完成')
      
      // 强制 resize 确保图表渲染
      setTimeout(() => {
        cityChart?.resize()
        salaryChart?.resize()
        educationChart?.resize()
        mapChart?.resize()
        experienceChart?.resize()
        console.log('图表 resize 完成')
      }, 300)
    } catch (e) {
      console.error('图表初始化失败:', e)
    }
  }, 300)
  
  // 加载数据并开始滚动
  loadData().then(() => {
    startScroll()
  })
  
  // 监听窗口变化
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  clearInterval(timeInterval)
  clearInterval(scrollInterval)
  cancelAnimationFrame(wordCloudTimer)
  window.removeEventListener('resize', handleResize)
  
  cityChart?.dispose()
  salaryChart?.dispose()
  educationChart?.dispose()
  mapChart?.dispose()
  experienceChart?.dispose()
})
</script>

<style lang="scss" scoped>
.dashboard-container {
  width: 100%;
  min-height: 100vh;
  background: linear-gradient(135deg, #1a202c 0%, #2d3748 50%, #1a202c 100%);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.dashboard-header {
  height: 80px;
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
  background: linear-gradient(180deg, rgba(79, 209, 197, 0.2) 0%, transparent 100%);
  border-bottom: 1px solid rgba(79, 209, 197, 0.3);
  
  h1 {
    font-size: 32px;
    font-weight: bold;
    background: linear-gradient(90deg, #4fd1c5, #63b3ed);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    text-shadow: 0 0 30px rgba(79, 209, 197, 0.5);
    letter-spacing: 8px;
  }
  
  .header-time {
    position: absolute;
    right: 30px;
    font-size: 14px;
    color: #a0aec0;
  }
}

.dashboard-main {
  flex: 1;
  display: flex;
  padding: 20px;
  gap: 20px;
}

.panel-left,
.panel-right {
  width: 260px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.panel-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.panel-item {
  flex: 1 1 0;
  background: rgba(45, 55, 72, 0.6);
  border-radius: 8px;
  border: 1px solid rgba(79, 209, 197, 0.2);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 180px;
  
  &.map-panel {
    flex: 2 1 0;  // 地图占2份，对应左侧/右侧前两个图表
    min-height: 240px;
  }
}

.panel-title {
  height: 40px;
  display: flex;
  align-items: center;
  padding: 0 15px;
  background: linear-gradient(90deg, rgba(79, 209, 197, 0.2), transparent);
  border-bottom: 1px solid rgba(79, 209, 197, 0.2);
  color: #4fd1c5;
  font-size: 14px;
  font-weight: bold;
  
  .icon {
    margin-right: 8px;
  }
}

.panel-content {
  flex: 1;
  padding: 10px;
}

.scroll-data {
  flex: 1 1 0;  // 让滚动列表自适应高度
  min-height: 220px;
  background: rgba(45, 55, 72, 0.6);
  border-radius: 8px;
  border: 1px solid rgba(79, 209, 197, 0.2);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  
  .scroll-title {
    height: 35px;
    line-height: 35px;
    padding: 0 15px;
    background: linear-gradient(90deg, rgba(79, 209, 197, 0.2), transparent);
    color: #4fd1c5;
    font-size: 14px;
    font-weight: bold;
  }
  
  .scroll-content {
    height: calc(100% - 35px);
    overflow: hidden;
    padding: 0 15px;
    cursor: pointer;
  }
  
  .scroll-list {
    transition: none;
  }
  
  .scroll-item {
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(74, 85, 104, 0.5);
    font-size: 12px;
    cursor: pointer;
    transition: background 0.2s;
    
    &:hover {
      background: rgba(79, 209, 197, 0.1);
    }
    
    .job-name {
      color: #e2e8f0;
      width: 35%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    
    .job-city {
      color: #4fd1c5;
      width: 15%;
    }
    
    .job-salary {
      color: #f687b3;
      width: 20%;
    }
    
    .view-btn {
      padding: 2px 8px;
      font-size: 11px;
    }
  }
}

// 岗位详情弹窗样式
.job-detail-dialog {
  .job-detail-content {
    .detail-row {
      display: flex;
      margin-bottom: 12px;
      
      .label {
        color: #a0aec0;
        width: 80px;
      }
      
      .value {
        color: #e2e8f0;
        
        &.salary {
          color: #f687b3;
          font-weight: bold;
        }
        
        &.source {
          color: #4fd1c5;
        }
      }
    }
    
    .detail-tags {
      margin-top: 15px;
      display: flex;
      gap: 8px;
    }
  }
}

.dashboard-selector {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 20px;
  border-bottom: 1px solid rgba(79, 209, 197, 0.25);
  background: rgba(45, 55, 72, 0.35);
  flex-wrap: wrap;
  
  .selector-label {
    color: #4fd1c5;
    font-size: 13px;
    font-weight: bold;
    flex: none;
  }
  
  .city-wheel {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding: 4px 2px;
    flex: 1;
    scrollbar-width: thin;
    
    .city-wheel-item {
      flex: none;
      padding: 6px 14px;
      border-radius: 999px;
      border: 1px solid rgba(79, 209, 197, 0.35);
      background: rgba(45, 55, 72, 0.6);
      color: #a0aec0;
      font-size: 12px;
      cursor: pointer;
      white-space: nowrap;
      
      &.active {
        background: #4fd1c5;
        color: #1a202c;
        border-color: #4fd1c5;
        font-weight: bold;
      }
      
      &:hover {
        border-color: #4fd1c5;
        color: #4fd1c5;
      }
    }
  }
  
  .direction-wheel {
    padding: 7px 12px;
    border-radius: 8px;
    border: 1px solid rgba(79, 209, 197, 0.35);
    background: rgba(45, 55, 72, 0.6);
    color: #e2e8f0;
    font-size: 13px;
    cursor: pointer;
  }
}

.rank-list {
  height: 100%;
  overflow-y: auto;
  padding: 5px 0;
  
  .rank-item {
    height: 28px;
    display: flex;
    align-items: center;
    padding: 0 10px;
    
    .rank-num {
      width: 20px;
      height: 20px;
      border-radius: 4px;
      background: #4a5568;
      color: #a0aec0;
      font-size: 12px;
      display: flex;
      justify-content: center;
      align-items: center;
      margin-right: 10px;
      
      &.rank-1 {
        background: linear-gradient(135deg, #f6e05e, #ed8936);
        color: #1a202c;
      }
      
      &.rank-2 {
        background: linear-gradient(135deg, #a0aec0, #718096);
        color: #1a202c;
      }
      
      &.rank-3 {
        background: linear-gradient(135deg, #ed8936, #c05621);
        color: #1a202c;
      }
    }
    
    .rank-name {
      flex: 1;
      color: #e2e8f0;
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    
    .rank-count {
      color: #4fd1c5;
      font-size: 12px;
    }
  }
}
</style>