"use strict";
const $=id=>document.getElementById(id);

const LABEL={wahr:"Wahr",falsch:"Falsch",irrefuehrend:"Irreführend",unklar:"Unklar"};
const COLOR={wahr:"var(--true)",falsch:"var(--false)",irrefuehrend:"var(--warn)",unklar:"var(--unk)"};
function normV(v){v=String(v||"").toLowerCase().replace("ü","ue");if(v.startsWith("wahr")||v==="true")return"wahr";if(v.startsWith("falsch")||v==="false")return"falsch";if(v.startsWith("irref"))return"irrefuehrend";return"unklar";}


/* ---------- render ---------- */
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;}
function safeUrl(u){try{const x=new URL(u);return /^https?:$/.test(x.protocol)?x:null;}catch{return null;}}

const RATING={verlaesslich:["Verlässlich","wahr"],ueberwiegend_korrekt:["Überwiegend korrekt","wahr"],gemischt:["Gemischt","irrefuehrend"],irrefuehrend:["Irreführend","irrefuehrend"],falschinformation:["Falschinformation","falsch"]};
function normR(r){r=String(r||"").toLowerCase().replace(/ü/g,"ue").replace(/ä/g,"ae").replace(/[\s-]+/g,"_");if(RATING[r])return r;if(r.startsWith("verl"))return"verlaesslich";if(r.startsWith("ueberw"))return"ueberwiegend_korrekt";if(r.startsWith("gem"))return"gemischt";if(r.startsWith("irre"))return"irrefuehrend";if(r.startsWith("falsch"))return"falschinformation";return null;}
function linkList(title,items){
  const ok=(items||[]).map(m=>({...m,u:safeUrl(m.url)})).filter(m=>m.u);
  if(!ok.length) return null;
  const box=el("div","more");box.append(el("h4",null,title));
  const ul=el("ul");
  for(const m of ok){const li=el("li");const a=el("a",null,m.u.hostname.replace(/^www\./,"")+" – "+String(m.title||"").slice(0,70));a.href=m.u.href;a.target="_blank";a.rel="noopener noreferrer";li.append(a);ul.append(li);}
  box.append(ul);return box;
}
function render(rep,isSample){
  const done=rep.claims.filter(c=>c.verdict!=="pending");
  const vs=done.map(c=>normV(c.verdict));
  const running=!!rep.running||done.length<rep.claims.length;
  const ov=rep.overall||null, rk=ov?normR(ov.rating):null;
  let headline,stampText,stampV;
  if(running){headline="Prüfung läuft …";stampText="läuft";stampV="unklar";}
  else if(rk){headline=ov.headline||RATING[rk][0];stampText=RATING[rk][0];stampV=RATING[rk][1];}
  else if(vs.includes("falsch")){headline="Enthält Falschinformation";stampText=LABEL.falsch;stampV="falsch";}
  else if(vs.includes("irrefuehrend")){headline="Teilweise irreführend";stampText=LABEL.irrefuehrend;stampV="irrefuehrend";}
  else if(vs.length&&vs.every(v=>v==="wahr")){headline="Aussagen werden bestätigt";stampText=LABEL.wahr;stampV="wahr";}
  else {headline="Nicht eindeutig belegt";stampText=LABEL.unklar;stampV="unklar";}

  const LIGHT={wahr:["g","Grün"],irrefuehrend:["y","Gelb"],unklar:["y","Gelb"],falsch:["r","Rot"]};
  const [lc,lname]=running?[null,""]:LIGHT[stampV];
  const out=document.createDocumentFragment();
  const v=el("div","verdict");
  const vh=el("div","vhead");
  vh.append(el("span","eyebrow",isSample?"Beispiel · Gesamteinschätzung der Seite":"Gesamteinschätzung der Seite"));
  if(running)vh.append(el("span","when","Prüfung läuft"));
  else if(rep.checkedAt){const d=new Date(rep.checkedAt);vh.append(el("span","when","Geprüft am "+d.toLocaleDateString("de-DE")+", "+d.toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"})+" Uhr"));}
  v.append(vh);
  const amp=el("div","ampel"+(running?" run":""));amp.setAttribute("role","img");amp.setAttribute("aria-label",running?"Prüfung läuft":"Ampel: "+lname);
  for(const c of ["r","y","g"]){const i=el("i",c+(c===lc?" on":""));amp.append(i);}
  const t=el("div","vtext");
  if(!running){const lb=el("span","vlabel",lname+" · "+stampText);lb.style.color=COLOR[stampV];t.append(lb);}
  if(!running&&ov&&ov.score!=null&&!isNaN(+ov.score)){
    const sc=Math.max(0,Math.min(100,Math.round(+ov.score)));
    const box=el("div","score");box.setAttribute("aria-label","Glaubwürdigkeit "+sc+" von 100 Punkten");
    const top=el("div","score-top");
    const num=el("span","score-num",String(sc));num.style.color=COLOR[stampV];
    top.append(num,el("span","score-max","/ 100 Punkte"));box.append(el("span","score-lbl","Glaubwürdigkeit"));
    const bar=el("div","score-bar");const fill=el("span");fill.style.width=sc+"%";fill.style.background=COLOR[stampV];bar.append(fill);
    box.append(top,bar);t.append(box);
  }
  t.append(el("h2",null,headline));
  if(ov&&ov.assessment)t.append(el("p",null,ov.assessment));
  else if(!running&&rep.summary)t.append(el("p",null,rep.summary));
  if(ov&&Array.isArray(ov.points)&&ov.points.length){const ul=el("ul","points");ov.points.slice(0,3).forEach(p=>ul.append(el("li",null,String(p))));t.append(ul);}
  v.append(amp,t);
  const nsrc=(rep.allSources||[]).length;
  const meta=el("div","src",(rep.title?rep.title+" · ":"")+rep.source+(rep.live?(nsrc?" · "+nsrc+" unabhängige Quellen":""):" · ohne Live-Quellen"));
  v.append(meta);
  const tally=el("div","tally");
  if(rep.claims.length)tally.append(el("span","chip t-unklar",rep.claims.length+" Aussagen geprüft"));
  for(const k of ["wahr","irrefuehrend","falsch","unklar"]){const n=vs.filter(x=>x===k).length;if(n)tally.append(el("span","chip t-"+k,n+" × "+LABEL[k]));}
  v.append(tally);
  out.append(v);

  if(rep.claims.length){const h=el("h2","sec-h","Geprüfte Aussagen");h.style.marginTop="22px";h.append(el("span",null,rep.claims.length+" aus dem Text"));out.append(h);}
  const list=el("div","claims");list.style.marginTop="14px";
  rep.claims.forEach((c,i)=>{
    const card=el("article","claim");
    const head=el("div","claim-head");
    const pending=c.verdict==="pending";const nv=normV(c.verdict);
    head.style.setProperty("--c",pending?"var(--line)":COLOR[nv]);
    const top=el("div","top");
    top.append(el("span","eyebrow","Aussage "+(i+1)+" von "+rep.claims.length));
    if(pending)top.append(el("span","chip t-unklar","wird geprüft"));
    else top.append(el("span","chip t-"+nv,LABEL[nv]+(c.confidence!=null&&!isNaN(+c.confidence)?" · "+Math.round(+c.confidence)+" %":"")));
    head.append(top,el("h3",null,c.claim||""));
    if(c.quote)head.append(el("p","quote","„"+c.quote+"“"));
    if(c.explanation)head.append(el("p","expl",c.explanation));
    card.append(head);
    if(!pending){
      const ev=el("div","ev");
      ev.append(srcCol("sup","Bestätigen die Aussage",c.supporting),srcCol("con","Sagen etwas anderes",c.contradicting));
      card.append(ev);
    }
    list.append(card);
  });
  out.append(list);
  if(!running){const all=linkList("Alle gefundenen Quellen ("+((rep.allSources||[]).length)+")",rep.allSources);if(all){const wrap=el("div","claim");wrap.style.marginTop="14px";wrap.append(all);out.append(wrap);}}
  $("result").replaceChildren(out);
}
function srcCol(cls,title,items){
  const d=el("div",cls);d.append(el("h4",null,title));
  const arr=Array.isArray(items)?items:[];
  if(!arr.length){d.append(el("p","empty","Keine Quelle gefunden, die das sagt."));return d;}
  for(const s of arr){
    const it=el("div","item");const u=safeUrl(s.url);
    if(u){const host=u.hostname.replace(/^www\./,"");const a=el("a",null,s.title||host);a.href=u.href;a.target="_blank";a.rel="noopener noreferrer";it.append(el("span","av",host.charAt(0)),a,el("span","dom",host));}
    else it.append(el("span","av",String(s.title||"Q").charAt(0)),el("span","nolink",s.title||"Quelle"));
    if(s.statement)it.append(el("p",null,s.statement));
    d.append(it);
  }
  return d;
}


/* ---------- popup ---------- */
const ORIGINS={origins:["http://*/*","https://*/*"]};
const normUrl=u=>{const x=safeUrl(u);if(!x)return null;x.hash="";return x.href.replace(/\/$/,"");};
let tab=null, mode="url", state={job:null,cache:{}}, local=null, marksOn=true;

function demoPreview(url){
  const demo=DEMO_CASES.find(entry=>normUrl(entry.url)===url);
  if(!demo)return null;
  return {
    source:demo.url, title:"Vorbereitete Demo-Bewertung", live:false,
    summary:"Bewertung aus den Demo-Daten. Der Abgleich mit dem Artikeltext startet automatisch, sobald die Seite geladen ist.",
    claims:demo.claims.map(c=>({...c,claim:c.quote,supporting:c.supporting||[],contradicting:c.contradicting||[]})),
    allSources:[]
  };
}

/* tabs */
function setMode(m){mode=m;$("tab-url").setAttribute("aria-selected",m==="url");$("tab-text").setAttribute("aria-selected",m==="text");$("urlField").hidden=m!=="url";$("text").hidden=m!=="text";paint();}
$("tab-url").onclick=()=>setMode("url");
$("tab-text").onclick=()=>setMode("text");

function running(){return !!local||state.job?.status==="running";}
function updateButtons(){
  const run=running();
  $("go").disabled=run;
  $("stop").hidden=!run;
  const n=$("modeNote");
  n.textContent="Demo-Prüfung für ausgewählte Artikel.";
}

function paintLog(entries,live){
  const l=$("log");
  if(!entries||!entries.length){l.replaceChildren();l.hidden=true;return;}
  if(!live)entries=entries.slice(-1);   // after a check only the summary line stays
  l.hidden=false;
  l.replaceChildren(...entries.map((e,i)=>{const d=document.createElement("div");d.textContent=e.m;d.className=e.c||"";if(live&&i===entries.length-1&&e.c!=="err")d.className="on";return d;}));
}
function showError(msg){const p=document.createElement("p");p.className="note warn";p.textContent=msg;$("result").replaceChildren(p);}

/* decide what the popup shows */
function paint(){
  updateButtons();
  const job=state.job;
  if(local){paintLog(local,true);setHud("run");$("result").replaceChildren();return;}
  if(job&&job.status==="running"){paintLog(job.log,true);setHud("run");$("result").replaceChildren();return;}
  const cur=mode==="url"?normUrl($("url").value.trim()):null;
  const jobHere=job&&((mode==="text"&&!job.url)||(cur&&job.url&&normUrl(job.url)===cur));
  if(jobHere&&job.status==="error"){paintLog(job.log,false);setHud("error");showError(job.error);return;}
  if(jobHere&&job.status==="done"&&job.report){paintLog(job.log,false);setHud("done",job.report);showReport(job.report,job.marks);return;}
  paintLog(null);
  const cached=cur&&state.cache[cur];
  if(cached){setHud("done",cached);showReport(cached,null);return;}
  const preview=cur&&demoPreview(cur);
  if(preview){
    setHud("done",preview);render(preview,true);
    $("modeNote").textContent="Vorbereitete Demo-Bewertung · Artikelabgleich läuft automatisch.";
    return;
  }
  setHud("idle");
  $("result").replaceChildren();
}

/* the control strip on top: light, verdict in one line, score */
const LIGHT_OF={wahr:"g",irrefuehrend:"y",unklar:"y",falsch:"r"};
const LIGHT_NAME={r:"Rot",y:"Gelb",g:"Grün"};
function lightOf(rep){
  const rk=normR(rep&&rep.overall&&rep.overall.rating);
  if(rk)return{l:LIGHT_OF[RATING[rk][1]],name:RATING[rk][0]};
  const vs=(rep&&rep.claims||[]).map(c=>normV(c.verdict));
  if(vs.includes("falsch"))return{l:"r",name:"Enthält Falschinformation"};
  if(vs.length&&vs.every(v=>v==="wahr"))return{l:"g",name:"Bestätigt"};
  return{l:"y",name:vs.includes("irrefuehrend")?"Teilweise irreführend":"Nicht eindeutig belegt"};
}
function setHud(kind,rep){
  const lamp=$("lamp");lamp.className="ampel"+(kind==="run"?" run":"");
  lamp.querySelectorAll("i").forEach(i=>i.classList.remove("on"));
  const host=(()=>{const u=safeUrl($("url").value.trim());return u?u.hostname.replace(/^www\./,""):"";})();
  if(kind!=="done")$("hudLabel").style.color="";
  if(kind==="run"){$("hudLabel").textContent="Prüfung läuft";$("hudTitle").textContent="Artikel wird automatisch abgeglichen …";$("hudSub").textContent=host;lamp.setAttribute("aria-label","Ampel: Prüfung läuft");return;}
  if(kind==="error"){$("hudLabel").textContent="Abgebrochen";$("hudTitle").textContent="Bitte erneut prüfen";$("hudSub").textContent=host;lamp.setAttribute("aria-label","Ampel: keine Bewertung");return;}
  if(kind==="done"){
    const {l,name}=lightOf(rep);lamp.querySelector("i."+l).classList.add("on");
    const sc=rep.overall&&rep.overall.score!=null&&!isNaN(+rep.overall.score)?Math.round(+rep.overall.score):null;
    $("hudLabel").textContent=LIGHT_NAME[l];$("hudLabel").style.color=COLOR[{r:"falsch",y:"irrefuehrend",g:"wahr"}[l]];
    $("hudTitle").textContent=name;
    $("hudSub").textContent=(sc!=null?"Glaubwürdigkeit "+sc+" / 100":"")+(rep.claims&&rep.claims.length?(sc!=null?" · ":"")+rep.claims.length+" Aussagen":"");
    lamp.setAttribute("aria-label","Ampel: "+LIGHT_NAME[l]+", "+name);
    return;
  }
  $("hudLabel").textContent="Noch nicht geprüft";$("hudLabel").style.color="";
  $("hudTitle").textContent=mode==="text"?"Text prüfen":"Diese Seite prüfen";
  $("hudSub").textContent=mode==="text"?"":host;
  lamp.setAttribute("aria-label","Ampel: noch nicht geprüft");
}

/* show a report, plus "Im Text zeigen" when it belongs to the open tab */
function showReport(rep,found){
  render(rep,true);
  if(!marksOn||!tab||!tab.url||normUrl(rep.source)!==normUrl(tab.url))return;
  document.querySelectorAll("#result .claim-head").forEach((head,i)=>{
    if(!rep.claims[i])return;
    const b=document.createElement("button");b.type="button";b.className="locate";
    const miss=Array.isArray(found)&&found[i]===false;
    b.textContent=miss?"Stelle im Text nicht gefunden":"↓ Im Text zeigen";b.disabled=miss;
    b.onclick=async()=>{
      const r=await chrome.runtime.sendMessage({type:"focus",tabId:tab.id,i}).catch(()=>null);
      if(r&&r.ok){window.close();}else{b.textContent="Stelle im Text nicht gefunden";b.disabled=true;}
    };
    head.append(b);
  });
}
function reportForTab(){
  if(!tab||!tab.url)return null;const k=normUrl(tab.url);
  const j=state.job;
  if(j&&j.status==="done"&&j.report&&j.url&&normUrl(j.url)===k)return j.report;
  return state.cache[k]||null;
}
$("marks").addEventListener("change",async()=>{
  marksOn=$("marks").checked;
  const rep=reportForTab();
  const r=await chrome.runtime.sendMessage({type:"marks",on:marksOn,tabId:tab&&tab.id,report:rep}).catch(()=>null);
  if(state.job&&r&&Array.isArray(r.found))state.job.marks=r.found;
  paint();
});

/* read the page */
function sameAsTab(u){return tab&&tab.url&&normUrl(tab.url)===normUrl(u);}
async function readTab(){
  const [{result:res}]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>{
    const clean=t=>String(t||"").replace(/[ \t]+\n/g,"\n").replace(/\n{3,}/g,"\n\n").trim();
    const cands=[...document.querySelectorAll("article, main, [role=main]")].map(e=>clean(e.innerText)).sort((a,b)=>b.length-a.length);
    let text=cands[0]||"";
    if(text.length<600)text=clean(document.body&&document.body.innerText);
    const desc=(document.querySelector('meta[name="description"],meta[property="og:description"]')||{}).content||"";
    return {title:document.title,url:location.href,text:text.slice(0,30000),desc:String(desc).slice(0,400)};
  }});
  return res;
}
async function fetchUrl(u){
  let r;
  try{r=await fetch(u,{credentials:"omit",redirect:"follow"});}catch{throw{message:"Der Link konnte nicht geöffnet werden. Prüfe die Adresse."};}
  if(!r.ok)throw{message:"Die Seite hat den Abruf verweigert (Fehler "+r.status+"). Öffne sie im Tab und prüfe sie dort."};
  const doc=new DOMParser().parseFromString(await r.text(),"text/html");
  doc.querySelectorAll("script,style,noscript,nav,footer,header,aside,form").forEach(e=>e.remove());
  const root=doc.querySelector("article")||doc.querySelector("main")||doc.body;
  let text=[...root.querySelectorAll("h1,h2,h3,h4,p,li,blockquote")].map(n=>n.textContent.replace(/\s+/g," ").trim()).filter(Boolean).join("\n");
  if(text.length<600)text=(root.textContent||"").replace(/\s+/g," ").trim();
  const desc=(doc.querySelector('meta[name="description"],meta[property="og:description"]')||{}).content||"";
  return {title:doc.title||u,url:r.url||u,text:text.slice(0,30000),desc:String(desc).slice(0,400)};
}

/* run */
$("stop").onclick=()=>chrome.runtime.sendMessage({type:"stop"});
$("form").addEventListener("submit",async e=>{
  e.preventDefault();
  if(running())return;
  let u=$("url").value.trim();
  local=[{m:"Lese die Seite",c:"on"}];paint();
  try{
    let page;
    if(mode==="url"){
      if(!u){$("url").focus();throw{message:"Bitte einen Link eingeben."};}
      if(!/^https?:\/\//i.test(u))u="https://"+u;
      if(!safeUrl(u))throw{message:"Das ist kein gültiger Link."};
      // Request access within the submit gesture; activeTab already covers the open page.
      if(!sameAsTab(u)&&!(await chrome.permissions.request(ORIGINS)))throw{message:"Ohne Leserecht für Webseiten kann die Erweiterung die Seite nicht lesen. Tippe erneut auf „Prüfen“ und erlaube den Zugriff."};
      if(sameAsTab(u)){
        try{page=await readTab();}catch(err){throw{message:"Diese Seite kann nicht gelesen werden (z. B. Chrome-Einstellungen). Lade sie neu und versuch es erneut."};}
      }else page=await fetchUrl(u);
      if(!page||page.text.length<200)throw{message:"Auf dieser Seite wurde kaum Text gefunden. Öffne einen Artikel mit Text und versuch es erneut."};
    }else{
      const t=$("text").value.trim();
      if(t.length<40){$("text").focus();throw{message:"Bitte einen längeren Text einfügen."};}
      page={title:"Eingefügter Text",url:null,text:t.slice(0,30000),desc:""};
    }
    const r=await chrome.runtime.sendMessage({type:"check",page,tabId:tab&&tab.id,log:["Seite gelesen: "+(page.title||"").slice(0,60)]});
    if(!r||!r.ok)throw{message:(r&&r.error)||"Die Prüfung konnte nicht gestartet werden."};
    local=null;paint();
  }catch(err){
    local=null;paint();showError(err&&err.message||"Unbekannter Fehler.");
  }
});

/* live updates from the background */
chrome.storage.onChanged.addListener((ch,area)=>{
  if(area!=="local")return;
  if(ch.job)state.job=ch.job.newValue||null;
  if(ch.cache)state.cache=ch.cache.newValue||{};
  if(ch.job||ch.cache)paint();
});

/* start */
(async()=>{
  try{
    const s=await chrome.storage.local.get(["job","cache","marksOn"]);
    marksOn=s.marksOn!==false;
    state={job:s.job||null,cache:s.cache||{}};
  }catch{}
  $("marks").checked=marksOn;
  try{[tab]=await chrome.tabs.query({active:true,currentWindow:true});}catch{}
  const currentUrl=tab&&(tab.pendingUrl||tab.url);
  if(safeUrl(currentUrl))$("url").value=currentUrl;
  $("url").addEventListener("input",()=>paint());
  paint();
})();
