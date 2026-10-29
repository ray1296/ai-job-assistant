import {
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  type PropType,
} from "vue";

const STORAGE_KEY = "zhuguang-orbit-position";
const STORAGE_VERSION = 1;
const DRAG_THRESHOLD = 6;
const KEYBOARD_STEP = 16;
const KEYBOARD_STEP_LARGE = 48;
const EDGE_MARGIN = 8;
const CLICK_SUPPRESS_MS = 500;

const TITLE =
  "拖动可移动求职导航开关 · Enter/空格 展开或收起 · Alt+方向键移动 · Alt+Home 复位";

interface NormalizedPosition {
  x: number;
  y: number;
}

interface PixelPosition {
  left: number;
  top: number;
}

interface ViewportMetrics {
  maxLeft: number;
  maxTop: number;
  travelX: number;
  travelY: number;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  startLeft: number;
  startTop: number;
  moved: boolean;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || max < min) return min;
  return value < min ? min : value > max ? max : value;
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function roundPosition(value: number): number {
  return Math.round(clamp01(value) * 10000) / 10000;
}

/** Read the saved normalized position. Storage failures or bad data are ignored. */
function readSavedPosition(): NormalizedPosition | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    if (record.v !== STORAGE_VERSION) return null;
    const { x, y } = record;
    if (typeof x !== "number" || typeof y !== "number") return null;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x: clamp01(x), y: clamp01(y) };
  } catch {
    return null;
  }
}

/** Persist (or clear) the normalized position. Never throws. */
function writeSavedPosition(position: NormalizedPosition | null): void {
  try {
    if (position === null) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        v: STORAGE_VERSION,
        x: roundPosition(position.x),
        y: roundPosition(position.y),
      }),
    );
  } catch {
    // Storage can be blocked (private mode, quota, policy): position is cosmetic.
  }
}

function measureViewport(element: HTMLElement | null): ViewportMetrics {
  const viewportWidth =
    window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight =
    window.innerHeight || document.documentElement.clientHeight || 0;
  const rect = element ? element.getBoundingClientRect() : null;
  const width = rect && rect.width > 0 ? rect.width : element ? element.offsetWidth : 0;
  const height = rect && rect.height > 0 ? rect.height : element ? element.offsetHeight : 0;
  const maxLeft = Math.max(0, viewportWidth - width);
  const maxTop = Math.max(0, viewportHeight - height);
  return {
    maxLeft,
    maxTop,
    travelX: Math.max(0, maxLeft - EDGE_MARGIN * 2),
    travelY: Math.max(0, maxTop - EDGE_MARGIN * 2),
  };
}

function pixelFromNormalized(
  position: NormalizedPosition,
  metrics: ViewportMetrics,
): PixelPosition {
  const left =
    metrics.travelX > 0
      ? EDGE_MARGIN + clamp01(position.x) * metrics.travelX
      : 0;
  const top =
    metrics.travelY > 0
      ? EDGE_MARGIN + clamp01(position.y) * metrics.travelY
      : 0;
  return {
    left: clamp(left, 0, metrics.maxLeft),
    top: clamp(top, 0, metrics.maxTop),
  };
}

function normalizedFromPixel(
  position: PixelPosition,
  metrics: ViewportMetrics,
): NormalizedPosition {
  return {
    x:
      metrics.travelX > 0
        ? clamp01((position.left - EDGE_MARGIN) / metrics.travelX)
        : 0,
    y:
      metrics.travelY > 0
        ? clamp01((position.top - EDGE_MARGIN) / metrics.travelY)
        : 0,
  };
}

