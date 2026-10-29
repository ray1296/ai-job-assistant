import { createRouter, createWebHashHistory } from "vue-router";

const TabBarLayout = () => import("../orig/layouts/TabBarLayout.vue");
const UserLayout = () => import("../orig/layouts/UserLayout.vue");

const routes = [
  { path: "/", component: TabBarLayout, redirect: "/review", children: [
    { path: "review", name: "ReviewList", component: () => import("../orig/views/review/index.vue") },
    { path: "upload", name: "UploadCenter", component: () => import("../orig/views/upload/index.vue") },
  ]},
  { path: "/review/:subjectId", name: "SubjectReview", component: () => import("../orig/views/review/subject.vue") },
  { path: "/ai-pages", name: "AiReportHistory", component: () => import("../orig/views/ai/history.vue") },
  { path: "/ai-page/:id", name: "AiReport", component: () => import("../orig/views/ai/page.vue") },
  { path: "/:pathMatch(.*)*", redirect: "/review" },
];

export default createRouter({ history: createWebHashHistory(), routes });
