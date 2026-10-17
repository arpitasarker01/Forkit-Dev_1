/* Public evidence is read-only and fail-closed. No individual-level telemetry. */
(()=>{"use strict";
const config=window.FORKIT_SITE_CONFIG||{};
const base=typeof config.publicEvidenceSnapshotUrl==="string"?config.publicEvidenceSnapshotUrl:"";
const allowed=/^https:\/\/forkit-ai\.com\/evidence\/community-snapshot\.json$/;
const status=document.getElementById("evidence-network-status"),provenance=document.getElementById("evidence-provenance");
if(!base||!allowed.test(base))return;
const names=["contributors","observation_hours","active_hours","observed_systems","model_records","active_ratio"];
async function load(){
 try{
 const response=await fetch(base,{cache:"no-store",credentials:"omit"});
 if(!response.ok)throw Error("unavailable");
 const value=await response.json();
 if(value.schema_version!==1||value.provenance!=="opt_in_community_reported"||!Number.isInteger(value.sample_size)||value.sample_size<10||typeof value.window_start!=="string"||typeof value.window_end!=="string"||typeof value.updated_at!=="string")throw Error("insufficient provenance");
 const times=[value.window_start,value.window_end,value.updated_at].map(x=>Date.parse(x));
 if(times.some(x=>!Number.isFinite(x))||times[0]>times[1]||times[1]>times[2]||times[2]>Date.now()+60000||Date.now()-times[2]>14*86400000)throw Error("stale snapshot");
 const metrics=value.metrics||{};
 if(!names.every(n=>typeof metrics[n]==="number"&&Number.isFinite(metrics[n])&&metrics[n]>=0))throw Error("invalid metrics");
 if(!Number.isInteger(metrics.contributors)||metrics.contributors!==value.sample_size||!Number.isInteger(metrics.observed_systems)||!Number.isInteger(metrics.model_records)||metrics.active_hours>metrics.observation_hours||metrics.active_ratio>100)throw Error("inconsistent totals");
 if(metrics.observation_hours===0&&metrics.active_ratio!==0)throw Error("inconsistent ratio");
 if(metrics.observation_hours>0&&Math.abs(metrics.active_ratio-100*metrics.active_hours/metrics.observation_hours)>1)throw Error("inconsistent ratio");
 for(const name of names){const node=document.querySelector('[data-evidence-metric="'+name+'"]');if(node)node.textContent=name==="active_ratio"?metrics[name].toFixed(1)+"%":metrics[name].toLocaleString("en-US",{maximumFractionDigits:1})}
 status.textContent="COMMUNITY-REPORTED · OPT-IN";
 provenance.textContent="Sample: "+value.sample_size+" consented contributing installations · Window: "+value.window_start.slice(0,10)+" to "+value.window_end.slice(0,10)+" · Updated: "+value.updated_at.slice(0,10)+". Anonymous self-reported contributions are not hardware verified. No raw participant data shown.";
 }catch(_){if(status)status.textContent="COLLECTING OPT-IN EVIDENCE";}
}
load();
})();