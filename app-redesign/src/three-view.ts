import { defineComponent, h, ref, onMounted, onBeforeUnmount, watch } from "vue";
// @ts-ignore
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export default defineComponent({
  props: { spec: { type: Object, default: () => ({}) } },
  emits: ["close"],
  setup(props, { emit }) {
    const host = ref<HTMLElement | null>(null);
    const label = ref("");
    let renderer: any = null, scene: any = null, camera: any = null, controls: any = null, group: any = null, raf = 0;

    function build(spec: any) {
      if (!scene) return;
      if (group) { scene.remove(group); group.traverse((o: any) => { o.geometry?.dispose?.(); }); }
      group = new THREE.Group();
      const shape = String(spec?.shape || "cube").toLowerCase();
      const color = 0x7460c9;
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.15 });
      const edge = new THREE.LineBasicMaterial({ color: 0x2f2a45 });
      const addEdges = (mesh: any) => {
        const e = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), edge);
        mesh.add(e);
        return mesh;
      };
      if (shape === "sphere") group.add(addEdges(new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), mat)));
      else if (shape === "cone") group.add(addEdges(new THREE.Mesh(new THREE.ConeGeometry(1, 1.8, 32), mat)));
      else if (shape === "cylinder") group.add(addEdges(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.8, 32), mat)));
      else if (shape === "torus") group.add(addEdges(new THREE.Mesh(new THREE.TorusGeometry(1, 0.35, 16, 48), mat)));
      else if (shape === "pyramid") group.add(addEdges(new THREE.Mesh(new THREE.ConeGeometry(1, 1.8, 4), mat)));
      else if (shape === "plane") group.add(addEdges(new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), mat)));
      else if (shape === "graph") {
        const pts = [[-1.4, -1, 0], [0, 1.2, 0], [1.4, -1, 0], [0, 0, 1.2]];
        const dots = pts.map((p) => {
          const m = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), new THREE.MeshStandardMaterial({ color: 0x2f9e8f }));
          m.position.set(p[0], p[1], p[2]);
          return m;
        });
        dots.forEach((d: any) => group.add(d));
        const edges = [[0, 1], [1, 2], [0, 2], [0, 3], [1, 3], [2, 3]];
        for (const [a, b] of edges) {
          const g = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(...(pts[a] as [number, number, number])),
            new THREE.Vector3(...(pts[b] as [number, number, number])),
          ]);
          group.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x7460c9 })));
        }
      } else {
        group.add(addEdges(new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), mat)));
      }
      scene.add(group);
      label.value = spec?.text || "";
    }

    onMounted(() => {
      const el = host.value!;
      const w = el.clientWidth, hh = el.clientHeight;
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0xfaf8fd);
      camera = new THREE.PerspectiveCamera(50, w / hh, 0.1, 100);
      camera.position.set(3.2, 2.6, 3.6);
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(w, hh);
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      el.appendChild(renderer.domElement);
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.enableZoom = true;
      scene.add(new THREE.AmbientLight(0xffffff, 0.85));
      const dir = new THREE.DirectionalLight(0xffffff, 1.1);
      dir.position.set(4, 6, 5);
      scene.add(dir);
      scene.add(new THREE.GridHelper(6, 12, 0xe6def0, 0xefe9f7));
      build(props.spec);
      const loop = () => { raf = requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); };
      loop();
    });
    watch(() => props.spec, (v) => build(v), { deep: true });
    onBeforeUnmount(() => {
      cancelAnimationFrame(raf);
      try { controls?.dispose(); renderer?.dispose(); } catch {}
    });

    return () =>
      h("div", { class: "three-backdrop", onClick: (e: Event) => { if (e.target === e.currentTarget) emit("close"); } }, [
        h("div", { class: "three-panel" }, [
          h("header", { class: "three-head" }, [
            h("strong", "3D 演示" + (label.value ? " · " + label.value : "")),
            h("span", { class: "muted" }, "拖动旋转 · 滚轮缩放"),
            h("button", { class: "btn small", onClick: () => emit("close") }, "×"),
          ]),
          h("div", { ref: host, class: "three-host" }),
        ]),
      ]);
  },
});
