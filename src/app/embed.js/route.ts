// app/embed.js/route.ts
import { NextResponse } from "next/server";

export function GET() {
  const host = process.env.NEXT_PUBLIC_CHAT_HOST || "";
  
  const js = `
(function(){
  var HOST = "${host}".trim() || (typeof location !== "undefined" ? location.origin : "");
  var DEFAULTS = { agent: "doctor", theme: "light", source: "embed", width: 420, height: 720 };

  function openPopup(opts){
    opts = opts || {};
    var q = opts.question ? "&q=" + encodeURIComponent(opts.question) : "";
    var agent = opts.agent || DEFAULTS.agent;
    var theme = opts.theme || DEFAULTS.theme;
    var source = opts.source || DEFAULTS.source;
    var variant = opts.variant || "";
    var preset = opts.preset || "";
    
    var url = HOST + "/chat?agent=" + encodeURIComponent(agent) +
              "&theme=" + encodeURIComponent(theme) +
              "&source=" + encodeURIComponent(source);
    
    if (variant) url += "&variant=" + encodeURIComponent(variant);
    if (preset) url += "&preset=" + encodeURIComponent(preset);
    url += q;
    
    var feat = "noopener,width=" + (opts.width || DEFAULTS.width) + ",height=" + (opts.height || DEFAULTS.height);
    var w = window.open(url, "plantzChat", feat);
    try { w && w.focus(); } catch(e){}
    return w;
  }

  function mountButton(cfg){
    cfg = cfg || {};
    var btn = document.createElement("button");
    btn.textContent = cfg.label || "Ask Plantz";
    btn.style.cssText = "position:fixed;bottom:20px;right:20px;padding:12px 20px;border-radius:999px;border:1px solid #8a9a5a;background:#8a9a5a;color:#fff;cursor:pointer;z-index:2147483647;font-family:system-ui,-apple-system,sans-serif;font-size:14px;font-weight:500;box-shadow:0 4px 12px rgba(138,154,90,0.3);transition:all 0.2s ease;";
    btn.addEventListener("mouseenter", function(){ 
      btn.style.background = "#6f7d48"; 
      btn.style.boxShadow = "0 6px 16px rgba(138,154,90,0.4)";
    });
    btn.addEventListener("mouseleave", function(){ 
      btn.style.background = "#8a9a5a"; 
      btn.style.boxShadow = "0 4px 12px rgba(138,154,90,0.3)";
    });
    btn.addEventListener("click", function(){ openPopup(cfg); });
    document.body.appendChild(btn);
    return btn;
  }

  function embedIframe(cfg){
    cfg = cfg || {};
    var container = cfg.container;
    if (typeof container === "string") {
      container = document.querySelector(container);
    }
    if (!container) {
      console.error("PlantzChat.embedIframe: container not found");
      return null;
    }

    var q = cfg.question ? "&q=" + encodeURIComponent(cfg.question) : "";
    var agent = cfg.agent || DEFAULTS.agent;
    var theme = cfg.theme || DEFAULTS.theme;
    var source = cfg.source || DEFAULTS.source;
    var variant = cfg.variant || "";
    var preset = cfg.preset || "";
    
    var url = HOST + "/chat?agent=" + encodeURIComponent(agent) +
              "&theme=" + encodeURIComponent(theme) +
              "&source=" + encodeURIComponent(source);
    
    if (variant) url += "&variant=" + encodeURIComponent(variant);
    if (preset) url += "&preset=" + encodeURIComponent(preset);
    url += q;

    var iframe = document.createElement("iframe");
    iframe.src = url;
    iframe.title = cfg.title || "Plantz Chat";
    iframe.style.cssText = "width:100%;height:" + (cfg.height || "600px") + ";border:1px solid #e5e7eb;border-radius:8px;";
    iframe.allow = "clipboard-write";
    
    // Listen for height updates from iframe
    window.addEventListener("message", function(e){
      if (e.source !== iframe.contentWindow) return;
      if (e.data && e.data.type === "plantz:height") {
        var h = e.data.payload && e.data.payload.height;
        if (h && cfg.autoHeight) {
          iframe.style.height = h + "px";
        }
      }
    });

    container.appendChild(iframe);
    return iframe;
  }

  window.PlantzChat = window.PlantzChat || { 
    open: openPopup, 
    mountButton: mountButton,
    embedIframe: embedIframe
  };

  // Auto-init via data-* on the script tag
  try {
    var s = document.currentScript;
    if (s && s.dataset.autobutton === "true") {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function(){
          mountButton({
            label: s.dataset.label,
            agent: s.dataset.agent,
            theme: s.dataset.theme,
            source: s.dataset.source,
            question: s.dataset.question,
            variant: s.dataset.variant
          });
        });
      } else {
        mountButton({
          label: s.dataset.label,
          agent: s.dataset.agent,
          theme: s.dataset.theme,
          source: s.dataset.source,
          question: s.dataset.question,
          variant: s.dataset.variant
        });
      }
    }
  } catch(e){
    console.error("PlantzChat auto-init error:", e);
  }
})();
  `.trim();

  return new NextResponse(js, { 
    headers: { 
      "Content-Type": "application/javascript",
      "Cache-Control": "public, max-age=600",
      "Access-Control-Allow-Origin": "*",
    } 
  });
}

