# Plantz Chat Embed SDK

## 🚀 Quick Start

Add one line to your website:

```html
<script src="https://plantz-call-booking.vercel.app/embed.js"
        data-autobutton="true"
        data-source="partner:yourcompany"></script>
```

A floating chat button appears automatically! 🎉

---

## 📦 What's Included

### SDK File
- **URL**: `https://plantz-call-booking.vercel.app/embed.js`
- **Size**: ~3KB minified
- **Cache**: 10 minutes
- **CORS**: Enabled globally

### Three Integration Methods

1. **Auto Button** - Zero JavaScript, one script tag
2. **Popup** - `PlantzChat.open()` from your buttons
3. **Iframe** - `PlantzChat.embedIframe()` inline

---

## 🎯 Live Demo

**Test all features**: `http://localhost:3000/embed-demo.html`

Open this page to see:
- Auto-button in action
- Popup windows
- Inline iframe embedding
- Event tracking examples

---

## 📖 Documentation

**Full integration guide**: See `PARTNER_INTEGRATION.md`

Includes:
- Code examples for all methods
- Analytics event tracking
- Platform-specific guides (WordPress, React, Shopify)
- Security & whitelisting
- Best practices

---

## 🔧 API Reference

### `PlantzChat.open(options)`

Opens chat in popup window.

```javascript
PlantzChat.open({
  question: "What helps with sleep?",  // Pre-filled question
  agent: "doctor",                     // Agent type
  theme: "light",                      // Theme
  source: "partner:acme",              // Your tracking ID
  width: 420,                          // Popup width
  height: 720                          // Popup height
});
```

### `PlantzChat.mountButton(options)`

Adds floating button to page.

```javascript
PlantzChat.mountButton({
  label: "Ask Plantz",                 // Button text
  question: "I need help",             // Pre-filled question
  source: "partner:acme"               // Your tracking ID
});
```

### `PlantzChat.embedIframe(options)`

Embeds chat as inline iframe.

```javascript
PlantzChat.embedIframe({
  container: "#chat-container",        // CSS selector or DOM element
  question: "What helps with anxiety?",// Pre-filled question
  source: "partner:acme",              // Your tracking ID
  height: "600px",                     // CSS height
  autoHeight: false,                   // Auto-resize
  title: "Plantz Chat"                 // Accessibility title
});
```

---

## 📊 Analytics Events

Listen for user interactions:

```javascript
window.addEventListener("message", function(e) {
  if (e.data?.type === "plantz:event") {
    const { name, detail, source } = e.data.payload;
    
    // Track in your analytics
    console.log("Event:", name, detail);
  }
});
```

**Events fired:**
- `conversation_start` - User sent first message
- `assistant_reply` - Assistant responded
- `booking_started` - User started booking
- `booking_completed` - Booking successful
- `error` - Error occurred

---

## 🔒 Security

**Whitelisting Required**

To embed on your domain, contact Plantz to be whitelisted.

**CSP Protection**: Unauthorized domains are blocked by Content Security Policy.

---

## 🎨 Customization

### Button Styling

```javascript
const btn = PlantzChat.mountButton({ source: "partner:acme" });
btn.style.bottom = "80px";
btn.style.background = "#your-color";
```

### Iframe Styling

```css
#chat-container iframe {
  border-radius: 12px !important;
  box-shadow: 0 4px 20px rgba(0,0,0,0.1) !important;
}
```

---

## ✅ Testing Checklist

Before going live:

- [ ] Test auto-button on your staging site
- [ ] Verify popup opens correctly
- [ ] Test iframe embedding
- [ ] Check event tracking in console
- [ ] Test on mobile devices
- [ ] Verify source tag is correct
- [ ] Test with pre-filled questions

---

## 🆘 Troubleshooting

**Button doesn't appear?**
- Check script URL is correct
- Verify `data-autobutton="true"` is set
- Check browser console for errors

**Popup blocked?**
- User must click a button to open popup
- Can't auto-open on page load (browser security)

**Iframe not loading?**
- Check domain is whitelisted
- Verify CSP headers in browser DevTools
- Check console for CSP errors

**Events not firing?**
- Ensure you're listening for `message` events
- Check `e.data.type` starts with `"plantz:"`
- Verify iframe/popup is from correct origin

---

## 📞 Support

**Questions?** 
- Email: support@plantz.io
- Docs: `PARTNER_INTEGRATION.md`
- Demo: `http://localhost:3000/embed-demo.html`

**Report bugs:**
- GitHub Issues: https://github.com/millionmedia2/plantz-call-booking/issues

---

## 📝 Changelog

### v1.0.0 (October 25, 2025)
- Initial release
- Auto-button support
- Popup windows
- Iframe embedding
- Event tracking
- Full documentation

---

**Made with 🌿 by Plantz**

