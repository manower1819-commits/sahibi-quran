import {initializeApp} from "firebase/app";
import {getAuth,onAuthStateChanged,createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut as fbSignOut,sendPasswordResetEmail,deleteUser} from "firebase/auth";
import {initializeFirestore,persistentLocalCache,persistentMultipleTabManager,doc,collection,query,where,onSnapshot,setDoc,deleteDoc,getDocs,arrayUnion,limit,addDoc} from "firebase/firestore";
import {getMessaging,getToken,isSupported} from "firebase/messaging";

/* Same API as backend-fake.js. Everything the UI reads lives in `store`. */
export function createFirebaseBackend(cfg){
  const app=initializeApp(cfg.firebase);
  const auth=getAuth(app);
  const db=initializeFirestore(app,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})});
    const store={ready:false,user:null,profile:{},kids:{},days:{},halaqas:{},hdocs:{},students:{}};
  const listeners=new Set();let emitT=null;
  const emit=()=>{clearTimeout(emitT);emitT=setTimeout(()=>listeners.forEach(f=>f()),30)};
  let subs={};
  const sub=(key,fn)=>{if(!subs[key])subs[key]=fn()};
  const unsubAll=()=>{Object.values(subs).forEach(u=>{try{u()}catch(e){}});subs={}};
  const err=e=>console.warn("[sahibi]",e&&e.code,e&&e.message);

  onAuthStateChanged(auth,u=>{
    unsubAll();
    Object.assign(store,{user:u?{uid:u.uid,email:u.email}:null,profile:{},kids:{},days:{},halaqas:{},hdocs:{},students:{}});
    if(!u){store.ready=true;emit();return}
    let got=0;const one=()=>{if(++got>=3){store.ready=true}emit()};
    sub("profile",()=>onSnapshot(doc(db,"users",u.uid),s=>{store.profile=s.data()||{};one()},e=>{err(e);one()}));
    sub("kids",()=>onSnapshot(query(collection(db,"kids"),where("parentUid","==",u.uid)),s=>{
      const m={};s.forEach(d=>{m[d.id]=Object.assign({id:d.id},d.data())});store.kids=m;
      Object.values(m).forEach(k=>{if(k.halaqaId)sub("h:"+k.halaqaId,()=>onSnapshot(doc(db,"halaqas",k.halaqaId),hs=>{if(hs.exists())store.hdocs[hs.id]=Object.assign({id:hs.id},hs.data());else delete store.hdocs[hs.id];emit()},err));subDays(k.id)});
      one()},e=>{err(e);one()}));
    sub("halaqas",()=>onSnapshot(query(collection(db,"halaqas"),where("teacherUid","==",u.uid)),s=>{
      const m={};s.forEach(d=>{m[d.id]=Object.assign({id:d.id},d.data())});store.halaqas=m;one()},e=>{err(e);one()}));
  });

  function subDays(kidId){
    sub("d:"+kidId,()=>onSnapshot(collection(db,"kids",kidId,"days"),s=>{const m={};s.forEach(d=>{m[d.id]=d.data()});store.days[kidId]=m;emit()},err));
  }
  function subStudents(hid){
    if(!store.user)return;
    sub("s:"+hid,()=>onSnapshot(query(collection(db,"kids"),where("teacherUid","==",store.user.uid),where("halaqaId","==",hid)),s=>{
      const m={};s.forEach(d=>{m[d.id]=Object.assign({id:d.id},d.data());subDays(d.id)});store.students[hid]=m;emit()},err));
  }
  const clean=o=>JSON.parse(JSON.stringify(o));
  return {
    kind:"firebase",store,
    onChange(f){listeners.add(f);return()=>listeners.delete(f)},
    async signUp(email,pw,name){const c=await createUserWithEmailAndPassword(auth,email,pw);await setDoc(doc(db,"users",c.user.uid),{name:name||"",createdAt:Date.now()},{merge:true})},
    signIn:(email,pw)=>signInWithEmailAndPassword(auth,email,pw),
    signOut:()=>fbSignOut(auth),
    resetPw:email=>sendPasswordResetEmail(auth,email),
    saveProfile(p){if(!store.user)return Promise.resolve();Object.assign(store.profile,p);emit();return setDoc(doc(db,"users",store.user.uid),clean(p),{merge:true}).catch(err)},
    saveKid(k){const d=clean(k);delete d.id;d.parentUid=store.user.uid;store.kids[k.id]=Object.assign({},k,d);emit();subDays(k.id);return setDoc(doc(db,"kids",k.id),d,{merge:true})},
    async deleteKid(id){const ds=await getDocs(collection(db,"kids",id,"days"));await Promise.all(ds.docs.map(d=>deleteDoc(d.ref)));await deleteDoc(doc(db,"kids",id))},
    subDays,subStudents,
    setDay(kidId,date,f){const m=store.days[kidId]||(store.days[kidId]={});m[date]=Object.assign({},m[date],f);emit();return setDoc(doc(db,"kids",kidId,"days",date),clean(f),{merge:true}).catch(err)},
    saveHalaqa(h){const d=clean(h);delete d.id;d.teacherUid=store.user.uid;store.halaqas[h.id]=Object.assign({},h,d);emit();return setDoc(doc(db,"halaqas",h.id),d,{merge:true})},
    async deleteHalaqa(id){const st=store.students[id]||{};await Promise.all(Object.keys(st).map(k=>setDoc(doc(db,"kids",k),{halaqaId:null,teacherUid:null},{merge:true}).catch(err)));await deleteDoc(doc(db,"halaqas",id))},
    async findHalaqa(code){const s=await getDocs(query(collection(db,"halaqas"),where("code","==",code),limit(1)));return s.empty?null:Object.assign({id:s.docs[0].id},s.docs[0].data())},
    async joinHalaqa(kidId,code){const h=await this.findHalaqa(code.trim().toUpperCase());if(!h)return{err:"notfound"};
      await setDoc(doc(db,"kids",kidId),{halaqaId:h.id,teacherUid:h.teacherUid},{merge:true});
      if(store.kids[kidId])Object.assign(store.kids[kidId],{halaqaId:h.id,teacherUid:h.teacherUid});store.hdocs[h.id]=h;
      sub("h:"+h.id,()=>onSnapshot(doc(db,"halaqas",h.id),hs=>{if(hs.exists())store.hdocs[hs.id]=Object.assign({id:hs.id},hs.data());emit()},err));emit();return{ok:true,name:h.name}},
    leaveHalaqa(kidId){if(store.kids[kidId])Object.assign(store.kids[kidId],{halaqaId:null,teacherUid:null});emit();return setDoc(doc(db,"kids",kidId),{halaqaId:null,teacherUid:null},{merge:true})},
    removeStudent:kidId=>setDoc(doc(db,"kids",kidId),{halaqaId:null,teacherUid:null},{merge:true}),
    async codeTaken(code){return !!(await this.findHalaqa(code))},
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
    async deleteAccount(){
      const u=auth.currentUser;if(!u)return;
      for(const id of Object.keys(store.halaqas)){subStudents(id)}
      for(const id of Object.keys(store.halaqas))await this.deleteHalaqa(id);
      for(const id of Object.keys(store.kids))await this.deleteKid(id);
      await deleteDoc(doc(db,"users",u.uid));
      await deleteUser(u);
    }
  };
}
