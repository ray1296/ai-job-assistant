import test from "node:test";
import assert from "node:assert/strict";
import {validateClassification} from "../server/resume-classification.mjs";
import {profileData} from "../server/profile-data.mjs";
const source="Lin Example\n123456789\nlin@example.invalid\nProject Z\n2024\nBuilt tests\nGPA 3.8";
const candidate=()=>({profile:{name:"Lin Example",phone:"123456789",email:"lin@example.invalid",cities:[],directions:[],education:[],experience:[],projects:[{title:"Project Z",period:"2024",detail:"Built tests"}]},extras:[{title:"GPA",content:"GPA 3.8"}]});
test("classification returns profile and extras without making a document",()=>{
  const result=validateClassification(candidate(),source,profileData);
  assert.equal(result.profile.name,"Lin Example");
  assert.equal(result.profile.projects[0].period,"2024");
  assert.deepEqual(result.extras,[{title:"GPA",content:"GPA 3.8"}]);
  assert.match(result.profile.notes,/GPA 3.8/);
  assert.equal(result.document,undefined);
  assert.equal(profileData(candidate().profile).notes,"");
  assert.ok(result.evidence.every(x=>source.includes(x.quote)));
});
test("invented unknown content and invalid extras are rejected",()=>{
  const c=candidate();c.extras[0].content="GPA 4.0";
  assert.throws(()=>validateClassification(c,source,profileData),{status:502});
  assert.throws(()=>validateClassification({...candidate(),extras:{}},source,profileData),{status:502});
});
