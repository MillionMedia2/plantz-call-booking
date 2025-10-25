// components/ChatEmbed.tsx
"use client";
import { useEffect, useMemo, useRef } from "react";
import ChatInterface from "./ChatInterface";
import type { EmbedConfig } from "@/types/embed";

const allowedDomains = (process.env.NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS || "")
  .split(",").map(s => s.trim()).filter(Boolean); // e.g. "plantz.io,partner.com,localhost:3000"

function isAllowed(origin: string) {
  try {
    const u = new URL(origin);
    return allowedDomains.some(d => u.host.endsWith(d));
  } catch { return false; }
}

export default function ChatEmbed({ config }: { config: EmbedConfig }) {
  const isEmbedded = useMemo(() => typeof window !== "undefined" && window.parent !== window, []);
  const parentOriginRef = useRef<string | null>(null);
  const heightTick = useRef<number | null>(null);
  const lastHeightRef = useRef<number>(0);

  useEffect(() => {
    if (!isEmbedded) return;

    // Parent should send the first message (init/seed). We learn + pin origin from that.
    function onMsg(e: MessageEvent) {
      if (!isAllowed(e.origin)) return;
      if (!parentOriginRef.current) parentOriginRef.current = e.origin;

      const { type, payload } = e.data || {};
      if (type === "plantz:seed" && typeof payload?.question === "string") {
        window.dispatchEvent(new CustomEvent("plantz-seed", { detail: payload.question }));
      }
      if (type === "plantz:command") {
        window.dispatchEvent(new CustomEvent("plantz-command", { detail: payload }));
      }
    }
    window.addEventListener("message", onMsg);

    // Tell parent we're ready (cannot set specific origin yet; parent listens with origin filter)
    window.parent?.postMessage({ type: "plantz:ready" }, "*");

    // Throttled resize: requestAnimationFrame (fast, low-overhead)
    const ro = new ResizeObserver(() => {
      if (!parentOriginRef.current) return;
      if (heightTick.current !== null) return;
      heightTick.current = requestAnimationFrame(() => {
        heightTick.current = null;
        const h = document.documentElement.scrollHeight;
        
        // Only send if height changed
        if (h !== lastHeightRef.current) {
          lastHeightRef.current = h;
          window.parent?.postMessage(
            { type: "plantz:height", payload: { height: h } },
            parentOriginRef.current!
          );
        }
      });
    });
    ro.observe(document.documentElement);

    return () => {
      window.removeEventListener("message", onMsg);
      ro.disconnect();
      if (heightTick.current) cancelAnimationFrame(heightTick.current);
    };
  }, [isEmbedded]);

  // Event relay to parent with pinned origin
  const emitToParent = (name: string, detail?: any) => {
    if (!isEmbedded || !parentOriginRef.current) return;
    window.parent.postMessage(
      { 
        type: "plantz:event", 
        payload: { name, detail, source: config.sourceTag } 
      }, 
      parentOriginRef.current
    );
  };

  // Listen for ChatInterface lifecycle events (you can fire CustomEvents from ChatInterface)
  useEffect(() => {
    if (!isEmbedded) return;
    const handler = (e: Event) => {
      const ce = e as CustomEvent;
      emitToParent(ce.detail?.name, ce.detail);
    };
    window.addEventListener("plantz-emit", handler as EventListener);
    return () => window.removeEventListener("plantz-emit", handler as EventListener);
  }, [isEmbedded, config.sourceTag]);

  return <ChatInterface embedConfig={{ ...config, isEmbedded }} />;
}

