const base="http://127.0.0.1:5173";
let cookie="", csrf="";
async function call(path, method="GET", body, headers={}){
  const r=await fetch(base+path,{method,headers:{...headers,cookie,...(csrf?{"X-CSRF-Token":csrf}:{})},body});
  const t=await r.text(); let j; try{j=JSON.parse(t)}catch{j=t.slice(0,200)}
  return {status:r.status, body:j, setCookie:r.headers.get("set-cookie")};
}
async function reg(email){ const r=await call("/api/auth/register","POST",JSON.stringify({email,password:"Dataset-Test-123!"}),{"Content-Type":"application/json"}); cookie=(r.setCookie||"").split(";")[0]; csrf=r.body.csrf; return r.status; }
import fs from "node:fs";
await reg("ds-a-"+Date.now()+"@example.invalid");
const buf=fs.readFileSync("artifacts/dataset-fixtures/housing.json");
const up=await call("/api/datasets","POST",buf,{"Content-Type":"application/json","X-File-Name":encodeURIComponent("housing.json"),"X-Category":"housing"});
const id=up.body.dataset.id;
const d=await call("/api/datasets/"+id);
console.log("本人看明细:", JSON.stringify(d.body.dataset.rows[0]));
// 换账号
await reg("ds-b-"+Date.now()+"@example.invalid");
const other=await call("/api/datasets/"+id);
console.log("他人访问该数据集:", other.status, JSON.stringify(other.body).slice(0,80));
const otherList=await call("/api/datasets");
console.log("他人列表条数:", (otherList.body.datasets||[]).length);
const del=await call("/api/datasets/"+id,"DELETE");
console.log("他人删除:", del.status);
// 原账号仍能看到且能删
const back=await reg("ds-a2-"+Date.now()+"@example.invalid");
console.log("--- 非法文件 ---");
const bad=await call("/api/datasets","POST",Buffer.from("not,a-real"),{"Content-Type":"text/plain","X-File-Name":encodeURIComponent("x.exe"),"X-Category":"jobs"});
console.log("exe:", bad.status, JSON.stringify(bad.body).slice(0,80));
const badCat=await call("/api/datasets","POST",buf,{"Content-Type":"application/json","X-File-Name":encodeURIComponent("h.json"),"X-Category":"nope"});
console.log("bad category:", badCat.status, JSON.stringify(badCat.body).slice(0,80));
