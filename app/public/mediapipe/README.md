# MediaPipe 端侧视觉资源

这些文件用于模拟面试的端侧 CV，全部在浏览器本地运行，不上传原始视频。

- `face_landmarker.task`：MediaPipe Face Landmarker（float16, v1）
  来源：https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
- `pose_landmarker_lite.task`：MediaPipe Pose Landmarker Lite（float16, v1）
  来源：https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task
- `wasm/`：`@mediapipe/tasks-vision@1.1.1` 自带的 WASM runtime（保留 SIMD 与 no-SIMD 两套）。

MediaPipe 模型与 runtime 遵循其上游 Apache-2.0 许可；升级 `@mediapipe/tasks-vision` 时请同步更新 `wasm/`。
- `vision_bundle.mjs`：`@mediapipe/tasks-vision@1.1.1` 的 ESM bundle，手势彩蛋运行时动态 import；升级依赖时从 `node_modules/@mediapipe/tasks-vision/vision_bundle.mjs` 同步。
- `gesture_recognizer.task`：MediaPipe Gesture Recognizer（float16, v1）
  来源：https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task

首次打开手势彩蛋要下载 wasm（约 13.5MB）+ 手势模型（约 8MB），慢网络下约 20–60 秒；前端超时已放宽到 90 秒，加载完成后浏览器会按 `Cache-Control: max-age=86400` 缓存。
