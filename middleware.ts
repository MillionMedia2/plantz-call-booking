// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  
  if (req.nextUrl.pathname.startsWith("/chat")) {
    const allow = (process.env.EMBED_ALLOWED_ORIGINS || "").trim(); // space-separated full origins
    if (allow) {
      res.headers.set("Content-Security-Policy", `frame-ancestors ${allow};`);
    }
    res.headers.set("Referrer-Policy", "no-referrer");
    res.headers.set("X-Content-Type-Options", "nosniff");
    // Optional: noindex for /chat
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  
  if (req.nextUrl.pathname === "/embed.js") {
    res.headers.set("Cache-Control", "public, max-age=600");
  }
  
  return res;
}

export const config = { 
  matcher: ["/chat/:path*", "/embed.js"] 
};

