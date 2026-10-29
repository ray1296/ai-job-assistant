const params = new URLSearchParams(location.search);
const model = params.get("model") || "/live2d/live2d-widget-models/live2d-widget-model-miku/assets/miku.model.json";
const s = document.createElement("script");
s.src = "/live2d/js/l2d.js";
s.onload = () => {
  try {
    window.loadlive2d("pet", model);
    document.getElementById("hit").addEventListener("click", () => {
      try { parent.postMessage({ type: "zg-pet-click" }, "*"); } catch (e) {}
    });
    setInterval(() => { try { window.randomExpression && window.randomExpression(); } catch (e) {} }, 8000);
  } catch (e) { document.body.dataset.error = String(e); }
};
document.head.appendChild(s);
