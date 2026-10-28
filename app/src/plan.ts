import {
  defineComponent,
  h,
  ref,
  computed,
  watch,
  onMounted,
  onBeforeUnmount,
} from "vue";
import { api, ApiError, errorText, session } from "./api";
import { safeJobUrl } from "./jobs";

type Draft = {
  job: any;
  text: string;
  saved: string;
  revision: number;
  saving: boolean;
  error: string;
  notice: string;
  conflict?: { draft: string; revision: number };
};
export default defineComponent({
  emits: ["dirty"],
  setup(_, { emit }) {
    const account = session.user?.id;
    const rows = ref<Draft[]>([]),
      selected = ref(""),
      loading = ref(false),
      error = ref(""),
      maxLength = ref(8000);
    const current = computed(() =>
      rows.value.find((row) => row.job.id === selected.value),
    );
    const dirty = computed(() =>
      rows.value.some((row) => row.text !== row.saved),
    );
    watch(dirty, (value) => emit("dirty", value));
    const suggestion = ref<{
        jobId: string;
        text: string;
        base: string;
      } | null>(null),
      aiBusy = ref(false),
      copyStatus = ref(""),
      tailorBusy = ref(false),
      tailorResult = ref<{ resumeId: string; title: string; copy: string } | null>(null);
    let alive = true,
      listSeq = 0,
      aiSeq = 0,
      aiController: AbortController | null = null;
    const controllers = new Set<AbortController>();
    const active = () => alive && session.user?.id === account;
    function control() {
      const c = new AbortController();
      controllers.add(c);
      return c;
    }
    function cancelAI(notify = false) {
      ++aiSeq;
      aiController?.abort();
      aiController = null;
      aiBusy.value = false;
      suggestion.value = null;
      if (notify && current.value)
        current.value.notice = "AI 请求已取消，原草稿未修改。";
    }
    async function load() {
      if (loading.value) return;
      const seq = ++listSeq,
        c = control();
      loading.value = true;
      error.value = "";
      try {
        const result = await api("/application-plan", "GET", undefined, {
          signal: c.signal,
        });
        if (!active() || seq !== listSeq) return;
        maxLength.value = result.maxTextLength || 8000;
        const existing = new Map(rows.value.map((row) => [row.job.id, row]));
        const next: Draft[] = result.items.map((item: any) => {
          const old = existing.get(item.job.id);
          existing.delete(item.job.id);
          if (old && (old.text !== old.saved || old.saving)) {
            old.job = item.job;
            return old;
          }
          return {
            job: item.job,
            text: item.draft,
            saved: item.draft,
            revision: item.revision,
            saving: false,
            error: "",
            notice: "",
          };
        });
        // Never discard an edited draft if another tab deselected its job.
        for (const row of existing.values())
          if (row.text !== row.saved || row.saving) {
            row.notice = "该岗位已不在投递意向中，仍保留本页未保存草稿。";
            next.push(row);
          }
        rows.value = next;
        if (!next.some((row) => row.job.id === selected.value))
          selected.value = next[0]?.job.id || "";
      } catch (e) {
        if (active() && !c.signal.aborted) error.value = errorText(e);
      } finally {
        controllers.delete(c);
        if (active() && seq === listSeq) loading.value = false;
      }
    }
    function choose(id: string) {
      if (id === selected.value) return;
      cancelAI();
      selected.value = id;
      copyStatus.value = "";
    }
    function edit(value: string) {
      const row = current.value;
      if (!row) return;
      cancelAI();
      row.text = value;
      row.notice = "";
      copyStatus.value = "";
    }
    async function save(row: Draft) {
      if (row.saving) return;
      row.saving = true;
      row.error = "";
      row.notice = "";
      const text = row.text,
        revision = row.revision,
        c = control();
      try {
        const result = await api(
          "/application-plan/" + encodeURIComponent(row.job.id),
          "PUT",
          { text, revision },
          { signal: c.signal },
        );
        if (!active()) return;
        row.saved = text;
        row.revision = result.revision;
        row.conflict = undefined;
        row.notice =
          row.text === text
            ? "草稿已保存"
            : "已保存提交时的版本；后续编辑尚未保存。";
      } catch (e) {
        if (!active() || c.signal.aborted) return;
        row.error =
          e instanceof ApiError && e.status === 409
            ? "其他页面已更新此草稿。你的文字仍保留，请读取最新版本后选择如何处理。"
            : errorText(e);
      } finally {
        controllers.delete(c);
        if (active()) row.saving = false;
      }
    }
    async function getLatest(row: Draft) {
      const c = control();
      row.error = "";
      try {
        const result = await api(
          "/application-plan/" + encodeURIComponent(row.job.id),
          "GET",
          undefined,
          { signal: c.signal },
        );
        if (active())
          row.conflict = { draft: result.draft, revision: result.revision };
      } catch (e) {
        if (active() && !c.signal.aborted) row.error = errorText(e);
      } finally {
        controllers.delete(c);
      }
    }
    function resolve(row: Draft, useLatest: boolean) {
      if (!row.conflict) return;
      if (
        !confirm(
          useLatest
            ? "使用服务器版本会替换本页该岗位的文字，确认？"
            : "保留本页文字，并以刚读取的服务器版本为基线；仍需再次保存。确认？",
        )
      )
        return;
      cancelAI();
      row.revision = row.conflict.revision;
      row.saved = row.conflict.draft;
      if (useLatest) row.text = row.conflict.draft;
      row.conflict = undefined;
      row.error = "";
      row.notice = useLatest
        ? "已读取服务器版本。"
        : "保留了本页文字，请核对后再次保存。";
    }
    async function generate() {
      const row = current.value;
      if (!row || aiBusy.value) return;
      cancelAI();
      const seq = ++aiSeq,
        c = control();
      aiController = c;
      aiBusy.value = true;
      row.error = "";
      row.notice = "";
      const text = row.text,
        id = row.job.id;
      try {
        const result = await api(
          "/ai/application-copy",
          "POST",
          { jobId: id, text, mode: text.trim() ? "optimize" : "generate" },
          { signal: c.signal, timeoutMs: 55000 },
        );
        if (
          !active() ||
          seq !== aiSeq ||
          selected.value !== id ||
          row.text !== text
        )
          return;
        if (
          typeof result.text !== "string" ||
          !result.text.trim() ||
          result.text.length > maxLength.value
        )
          throw new Error("AI 返回内容无效，原草稿未修改。");
        suggestion.value = { jobId: id, text: result.text, base: text };
      } catch (e) {
        if (active() && seq === aiSeq && !c.signal.aborted)
          row.error = errorText(e) + "；原草稿未修改。";
      } finally {
        controllers.delete(c);
        if (active() && seq === aiSeq) {
          aiBusy.value = false;
          aiController = null;
        }
      }
    }
    function accept() {
      const row = current.value,
        s = suggestion.value;
      if (!row || !s || s.jobId !== row.job.id || s.base !== row.text) return;
      row.text = s.text;
      suggestion.value = null;
      row.notice = "已采纳到编辑区，尚未保存。";
    }
    async function copy() {
      const row = current.value;
      if (!row) return;
      const id = row.job.id,
        text = row.text;
      copyStatus.value = "";
      try {
        let copied = false;
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            copied = true;
          }
        } catch {
          /* HTTP and denied permissions use the selection fallback below. */
        }
        if (!copied) {
          const previous = document.activeElement as HTMLElement | null;
          const field = document.createElement("textarea");
          field.value = text;
          field.setAttribute("aria-label", "复制话术临时区域");
          field.style.cssText = "position:fixed;left:-9999px;top:0";
          document.body.append(field);
          try {
            field.focus();
            field.select();
            copied = document.execCommand("copy");
          } finally {
            field.remove();
            previous?.focus();
          }
        }
        if (!copied)
          throw new Error("浏览器阻止自动复制，请在话术编辑区全选并手动复制。");
        if (active() && selected.value === id)
          copyStatus.value = "话术已复制。";
      } catch (e) {
        if (active() && selected.value === id) copyStatus.value = errorText(e);
      }
    }
    async function tailorResume() {
      const row = current.value;
      if (!row || tailorBusy.value) return;
      cancelAI();
      tailorBusy.value = true;
      row.error = "";
      row.notice = "";
      const id = row.job.id;
      try {
        const result = await api(
          "/ai/tailored-application",
          "POST",
          { jobId: id },
          { timeoutMs: 150000 },
        );
        if (!result?.resume?.id || typeof result.copy !== "string" || !result.copy.trim())
          throw new Error("AI 返回的定制结果无效，原草稿未修改。");
        if (!active() || selected.value !== id) return;
        row.text = result.copy.slice(0, maxLength.value);
        await save(row);
        row.notice =
          row.text === row.saved
            ? "专属简历已生成，文案已自动保存。"
            : "专属简历已生成，文案已写入，请检查后保存。";
        tailorResult.value = {
          resumeId: String(result.resume.id),
          title: String(result.resume.title || "专属简历"),
          copy: row.text,
        };
      } catch (e) {
        if (active() && selected.value === id) row.error = errorText(e);
      } finally {
        if (active()) tailorBusy.value = false;
      }
    }
    function openTailoredResume() {
      const r = tailorResult.value;
      if (!r) return;
      try {
        localStorage.setItem("zg.resumeOpenId", r.resumeId);
      } catch {}
      const win = window.open("#resume", "_blank");
      if (!win) {
        const row = current.value;
        if (row) row.notice = "浏览器拦截了新标签页，请允许弹窗后重试，或到简历工作室手动打开。";
        return;
      }
      try { win.opener = null; } catch {}
      tailorResult.value = null;
    }
    async function copyAndOpen() {
      const row = current.value;
      if (!row) return;
      const url = safeJobUrl(row.job.url);
      let win: Window | null = null;
      if (url) {
        win = window.open(url, "_blank");
        if (win) {
          try { win.opener = null; } catch {}
        }
      }
      await copy();
      if (url && !win) row.notice = "文案已复制，但浏览器拦截了新标签页；请允许弹窗后重试。";
      else if (url) row.notice = "文案已复制，岗位页已在新标签页打开。";
      else row.notice = "文案已复制；该岗位暂无安全有效的链接。";
    }

    onMounted(load);
    onBeforeUnmount(() => {
      alive = false;
      cancelAI();
      controllers.forEach((c) => c.abort());
      emit("dirty", false);
    });
    return () =>
      h("section", { class: "plan-page" }, [
        h("div", { class: "scene-heading" }, [
          h("span", { class: "eyebrow" }, "YOUR APPLICATION PLAN"),
          h("h1", "投递意向与方案"),
          h("p", "逐个准备你的开场白。AI 只提供建议，采纳和保存始终由你决定。"),
        ]),
        h("div", { class: "plan-overview" }, [
          h(
            "span",
            { class: "native-status" },
            "原生投递方案 · 已接入个人草稿",
          ),
          h("a", { href: "#jobs" }, "管理投递意向"),
          h(
            "button",
            { onClick: load, disabled: loading.value },
            "刷新岗位列表",
          ),
        ]),
        error.value
          ? h("p", { class: "error", role: "alert" }, error.value)
          : null,
        loading.value ? h("p", { role: "status" }, "正在读取投递方案…") : null,
        !loading.value && !error.value && !rows.value.length
          ? h("div", { class: "plan-empty" }, [
              h("h2", "还没有已选岗位"),
              h("p", "先在发现岗位中勾选并保存投递意向，再来准备话术。"),
              h("a", { href: "#jobs" }, "去发现岗位 →"),
            ])
          : null,
        rows.value.length
          ? h("div", { class: "plan-layout" }, [
              h(
                "aside",
                { class: "plan-sidebar", "aria-label": "已选岗位列表" },
                [
                  h("h2", "已选岗位（" + rows.value.length + "）"),
                  h(
                    "ul",
                    { class: "plan-job-list" },
                    rows.value.map((row) =>
                      h(
                        "li",
                        { key: row.job.id },
                        h(
                          "button",
                          {
                            class:
                              row.job.id === selected.value ? "active" : "",
                            "aria-current":
                              row.job.id === selected.value
                                ? "true"
                                : undefined,
                            onClick: () => choose(row.job.id),
                          },
                          [
                            h("strong", row.job.title),
                            h("span", row.job.company),
                            h(
                              "small",
                              row.job.city +
                                (row.text !== row.saved ? " · 未保存" : ""),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              current.value
                ? (() => {
                    const row = current.value!,
                      url = safeJobUrl(row.job.url);
                    return h(
                      "article",
                      { class: "plan-editor", key: row.job.id },
                      [
                        h("h2", row.job.title),
                        h(
                          "p",
                          { class: "job-company" },
                          row.job.company + " · " + row.job.city,
                        ),
                        h(
                          "p",
                          { class: "plan-help", id: "plan-help" },
                          "请核对事实，勿加入未具备的经历或能力。切换岗位保留本页草稿；离开页面前请保存。定制简历会新建一份针对该岗位的简历，并生成投递文案；文案可手动修改后保存，或复制并打开岗位。",
                        ),
                        h("label", { for: "application-text" }, "投递话术"),
                        h("textarea", {
                          id: "application-text",
                          class: "plan-textarea",
                          value: row.text,
                          maxlength: maxLength.value,
                          "aria-describedby": "plan-help plan-count",
                          placeholder:
                            "在这里写给招聘方的话；留空时可请 AI 生成，有文字时可请 AI 优化。",
                          onInput: (e: any) => edit(e.target.value),
                        }),
                        h(
                          "p",
                          { id: "plan-count", class: "plan-count" },
                          row.text.length +
                            " / " +
                            maxLength.value +
                            " 字 · " +
                            (row.text === row.saved ? "已同步" : "尚未保存"),
                        ),
                        h("div", { class: "plan-actions" }, [
                          h(
                            "button",
                            {
                              class: "primary",
                              onClick: tailorResume,
                              disabled: tailorBusy.value || aiBusy.value,
                            },
                            tailorBusy.value
                              ? "正在定制简历…"
                              : "AI 定制简历 + 投递文案",
                          ),
                          h(
                            "button",
                            {
                              onClick: () => save(row),
                              disabled:
                                row.saving ||
                                row.text === row.saved ||
                                row.text.length > maxLength.value,
                            },
                            row.saving ? "正在保存…" : "保存草稿",
                          ),
                          url
                            ? h(
                                "button",
                                { onClick: copyAndOpen, disabled: !row.text },
                                "复制文案并打开岗位",
                              )
                            : null,
                          url
                            ? h(
                                "a",
                                {
                                  href: url,
                                  target: "_blank",
                                  rel: "noopener noreferrer",
                                },
                                "打开岗位（新标签页）",
                              )
                            : h("span", "暂无安全有效的岗位链接"),
                        ]),
                        row.error
                          ? h("div", { class: "error", role: "alert" }, [
                              h("p", row.error),
                              h(
                                "button",
                                {
                                  onClick: () => getLatest(row),
                                  disabled: row.saving,
                                },
                                "读取最新草稿（不覆盖本页）",
                              ),
                            ])
                          : null,
                        row.conflict
                          ? h(
                              "section",
                              {
                                class: "plan-conflict",
                                "aria-label": "服务器最新草稿",
                              },
                              [
                                h("h3", "服务器最新草稿"),
                                h("pre", row.conflict.draft || "（空草稿）"),
                                h(
                                  "button",
                                  { onClick: () => resolve(row, false) },
                                  "保留本页文字并更新保存基线",
                                ),
                                h(
                                  "button",
                                  { onClick: () => resolve(row, true) },
                                  "使用服务器版本",
                                ),
                              ],
                            )
                          : null,
                        row.notice
                          ? h("p", { role: "status" }, row.notice)
                          : null,
                        copyStatus.value
                          ? h("p", { role: "status" }, copyStatus.value)
                          : null,
                        suggestion.value?.jobId === row.job.id
                          ? h(
                              "section",
                              {
                                class: "plan-suggestion",
                                "aria-label": "AI 话术建议",
                              },
                              [
                                h("h3", "AI 建议 · 尚未采纳"),
                                h(
                                  "p",
                                  "请检查后再采纳。采纳仅更新编辑区，不会自动保存或投递。",
                                ),
                                h("pre", suggestion.value!.text),
                                h("div", { class: "plan-actions" }, [
                                  h(
                                    "button",
                                    { class: "primary", onClick: accept },
                                    "采纳到编辑区",
                                  ),
                                  h(
                                    "button",
                                    {
                                      onClick: () => (suggestion.value = null),
                                    },
                                    "放弃建议",
                                  ),
                                ]),
                              ],
                            )
                          : null,
                      ],
                    );
                  })()
                : null,
            ])
          : null,
        tailorResult.value
          ? h(
              "div",
              {
                class: "plan-modal-mask",
                onClick: () => (tailorResult.value = null),
              },
              h(
                "div",
                {
                  class: "plan-modal",
                  role: "dialog",
                  "aria-modal": "true",
                  onClick: (e: Event) => e.stopPropagation(),
                },
                [
                  h("h3", "专属简历生成完毕"),
                  h("p", "已为这个岗位生成一份定制版简历：" + tailorResult.value.title),
                  h(
                    "p",
                    "投递文案也已写入编辑区并自动保存。请先检查文案，确认无误后再复制并打开岗位页。",
                  ),
                  h("div", { class: "plan-actions" }, [
                    h(
                      "button",
                      { class: "primary", onClick: openTailoredResume },
                      "打开简历工作室（新标签页）",
                    ),
                    h(
                      "button",
                      { onClick: () => (tailorResult.value = null) },
                      "留在本页",
                    ),
                  ]),
                ],
              ),
            )
          : null,
      ]);
  },
});
