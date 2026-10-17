/* Private beta interest: browser-only mail composer. Never sends email, tool selections or device metadata to analytics. */
(()=>{"use strict";
const form=document.getElementById("betaSignup");
if(!form)return;
const email=document.getElementById("betaEmail"),os=document.getElementById("betaPlatform"),status=document.getElementById("betaStatus");
const copy=document.getElementById("betaCopy"),confirmation=document.getElementById("betaConfirm");
const receiver="developer@forkit.dev";
const allowedOS=new Set(["macos","windows","linux"]);
const allowedTools=new Set(["Claude Code","Codex","Cursor","Windsurf","Gemini CLI","VS Code/Copilot","Ollama","LM Studio","Other"]);
let requestText="",requestHref="",started=false,composed=false;
const track=name=>window.ForkitAnalytics?.send(name,{});
function markStarted(){if(started)return;started=true;track("beta_signup_started")}
for(const field of [email,os])field?.addEventListener("focus",markStarted,{once:true});
function details(){
 const address=String(email.value||"").trim();
 const platform=String(os.value||"");
 if(!email.checkValidity()||!address||address.length>254||/[\r\n]/.test(address)||!allowedOS.has(platform))return null;
 const tools=[...form.querySelectorAll('input[name="tools"]:checked')].map(x=>x.value).filter(x=>allowedTools.has(x));
 return {address,platform,tools};
}
function build(d){
 const subject="Forkit Footprint private beta request — "+d.platform;
 const safeSource=new Set(["linkedin","reddit","hn","github","partner","direct"]);
 const campaign=window.ForkitMarketingAttribution?.source;
 const source=safeSource.has(campaign)?campaign:"direct";
 // This goes only into a user-initiated message in their own mail client.
 const body=[
 "Hello Forkit team,",
 "",
 "I'd like to join the Footprint private beta.",
 "Email: "+d.address,
 "Operating system: "+d.platform,
 "Referral source: "+source,
 "AI tools (optional): "+(d.tools.length?d.tools.join(", "):"Not specified"),
 "",
 "Please send me private-beta access instructions and the applicable security/installation notes.",
 "I understand this is a test candidate, not a signed general-availability installer.",
 "",
 "Thanks"
 ].join("\n");
 return {subject,body,text:"To: "+receiver+"\nSubject: "+subject+"\n\n"+body,
 href:"mailto:"+receiver+"?subject="+encodeURIComponent(subject)+"&body="+encodeURIComponent(body)};
}
form.addEventListener("submit",event=>{
 event.preventDefault();
 markStarted();
 if(!form.reportValidity())return;
 const d=details();if(!d)return;
 track("beta_platform_"+d.platform);
 const request=build(d);
 requestText=request.text;requestHref=request.href;composed=true;
 status.hidden=false;
 status.querySelector("strong").textContent="Your request is ready to send.";
 confirmation.disabled=false;
 confirmation.textContent="I HAVE SENT THE EMAIL";
 // On a device with no mail client, the copy-request fallback stays available.
 location.href=requestHref;
});
copy?.addEventListener("click",async()=>{
 if(!requestText)return;
 try{await navigator.clipboard.writeText(requestText);copy.textContent="COPIED — PASTE INTO YOUR EMAIL";status.querySelector("p").textContent="Paste the request into an email to "+receiver+" and press Send.";}
 catch{status.querySelector("p").textContent="Open your email app and address a message to "+receiver+"; browser clipboard access is unavailable.";}
});
confirmation?.addEventListener("click",()=>{
 if(!composed)return;
 // This is a self-attestation of an email sent, not a confirmed backend signup.
 track("beta_signup_completed");
 status.querySelector("strong").textContent="Thanks for requesting the beta.";
 status.querySelector("p").textContent="If you sent the message, the Forkit team can reply with next steps. No automatic signup or email verification occurred.";
 confirmation.disabled=true;
 confirmation.textContent="REQUEST MARKED AS SENT";
});
})();
