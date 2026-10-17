(()=>{"use strict";
const fields=["observed","active","apps","models"];
const elements=Object.fromEntries(fields.map(x=>[x,document.getElementById(x)]));
const status=document.getElementById("shareStatus");
const sanitize=(el,max,whole=false)=>{if(!el||el.value.trim()==="")return null;const n=Number(el.value);return Number.isFinite(n)&&n>=0&&n<=max&&(!whole||Number.isInteger(n))?n:null};
function read(){
const observed=sanitize(elements.observed,100000),active=sanitize(elements.active,100000),apps=sanitize(elements.apps,100,true),models=sanitize(elements.models,100000,true);
if(elements.active.value.trim()!=="" && observed===null)return {error:"Enter valid observation minutes before AI-active minutes."};
if(active!==null&&active>observed)return {error:"AI-active time cannot exceed valid observed time."};
for(const key of fields){if(elements[key].value.trim()!==""&&({observed,active,apps,models})[key]===null)return{error:"Enter valid non-negative totals only."}}
return {observed,active,apps,models};
}
function fmt(x){return x===null?"—":x.toLocaleString("en-US",{maximumFractionDigits:1})}
function update(){const d=read(),valid=!d.error;if(status)status.textContent=d.error||"All totals stay in this browser. Nothing is uploaded.";
document.getElementById("posterMinutes").textContent=fmt(valid?d.observed:null);
document.getElementById("posterDetails").textContent=valid?("AI-active: "+fmt(d.active)+" min · AI app categories: "+fmt(d.apps)+" · Local model records: "+fmt(d.models)):"Correct the entered totals to continue.";
return valid?d:null}
function caption(){const d=update();if(!d)return null;return "My Forkit AI Footprint (self-reported local aggregate): "+fmt(d.observed)+" min observed · "+fmt(d.active)+" min AI-active · "+fmt(d.apps)+" AI app categories · "+fmt(d.models)+" local model records. No prompts, code or identity shared. Try it: https://forkit-ai.com/footprint/"}
function draw(){const d=update();if(!d)return null;const canvas=document.createElement("canvas");canvas.width=1080;canvas.height=1080;
const ctx=canvas.getContext("2d");if(!ctx)return null;
const g=ctx.createLinearGradient(0,0,1080,1080);g.addColorStop(0,"#211944");g.addColorStop(.7,"#2a1f55");g.addColorStop(1,"#008190");ctx.fillStyle=g;ctx.fillRect(0,0,1080,1080);
ctx.fillStyle="#6aa7ab";ctx.font="bold 35px system-ui";ctx.fillText("FORKIT AI  /  PRIVATE FOOTPRINT",76,114);
ctx.fillStyle="#f1ebdf";ctx.font="bold 78px system-ui";ctx.fillText("My AI activity.",76,274);ctx.fillText("My evidence.",76,369);
ctx.fillStyle="#f9c18c";ctx.font="bold 180px system-ui";ctx.fillText(fmt(d.observed),76,640);
ctx.fillStyle="#f1ebdf";ctx.font="36px system-ui";ctx.fillText("VALID OBSERVATION MINUTES",76,704);
ctx.font="30px system-ui";ctx.fillText("AI-active: "+fmt(d.active)+" min",76,793);ctx.fillText("AI app categories: "+fmt(d.apps),76,841);ctx.fillText("Local model records: "+fmt(d.models),76,889);
ctx.fillStyle="#6aa7ab";ctx.font="25px system-ui";ctx.fillText("SELF-REPORTED · AGGREGATE ONLY · NOT VERIFIED",76,984);ctx.fillText("forkit-ai.com/footprint/",76,1022);
return canvas}
async function copy(value){try{await navigator.clipboard.writeText(value);status.textContent="Copied.";return true}catch(_){status.textContent="Clipboard unavailable. You can copy the product URL from the address bar.";return false}}
document.getElementById("shareForm")?.addEventListener("submit",e=>e.preventDefault());
fields.forEach(key=>elements[key]?.addEventListener("input",update));update();
document.getElementById("copyCaption")?.addEventListener("click",()=>{const c=caption();if(c)copy(c)});
document.getElementById("copyLink")?.addEventListener("click",()=>copy("https://forkit-ai.com/footprint/"));
document.getElementById("exportCard")?.addEventListener("click",()=>{const c=draw();if(!c)return;c.toBlob(blob=>{if(!blob){status.textContent="Cannot render image.";return}const u=URL.createObjectURL(blob);const a=document.createElement("a");a.href=u;a.download="forkit-footprint-aggregate.png";a.click();setTimeout(()=>URL.revokeObjectURL(u),30000);status.textContent="Your image was saved locally.";window.ForkitAnalytics?.send("share_card_export")},"image/png")});
document.getElementById("shareCard")?.addEventListener("click",()=>{const c=draw();if(!c)return;c.toBlob(async blob=>{if(!blob)return;const file=new File([blob],"forkit-footprint-aggregate.png",{type:"image/png"});if(navigator.share&&navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:"My Forkit AI Footprint"});status.textContent="Shared with your chosen app.";window.ForkitAnalytics?.send("share_card_export");return}catch(e){if(e.name==="AbortError")return;}}status.textContent="Native image sharing unavailable. Use Save PNG to attach the image manually."},"image/png")});
const publicUrl="https://forkit-ai.com/footprint/";
document.querySelectorAll("[data-share-network]").forEach(b=>b.addEventListener("click",()=>{
const network=b.dataset.shareNetwork;const text="Explore your AI Footprint locally and privately — no prompts or code uploaded.";
const href=network==="linkedin"?"https://www.linkedin.com/sharing/share-offsite/?url="+encodeURIComponent(publicUrl):network==="x"?"https://twitter.com/intent/tweet?text="+encodeURIComponent(text)+"&url="+encodeURIComponent(publicUrl):network==="reddit"?"https://www.reddit.com/submit?url="+encodeURIComponent(publicUrl)+"&title="+encodeURIComponent(text):"";
if(href){window.open(href,"_blank","noopener,noreferrer");window.ForkitAnalytics?.send("share_network_open");}
status.textContent="Social sharing opens only the public product link. Attach your image separately if you choose.";
}));
})();