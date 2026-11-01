/* In-memory demo backend with the same API as backend-firebase.js.
   Used for the preview and for tests; data stays on this device. */
export function createFakeBackend(){
  const KEY="sahibi-demo-v2";
  let db={users:{},kids:{},days:{},halaqas:{},session:null};
  try{const v=JSON.parse(localStorage.getItem(KEY)||"null");if(v)db=Object.assign(db,v)}catch(e){}
  const persist=()=>{try{localStorage.setItem(KEY,JSON.stringify(db))}catch(e){}};
  const store={ready:false,user:null,profile:{},kids:{},days:{},halaqas:{},hdocs:{},students:{}};
  const listeners=new Set();let t=null;
  const emit=()=>{clearTimeout(t);t=setTimeout(()=>listeners.forEach(f=>f()),10)};
  const C=o=>JSON.parse(JSON.stringify(o));
  const watched=new Set();
  function refresh(){
    persist();
    const u=db.session&&db.users[db.session];
    store.user=u?{uid:db.session,email:u.email}:null;
    store.profile=u?C(u.profile||{}):{};
    store.kids={};store.halaqas={};store.hdocs={};
    if(u){
      Object.entries(db.kids).forEach(([id,k])=>{if(k.parentUid===db.session){store.kids[id]=Object.assign({id},C(k));if(k.halaqaId&&db.halaqas[k.halaqaId])store.hdocs[k.halaqaId]=Object.assign({id:k.halaqaId},C(db.halaqas[k.halaqaId]))}});
      Object.entries(db.halaqas).forEach(([id,h])=>{if(h.teacherUid===db.session)store.halaqas[id]=Object.assign({id},C(h))});
      Object.keys(store.students).forEach(hid=>{const m={};Object.entries(db.kids).forEach(([id,k])=>{if(k.halaqaId===hid&&k.teacherUid===db.session)m[id]=Object.assign({id},C(k))});store.students[hid]=m});
      store.days={};const vis=id=>db.kids[id]&&(db.kids[id].parentUid===db.session||db.kids[id].teacherUid===db.session);
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
    async saveKid(k){const d=C(k);delete d.id;d.parentUid=db.session;db.kids[k.id]=Object.assign(db.kids[k.id]||{},d);refresh()},
    async deleteKid(id){delete db.kids[id];delete db.days[id];refresh()},
    subDays(){},
    subStudents(hid){if(!store.students[hid]){store.students[hid]={};setTimeout(refresh,0)}},
    async setDay(kidId,date,f){const m=db.days[kidId]||(db.days[kidId]={});m[date]=Object.assign(m[date]||{},C(f));refresh()},
    async saveHalaqa(h){const d=C(h);delete d.id;d.teacherUid=db.session;db.halaqas[h.id]=Object.assign(db.halaqas[h.id]||{},d);refresh()},
    async deleteHalaqa(id){Object.values(db.kids).forEach(k=>{if(k.halaqaId===id){k.halaqaId=null;k.teacherUid=null}});delete db.halaqas[id];delete store.students[id];refresh()},
    async findHalaqa(code){const e=Object.entries(db.halaqas).find(([,h])=>h.code===code);return e?Object.assign({id:e[0]},C(e[1])):null},
    async joinHalaqa(kidId,code){const h=await this.findHalaqa(String(code).trim().toUpperCase());if(!h)return{err:"notfound"};const k=db.kids[kidId];k.halaqaId=h.id;k.teacherUid=h.teacherUid;refresh();return wait({ok:true,name:h.name})},
    async leaveHalaqa(kidId){const k=db.kids[kidId];if(k){k.halaqaId=null;k.teacherUid=null}refresh()},
    async removeStudent(kidId){return this.leaveHalaqa(kidId)},
    async codeTaken(code){return !!(await this.findHalaqa(code))},
    async enablePush(){return wait("demo")},
    async remindKid(){return wait("ok")},
    async deleteAccount(){const uid=db.session;Object.keys(db.halaqas).forEach(id=>{if(db.halaqas[id].teacherUid===uid)this.deleteHalaqa(id)});Object.keys(db.kids).forEach(id=>{if(db.kids[id].parentUid===uid){delete db.kids[id];delete db.days[id]}});delete db.users[uid];db.session=null;refresh()}
  };
}
