export const MAX_PHOTOS = 3;
export const MAX_PHOTO_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTO_DATA_LENGTH = 900_000;

/**
 * 个人照片统一在浏览器端压缩为 JPEG，避免把原始大图写进账号资料。
 * 最长边 1000px，质量从 .84 逐步降低，直到 data URL 不超过 900KB。
 */
export async function fileToPhotoDataUrl(file: File): Promise<string> {
  if (!file || !/^image\/(?:jpeg|png|webp)$/i.test(file.type)) {
    throw new Error("请选择 JPG、PNG 或 WebP 图片");
  }
  if (file.size < 1 || file.size > MAX_PHOTO_FILE_BYTES) {
    throw new Error("单张照片不能超过 10MiB");
  }
  let source: CanvasImageSource;
  let width = 0, height = 0;
  let revoke = "";
  try {
    if ("createImageBitmap" in window) {
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
        source = bitmap; width = bitmap.width; height = bitmap.height;
      } catch {
        // Safari/旧版 Chromium 对某些 PNG 的 createImageBitmap 会失败，回退到 Image。
        const url = URL.createObjectURL(file);
        revoke = url;
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("图片读取失败"));
          img.src = url;
        });
        source = image; width = image.naturalWidth; height = image.naturalHeight;
      }
    } else {
      const url = URL.createObjectURL(file);
      revoke = url;
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("图片读取失败"));
        img.src = url;
      });
      source = image; width = image.naturalWidth; height = image.naturalHeight;
    }
  } catch {
    throw new Error("图片读取失败，请换一张 JPG/PNG/WebP");
  }
  try {
    if (!width || !height) throw new Error("图片尺寸无效");
    const scale = Math.min(1, 1000 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("浏览器不支持图片压缩");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    let quality = 0.84;
    let data = canvas.toDataURL("image/jpeg", quality);
    while (data.length > MAX_PHOTO_DATA_LENGTH && quality > 0.5) {
      quality -= 0.08;
      data = canvas.toDataURL("image/jpeg", quality);
    }
    if (data.length > MAX_PHOTO_DATA_LENGTH) {
      throw new Error("照片压缩后仍过大，请换一张更小的图片");
    }
    return data;
  } finally {
    if (revoke) URL.revokeObjectURL(revoke);
    if (source && "close" in source && typeof (source as ImageBitmap).close === "function") {
      try { (source as ImageBitmap).close(); } catch {}
    }
  }
}

export function isPhotoDataUrl(value: unknown): value is string {
  return typeof value === "string" && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value) && value.length <= 1_100_000;
}
