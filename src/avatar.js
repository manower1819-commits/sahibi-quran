/* Original character illustrations: 8 looks x 4 skin tones. */
const O="#1b2147";
export const SKINS=["#f1c9a5","#e9b98f","#c98e62","#8d5a3b"];
const hij=(c,c2)=>['<path d="M30 112 C26 60 40 24 75 24 C110 24 124 60 120 112 C112 124 38 124 30 112 Z" fill="'+c+'" stroke="'+O+'" stroke-width="3.5"/>','<path d="M41 64 C42 40 58 30 75 30 C92 30 108 40 109 64" fill="none" stroke="'+c2+'" stroke-width="5" stroke-linecap="round"/>',true];
export const LOOKS=[
 {ar:"طاقية",en:"Kufi",outfit:"#16245e",bg:"#e6f0ff",hair:['','<path d="M41 58 C44 30 106 30 109 58 C100 52 50 52 41 58 Z" fill="#ffffff" stroke="'+O+'" stroke-width="3.5"/><path d="M52 44 h46 M47 51 h56" stroke="#d6dbe8" stroke-width="2"/>']},
 {ar:"شعر قصير",en:"Short hair",outfit:"#ff7a59",bg:"#fff1d6",hair:['','<path d="M40 66 C36 30 70 22 92 30 C108 36 114 52 110 66 C104 52 96 46 86 46 C76 50 58 48 48 44 C44 50 42 58 40 66 Z" fill="#2d1f14" stroke="'+O+'" stroke-width="3.5"/>']},
 {ar:"نظارة",en:"Glasses",outfit:"#2a9d8f",bg:"#e5f6ec",glasses:true,hair:['','<path d="M40 64 C34 44 46 30 58 32 C62 22 80 22 86 30 C98 26 112 38 110 56 C112 60 110 64 108 66 C102 54 92 48 80 48 C68 50 52 48 46 52 C44 56 42 60 40 64 Z" fill="#5a3a22" stroke="'+O+'" stroke-width="3.5"/>']},
 {ar:"قبعة",en:"Cap",outfit:"#ffc93c",bg:"#e6f4ff",hair:['','<path d="M40 60 C40 32 110 32 110 60 Z" fill="#4fb3ff" stroke="'+O+'" stroke-width="3.5"/><path d="M75 58 h44 c2 6 -4 10 -12 10 H75 Z" fill="#2b8ad6" stroke="'+O+'" stroke-width="3.5"/>']},
 {ar:"حجاب وردي",en:"Pink hijab",outfit:"#ff6fae",bg:"#fde7f1",hair:hij("#ff8fc0","#ff6fae")},
 {ar:"ضفيرتان",en:"Braids",outfit:"#8b5cf6",bg:"#f0e9ff",hair:['<path d="M36 70 C30 100 34 120 42 130 C48 122 46 100 46 80 Z M114 70 C120 100 116 120 108 130 C102 122 104 100 104 80 Z" fill="#2d1f14" stroke="'+O+'" stroke-width="3.5"/><circle cx="42" cy="132" r="5" fill="#ff6fae" stroke="'+O+'" stroke-width="2.5"/><circle cx="108" cy="132" r="5" fill="#ff6fae" stroke="'+O+'" stroke-width="2.5"/>','<path d="M40 68 C36 32 114 32 110 68 C104 50 92 44 75 44 C58 44 46 50 40 68 Z" fill="#2d1f14" stroke="'+O+'" stroke-width="3.5"/>']},
 {ar:"حجاب أزرق",en:"Blue hijab",outfit:"#1a8fa8",bg:"#e3f5f8",hair:hij("#4fb6cc","#1a8fa8")},
 {ar:"شريطة",en:"Bow",outfit:"#ffb627",bg:"#fff4d9",hair:['<path d="M38 74 C30 40 50 22 75 22 C100 22 120 40 112 74 C112 92 116 104 110 108 L104 80 C100 56 90 48 75 48 C60 48 50 56 46 80 L40 108 C34 104 38 92 38 74 Z" fill="#6b4226" stroke="'+O+'" stroke-width="3.5"/>','<path d="M98 34 l16 -10 v20 z M98 34 l-4 16 16 -6 z" fill="#ffc93c" stroke="'+O+'" stroke-width="2.5" stroke-linejoin="round"/>']}
];
/* full = with background circle and body; head = face only (for small markers) */
export function avatar(look,skin,opt){
  opt=opt||{};const L=LOOKS[look]||LOOKS[0],sk=SKINS[skin]==null?SKINS[1]:SKINS[skin],h=L.hair,isHij=!!h[2];
  let s='<svg viewBox="0 0 150 '+(opt.head?'120':'170')+'" aria-hidden="true">';
  if(!opt.head&&!opt.nobg)s+='<circle cx="75" cy="78" r="66" fill="'+L.bg+'"/>';
  if(!opt.head)s+='<path d="M22 170 C24 128 48 112 75 112 C102 112 126 128 128 170 Z" fill="'+L.outfit+'" stroke="'+O+'" stroke-width="3.5"/><path d="M62 114 Q75 128 88 114" fill="none" stroke="'+O+'" stroke-width="3"/>';
  s+=h[0];
  if(!opt.head)s+='<rect x="66" y="96" width="18" height="20" rx="6" fill="'+sk+'" stroke="'+O+'" stroke-width="3"/>';
  s+='<ellipse cx="75" cy="70" rx="34" ry="36" fill="'+sk+'" stroke="'+O+'" stroke-width="3.5"/>';
  if(!isHij)s+='<ellipse cx="41" cy="74" rx="6" ry="8" fill="'+sk+'" stroke="'+O+'" stroke-width="3"/><ellipse cx="109" cy="74" rx="6" ry="8" fill="'+sk+'" stroke="'+O+'" stroke-width="3"/>';
  s+=h[1];
  s+='<ellipse cx="62" cy="74" rx="4.2" ry="5.2" fill="'+O+'"/><ellipse cx="88" cy="74" rx="4.2" ry="5.2" fill="'+O+'"/><circle cx="63.5" cy="72" r="1.5" fill="#fff"/><circle cx="89.5" cy="72" r="1.5" fill="#fff"/>';
  s+=opt.happy?'<path d="M64 86 Q75 102 86 86 Z" fill="#7a2b1f" stroke="'+O+'" stroke-width="2.5"/>':'<path d="M66 89 Q75 97 84 89" fill="none" stroke="'+O+'" stroke-width="3.2" stroke-linecap="round"/>';
  s+='<ellipse cx="54" cy="86" rx="6" ry="4" fill="#ff9f8a" opacity=".55"/><ellipse cx="96" cy="86" rx="6" ry="4" fill="#ff9f8a" opacity=".55"/>';
  if(L.glasses)s+='<circle cx="62" cy="74" r="10" fill="none" stroke="'+O+'" stroke-width="3"/><circle cx="88" cy="74" r="10" fill="none" stroke="'+O+'" stroke-width="3"/><path d="M72 74 h6" stroke="'+O+'" stroke-width="3"/>';
  return s+'</svg>';
}
