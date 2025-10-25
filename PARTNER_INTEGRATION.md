# Plantz Chat - Partner Integration Guide

## Quick Start (1-Line Install)

Add this script tag to your website to get an automatic chat button:

```html
<script src="https://plantz-call-booking.vercel.app/embed.js"
        data-autobutton="true"
        data-label="Ask Plantz"
        data-source="partner:yourcompany"></script>
```

That's it! A floating chat button will appear in the bottom-right corner.

---

## Integration Methods

### 1. Auto Button (Recommended for Most Partners)

The simplest integration - one script tag, zero JavaScript required.

```html
<script src="https://plantz-call-booking.vercel.app/embed.js"
        data-autobutton="true"
        data-label="Ask About Cannabis"
        data-agent="doctor"
        data-theme="light"
        data-source="partner:acme"
        data-question="What helps with sleep?"></script>
```

**Attributes:**
- `data-autobutton="true"` - Required to enable auto-button
- `data-label` - Button text (default: "Ask Plantz")
- `data-agent` - Agent type (default: "doctor")
- `data-theme` - Theme (default: "light")
- `data-source` - Your tracking ID (e.g., "partner:yourcompany")
- `data-question` - Optional pre-filled question

---

### 2. Programmatic Popup

Open the chat in a popup window from your own buttons/links.

```html
<script src="https://plantz-call-booking.vercel.app/embed.js"></script>

<button onclick="PlantzChat.open({ question: 'What helps with sleep?', source: 'partner:acme' })">
  Get Cannabis Advice
</button>

<script>
  // Or call from JavaScript
  document.getElementById("myButton").addEventListener("click", function() {
    PlantzChat.open({
      question: "What conditions can be treated?",
      agent: "doctor",
      theme: "light",
      source: "partner:acme",
      width: 420,
      height: 720
    });
  });
</script>
```

**Options:**
- `question` - Pre-filled question (optional)
- `agent` - Agent type (default: "doctor")
- `theme` - "light" or "dark" (default: "light")
- `source` - Your tracking ID for analytics
- `variant` - Custom variant (future use)
- `preset` - JWT preset token (future use)
- `width` - Popup width in pixels (default: 420)
- `height` - Popup height in pixels (default: 720)

---

### 3. Custom Mounted Button

Programmatically add a floating button anywhere on your page.

```html
<script src="https://plantz-call-booking.vercel.app/embed.js"></script>
<script>
  PlantzChat.mountButton({
    label: "Get Cannabis Advice",
    question: "I need help choosing a clinic",
    source: "partner:acme"
  });
</script>
```

The button will appear in the bottom-right corner with your custom styling.

---

### 4. Embedded Iframe

Embed the chat directly in your page layout.

```html
<div id="chat-container"></div>

<script src="https://plantz-call-booking.vercel.app/embed.js"></script>
<script>
  PlantzChat.embedIframe({
    container: "#chat-container",  // CSS selector or DOM element
    question: "What helps with anxiety?",
    source: "partner:acme",
    height: "600px",
    autoHeight: false,  // Auto-resize based on content
    title: "Plantz Medical Cannabis Chat"
  });
</script>
```

**Options:**
- `container` - CSS selector (string) or DOM element (required)
- `question` - Pre-filled question (optional)
- `source` - Your tracking ID
- `height` - CSS height value (default: "600px")
- `autoHeight` - Auto-resize iframe (default: false)
- `title` - Iframe title for accessibility

---

## Analytics & Event Tracking

Listen for events from the chat to track user interactions:

```javascript
window.addEventListener("message", function(e) {
  // Only process Plantz events
  if (e.data && e.data.type && e.data.type.startsWith("plantz:")) {
    const { type, payload } = e.data;
    
    switch(type) {
      case "plantz:ready":
        console.log("Chat is ready");
        break;
        
      case "plantz:event":
        // Analytics events
        const { name, detail, source } = payload;
        console.log("Event:", name, detail);
        
        // Send to your analytics
        if (typeof gtag !== "undefined") {
          gtag("event", name, {
            event_category: "plantz_chat",
            event_label: source,
            ...detail
          });
        }
        break;
        
      case "plantz:height":
        // Iframe height changed
        console.log("New height:", payload.height);
        break;
    }
  }
});
```

