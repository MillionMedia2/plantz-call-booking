# Plantz Agent Appointments - Development Context

## Recent Changes (Phase 1: Embed Integration)

### Overview
Implemented a scalable `/chat` route with query parameter support and embed-friendly architecture. This allows the chatbot to be embedded on partner sites with auto-seeded questions and analytics tracking.

### What Was Added

#### 1. New Route: `/chat`
- **File**: `src/app/chat/page.tsx`
- **Purpose**: Dedicated route for embeddable chat interface
- **Features**:
  - Accepts query parameters: `q`, `agent`, `variant`, `theme`, `source`, `preset`
  - Server component that awaits searchParams (Next.js 15 async pattern)
  - Renders `ChatEmbed` wrapper with configuration

#### 2. Type Definitions
- **File**: `src/types/embed.ts`
- **Purpose**: TypeScript types for embed configuration
- **Exports**: `EmbedConfig` interface with optional fields for all query params plus `isEmbedded` flag

#### 3. ChatEmbed Wrapper Component
- **File**: `src/components/ChatEmbed.tsx`
- **Purpose**: Isolates all embed-specific logic from core ChatInterface
- **Features**:
  - **Embed Detection**: Checks if `window !== window.parent`
  - **Origin Validation**: Validates parent origin against allowlist from env
  - **postMessage Bridge**: 
    - Listens for `plantz:seed` (seed questions from parent)
    - Listens for `plantz:command` (reset, focus commands)
    - Sends `plantz:ready` when loaded
    - Sends `plantz:height` on resize (throttled with rAF)
    - Relays `plantz:event` analytics events to parent
  - **Security**: Pins parent origin after first valid message
  - **Performance**: Uses requestAnimationFrame for resize throttling, only sends when height changes

#### 4. ChatInterface Enhancements
- **File**: `src/components/ChatInterface.tsx` (minimal changes)
- **New Props**: Accepts optional `embedConfig?: EmbedConfig`
- **New Features**:
  - **Auto-send**: One-time auto-submission of `initialQuestion` from query param
  - **Event Emission**: Dispatches CustomEvents at key lifecycle points:
    - `conversation_start`: When first user message sent
    - `assistant_reply`: When first token received from assistant
    - `booking_started`: When booking flow begins
    - `booking_completed`: When booking successfully completed
    - `error`: When errors occur (includes error details)
  - **Command Listeners**: Responds to `plantz-seed` and `plantz-command` events
  - **Helper Functions**: `resetConversation()`, `focusInput()`, `emitEvent()`
- **Refs Added**: `sentSeed`, `inputRef` for embed functionality
- **No Breaking Changes**: All existing functionality preserved

#### 5. Security Middleware
- **File**: `middleware.ts`
- **Purpose**: Route-scoped security headers
- **Features**:
  - **CSP for /chat**: Sets `frame-ancestors` based on `EMBED_ALLOWED_ORIGINS` env var
  - **Additional Headers**: 
    - `Referrer-Policy: no-referrer`
    - `X-Content-Type-Options: nosniff`
    - `X-Robots-Tag: noindex, nofollow`
  - **Cache Control for /embed.js**: `public, max-age=600` (Phase 2)

#### 6. Environment Variables
New env vars required (add to `.env.local`):

```bash
# Space-separated full origins for CSP frame-ancestors
EMBED_ALLOWED_ORIGINS="https://plantz.io https://partner1.com http://localhost:3000"

# Comma-separated domains for client-side origin validation (no protocol)
NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS="plantz.io,partner1.com,localhost:3000"

# Optional: Host for embed SDK (Phase 2)
NEXT_PUBLIC_CHAT_HOST="https://plantz-call-booking.vercel.app"
```

### Architecture Decisions

1. **Wrapper Pattern**: Created `ChatEmbed.tsx` to isolate embed concerns, keeping `ChatInterface.tsx` clean
2. **Single Config Object**: Pass one `EmbedConfig` object instead of multiple props
3. **CustomEvents**: Use browser CustomEvents for internal communication between wrapper and interface
4. **Conditional Logic**: postMessage bridge only active when `isEmbedded === true`
5. **Security First**: Origin validation, pinned targetOrigin, CSP headers
6. **Future-Proof**: Room for JWT presets, multiple agents, themes, variants

### Testing

#### Build Status
✅ Production build successful
- No TypeScript errors
- No linter errors (except pre-existing `<img>` warning)
- All routes compile correctly

#### Manual Testing Required
1. Visit `http://localhost:3000/chat?q=Hello` - should auto-send "Hello"
2. Visit `http://localhost:3000/chat?q=What%20helps%20with%20sleep` - should auto-send question
3. Visit `http://localhost:3000/chat` - should work normally without auto-send
4. Test in iframe from allowed origin - should emit events to parent

### Next Steps (Phase 2)

1. **Embed SDK** (`/embed.js` route):
   - One-line partner integration
   - `PlantzChat.open()` and `PlantzChat.mountButton()` methods
   - Auto-button via `data-*` attributes
   - Popup window support

