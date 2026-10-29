import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createResumeImports, expandRecognition, validateRecognition } from "../server/resume-import.mjs";
import { profileData } from "../server/profile-data.mjs";

// Intentionally projects first, education last, and name/contact in the middle.
const source = "项目经历\nProject Z\n2024\nBuilt tests\nLin Example\nlin@example.invalid | 123456789\n教育背景\nExample University\n2020-2024\nComputer Science";
function candidate() {
  return {profile:{name:"Lin Example",phone:"123456789",email:"lin@example.invalid",cities:[],directions:[],projects:[{title:"Project Z",period:"2024",detail:"Built tests"}],education:[{title:"Example University",period:"2020-2024",detail:"Computer Science"}],experience:[]},document:{schemaVersion:2,header:{name:{ref:"profile.name"},contact:"lin@example.invalid | 123456789"},sections:[{id:"projects",title:"项目经历",items:[{id:"p1",title:{ref:"profile.projects.0.title"},meta:{ref:"profile.projects.0.period"},content:{ref:"profile.projects.0.detail"}}]},{id:"education",title:"教育背景",items:[{id:"e1",title:{ref:"profile.education.0.title"},meta:{ref:"profile.education.0.period"},content:{ref:"profile.education.0.detail"}}]}]}};
}
async function harness(fn, options={}) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),"resume-semantic-"));
  let handler; let calls=0;
  const server=http.createServer(async(req,res)=>{calls++;let text="";for await(const c of req)text+=c;handler(JSON.parse(text),res);});
  await new Promise(r=>server.listen(0,"127.0.0.1",r));
  await fs.writeFile(path.join(dir,"ai-config.json"),JSON.stringify({apiKey:"synthetic-secret-must-not-leak",baseUrl:"http://127.0.0.1:"+server.address().port,model:"text-fixture",visionModel:"vision-fixture"}));
  const db=new DatabaseSync(":memory:");db.exec("CREATE TABLE users(id TEXT PRIMARY KEY);INSERT INTO users VALUES('a')");
  const svc=createResumeImports(db,dir,profileData,options);
  try {await fn(svc,(f)=>handler=f,()=>calls,db);} finally {svc.close();server.closeAllConnections();await new Promise(r=>server.close(r));db.close();await fs.rm(dir,{recursive:true,force:true});}
}
const envelope=(res,raw,extra={})=>res.end(JSON.stringify({choices:[{finish_reason:"stop",message:{content:JSON.stringify(raw)}}],usage:{prompt_tokens:100,completion_tokens:200,total_tokens:300},...extra}));

test("compact text AI maps arbitrary ordering and all facts without repeated source/evidence", async()=>harness(async(svc,set,calls)=>{
  set((body,res)=>{assert.equal(body.model,"text-fixture");assert.equal(body.max_tokens,8192);assert.equal(body.stream,false);assert.match(body.messages[0].content,/按语义分类/);assert.match(body.messages[0].content,/不生成document/);envelope(res,candidate());});
  const draft=await svc.recognize("a",{text:source});
  assert.equal(calls(),1);assert.equal(draft.sourceText,source);assert.equal(draft.profile.name,"Lin Example");assert.equal(draft.document.header.name,"Lin Example");assert.equal(draft.document.sections[0].items[0].title,"Project Z");assert.equal(draft.document.sections[1].items[0].title,"Example University");
  assert.ok(draft.evidence.length>10);assert.ok(draft.evidence.every(e=>source.includes(e.quote)&&e.page===null));assert.equal(draft.metrics.usage.totalTokens,300);assert.equal(draft.metrics.cost.amount,null);assert.equal(draft.provenance.localFallback,false);assert.ok(draft.metrics.responseBytes>0);assert.doesNotMatch(JSON.stringify(draft),/synthetic-secret|baseUrl/);
}));

test("vision uses actual image and demands complete source text in same semantic request",async()=>harness(async(svc,set,calls)=>{
  set((body,res)=>{assert.equal(body.model,"vision-fixture");assert.ok(body.messages[1].content.some(x=>x.type==="image_url"&&x.image_url.url.startsWith("data:image/png;base64,")));envelope(res,{...candidate(),sourceText:source});});
  const draft=await svc.recognize("a",{images:[{mime:"image/png",data:"aGVsbG8="}],pages:[{page:1,method:"PDF页面视觉识别"}]});assert.equal(calls(),1);assert.equal(draft.mode,"vision");assert.equal(draft.provenance.visualAI,true);assert.equal(draft.metrics.imageBytes,5);
}));

