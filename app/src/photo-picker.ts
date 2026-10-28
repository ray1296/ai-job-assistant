import { defineComponent, h, ref } from "vue";
import { MAX_PHOTOS, fileToPhotoDataUrl } from "./photo";

export default defineComponent({
  name: "PhotoPicker",
  props: {
    photos: { type: Array, default: () => [] },
    onChange: { type: Function, required: true },
    disabled: Boolean,
    max: { type: Number, default: MAX_PHOTOS },
    label: { type: String, default: "个人照片" },
    availablePhotos: { type: Array, default: () => [] },
  },
  setup(props) {
    const input = ref<HTMLInputElement | null>(null);
    const busy = ref(false);
    const error = ref("");
    const max = () => Math.min(MAX_PHOTOS, Number(props.max) || MAX_PHOTOS);
    async function add(e: Event) {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      (e.target as HTMLInputElement).value = "";
      if (!files.length || busy.value || props.disabled) return;
      const room = max() - props.photos.length;
      if (room <= 0) { error.value = "最多上传 " + max() + " 张照片"; return; }
      busy.value = true;
      error.value = "";
      const next = props.photos.slice();
      try {
        for (const file of files.slice(0, room)) next.push(await fileToPhotoDataUrl(file));
        if (files.length > room) error.value = "最多上传 " + max() + " 张照片，多出的文件未加入";
        props.onChange(next.slice(0, max()));
      } catch (e) {
        error.value = e instanceof Error ? e.message : "照片读取失败";
      } finally {
        busy.value = false;
      }
    }
    function addFromProfile(src: string) {
      if (props.disabled || busy.value) return;
      if (props.photos.includes(src)) { error.value = "这张照片已经在简历里了"; return; }
      if (props.photos.length >= max()) { error.value = "最多上传 " + max() + " 张照片"; return; }
      error.value = "";
      props.onChange([...props.photos, src].slice(0, max()));
    }
    function remove(index: number) {
      if (props.disabled) return;
      props.onChange(props.photos.filter((_, i) => i !== index));
    }
    return () => h("div", { class: "photo-picker" }, [
      h("div", { class: "photo-picker-head" }, [
        h("span", props.label + "（可选，最多" + max() + "张）"),
        h("small", props.photos.length + "/" + max()),
      ]),
      h("div", { class: "photo-picker-grid" }, [
        ...(props.photos as string[]).map((src: string, i: number) => h("div", { class: "photo-thumb" }, [
          h("img", { src, alt: "个人照片 " + (i + 1) }),
          h("button", {
            type: "button", class: "photo-remove", "aria-label": "移除第" + (i + 1) + "张照片",
            title: "移除照片", disabled: props.disabled, onClick: () => remove(i),
          }, "×"),
        ])),
        props.photos.length < max()
          ? h("label", { class: "photo-add", title: "上传照片", "aria-label": "上传个人照片" }, [
              h("input", {
                ref: input, type: "file", accept: "image/jpeg,image/png,image/webp", multiple: true,
                disabled: busy.value || props.disabled, onChange: add,
              }),
              h("span", busy.value ? "…" : "＋"),
              h("small", "上传"),
            ])
          : null,
      ]),
      h("p", { class: "photo-hint" }, "支持 JPG / PNG / WebP，自动压缩；第一张作为主照片。"),
      (props.availablePhotos as string[]).length && props.photos.length < max()
        ? h("div", { class: "photo-profile-picks" }, [
            h("small", "从个人信息选择"),
            h("div", { class: "photo-profile-grid" }, (props.availablePhotos as string[]).map((src: string, i: number) =>
              h("button", {
                type: "button",
                class: "photo-profile-pick" + (props.photos.includes(src) ? " selected" : ""),
                disabled: busy.value || props.disabled || props.photos.includes(src),
                title: props.photos.includes(src) ? "已加入简历" : "选择这张照片",
                onClick: () => addFromProfile(src),
              }, [
                h("img", { src, alt: "个人信息照片 " + (i + 1) }),
                h("span", props.photos.includes(src) ? "已选" : "选择"),
              ])
            )),
          ])
        : null,
      error.value ? h("p", { class: "photo-error", role: "alert" }, error.value) : null,
    ]);
  },
});