### Event Types

**`plantz:ready`**
- Fired when chat loads
- No payload

**`plantz:event`** - Analytics events:
- `conversation_start` - User sent first message
  - `detail.initialQuestion` or `detail.seededQuestion`
- `assistant_reply` - Assistant responded
  - `detail.threadId`
- `booking_started` - User started booking flow
  - `detail.threadId`
- `booking_completed` - Booking successful
  - `detail.bookingData` (date, time, phone)
- `error` - Error occurred
  - `detail.message`, `detail.code`

**`plantz:height`**
- Iframe content height changed
- `payload.height` - New height in pixels

---

## Security & Whitelisting

To embed the chat on your domain, you must be whitelisted. Contact Plantz to add your domain to the allowlist.

**What we need:**
- Your domain(s): `https://yoursite.com`
- Your company name
- Your tracking source ID: `partner:yourcompany`

Once whitelisted, the chat will work on your domain. Unauthorized domains will be blocked by CSP.

---

## Styling & Customization

### Button Position

The auto-button and mounted buttons appear in the bottom-right by default. To customize:

```javascript
const btn = PlantzChat.mountButton({
  label: "Chat with us",
  source: "partner:acme"
});

// Customize position
btn.style.bottom = "80px";
btn.style.right = "30px";

// Or left side
btn.style.left = "20px";
btn.style.right = "auto";
```

### Iframe Styling

```css
#chat-container iframe {
  border-radius: 12px !important;
  box-shadow: 0 4px 20px rgba(0,0,0,0.1) !important;
}
```

---

## Testing

**Demo Page:** `https://plantz-call-booking.vercel.app/embed-demo.html`

Test all integration methods before going live.

**Local Testing:**
```html
<!-- Use localhost for testing -->
<script src="http://localhost:3000/embed.js" 
        data-autobutton="true"
        data-source="test:local"></script>
```

---

## Best Practices

1. **Always include a source tag** - Use `source: "partner:yourcompany"` for tracking
2. **Pre-fill questions when possible** - Better UX, higher engagement
3. **Listen for events** - Track conversions and user behavior
4. **Test on staging first** - Use the demo page to verify integration
5. **Mobile-friendly** - The chat is responsive, but test on mobile devices

---

## Support

**Questions?** Contact Plantz support:
- Email: support@plantz.io
- Docs: https://plantz.io/docs

**Report Issues:**
- GitHub: https://github.com/millionmedia2/plantz-call-booking/issues

---

## Examples

### WordPress Integration

```php
// Add to your theme's footer.php or use a plugin
function add_plantz_chat() {
  ?>
  <script src="https://plantz-call-booking.vercel.app/embed.js"
          data-autobutton="true"
          data-label="Ask About Cannabis"
          data-source="partner:<?php echo get_bloginfo('name'); ?>"></script>
  <?php
}
add_action('wp_footer', 'add_plantz_chat');
```

### React Integration

```jsx
import { useEffect } from 'react';

function App() {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://plantz-call-booking.vercel.app/embed.js';
    script.async = true;
    document.body.appendChild(script);

    script.onload = () => {
      window.PlantzChat.mountButton({
        label: 'Get Cannabis Advice',
        source: 'partner:myreactapp'
      });
    };

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  return <div>Your App</div>;
}
```

### Shopify Integration

```liquid
<!-- Add to theme.liquid before </body> -->
<script src="https://plantz-call-booking.vercel.app/embed.js"
        data-autobutton="true"
        data-label="Cannabis Advice"
        data-source="partner:{{ shop.name }}"></script>
```

---

**Version:** 1.0  
**Last Updated:** October 25, 2025