2. **Partner Documentation**:
   - Integration guide
   - Event reference
   - Security best practices

3. **Phase 3 (Future)**:
   - JWT preset system for locked configs
   - Multiple agent support
   - Theme variants
   - Analytics dashboard

### Files Modified

**New Files:**
- `src/types/embed.ts`
- `src/components/ChatEmbed.tsx`
- `src/app/chat/page.tsx`
- `middleware.ts`

**Modified Files:**
- `src/components/ChatInterface.tsx` (added embedConfig prop, auto-send, event emission)

### Deployment Notes

- Build passes all checks
- Requires new env vars to be set in Vercel
- No breaking changes to existing `/` route
- Middleware applies only to `/chat` and `/embed.js` routes

---

## Phase 2: Embed SDK (Complete)

### Overview
Created a production-ready JavaScript SDK that partners can use to embed the Plantz chatbot on their websites with a single line of code.

### What Was Added

#### 1. Embed SDK Route
- **File**: `src/app/embed.js/route.ts`
- **Purpose**: Serves the partner-facing JavaScript SDK
- **Features**:
  - **Three Integration Methods**:
    1. `PlantzChat.open()` - Opens chat in popup window
    2. `PlantzChat.mountButton()` - Adds floating button
    3. `PlantzChat.embedIframe()` - Embeds as inline iframe
  - **Auto-Init**: Supports `data-*` attributes for zero-JavaScript setup
  - **Event Listening**: Iframe listens for height changes from chat
  - **Customizable**: All params (question, agent, theme, source) configurable
  - **Branded Styling**: Green theme matching Plantz brand (#8a9a5a)
  - **CORS Enabled**: `Access-Control-Allow-Origin: *` for public SDK
  - **Cached**: `Cache-Control: public, max-age=600` for performance

#### 2. Demo Page
- **File**: `public/embed-demo.html`
- **Purpose**: Interactive demo of all SDK features
- **Sections**:
  1. Auto Button demo (one-line install)
  2. Programmatic popup examples
  3. Custom mounted button
  4. Embedded iframe
  5. Event listening for analytics
- **URL**: `http://localhost:3000/embed-demo.html`

#### 3. Partner Integration Guide
- **File**: `PARTNER_INTEGRATION.md`
- **Purpose**: Complete documentation for partners
- **Contents**:
  - Quick start (1-line install)
  - All integration methods with code examples
  - Analytics & event tracking guide
  - Security & whitelisting requirements
  - Styling & customization tips
  - Best practices
  - Platform-specific examples (WordPress, React, Shopify)

### SDK Features

#### Auto Button (One-Line Install)
```html
<script src="https://plantz-call-booking.vercel.app/embed.js"
        data-autobutton="true"
        data-label="Ask Plantz"
        data-source="partner:yourcompany"></script>
```

#### Programmatic Popup
```javascript
PlantzChat.open({
  question: "What helps with sleep?",
  source: "partner:acme",
  width: 420,
  height: 720
});
```

#### Embedded Iframe
```javascript
PlantzChat.embedIframe({
  container: "#chat-container",
  question: "What helps with anxiety?",
  source: "partner:acme",
  height: "600px",
  autoHeight: false
});
```

### Partner Benefits

1. **Zero-Code Integration**: Auto-button requires no JavaScript knowledge
2. **Flexible**: Three integration methods for different use cases
3. **Analytics Ready**: Full event tracking for conversions
4. **Branded**: Matches Plantz green theme automatically
5. **Mobile-Friendly**: Responsive design works on all devices
6. **Secure**: CSP-protected, origin validation
7. **Fast**: Cached SDK, optimized loading

### Testing

#### SDK Endpoint
✅ `http://localhost:3000/embed.js` - Serves JavaScript SDK
- Content-Type: `application/javascript`
- Cache-Control: `public, max-age=600`
- CORS: Enabled

#### Demo Page
✅ `http://localhost:3000/embed-demo.html` - Interactive demos
- Auto-button working
- Popup windows functional
- Iframe embedding operational
- Event logging to console

### Deployment Checklist

**Before deploying to production:**
1. ✅ Set `NEXT_PUBLIC_CHAT_HOST` in Vercel env vars
2. ✅ Set `EMBED_ALLOWED_ORIGINS` for partner domains
3. ✅ Set `NEXT_PUBLIC_EMBED_ALLOWED_ORIGINS` for client validation
4. ✅ Test SDK loads from production URL
5. ✅ Test auto-button on partner staging site
6. ✅ Verify CSP headers block unauthorized domains
7. ✅ Test event tracking with partner analytics

### Partner Onboarding Process

1. **Partner applies** - Provides domain and company info
2. **Plantz approves** - Adds domain to `EMBED_ALLOWED_ORIGINS`
3. **Partner integrates** - Adds script tag with their source ID
4. **Partner tests** - Uses demo page to verify
5. **Go live** - Partner deploys to production
6. **Track results** - Monitor events via analytics

---

**Last Updated**: October 25, 2025
**Phase**: 2 (Complete)
**Next Phase**: 3 (JWT Presets, Multi-Agent, Analytics Dashboard)

