(() => {
  const demos = {
    developer: {
      title: "Claude Code → project result",
      assurance: "PARTIAL",
      note: "Simulated example. It demonstrates the Action model; it is not a claim that current Footprint reconstructs these links end-to-end.",
      chain: [["01","ACTOR","Developer"],["02","AGENT","Claude Code"],["03","MODEL","Claude"],["04","TOOLS","Terminal · MCP · GitHub"],["05","OBJECT","Project activity"],["06","RESULT","Code change"]],
      evidence: [["Agent process","DIRECT"],["Model/provider","SUPPORTED"],["Tool interaction","INFERRED"],["Project result","SUPPORTED"],["Human approval context","MISSING"]]
    },
    enterprise: {
      title: "Purchase order commitment",
      assurance: "PARTIAL",
      note: "Simulated enterprise example. The record preserves the missing approval instead of silently assuming authorization.",
      chain: [["01","ACTOR","Human requester"],["02","AUTHORITY","Approval ?"],["03","AGENT","Purchasing agent"],["04","MODEL","Claude"],["05","IDENTITY","svc-procurement"],["06","TOOL","create_purchase_order"],["07","SYSTEM","SAP"],["08","RESULT","PO #91821 · €18,400"]],
      evidence: [["Agent trace","DIRECT"],["Identity","SUPPORTED"],["Tool request","DIRECT"],["SAP write","DIRECT"],["Approval","MISSING"]]
    }
  };
  function renderDemo(mode) {
    const d=demos[mode]||demos.developer;
    const chain=document.getElementById("demoChain"), evidence=document.getElementById("demoEvidence");
    if(!chain||!evidence)return;
    chain.innerHTML=d.chain.map((n,i)=>`<div class="chain-node"><b>${n[0]}</b><strong>${n[1]}</strong><small>${n[2]}</small></div>${i<d.chain.length-1?'<i class="chain-arrow"></i>':''}`).join("");
    evidence.innerHTML=d.evidence.map(([label,state])=>`<div class="evidence-row"><span>${label}</span><span class="${state.toLowerCase()}">${state}</span></div>`).join("");
    document.getElementById("demoTitle").textContent=d.title;
    document.getElementById("demoAssurance").textContent=d.assurance;
    document.getElementById("demoNote").textContent=d.note;
    document.querySelectorAll("[data-demo-tab]").forEach(el=>el.classList.toggle("active",el.dataset.demoTab===mode));
  }
  const p=new URLSearchParams(location.search);
  renderDemo(p.get("demo")==="enterprise"?"enterprise":"developer");
})();
/* Homepage proof runs entirely in the browser against simulated, allowlisted records. */
(() => {
const engine=window.ForkitEvidenceDemo;
const sources=document.getElementById("homeSources"),result=document.getElementById("homeResult");
const scenario=document.getElementById("homeScenario"),run=document.getElementById("homeRun");
if(!engine||!sources||!result||!run||!scenario)return;
function controls(){
 const items=engine.scenarios[scenario.value].sources;
 sources.innerHTML=items.map(item=>`<label><input type="checkbox" data-source="${item.id}" ${item.on?"checked":""}><span>${item.label}</span></label>`).join("");
 result.textContent="Choose sources, then run. All example records are simulated.";
}
scenario.addEventListener("change",controls);
run.addEventListener("click",()=>{
 const selected=Object.fromEntries([...sources.querySelectorAll("input")].map(c=>[c.dataset.source,c.checked]));
 const r=engine.evaluate(scenario.value,selected);
 const list=document.createElement("div");list.className="home-claims";
 r.claims.forEach(claim=>{
   const line=document.createElement("div");line.className="home-claim";
   const desc=document.createElement("span");desc.textContent=claim.label+" · "+claim.ref+" (simulated)";
   const state=document.createElement("strong");state.className="state-"+claim.state.toLowerCase();state.textContent=claim.state;
   line.append(desc,state);list.append(line);
 });
 result.replaceChildren(list);
 const summary=document.createElement("p");summary.className="demo-note";
 summary.textContent=r.missing+" missing · "+r.conflicts+" conflicting · "+r.present+" / "+r.total+" synthetic source records present. Neither coverage nor simulation is real verification.";
 result.appendChild(summary);
 window.ForkitAnalytics?.send("reconstruction_started",{simulated:true,scenario:scenario.value});
 window.ForkitAnalytics?.send("reconstruction_completed",{simulated:true,scenario:scenario.value,source_count:r.present,missing_count:r.missing,conflict_count:r.conflicts});
});
controls();
})();