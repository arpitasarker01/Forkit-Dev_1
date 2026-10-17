(() => {
"use strict";
const engine=window.ForkitEvidenceDemo;
const controls=document.getElementById("sourceControls"), count=document.getElementById("sourceCount");
const chain=document.getElementById("reconstructChain"), rows=document.getElementById("reconstructEvidence");
const assurance=document.getElementById("reconstructAssurance"), title=document.getElementById("record-title");
const fill=document.getElementById("confidenceFill"), coverageValue=document.getElementById("coverageValue"), copy=document.getElementById("coverageCopy"), run=document.getElementById("runReconstruct");
if(!engine||!controls||!run) return;
const qs=new URLSearchParams(location.search);
let current=qs.get("scenario")==="procurement"?"procurement":"developer";
let completed=false;
function escapeHTML(s){return String(s).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));}
function selections(){return Object.fromEntries([...controls.querySelectorAll('input[type="checkbox"]')].map(e=>[e.dataset.source,e.checked]));}
function model(){return engine.evaluate(current,selections());}
function renderControls(){
 const d=engine.scenarios[current];
 controls.innerHTML=d.sources.map(s=>`<label class="source-toggle">
 <input type="checkbox" data-source="${escapeHTML(s.id)}" ${s.on?"checked":""}>
 <span class="source-toggle-copy"><strong>${escapeHTML(s.label)}</strong><small>${escapeHTML(s.ref)} · SIMULATED</small></span><i aria-hidden="true"></i></label>`).join("");
 document.querySelectorAll("[data-scenario]").forEach(b=>{const on=b.dataset.scenario===current;b.classList.toggle("active",on);b.setAttribute("aria-pressed",String(on));});
 updateCount();
}
function updateCount(){const e=model();count.textContent=`${e.present} / ${e.total} present`;}
function render(){
 const r=model();updateCount();
 title.textContent=r.title;
 assurance.textContent=r.conflicts?"CONFLICTING":r.missing?"EVIDENCE GAPS":"EXAMPLE COMPLETE";
 assurance.dataset.state=r.conflicts?"conflicting":r.missing?"partial":"supported";
 chain.innerHTML=r.chain.map((node,i)=>`<span>${escapeHTML(node)}</span>${i<r.chain.length-1?"<i aria-hidden=\"true\">→</i>":""}`).join("");
 rows.innerHTML=r.claims.map(c=>`<details class="evidence-claim">
 <summary><span>${escapeHTML(c.claim)}</span><b class="state-${c.state.toLowerCase()}">${c.state}</b></summary>
 <div class="provenance"><strong>SIMULATED · ${escapeHTML(c.ref)}</strong><p>${escapeHTML(c.state==="MISSING"?"No source provided. This claim is not established.":c.why)}</p><small>Source: ${escapeHTML(c.label)}. This is not production evidence.</small></div>
 </details>`).join("");
 const percentage=Math.round(r.present/r.total*100);
 fill.style.width=percentage+"%";coverageValue.textContent=percentage+"%";
 copy.textContent=`${r.present} of ${r.total} simulated sources present · ${r.missing} missing · ${r.conflicts} conflicting. Coverage does not prove causation or authorization.`;
 document.getElementById("record-title").focus?.({preventScroll:true});
}
function resetRecord(){
 completed=false;
 title.textContent="Ready to reconstruct";
 assurance.textContent="NOT RUN";
 assurance.dataset.state="partial";
 chain.replaceChildren();rows.replaceChildren();
 fill.style.width="0%";coverageValue.textContent="—";
 copy.textContent="Choose simulated evidence sources, then run reconstruction. No conclusion is shown until you run it.";
 updateCount();
}
function runOnce(){
 window.ForkitAnalytics?.send("reconstruction_started",{scenario:current,simulated:true});
 render();completed=true;
 const r=model();
 window.ForkitAnalytics?.send("reconstruction_completed",{scenario:current,simulated:true,source_count:r.present,missing_count:r.missing,conflict_count:r.conflicts});
}
document.querySelectorAll("[data-scenario]").forEach(b=>b.addEventListener("click",()=>{current=b.dataset.scenario;renderControls();resetRecord();window.ForkitAnalytics?.send("reconstruct_scenario",{scenario:current,simulated:true});}));
controls.addEventListener("change",resetRecord);
run.addEventListener("click",runOnce);
document.getElementById("shareSimulated")?.addEventListener("click",async()=>{
  const link="https://forkit-ai.com/reconstruct/?scenario="+(current==="procurement"?"procurement":"developer");
  const button=document.getElementById("shareSimulated");
  try{
    await navigator.clipboard.writeText(link);
    button.textContent="SIMULATED LINK COPIED";
    window.ForkitAnalytics?.send("share_reconstruction_link");
    setTimeout(()=>{button.textContent="COPY SIMULATED EXAMPLE LINK"},1800);
  }catch(_){button.textContent="COPY URL FROM ADDRESS BAR";history.replaceState(null,"","?scenario="+encodeURIComponent(current));}
});
renderControls();resetRecord();
})();