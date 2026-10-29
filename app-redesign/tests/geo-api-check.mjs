const base="http://127.0.0.1:5173";
let cookie="", csrf="";
async function call(path, method="GET", body, headers={}){
  const r=await fetch(base+path,{method,headers:{...headers,cookie,...(csrf?{"X-CSRF-Token":csrf}:{})},body});
  const t=await r.text(); let j; try{j=JSON.parse(t)}catch{j=t.slice(0,200)}
  return {status:r.status, body:j, setCookie:r.headers.get("set-cookie")};
}
const reg=await call("/api/auth/register","POST",JSON.stringify({email:"geo-"+Date.now()+"@example.invalid",password:"Geo-Test-12345!"}),{"Content-Type":"application/json"});
cookie=(reg.setCookie||"").split(";")[0]; csrf=reg.body.csrf;
const cfg=await call("/api/geo/config");
console.log("config", cfg.status, "configured:", cfg.body.configured, "keyLen:", (cfg.body.key||"").length);
// 加两个投递意向
const jobs=await call("/api/jobs?limit=3");
const ids=(jobs.body.jobs||jobs.body.items||[]).slice(0,2).map(j=>j.id);
for(const id of ids) await call("/api/job-intents/"+id,"PUT");
const layers=await call("/api/geo/layers");
console.log("layers", layers.status, "jobs:", layers.body.jobs?.length, "有坐标:", layers.body.jobs?.filter(j=>j.pos).length, "housing:", layers.body.housing?.length);
const first=layers.body.jobs?.find(j=>j.pos);
if(first){
  const nb=await call("/api/geo/nearby?lng="+first.pos.lng+"&lat="+first.pos.lat+"&radius=2000");
  const h=nb.body.pois||[];
  console.log("酒店", nb.status, h.length, "带电话:", h.filter(x=>x.tel).length, "样例:", h[0]?.name, h[0]?.tel);
  const sw=await call("/api/geo/nearby?kind=subway&city="+encodeURIComponent(first.city||"北京"));
  console.log("地铁站", sw.status, (sw.body.pois||[]).length, (sw.body.pois||[])[0]?.name);
  const rt=await call("/api/geo/route","POST",JSON.stringify({mode:"transit",from:{lng:first.pos.lng,lat:first.pos.lat},to:{lng:116.397,lat:39.909},city:first.city||"北京"}),{"Content-Type":"application/json"});
  console.log("公交路线", rt.status, rt.body.route?.distance, "米", Math.round((rt.body.route?.duration||0)/60), "分钟", "点数", rt.body.route?.polyline?.length);
  const ai=await call("/api/geo/ai-assist","POST",JSON.stringify({lng:first.pos.lng,lat:first.pos.lat,radius:2000,label:first.title}),{"Content-Type":"application/json"});
  console.log("AI建议", ai.status, JSON.stringify({advice:(ai.body.advice||"").slice(0,80),picks:(ai.body.picks||[]).length,tips:(ai.body.tips||[]).length}));
}
