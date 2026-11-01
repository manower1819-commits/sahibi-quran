import json,os,shutil,subprocess,sys
R=os.path.dirname(os.path.abspath(__file__))
cfgp=os.path.join(R,'config.local.json')
cfg=json.load(open(cfgp)) if os.path.exists(cfgp) else {"firebase":None,"region":"","vapidKey":""}
FBV="12.4.0"
css=open(os.path.join(R,'src/style.css'),encoding='utf8').read()
FONTS='<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Lalezar&family=Readex+Pro:wght@400;500;600&family=Reem+Kufi:wght@500;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600&family=Baloo+Bhaijaan+2:wght@600;700;800&display=swap">'
import base64
DEVH=471
def bundle(demo,out):
    open(os.path.join(R,'src/config.js'),'w').write('export const CONFIG='+json.dumps(cfg if not demo else {"firebase":None,"region":"","vapidKey":""},ensure_ascii=False)+';\n')
    subprocess.run([os.path.join(R,'node_modules/.bin/esbuild'),'src/main.js','--bundle','--format=esm','--minify','--target=es2022',
      '--define:__DEMO__='+('true' if demo else 'false'),'--define:__DEV_LOGO_H__='+str(DEVH),'--define:__DEV_LOGO__='+json.dumps(('data:image/png;base64,'+base64.b64encode(open(os.path.join(R,'public/brand/dev-logo.png'),'rb').read()).decode()) if demo else '/brand/dev-logo.png'),'--outfile='+out],cwd=R,check=True)
# ---------- preview (demo, single file for the artifact) ----------
os.makedirs(os.path.join(R,'dist'),exist_ok=True)
bundle(True,'dist/demo.js')
js=open(os.path.join(R,'dist/demo.js'),encoding='utf8').read()
assert 'firebase/' not in js and 'initializeApp' not in js, 'demo bundle must not include firebase'
prev=('<title>صاحبي القرآن</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n'+FONTS+'\n<style>'+css+'</style>\n'
      '<div class="wrap" id="app"></div>\n<script type="module">'+js.replace('</script','<\\/script')+'</script>\n')
open(os.path.join(R,'dist/preview.html'),'w',encoding='utf8').write(prev)
# ---------- hosting build ----------
P=os.path.join(R,'dist/public')
if os.path.exists(P): shutil.rmtree(P)
os.makedirs(P); shutil.copytree(os.path.join(R,'public/icons'),os.path.join(P,'icons'));shutil.copytree(os.path.join(R,'public/brand'),os.path.join(P,'brand'))
bundle(False,'dist/public/app.js')
head=('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">'
 '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
 '<title>صاحبي القرآن</title><meta name="description" content="ورد مراجعة وحفظ القرآن للأطفال، مجاني صدقة جارية">'
 '<link rel="manifest" href="manifest.webmanifest"><meta name="theme-color" content="#0a3b33">'
 '<link rel="icon" href="icons/icon-192.png"><link rel="apple-touch-icon" href="icons/apple-touch-icon.png">'
 '<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="صاحبي القرآن">'
 +FONTS+'<style>'+css+'</style></head><body><div class="wrap" id="app"></div>'
 '<script type="module" src="app.js"></script>'
 '<script>if("serviceWorker" in navigator){addEventListener("load",()=>navigator.serviceWorker.register("/firebase-messaging-sw.js").catch(()=>{}))}</script>'
 '</body></html>')
open(os.path.join(P,'index.html'),'w',encoding='utf8').write(head)
shutil.copy(os.path.join(R,'src/privacy.html'),os.path.join(P,'privacy.html'))
json.dump({"name":"صاحبي القرآن","short_name":"صاحبي القرآن","description":"ورد مراجعة وحفظ القرآن للأطفال — مجاني صدقة جارية",
 "start_url":"/","scope":"/","display":"standalone","orientation":"portrait","dir":"rtl","lang":"ar",
 "background_color":"#eef4f2","theme_color":"#0a3b33",
 "icons":[{"src":"icons/icon-192.png","sizes":"192x192","type":"image/png","purpose":"any maskable"},{"src":"icons/icon-512.png","sizes":"512x512","type":"image/png","purpose":"any maskable"}]},
 open(os.path.join(P,'manifest.webmanifest'),'w',encoding='utf8'),ensure_ascii=False,indent=1)
sw=open(os.path.join(R,'src/sw.js'),encoding='utf8').read().replace('__FBV__',FBV).replace('__CONFIG__',json.dumps(cfg.get("firebase")))
open(os.path.join(P,'firebase-messaging-sw.js'),'w',encoding='utf8').write(sw)
print('built; firebase configured:',bool(cfg.get("firebase")))