test("timeout remains bounded and records metrics without retry or partial draft",async()=>harness(async(svc,set,calls)=>{
  set(()=>{});await assert.rejects(svc.recognize("a",{text:source}),{status:504});assert.equal(calls(),1);assert.equal(svc.status().active,0);assert.equal(svc.list("a").length,0);assert.equal(svc.status().lastAttempt.outcome,"timeout");assert.equal(svc.status().lastAttempt.requestCount,1);
},{requestTimeoutMs:30}));

test("length truncation and changed source fail closed without local fallback",async()=>harness(async(svc,set)=>{
  set((body,res)=>envelope(res,candidate(),{choices:[{finish_reason:"length",message:{content:"{}"}}]}));await assert.rejects(svc.recognize("a",{text:source}),{status:502});
  set((body,res)=>envelope(res,{...candidate(),sourceText:"modified"}));await assert.rejects(svc.recognize("a",{text:source}),{status:502});assert.equal(svc.list("a").length,0);
}));

test("no visual source, unsafe aliases, missing contact/header and invented content rejected",()=>{
  assert.throws(()=>validateRecognition(expandRecognition(candidate()),profileData));
  const unsafe=candidate();unsafe.document.header.name={ref:"profile.__proto__"};assert.throws(()=>expandRecognition(unsafe,source));
  const invented=candidate();invented.profile.projects[0].detail="Invented";assert.throws(()=>validateRecognition(expandRecognition(invented,source),profileData));
  const contact=candidate();contact.document.header.contact="";assert.throws(()=>validateRecognition(expandRecognition(contact,source),profileData));
});

test("reprocess updates same id at eight-draft quota without duplicates",async()=>harness(async(svc,set,calls,db)=>{
  const body=validateRecognition(expandRecognition(candidate(),source),profileData);const now=Date.now();
  for(let i=0;i<8;i++) db.prepare("INSERT INTO resume_imports VALUES(?,?,?,1,?,?)").run("draft-"+i,"a",JSON.stringify({...body,filename:"synthetic.docx"}),now,now);
  set((request,res)=>envelope(res,candidate()));
  const result=await svc.reprocess("draft-0","a",source,1);
  assert.equal(result.id,"draft-0");assert.equal(result.revision,2);assert.equal(result.createdAt,now);assert.equal(svc.list("a").length,8);assert.equal(calls(),1);
  await assert.rejects(svc.reprocess("draft-0","a",source,1),{status:409});assert.equal(calls(),1);
  await assert.rejects(svc.reprocess("draft-0","b",source,2),{status:404});assert.equal(calls(),1);
}));

test("reprocess revision CAS preserves concurrent edit and failed recognition",async()=>harness(async(svc,set,calls,db)=>{
  const body=validateRecognition(expandRecognition(candidate(),source),profileData);const now=Date.now();db.prepare("INSERT INTO resume_imports VALUES(?,?,?,1,?,?)").run("draft-0","a",JSON.stringify(body),now,now);
  set((request,res)=>{const old=svc.get("draft-0","a");svc.update("draft-0","a",{...old,sourceText:source+"\nUser edit"});envelope(res,candidate());});
  await assert.rejects(svc.reprocess("draft-0","a",source,1),{status:409});assert.equal(svc.get("draft-0","a").revision,2);assert.match(svc.get("draft-0","a").sourceText,/User edit/);assert.equal(svc.list("a").length,1);
  set((request,res)=>envelope(res,{...candidate(),sourceText:"wrong source"}));await assert.rejects(svc.reprocess("draft-0","a",source,2),{status:502});assert.equal(svc.get("draft-0","a").revision,2);assert.equal(svc.list("a").length,1);
}));

test("legacy giant quotes become minimal per-field evidence and duplicates rejected",()=>{
  const raw=expandRecognition(candidate(),source);raw.evidence=[{path:"profile.name",quote:source,page:1}];const out=validateRecognition(raw,profileData);assert.equal(out.evidence[0].quote,"Lin Example");raw.evidence.push(raw.evidence[0]);assert.throws(()=>validateRecognition(raw,profileData));
});
