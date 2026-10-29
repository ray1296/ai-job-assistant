const base="http://127.0.0.1:5173";
let cookie="", csrf="";
async function call(path, method="GET", body, headers={}){
  const r=await fetch(base+path,{method,headers:{...headers,cookie,...(csrf?{"X-CSRF-Token":csrf}:{})},body});
  const t=await r.text(); let j; try{j=JSON.parse(t)}catch{j=t.slice(0,200)}
  return {status:r.status, body:j, setCookie:r.headers.get("set-cookie")};
}
const reg=await call("/api/auth/register","POST",JSON.stringify({email:"ds-"+Date.now()+"@example.invalid",password:"Dataset-Test-123!"}),{"Content-Type":"application/json"});
cookie=(reg.setCookie||"").split(";")[0]; csrf=reg.body.csrf;
console.log("register",reg.status,!!csrf);
import fs from "node:fs";
for (const [file,cat,ext] of [["artifacts/dataset-fixtures/jobs.csv","jobs","csv"],["artifacts/dataset-fixtures/housing.json","housing","json"],["artifacts/dataset-fixtures/knowledge.xml","knowledge","xml"],["artifacts/dataset-fixtures/companies.xlsx","companies","xlsx"]]) {
  const buf=fs.readFileSync(file);
  const r=await call("/api/datasets","POST",buf,{"Content-Type":"application/octet-stream","X-File-Name":encodeURIComponent(file.split("/").pop()),"X-Category":cat});
  console.log(cat, r.status, JSON.stringify(r.body).slice(0,260));
}
const l=await call("/api/datasets");
console.log("list", l.status, (l.body.datasets||[]).map(d=>d.category+":"+d.rowCount+"行/"+d.mappedBy).join(", "));
const first=(l.body.datasets||[])[0];
if(first){ const d=await call("/api/datasets/"+first.id+"?limit=5"); console.log("detail", d.status, JSON.stringify(d.body.dataset.rows[0]).slice(0,200)); }
