/* In-memory demo backend with the same API as backend-firebase.js.
   Used for the preview and for tests; data stays on this device. */
export function createFakeBackend(){
  const KEY="sahibi-demo-v2";
  let db={users:{},kids:{},days:{},halaqas:{},requests:{},invites:{},session:null};
  try{const v=JSON.parse(localStorage.getItem(KEY)||"null");if(v)db=Object.assign(db,v)}catch(e){}
  const persist=()=>{try{localStorage.setItem(KEY,JSON.stringify(db))}catch(e){}};
  const store={ready:false,user:null,profile:{},kids:{},days:{},halaqas:{},hdocs:{},students:{},joins:{},requests:{}};
  const isParent=k=>k.parentUid===db.session||(k.parentUids||[]).indexOf(db.session)>-1;
  const listeners=new Set();let t=null;
  const emit=()=>{clearTimeout(t);t=setTimeout(()=>listeners.forEach(f=>f()),10)};
  const C=o=>JSON.parse(JSON.stringify(o));
  const watched=new Set();
  function refresh(){
    persist();
    const u=db.session&&db.users[db.session];
    store.user=u?{uid:db.session,email:u.email}:null;
    store.profile=u?C(u.profile||{}):{};
    store.kids={};store.halaqas={};store.hdocs={};store.joins={};store.requests={};
    if(u){
      Object.entries(db.kids).forEach(([id,k])=>{if(isParent(k)){store.kids[id]=Object.assign({id},C(k));if(k.joinReq&&db.requests[k.joinReq.hid]&&db.requests[k.joinReq.hid][id]){const r=db.requests[k.joinReq.hid][id];if(r.status!=="approved")store.joins[id]={hid:k.joinReq.hid,name:k.joinReq.name||"",status:r.status}}if(k.halaqaId&&db.halaqas[k.halaqaId])store.hdocs[k.halaqaId]=Object.assign({id:k.halaqaId},C(db.halaqas[k.halaqaId]))}});
      Object.entries(db.halaqas).forEach(([id,h])=>{if(h.teacherUid===db.session){store.halaqas[id]=Object.assign({id},C(h));store.requests[id]=Object.values(db.requests[id]||{}).filter(r=>r.status==="pending").map(r=>Object.assign({id:r.kidId},C(r))).sort((a,b)=>(a.at||0)-(b.at||0))}});
      Object.keys(store.students).forEach(hid=>{const m={};Object.entries(db.kids).forEach(([id,k])=>{if(k.halaqaId===hid&&k.teacherUid===db.session)m[id]=Object.assign({id},C(k))});store.students[hid]=m});
      store.days={};const vis=id=>db.kids[id]&&(isParent(db.kids[id])||db.kids[id].teacherUid===db.session);
      Object.keys(db.days).forEach(id=>{if(vis(id))store.days[id]=C(db.days[id])});
    }else{store.days={};store.students={}}
    store.ready=true;emit();
  }
  setTimeout(refresh,0);
  const wait=v=>new Promise(r=>setTimeout(()=>r(v),60));
  const fail=code=>{const e=new Error(code);e.code=code;return Promise.reject(e)};
  const me=()=>db.users[db.session];
  return {
    kind:"demo",store,
    onChange(f){listeners.add(f);return()=>listeners.delete(f)},
    async signUp(email,pw,name){email=String(email).trim().toLowerCase();if(!/^\S+@\S+\.\S+$/.test(email))return fail("auth/invalid-email");if(String(pw).length<6)return fail("auth/weak-password");
      if(Object.values(db.users).some(u=>u.email===email))return fail("auth/email-already-in-use");
      const uid="u"+Date.now().toString(36);db.users[uid]={email,pw,profile:{name:name||""}};db.session=uid;refresh();return wait()},
    async signIn(email,pw){email=String(email).trim().toLowerCase();const e=Object.entries(db.users).find(([,u])=>u.email===email);if(!e||e[1].pw!==pw)return fail("auth/invalid-credential");db.session=e[0];refresh();return wait()},
    async signOut(){db.session=null;store.students={};refresh();return wait()},
    async resetPw(){return wait()},
    async saveProfile(p){const u=me();if(!u)return;u.profile=Object.assign(u.profile||{},C(p));refresh()},
    async saveKid(k){const d=C(k);delete d.id;d.parentUid=(db.kids[k.id]&&db.kids[k.id].parentUid)||db.session;db.kids[k.id]=Object.assign(db.kids[k.id]||{},d);refresh()},
    async deleteKid(id){delete db.kids[id];delete db.days[id];Object.values(db.requests).forEach(rs=>{delete rs[id]});refresh()},
    subDays(){},
    subStudents(hid){if(!store.students[hid]){store.students[hid]={};setTimeout(refresh,0)}},
    async fetchDays(){},
    async setDay(kidId,date,f){const m=db.days[kidId]||(db.days[kidId]={});m[date]=Object.assign(m[date]||{},C(f));refresh()},
    async saveHalaqa(h){const d=C(h);delete d.id;d.teacherUid=db.session;db.halaqas[h.id]=Object.assign(db.halaqas[h.id]||{},d);refresh()},
    async deleteHalaqa(id){Object.values(db.kids).forEach(k=>{if(k.halaqaId===id){k.halaqaId=null;k.teacherUid=null}});delete db.requests[id];delete db.halaqas[id];delete store.students[id];refresh()},
    async findHalaqa(code){const e=Object.entries(db.halaqas).find(([,h])=>h.code===code);return e?Object.assign({id:e[0]},C(e[1])):null},
    // asking to join: the class's teacher decides (decideJoin); nothing is linked until then
    async requestJoin(kidId,code){const h=await this.findHalaqa(String(code).trim().toUpperCase());if(!h)return{err:"notfound"};const k=db.kids[kidId];
      const rs=db.requests[h.id]||(db.requests[h.id]={});
      if(k.joinReq&&k.joinReq.hid&&k.joinReq.hid!==h.id&&db.requests[k.joinReq.hid])delete db.requests[k.joinReq.hid][kidId];   // asking another class replaces the first request
      if(!(rs[kidId]&&rs[kidId].status==="pending"))rs[kidId]={kidId,parentUid:db.session,teacherUid:h.teacherUid,kidName:String(k.name||"").slice(0,30),status:"pending",at:Date.now()};
      k.joinReq={hid:h.id,name:h.name||""};refresh();return wait({ok:true,pending:true,name:h.name})},
    async cancelJoin(kidId){const k=db.kids[kidId];if(k&&k.joinReq){if(db.requests[k.joinReq.hid])delete db.requests[k.joinReq.hid][kidId];k.joinReq=null}refresh()},
    async decideJoin(hid,kidId,approve){const r=(db.requests[hid]||{})[kidId];if(!r)return{linked:false};const k=db.kids[kidId];
      if(approve&&k){k.halaqaId=hid;k.teacherUid=db.session;k.joinReq=null;delete db.requests[hid][kidId];refresh();return{linked:true}}
      r.status="rejected";refresh();return{linked:false}},
    async leaveHalaqa(kidId){const k=db.kids[kidId];if(k){if(k.halaqaId&&db.requests[k.halaqaId])delete db.requests[k.halaqaId][kidId];k.halaqaId=null;k.teacherUid=null}refresh()},
    async removeStudent(kidId){Object.values(db.halaqas).forEach(h=>{if(h.studentPlans)delete h.studentPlans[kidId]});return this.leaveHalaqa(kidId)},
    async codeTaken(code){return !!(await this.findHalaqa(code))},
    // co-parents: the owner makes a code (valid 48 h, one use); the other parent enters it
    async createCoInvite(kidId){const k=db.kids[kidId];if(!k||k.parentUid!==db.session)return{err:"notowner"};
      const A="ABCDEFGHJKMNPQRSTUVWXYZ23456789";let code="";for(let i=0;i<8;i++)code+=A[Math.floor(Math.random()*A.length)];
      const exp=Date.now()+48*3600e3;db.invites[code]={kidId,ownerUid:db.session,exp,claimedBy:null};
      k.parentUids=Array.from(new Set([...(k.parentUids||[]),db.session]));refresh();return{ok:true,code,exp}},
    async redeemCoInvite(code){code=String(code||"").trim().toUpperCase();const inv=db.invites[code];if(!inv)return{err:"notfound"};
      if(inv.exp<Date.now())return{err:"expired"};if(inv.claimedBy&&inv.claimedBy!==db.session)return{err:"used"};
      const k=db.kids[inv.kidId];if(!k)return{err:"notfound"};
      k.parentUids=Array.from(new Set([...(k.parentUids||[k.parentUid]),db.session]));(k.parentNames||(k.parentNames={}))[db.session]=String((me().profile||{}).name||"").slice(0,30);
      delete db.invites[code];refresh();return{ok:true}},
    async removeCoParent(kidId,uid){const k=db.kids[kidId];if(!k||k.parentUid!==db.session)return;k.parentUids=(k.parentUids||[]).filter(x=>x!==uid);if(k.parentNames)delete k.parentNames[uid];refresh()},
    async leaveCoParent(kidId){const k=db.kids[kidId];if(!k)return;k.parentUids=(k.parentUids||[]).filter(x=>x!==db.session);if(k.parentNames)delete k.parentNames[db.session];refresh()},
    async enablePush(){return wait("demo")},
    async disablePush(){return "off"},
    async remindKid(){return wait("ok")},
    async notifyNote(){return wait("ok")},
    async deleteAccount(){const uid=db.session;Object.keys(db.halaqas).forEach(id=>{if(db.halaqas[id].teacherUid===uid)this.deleteHalaqa(id)});Object.keys(db.kids).forEach(id=>{if(db.kids[id].parentUid===uid){delete db.kids[id];delete db.days[id]}else if((db.kids[id].parentUids||[]).indexOf(uid)>-1)db.kids[id].parentUids=db.kids[id].parentUids.filter(x=>x!==uid)});delete db.users[uid];db.session=null;refresh()}
  };
}