export default defineComponent({
  name: "DraggableOrbit",
  props: {
    expanded: { type: Boolean, default: false },
    onToggle: {
      type: Function as PropType<() => void>,
      required: true,
    },
  },
  setup(props) {
    const trigger = ref<HTMLButtonElement | null>(null);
    const position = ref<PixelPosition | null>(null);

    let normalized: NormalizedPosition | null = null;
    let drag: DragState | null = null;
    let pendingPoint: PixelPosition | null = null;
    let moveFrame: number | null = null;
    let resizeFrame: number | null = null;
    let suppressClickUntil = 0;
    let lockedBodyUserSelect: string | null = null;
    let selectionLocked = false;

    function metrics(): ViewportMetrics {
      return measureViewport(trigger.value);
    }

    function lockSelection(): void {
      if (selectionLocked) return;
      selectionLocked = true;
      try {
        lockedBodyUserSelect = document.body.style.userSelect;
        document.body.style.userSelect = "none";
      } catch {
        lockedBodyUserSelect = null;
      }
    }

    function unlockSelection(): void {
      if (!selectionLocked) return;
      selectionLocked = false;
      if (lockedBodyUserSelect !== null) {
        try {
          document.body.style.userSelect = lockedBodyUserSelect;
        } catch {
          // Ignore: the document may be tearing down.
        }
      }
      lockedBodyUserSelect = null;
    }

    function applyPosition(next: PixelPosition): void {
      position.value = next;
      normalized = normalizedFromPixel(next, metrics());
    }

    function persist(): void {
      if (normalized) writeSavedPosition(normalized);
    }

    function flushMove(): void {
      moveFrame = null;
      if (!pendingPoint) return;
      const next = pendingPoint;
      pendingPoint = null;
      applyPosition(next);
    }

    function finishPointer(pointerId: number | null, persistPosition: boolean): void {
      const state = drag;
      const moved = state?.moved === true;

      if (moveFrame !== null) {
        cancelAnimationFrame(moveFrame);
        moveFrame = null;
      }
      const pending = pendingPoint;
      pendingPoint = null;
      if (moved && pending) applyPosition(pending);

      unlockSelection();
      drag = null;

      if (pointerId !== null) {
        try {
          trigger.value?.releasePointerCapture(pointerId);
        } catch {
          // Capture may never have been acquired.
        }
      }

      if (moved) {
        suppressClickUntil = Date.now() + CLICK_SUPPRESS_MS;
        if (persistPosition) persist();
      }
    }

    function onPointerdown(event: PointerEvent): void {
      if (drag) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const element = trigger.value;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const current = metrics();
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startLeft: clamp(rect.left, 0, current.maxLeft),
        startTop: clamp(rect.top, 0, current.maxTop),
        moved: false,
      };
      pendingPoint = null;
      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is an enhancement; dragging still works without it.
      }
    }

    function onPointermove(event: PointerEvent): void {
      const state = drag;
      if (!state || state.pointerId !== event.pointerId) return;
      if (event.pointerType === "mouse" && event.buttons === 0) {
        finishPointer(event.pointerId, true);
        return;
      }
      const dx = event.clientX - state.startX;
      const dy = event.clientY - state.startY;
      if (!state.moved) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        state.moved = true;
        lockSelection();
      }
      event.preventDefault();
      const current = metrics();
      pendingPoint = {
        left: clamp(state.startLeft + dx, 0, current.maxLeft),
        top: clamp(state.startTop + dy, 0, current.maxTop),
      };
      if (moveFrame === null) {
        moveFrame = requestAnimationFrame(flushMove);
      }
    }

    function onPointerup(event: PointerEvent): void {
      if (!drag || drag.pointerId !== event.pointerId) return;
      finishPointer(event.pointerId, true);
    }

    function onPointercancel(event: PointerEvent): void {
      if (!drag || drag.pointerId !== event.pointerId) return;
      finishPointer(event.pointerId, true);
    }

    function onLostpointercapture(event: PointerEvent): void {
      if (!drag || drag.pointerId !== event.pointerId) return;
      finishPointer(event.pointerId, true);
    }

    function onClick(event: MouseEvent): void {
      // Only a real drag suppresses the click. Keyboard activation reports detail 0.
      if (event.detail > 0 && Date.now() < suppressClickUntil) {
        event.preventDefault();
        event.stopPropagation();
        suppressClickUntil = 0;
        return;
      }
      suppressClickUntil = 0;
      props.onToggle();
    }

    function defaultPoint(): PixelPosition {
      const element = trigger.value;
      const current = metrics();
      const rect = element?.getBoundingClientRect();
      return {
        left: clamp(rect ? rect.left : EDGE_MARGIN, 0, current.maxLeft),
        top: clamp(rect ? rect.top : current.maxTop, 0, current.maxTop),
      };
    }

    function moveBy(dx: number, dy: number): void {
      const current = metrics();
      const base = position.value ?? defaultPoint();
      const next: PixelPosition = {
        left: clamp(base.left + dx, 0, current.maxLeft),
        top: clamp(base.top + dy, 0, current.maxTop),
      };
      position.value = next;
      normalized = normalizedFromPixel(next, current);
      persist();
    }

    function resetPosition(): void {
      normalized = null;
      position.value = null;
      writeSavedPosition(null);
    }

    function onKeydown(event: KeyboardEvent): void {
      if (event.altKey && event.key === "Home") {
        event.preventDefault();
        resetPosition();
        return;
      }
      if (!event.altKey) return; // Enter/Space keep native button activation.
      const step = event.shiftKey ? KEYBOARD_STEP_LARGE : KEYBOARD_STEP;
      let dx = 0;
      let dy = 0;
      switch (event.key) {
        case "ArrowLeft":
          dx = -step;
          break;
        case "ArrowRight":
          dx = step;
          break;
        case "ArrowUp":
          dy = -step;
          break;
        case "ArrowDown":
          dy = step;
          break;
        default:
          return;
      }
      event.preventDefault();
      moveBy(dx, dy);
    }

    function onWindowResize(): void {
      if (!position.value || !normalized) return;
      if (resizeFrame !== null) return;
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null;
        if (!position.value || !normalized) return;
        const current = metrics();
        const next = pixelFromNormalized(normalized, current);
        position.value = next;
        normalized = normalizedFromPixel(next, current);
      });
    }

    onMounted(() => {
      const saved = readSavedPosition();
      if (saved) {
        normalized = saved;
        position.value = pixelFromNormalized(saved, metrics());
        // Re-clamp once layout/fonts settle so a saved spot stays fully visible.
        resizeFrame = requestAnimationFrame(() => {
          resizeFrame = null;
          if (!position.value || !normalized) return;
          const current = metrics();
          const next = pixelFromNormalized(normalized, current);
          position.value = next;
          normalized = normalizedFromPixel(next, current);
        });
      }
      window.addEventListener("resize", onWindowResize, { passive: true });
    });

    onBeforeUnmount(() => {
      window.removeEventListener("resize", onWindowResize);
      if (moveFrame !== null) cancelAnimationFrame(moveFrame);
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      moveFrame = null;
      resizeFrame = null;
      pendingPoint = null;
      unlockSelection();
      const state = drag;
      drag = null;
      if (state) {
        try {
          trigger.value?.releasePointerCapture(state.pointerId);
        } catch {
          // Already released.
        }
      }
    });

    return () => {
      const style: Record<string, string> = {
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
      };
      const current = position.value;
      if (current) {
        style.position = "fixed";
        style.left = `${Math.round(current.left)}px`;
        style.top = `${Math.round(current.top)}px`;
        style.bottom = "auto";
        style.right = "auto";
      }
      const expanded = props.expanded;
      return h(
        "button",
        {
          ref: trigger,
          type: "button",
          class: "orbit-trigger",
          "aria-expanded": expanded ? "true" : "false",
          title: TITLE,
          style,
          onPointerdown: onPointerdown,
          onPointermove: onPointermove,
          onPointerup: onPointerup,
          onPointercancel: onPointercancel,
          onLostpointercapture: onLostpointercapture,
          onClick: onClick,
          onKeydown: onKeydown,
          onDragstart: (event: DragEvent) => event.preventDefault(),
        },
        [
          h("span", { class: "orbit-trigger-orb", style: { backgroundImage: 'url("/assets/star-map/astrolabe2.webp")' }, "aria-hidden": "true" }),
          h("span", { class: "orbit-trigger-label" }, expanded ? "收起导航" : "展开求职导航"),
        ],
      );
    };
  },
});
