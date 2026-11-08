import {initializeApp} from "firebase/app";
import {getAuth,onAuthStateChanged,createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut as fbSignOut,sendPasswordResetEmail,deleteUser} from "firebase/auth";
import {initializeFirestore,persistentLocalCache,persistentMultipleTabManager,doc,collection,query,where,onSnapshot,setDoc,updateDoc,deleteDoc,getDoc,getDocs,arrayUnion,arrayRemove,deleteField,serverTimestamp,addDoc} from "firebase/firestore";
import {getMessaging,getToken,isSupported} from "firebase/messaging";
import {encode,decode} from "./codec.js";

/* Same API as backend-fake.js. Everything the UI reads lives in `store`. */
export function createFirebaseBackend(cfg){
  const app=initializeApp(cfg.firebase);
  const auth=getAuth(app);
  const db=initializeFirestore(app,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})});
  const store={ready:false,user:null,profile:{},kids:{},days:{},halaqas:{},hdocs:{},students:{},joins:{},requests:{}};
  const listeners=new Set();let emitT=null;
  const emit=()=>{clearTimeout(emitT);emitT=setTimeout(()=>listeners.forEach(f=>f()),30)};
  let subs={};
  const sub=(key,fn)=>{if(!subs[key])subs[key]=fn()};
  const unsubAll=()=>{Object.values(subs).forEach(u=>{try{u()}catch(e){}});subs={}};
  const err=e=>console.warn("[sahibi]",e&&e.code,e&&e.message);

  onAuthStateChanged(auth,u=>{
    unsubAll();
    Object.assign(store,{user:u?{uid:u.uid,email:u.email}:null,profile:{},kids:{},days:{},halaqas:{},hdocs:{},students:{},joins:{},requests:{}});
    kA={};kB={};codeChecked=new Set();
    if(!u){store.ready=true;emit();return}
    let got=0;const one=()=>{if(++got>=4){store.ready=true}emit()};
    sub("profile",()=>onSnapshot(doc(db,"users",u.uid),s=>{store.profile=s.data()||{};one()},e=>{err(e);one()}));
    // children I own (parentUid) and children I co-parent (parentUids), merged by id
    const mergeKids=()=>{store.kids=Object.assign({},kB,kA);
      Object.values(store.kids).forEach(k=>{if(k.halaqaId)sub("h:"+k.halaqaId,()=>onSnapshot(doc(db,"halaqas",k.halaqaId),hs=>{if(hs.exists())store.hdocs[hs.id]=Object.assign({id:hs.id},decode(hs.data()));else delete store.hdocs[hs.id];emit()},err));subDays(k.id);watchJoin(k)});
      one()};
    const toMap=s=>{const m={};s.forEach(d=>{m[d.id]=Object.assign({id:d.id},decode(d.data()))});return m};
    sub("kidsA",()=>onSnapshot(query(collection(db,"kids"),where("parentUid","==",u.uid)),s=>{kA=toMap(s);mergeKids()},e=>{err(e);one()}));
    sub("kidsB",()=>onSnapshot(query(collection(db,"kids"),where("parentUids","array-contains",u.uid)),s=>{kB=toMap(s);mergeKids()},e=>{err(e);one()}));
    sub("halaqas",()=>onSnapshot(query(collection(db,"halaqas"),where("teacherUid","==",u.uid)),s=>{
      const m=toMap(s);store.halaqas=m;
      Object.values(m).forEach(h=>{ensureCode(h);
        sub("rq:"+h.id,()=>onSnapshot(query(collection(db,"halaqas",h.id,"requests"),where("status","==","pending")),rs=>{store.requests[h.id]=rs.docs.map(d=>Object.assign({id:d.id},d.data())).sort((a,b)=>(a.at||0)-(b.at||0));emit()},err))});
      one()},e=>{err(e);one()}));
  });

  // classes created before class codes got their own lookup document: the teacher's app adds it the first time it sees them
  let kA={},kB={},codeChecked=new Set();
  function ensureCode(h){
    if(!h.code||codeChecked.has(h.code)||!store.user)return;codeChecked.add(h.code);
    const cref=doc(db,"halaqaCodes",h.code);
    getDoc(cref).then(s=>{if(!s.exists())return setDoc(cref,{hid:h.id,teacherUid:store.user.uid})}).catch(err);
  }
  // a parent's pending join request for one child: follow its answer
  function watchJoin(k){
    const jr=k.joinReq;if(!jr||!jr.hid||!store.user)return;
    sub("j:"+k.id+":"+jr.hid,()=>onSnapshot(doc(db,"halaqas",jr.hid,"requests",k.id),async s=>{
      const cur=store.kids[k.id];if(!cur||!cur.joinReq||cur.joinReq.hid!==jr.hid)return;
      if(!s.exists()){delete store.joins[k.id];emit();return updateDoc(doc(db,"kids",k.id),{joinReq:null}).catch(err)}
      const r=s.data();
      if(r.status==="approved"){
        try{ // the teacher normally links the child at once; if that was refused (the child is in another class), the parent's app does it
          if(cur.halaqaId!==jr.hid)await updateDoc(doc(db,"kids",k.id),{halaqaId:jr.hid,teacherUid:r.teacherUid,joinReq:null});
          else await updateDoc(doc(db,"kids",k.id),{joinReq:null});
          await deleteDoc(s.ref).catch(err);
        }catch(e){err(e)}
        delete store.joins[k.id];emit();return;
      }
      store.joins[k.id]={hid:jr.hid,name:jr.name||"",status:r.status};emit();
    },err));
  }

  function subDays(kidId){
    sub("d:"+kidId,()=>onSnapshot(collection(db,"kids",kidId,"days"),s=>{const m={};s.forEach(d=>{m[d.id]=decode(d.data())});store.days[kidId]=m;emit()},err));
  }
  function subStudents(hid){
    if(!store.user)return;
    sub("s:"+hid,()=>onSnapshot(query(collection(db,"kids"),where("teacherUid","==",store.user.uid),where("halaqaId","==",hid)),s=>{
      const m={};s.forEach(d=>{m[d.id]=Object.assign({id:d.id},decode(d.data()));subDays(d.id)});store.students[hid]=m;emit()},err));
  }
  const clean=o=>JSON.parse(JSON.stringify(o));
  const wire=o=>encode(clean(o)); // what is written to Firestore (see codec.js)
  return {
    kind:"firebase",store,
    onChange(f){listeners.add(f);return()=>listeners.delete(f)},
    async signUp(email,pw,name){const c=await createUserWithEmailAndPassword(auth,email,pw);await setDoc(doc(db,"users",c.user.uid),{name:name||"",createdAt:Date.now()},{merge:true})},
    signIn:(email,pw)=>signInWithEmailAndPassword(auth,email,pw),
    signOut:()=>fbSignOut(auth),
    resetPw:email=>sendPasswordResetEmail(auth,email),
    saveProfile(p){if(!store.user)return Promise.resolve();Object.assign(store.profile,p);emit();return setDoc(doc(db,"users",store.user.uid),clean(p),{merge:true}).catch(err)},
    saveKid(k){const d=clean(k);delete d.id;const ex=store.kids[k.id];d.parentUid=ex&&ex.parentUid?ex.parentUid:store.user.uid;store.kids[k.id]=Object.assign({},k,d);emit();subDays(k.id);return setDoc(doc(db,"kids",k.id),encode(d),{merge:true})},
    async deleteKid(id){const ds=await getDocs(collection(db,"kids",id,"days"));await Promise.all(ds.docs.map(d=>deleteDoc(d.ref)));await deleteDoc(doc(db,"kids",id))},
    subDays,subStudents,
    setDay(kidId,date,f){const m=store.days[kidId]||(store.days[kidId]={});m[date]=Object.assign({},m[date],f);emit();return setDoc(doc(db,"kids",kidId,"days",date),wire(f),{merge:true}).catch(err)},
    async saveHalaqa(h){const d=clean(h);delete d.id;d.teacherUid=store.user.uid;store.halaqas[h.id]=Object.assign({},h,d);emit();
      await setDoc(doc(db,"halaqas",h.id),encode(d),{merge:true});
      if(d.code){const cref=doc(db,"halaqaCodes",d.code),s=await getDoc(cref).catch(()=>null);if(!s||!s.exists())await setDoc(cref,{hid:h.id,teacherUid:store.user.uid});codeChecked.add(d.code)}},
    async deleteHalaqa(id){const st=store.students[id]||{},h=store.halaqas[id];
      await Promise.all(Object.keys(st).map(k=>setDoc(doc(db,"kids",k),{halaqaId:null,teacherUid:null},{merge:true}).catch(err)));
      try{const rs=await getDocs(collection(db,"halaqas",id,"requests"));await Promise.all(rs.docs.map(d=>deleteDoc(d.ref)))}catch(e){err(e)}
      if(h&&h.code)await deleteDoc(doc(db,"halaqaCodes",h.code)).catch(err);
      await deleteDoc(doc(db,"halaqas",id))},
    // class code -> the class (name, teacher name): one code at a time, through halaqaCodes; classes themselves cannot be listed
    async findHalaqa(code){code=String(code||"").trim().toUpperCase();if(!/^[A-Z0-9]{4,12}$/.test(code))return null;
      const c=await getDoc(doc(db,"halaqaCodes",code));if(!c.exists())return null;
      const h=await getDoc(doc(db,"halaqas",c.data().hid));return h.exists()?Object.assign({id:h.id},decode(h.data())):null},
    // asking to join: the class's teacher decides (see decideJoin); nothing is linked until then
    async requestJoin(kidId,code){const h=await this.findHalaqa(code);if(!h)return{err:"notfound"};
      const k=store.kids[kidId],rref=doc(db,"halaqas",h.id,"requests",kidId);
      const ex=await getDoc(rref).catch(()=>null);
      if(ex&&ex.exists()){if(ex.data().status==="pending"){return{ok:true,pending:true,name:h.name}}await deleteDoc(rref)}
      await setDoc(rref,{kidId,parentUid:store.user.uid,teacherUid:h.teacherUid,kidName:String((k&&k.name)||"").slice(0,30),status:"pending",at:Date.now()});
      const jr={hid:h.id,name:h.name||""};await setDoc(doc(db,"kids",kidId),{joinReq:jr},{merge:true});
      if(k)k.joinReq=jr;store.joins[kidId]={hid:h.id,name:h.name||"",status:"pending"};emit();return{ok:true,pending:true,name:h.name}},
    async cancelJoin(kidId){const k=store.kids[kidId],jr=k&&k.joinReq;if(!jr)return;
      await deleteDoc(doc(db,"halaqas",jr.hid,"requests",kidId)).catch(err);await updateDoc(doc(db,"kids",kidId),{joinReq:null});
      k.joinReq=null;delete store.joins[kidId];emit()},
    async decideJoin(hid,kidId,approve){const rref=doc(db,"halaqas",hid,"requests",kidId);
      await updateDoc(rref,{status:approve?"approved":"rejected",decidedAt:serverTimestamp()});
      let linked=false;
      if(approve){try{await updateDoc(doc(db,"kids",kidId),{halaqaId:hid,teacherUid:store.user.uid});linked=true}catch(e){err(e)}}
      store.requests[hid]=(store.requests[hid]||[]).filter(r=>r.id!==kidId);emit();return{linked}},
    async leaveHalaqa(kidId){const k=store.kids[kidId],hid=k&&k.halaqaId;
      if(hid)await deleteDoc(doc(db,"halaqas",hid,"requests",kidId)).catch(()=>{});
      if(k)Object.assign(k,{halaqaId:null,teacherUid:null});emit();
      await setDoc(doc(db,"kids",kidId),{halaqaId:null,teacherUid:null},{merge:true})},
    async removeStudent(kidId){const hid=Object.keys(store.students).find(h=>store.students[h]&&store.students[h][kidId]);
      if(hid)await deleteDoc(doc(db,"halaqas",hid,"requests",kidId)).catch(()=>{});
      await setDoc(doc(db,"kids",kidId),{halaqaId:null,teacherUid:null},{merge:true})},
    async codeTaken(code){const s=await getDoc(doc(db,"halaqaCodes",String(code).toUpperCase()));return s.exists()},
    // co-parents: the owner makes a code (valid 48 h, one use); the other parent enters it
    async createCoInvite(kidId){const k=store.kids[kidId],uid=store.user.uid;if(!k||k.parentUid!==uid)return{err:"notowner"};
      const A="ABCDEFGHJKMNPQRSTUVWXYZ23456789",rnd=crypto.getRandomValues(new Uint8Array(8));let code="";for(const x of rnd)code+=A[x%A.length];
      const exp=Date.now()+48*3600e3;
      await setDoc(doc(db,"invites",code),{kidId,ownerUid:uid,exp,claimedBy:null});
      await updateDoc(doc(db,"kids",kidId),{inviteCode:code,parentUids:arrayUnion(uid)});
      k.inviteCode=code;k.parentUids=Array.from(new Set([...(k.parentUids||[]),uid]));emit();return{ok:true,code,exp}},
    async redeemCoInvite(code){code=String(code||"").trim().toUpperCase();const uid=store.user.uid;
      if(!/^[A-Z0-9]{8}$/.test(code))return{err:"notfound"};
      const iref=doc(db,"invites",code),s=await getDoc(iref);if(!s.exists())return{err:"notfound"};const inv=s.data();
      if(inv.exp<Date.now())return{err:"expired"};if(inv.claimedBy&&inv.claimedBy!==uid)return{err:"used"};
      if(!inv.claimedBy)await updateDoc(iref,{claimedBy:uid});
      await updateDoc(doc(db,"kids",inv.kidId),{parentUids:arrayUnion(uid),["parentNames."+uid]:String(store.profile.name||"").slice(0,30)});
      await deleteDoc(iref).catch(err);return{ok:true}},
    async removeCoParent(kidId,uid){const k=store.kids[kidId];if(!k||k.parentUid!==store.user.uid)return;
      await updateDoc(doc(db,"kids",kidId),{parentUids:arrayRemove(uid),["parentNames."+uid]:deleteField()});
      k.parentUids=(k.parentUids||[]).filter(x=>x!==uid);if(k.parentNames)delete k.parentNames[uid];emit()},
    async leaveCoParent(kidId){const uid=store.user.uid;await updateDoc(doc(db,"kids",kidId),{parentUids:arrayRemove(uid)});delete store.kids[kidId];delete kB[kidId];emit()},
    async enablePush(target){
      try{if(!(await isSupported()))return /iPhone|iPad|iPod/.test(navigator.userAgent)&&!navigator.standalone?"ios-home":"unsupported"}catch(e){return "unsupported"}
      const perm=await Notification.requestPermission();if(perm!=="granted")return "denied";
      const reg=await navigator.serviceWorker.register("/firebase-messaging-sw.js");
      const token=await getToken(getMessaging(app),{vapidKey:cfg.vapidKey,serviceWorkerRegistration:reg});
      if(!token)return "unsupported";
      if(target.kidId)await setDoc(doc(db,"kids",target.kidId),{tokens:arrayUnion(token)},{merge:true});
      else await setDoc(doc(db,"users",store.user.uid),{tokens:arrayUnion(token)},{merge:true});
      return "ok";
    },
    async remindKid(kidId,lang){await addDoc(collection(db,"reminders"),{kidId,teacherUid:store.user.uid,lang,at:Date.now()});return "ok"},
    async notifyNote(kidId,lang){await addDoc(collection(db,"reminders"),{kidId,teacherUid:store.user.uid,lang,at:Date.now(),kind:"note"});return "ok"},
    async deleteAccount(){
      const u=auth.currentUser;if(!u)return;
      for(const id of Object.keys(store.halaqas)){subStudents(id)}
      for(const id of Object.keys(store.halaqas))await this.deleteHalaqa(id);
      for(const id of Object.keys(store.kids)){if(store.kids[id].parentUid===u.uid)await this.deleteKid(id);else await this.leaveCoParent(id).catch(err)}
      await deleteDoc(doc(db,"users",u.uid));
      await deleteUser(u);
    }
  };
}
