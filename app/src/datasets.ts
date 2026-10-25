import { defineComponent, h, ref, computed, onMounted } from "vue";
import { api, session, errorText } from "./api";

const CATS = [
  ["jobs", "岗位", "方向 / 城市 / 详细地址 / JD / 链接"],
  ["companies", "企业", "公司 / 行业 / 规模 / 城市 / 地址"],
  ["housing", "租房", "地址 / 房源 / 租金 / 联系人 / 电话"],
  ["knowledge", "面经八股", "方向 / 问题 / 要点 / 来源"],
] as const;
const TABS = ["我的数据", "上传记录", "数据获取指南", "平台数据"];

interface Dataset {
  id: string;
  category: string;
  name: string;
  source: string;
  columns: string[];
  mapping: Record<string, string>;
  mappedBy: string;
  rowCount: number;
  createdAt: number;
}

export default defineComponent({
  setup() {
    const tab = ref(0);
    const category = ref<string>("jobs");
    const list = ref<Dataset[]>([]);
    const loading = ref(true);
    const busy = ref(false);
    const error = ref("");
    const notice = ref("");
    const file = ref<File | null>(null);
    const detail = ref<any>(null);
    const offset = ref(0);
    const limit = 100;

    const byCat = computed(() => {
      const map: Record<string, Dataset[]> = { jobs: [], companies: [], housing: [], knowledge: [] };
      for (const d of list.value) (map[d.category] || (map[d.category] = [])).push(d);
      return map;
    });
    const labelOf = (c: string) => (CATS.find((x) => x[0] === c) || ["", c])[1];

    async function load() {
      loading.value = true;
      try {
        const r = await api<any>("/datasets");
        list.value = r.datasets || [];
      } catch (e) {
        error.value = errorText(e);
      } finally {
        loading.value = false;
      }
    }

    function pickCategory(key: string) {
      category.value = key;
      tab.value = 0;
    }

    async function upload() {
      const f = file.value;
      if (!f || busy.value) return;
      if (f.size > 8 * 1024 * 1024) {
        error.value = "文件需小于 8MiB";
        return;
      }
      busy.value = true;
      error.value = "";
      notice.value = "";
      try {
        const res = await fetch("/api/datasets", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": f.type || "application/octet-stream",
            "X-CSRF-Token": session.csrf || "",
            "X-File-Name": encodeURIComponent(f.name),
            "X-Category": category.value,
          },
          body: f,
        });
        const data = await res.json();
        if (!res.ok) throw Error(data.error || "导入失败");
        const d = data.dataset;
        notice.value =
          "已导入 " + d.rowCount + " 行到「" + labelOf(d.category) + "」，字段对应" +
          (d.mappedBy === "ai" ? "由 AI 完成" : "按列名规则完成") +
          "（" + Object.keys(d.mapping).length + "/" + d.columns.length + " 列已对应）。";
        file.value = null;
        const input = document.querySelector<HTMLInputElement>("#dataset-file");
        if (input) input.value = "";
        await load();
        await open(d.id);
      } catch (e) {
        error.value = errorText(e);
      } finally {
        busy.value = false;
      }
    }

    async function open(id: string, more = false) {
      if (!more) {
        offset.value = 0;
        detail.value = null;
      }
      try {
        const r = await api<any>("/datasets/" + id + "?offset=" + offset.value + "&limit=" + limit, "GET", undefined, { timeoutMs: 30000 });
        if (more && detail.value) {
          detail.value.rows = [...detail.value.rows, ...r.dataset.rows];
          offset.value += r.dataset.rows.length;
        } else {
          detail.value = r.dataset;
          offset.value = r.dataset.rows.length;
        }
      } catch (e) {
        error.value = errorText(e);
      }
    }

    async function remove(d: Dataset) {
      if (!confirm("删除「" + d.name + "」以及它的 " + d.rowCount + " 行数据？")) return;
      try {
        await api("/datasets/" + d.id, "DELETE");
        if (detail.value?.id === d.id) detail.value = null;
        notice.value = "已删除该数据集";
        await load();
      } catch (e) {
        error.value = errorText(e);
      }
    }

    onMounted(load);

    // —— 原型里的表格样式 ——
    // 原型 .tr 是 4 列网格；列数不同时用 cN 修饰类改模板
    const cell = (c: any) =>
      c && typeof c === "object" && (c as any).type ? c : h("span", String(c ?? ""));
    const table = (head: string[], rows: any[][]) => {
      const n = head.length;
      const style = n === 4 ? {} : { gridTemplateColumns: "repeat(" + n + ", minmax(90px, 1fr))" };
      return h("div", { class: "table" }, [
        h("div", { class: "tr head", style }, head.map((x) => h("span", x))),
        ...rows.map((r) => h("div", { class: "tr", style }, r.map(cell))),
      ]);
    };

    const overviewRows = computed(() =>
      CATS.map(([key, name, fields]) => {
        const sets = byCat.value[key] || [];
        const rows = sets.reduce((n, d) => n + d.rowCount, 0);
        return [name, fields, rows ? rows + " 行 / " + sets.length + " 份" : "用户本次提供", rows ? "已接入" : "待上传"];
      }),
    );

    const uploadZone = () =>
      h("div", { class: "upload" }, [
        h("span", "↥"),
        h("h3", "把你的数据放进来"),
        h("p", "岗位 / 企业 / 租房 / 面经 · CSV、Excel、JSON、XML"),
        h("input", {
          id: "dataset-file",
          type: "file",
          accept: ".csv,.tsv,.json,.ndjson,.jsonl,.xml,.xlsx,.xls,.txt",
          style: "display:none",
          onChange: (e: Event) => {
            file.value = (e.target as HTMLInputElement).files?.[0] || null;
            error.value = "";
          },
        }),
        h("button", { class: "btn", onClick: () => document.getElementById("dataset-file")?.click() }, "选择文件"),
        file.value
          ? h("p", { class: "muted" }, "已选择：" + file.value.name + "（" + Math.round(file.value.size / 1024) + " KB）")
          : null,
        file.value
          ? h("div", { class: "proto-cats" }, CATS.map(([key, name]) =>
              h("button", {
                class: "btn" + (category.value === key ? " primary" : ""),
                onClick: () => (category.value = key),
              }, name),
            ))
          : null,
        file.value
          ? h("button", { class: "btn primary", disabled: busy.value, onClick: upload },
              busy.value ? "正在解析并导入…" : "上传并解析到「" + labelOf(category.value) + "」")
          : null,
      ]);

    return () =>
      h("div", { class: "proto-page" }, [
        h("div", { class: "scene-heading" }, [
          h("span", { class: "eyebrow" }, "YOUR CAREER, YOUR WAY"),
          h("h1", "我的数据空间"),
          h("p", "让你自己的数据，也成为求职的助力"),
        ]),
        h("div", { class: "toolbar" }, [
          h("button", { class: "btn", onClick: () => { tab.value = 0; category.value = "jobs"; } }, "岗位 / 企业 / 租房上传"),
          h("a", { class: "btn", href: "#study-upload" }, "学习资料 / 题库上传"),
        ]),
        h("div", { class: "notice" }, "♧ 私人数据仅在你的账号中展示；助手可代你解析、检索和匹配，不会共享给其他用户。"),
        h("div", { class: "tabs" }, TABS.map((name, i) =>
          h("button", { class: "tab" + (tab.value === i ? " chosen" : ""), onClick: () => (tab.value = i) }, name),
        )),
        error.value ? h("p", { class: "error", role: "alert" }, error.value) : null,
        notice.value ? h("p", { class: "muted", role: "status" }, notice.value) : null,

        // 我的数据
        tab.value === 0
          ? h("div", [
              h("div", { class: "grid two" }, [
                uploadZone(),
                h("section", { class: "card" }, [
                  h("h3", "不知道从哪里获取数据？"),
                  h("p", { class: "muted" }, "你可以使用 Tabbit 或其他 Agent，获取自己关注的公开信息，整理后上传。"),
                  h("ol", { class: "guide" }, [
                    h("li", "确定方向、城市和目标信息渠道"),
                    h("li", "让工具保留原链接、地址与采集日期"),
                    h("li", "检查字段与来源，再上传到私人空间"),
                  ]),
                  h("div", { class: "proto-cats" }, [
                    h("button", { class: "btn", onClick: () => (tab.value = 2) }, "查看字段模板"),
                    h("button", { class: "btn", onClick: () => (tab.value = 2) }, "浏览推荐渠道"),
                  ]),
                ]),
              ]),
              h("section", { class: "card" }, [
                h("h3", "已上传的数据"),
                loading.value
                  ? h("p", { class: "muted" }, "正在读取你的数据…")
                  : list.value.length
                    ? table(
                        ["名称", "类型", "行数", "字段对应", "上传时间", "操作"],
                        list.value.map((d) => [
                          d.name,
                          labelOf(d.category),
                          d.rowCount + " 行",
                          Object.keys(d.mapping).length + "/" + d.columns.length + " 列" + (d.mappedBy === "ai" ? "（AI）" : ""),
                          new Date(d.createdAt).toLocaleString("zh-CN"),
                          h("span", { class: "proto-ops" }, [
                            h("button", { class: "btn", onClick: () => open(d.id) }, "查看"),
                            h("button", { class: "btn", onClick: () => remove(d) }, "删除"),
                          ]),
                        ]),
                      )
                    : h("p", { class: "muted" }, "还没有上传过数据。支持 CSV / TSV / JSON / NDJSON / XML / XLSX，单个文件 ≤8MiB。"),
              ]),
            ])
          : null,

        // 上传记录
        tab.value === 1
          ? h("section", { class: "card" }, [
              h("h3", "上传记录"),
              list.value.length
                ? table(
                    ["时间", "文件", "类型", "行数", "字段映射方式"],
                    list.value.map((d) => [
                      new Date(d.createdAt).toLocaleString("zh-CN"),
                      d.name,
                      labelOf(d.category),
                      d.rowCount + " 行",
                      d.mappedBy === "ai" ? "AI 自动对应" : "按列名规则对应",
                    ]),
                  )
                : h("p", { class: "muted" }, "暂无记录。"),
            ])
          : null,

        // 数据获取指南
        tab.value === 2
          ? h("div", { class: "grid two" }, [
              h("section", { class: "card" }, [
                h("h3", "字段模板"),
                h("p", { class: "muted" }, "按下面的标准字段整理，上传后 AI 会自动对应；列名不一致也能识别，对应不上的列会原样保留。"),
                table(["数据类型", "推荐字段"], CATS.map(([, name, fields]) => [name, fields])),
              ]),
              h("section", { class: "card" }, [
                h("h3", "从哪里获取"),
                h("ol", { class: "guide" }, [
                  h("li", "岗位：招聘官网 / 校招页面 / 你已有的投递表"),
                  h("li", "企业：企业信息查询站，保留工商信息与来源"),
                  h("li", "租房：租房平台导出，务必保留详细地址"),
                  h("li", "面经：你自己整理的题库，保留来源与日期"),
                ]),
                h("p", { class: "muted" }, "所有数据只存在你自己的账号下；展示时手机号、座机、邮箱、身份证会自动打码。"),
              ]),
            ])
          : null,

        // 平台数据
        tab.value === 3
          ? h("section", { class: "card" }, [
              h("h3", "数据集概览"),
              table(["数据类型", "可用字段", "当前数据量", "状态"], overviewRows.value),
            ])
          : null,

        // 明细
        detail.value
          ? h("section", { class: "card" }, [
              h("h3", detail.value.name),
              h("p", { class: "muted" },
                "共 " + detail.value.rowCount + " 行，当前显示 " + detail.value.rows.length + " 行 · 字段对应：" +
                Object.entries(detail.value.mapping).map(([f, c]) => f + "←" + c).join("、")),
              h("div", { class: "proto-table-scroll" }, [
                h("div", { class: "table" }, [
                  h("div", { class: "tr head", style: { gridTemplateColumns: "repeat(" + detail.value.columns.length + ", minmax(90px, 1fr))" } },
                    detail.value.columns.map((c: string) => h("span", c))),
                  ...detail.value.rows.map((row: any) =>
                    h("div", { class: "tr", style: { gridTemplateColumns: "repeat(" + detail.value.columns.length + ", minmax(90px, 1fr))" } },
                      detail.value.columns.map((c: string) => h("span", String(row[c] ?? "")))),
                  ),
                ]),
              ]),
              detail.value.rows.length < detail.value.rowCount
                ? h("button", { class: "btn", onClick: () => open(detail.value.id, true) }, "加载更多")
                : null,
              h("button", { class: "btn", onClick: () => (detail.value = null) }, "收起明细"),
            ])
          : null,
      ]);
  },
});
