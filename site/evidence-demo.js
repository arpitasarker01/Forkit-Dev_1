/* Simulated teaching scenarios only. Never ingest customer or production evidence here. */
(() => {
  "use strict";
  const scenarios = {
    developer: {
      title: "Developer agent proposes a code change",
      chain: ["Developer", "Coding agent", "Model", "Tool/MCP", "Result"],
      sources: [
        {id:"process",label:"Agent activity trace",ref:"SIM-DEV-PROC-01",state:"DIRECT",on:true,claim:"A coding agent ran",why:"A simulated local activity record observes agent execution. It does not prove which prompt or code was used."},
        {id:"model",label:"Model/provider metadata",ref:"SIM-DEV-MODEL-02",state:"SUPPORTED",on:true,claim:"Model identity matched",why:"A simulated metadata record supports a provider association, but does not attest to a particular response."},
        {id:"tool",label:"Tool / MCP correlation",ref:"SIM-DEV-TOOL-03",state:"INFERRED",on:true,claim:"An agent invoked a tool",why:"Example timestamps correlate, but no shared request ID proves attribution."},
        {id:"result",label:"Repository result evidence",ref:"SIM-DEV-RESULT-04",state:"SUPPORTED",on:true,claim:"The change was recorded",why:"A simulated result record supports a change but does not prove it was caused by this agent."},
        {id:"approval",label:"Human approval",ref:"SIM-DEV-APPROVAL-05",state:"SUPPORTED",on:false,claim:"The action was approved",why:"Approval evidence is absent in the default example. An enabled switch only inserts simulated evidence."}
      ]
    },
    procurement: {
      title: "Procurement agent commits an order",
      chain: ["Requester", "Agent", "Identity", "Tool", "ERP result"],
      sources: [
        {id:"trace",label:"Agent execution trace",ref:"SIM-PO-TRACE-01",state:"DIRECT",on:true,claim:"The agent requested an order",why:"A simulated agent record directly shows the attempted action, not its final authorization."},
        {id:"identity",label:"Delegated identity",ref:"SIM-PO-IAM-02",state:"CONFLICTING",on:true,claim:"The delegated actor is consistent",why:"Simulated identity evidence names a different principal than the agent trace; the disagreement cannot be resolved."},
        {id:"tool",label:"Tool/API audit",ref:"SIM-PO-TOOL-03",state:"SUPPORTED",on:true,claim:"A purchase tool was called",why:"A simulated API audit corroborates the call, but not a valid approval."},
        {id:"erp",label:"Business-system write",ref:"SIM-PO-ERP-04",state:"DIRECT",on:true,claim:"The order was committed",why:"A simulated ERP event directly reports the write. It does not establish the initiating actor."},
        {id:"approval",label:"Approval ticket",ref:"SIM-PO-APPROVAL-05",state:"SUPPORTED",on:false,claim:"A human approved the order",why:"No simulated approval ticket is present until the switch is enabled."}
      ]
    }
  };
  function evaluate(scenario, selections) {
    const d=scenarios[scenario]||scenarios.developer;
    const claims=d.sources.map(s=>({
      ...s,
      state:selections?.[s.id]===undefined?(s.on?s.state:"MISSING"):(selections[s.id]?s.state:"MISSING"),
      provenance:"Simulated source "+s.ref,
      simulated:true
    }));
    const present=claims.filter(x=>x.state!=="MISSING").length;
    return {title:d.title,chain:d.chain,claims,present,total:claims.length,missing:claims.filter(x=>x.state==="MISSING").length,conflicts:claims.filter(x=>x.state==="CONFLICTING").length};
  }
  window.ForkitEvidenceDemo=Object.freeze({scenarios,evaluate});
})();
