(() => {
 "use strict";
 // Website-only events. No IP, identities, prompts, paths, model outputs or product payloads.
 const allowSources=new Set(["linkedin","hn","reddit","github","partner","direct"]);
 let campaign="direct";
 try{
   const raw=(new URLSearchParams(location.search).get("src")||new URLSearchParams(location.search).get("utm_source")||"").toLowerCase();
   const stored=sessionStorage.getItem("forkit_campaign_source");
   campaign=allowSources.has(raw)?raw:allowSources.has(stored)?stored:"direct";
   if(allowSources.has(raw))sessionStorage.setItem("forkit_campaign_source",raw);
 }catch(_){}
 const page=document.body?.dataset?.page||"unknown";
 function send(name,meta={}){
   if(typeof name!=="string" || !/^[a-z_]{3,42}$/.test(name))return;
   window.dispatchEvent(new CustomEvent("forkit:analytics",{detail:{name,page,campaign,meta}}));
 }
 window.ForkitMarketingAttribution=Object.freeze({source:campaign});
 window.ForkitAnalytics={send};
 document.addEventListener("click",(event)=>{
   const target=event.target instanceof Element?event.target.closest("[data-analytics]"):null;
   if(target)send(target.dataset.analytics,{});
 });
})();

(() => {
  const root=document.documentElement;
  const storageKey="forkit_ai_theme";
  const cssHref="/theme.css?v=20261009promo";
  if(!document.querySelector(`link[href="${cssHref}"]`)){
    const link=document.createElement("link");link.rel="stylesheet";link.href=cssHref;document.head.appendChild(link);
  }
  const mq=window.matchMedia?.("(prefers-color-scheme: light)");
  let stored=null;try{stored=localStorage.getItem(storageKey)}catch(_){}
  let theme=stored==="light"||stored==="dark"?stored:(mq?.matches?"light":"dark");
  let toggle;
  function assetsFor(mode){return mode==="light"?{logo:"/assets/forkit-ai-wordmark-on-light.svg?v=20261008exact",mark:"/assets/forkit-ai-mark-on-dark.svg?v=20261008purple"}:{logo:"/assets/forkit-ai-wordmark-on-dark.svg?v=20261008purple",mark:"/assets/forkit-ai-mark-on-dark.svg?v=20261008purple"}}
  function apply(mode,persist=false){
    theme=mode==="light"?"light":"dark";
    root.dataset.theme=theme;
    root.style.colorScheme=theme;
    if(persist){stored=theme;try{localStorage.setItem(storageKey,theme)}catch(_){}}
    const assets=assetsFor(theme);
    document.querySelectorAll("img.brand-logo").forEach(img=>{if(img.getAttribute("src")!==assets.logo)img.setAttribute("src",assets.logo)});
    const icon=document.querySelector('link[rel="icon"]')||document.head.appendChild(Object.assign(document.createElement("link"),{rel:"icon"}));
    icon.href=assets.mark;icon.type="image/svg+xml";
    if(toggle){
      const next=theme==="dark"?"light":"dark";
      toggle.setAttribute("aria-label",`Switch to ${next} mode`);
      toggle.setAttribute("title",`Switch to ${next} mode`);
      toggle.setAttribute("aria-pressed",theme==="light"?"true":"false");
    }
  }
  function mount(){
    const nav=document.querySelector("header.nav");
    if(nav&&!nav.querySelector(".theme-toggle")){
      toggle=document.createElement("button");
      toggle.type="button";
      toggle.className="theme-toggle";
      toggle.innerHTML='<span class="theme-sun" aria-hidden="true">☀</span><span class="theme-moon" aria-hidden="true">☾</span>';
      const cta=nav.querySelector(".nav-cta");
      nav.insertBefore(toggle,cta||null);
      toggle.addEventListener("click",()=>apply(theme==="dark"?"light":"dark",true));
    }
    apply(theme,false);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount,{once:true});else mount();
  mq?.addEventListener?.("change",e=>{if(stored!=="light"&&stored!=="dark")apply(e.matches?"light":"dark",false)});
})();