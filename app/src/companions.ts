import { defineComponent, h, ref, onMounted, onUnmounted } from "vue";
const agents = [
  ["小光", "主理人", "☀", "#e9e2ff"],
  ["知简", "简历顾问", "✿", "#dcece6"],
  ["寻星", "岗位向导", "✧", "#ffead1"],
  ["小研", "学习教练", "✎", "#e2ebff"],
  ["星语", "面试官", "◈", "#ffe1e7"],
];
export default defineComponent({
  setup() {
    const positions = ref(
      agents.map((_, i) => ({
        x: Math.max(8, innerWidth - 120 - i * 64),
        y: i ? 110 : 160,
      })),
    );
    const collapsed = ref(false),
      hint = ref(false);
    const clamp = () =>
      (positions.value = positions.value.map((p, i) => ({
        x: Math.max(0, Math.min(innerWidth - (i ? 47 : 96), p.x)),
        y: Math.max(105, Math.min(innerHeight - 150, p.y)),
      })));
    onMounted(() => window.addEventListener("resize", clamp));
    onUnmounted(() => window.removeEventListener("resize", clamp));
    function start(e: PointerEvent, i: number) {
      if ((e.target as HTMLElement).closest("button")) return;
      const el = e.currentTarget as HTMLElement,
        rect = el.getBoundingClientRect(),
        dx = e.clientX - rect.left,
        dy = e.clientY - rect.top;
      el.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        positions.value[i] = {
          x: Math.max(
            0,
            Math.min(innerWidth - el.offsetWidth, ev.clientX - dx),
          ),
          y: Math.max(
            0,
            Math.min(innerHeight - el.offsetHeight, ev.clientY - dy),
          ),
        };
      };
      const end = () => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", end);
        el.removeEventListener("pointercancel", end);
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", end);
      el.addEventListener("pointercancel", end);
    }
    return () =>
      h("aside", { "aria-label": "求职团队外观占位", class: "companions" }, [
        h(
          "button",
          {
            class: "companions-toggle",
            onClick: () => (collapsed.value = !collapsed.value),
          },
          collapsed.value ? "显示伙伴" : "收起伙伴",
        ),
        ...(collapsed.value
          ? []
          : agents.map(([name, role, icon, color], i) =>
              h(
                "div",
                {
                  class: ["floating-pet", i ? "small-pet" : "lead-pet"],
                  style: {
                    left: positions.value[i].x + "px",
                    top: positions.value[i].y + "px",
                    "--avatar": color,
                  },
                  onPointerdown: (e: PointerEvent) => start(e, i),
                },
                [
                  h(
                    "div",
                    {
                      class: "pet-drag",
                      title: "按住自由拖动；当前仍为外观占位",
                    },
                    [
                      h("div", { class: "avatar" }, [
                        h("span", { class: "hair" }),
                        h("span", { class: "face" }, "•‿•"),
                        h("span", { class: "body" }),
                        h("i", icon),
                      ]),
                      h("span", name + " · " + role),
                    ],
                  ),
                  i === 0
                    ? h(
                        "button",
                        {
                          class: "pet-menu",
                          "aria-label": "伙伴当前状态",
                          onClick: () => (hint.value = !hint.value),
                        },
                        "⋯",
                      )
                    : null,
                  i === 0 && hint.value
                    ? h(
                        "p",
                        { class: "pet-hint" },
                        "伙伴仍是外观占位。真实AI、语音联动将在下一批接入。",
                      )
                    : null,
                ],
              ),
            )),
      ]);
  },
});
