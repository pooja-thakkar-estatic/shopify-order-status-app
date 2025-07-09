# Shopify Order Status Email App

This Node.js app listens for Shopify order updates and sends custom order status emails to customers via SMTP (Gmail, Outlook, or any custom SMTP server).

---

## Features
- Listens for Shopify webhooks (order updated)
- Checks for order status metafield changes
- Sends simple HTML emails to customers using SMTP
- Works with Gmail, Outlook, or any SMTP provider

---

## 1. Setup

### Prerequisites
- Node.js 18+
- A Shopify store (admin access)
- SMTP credentials (Gmail, Outlook, or custom)

### Installation
```bash
cd shopify-order-status-app
npm install
```

---

## 2. Configuration

1. Copy `.env.example` to `.env` and fill in your values:

```
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
SHOPIFY_WEBHOOK_SECRET=your_shopify_webhook_secret
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_email_password_or_app_password
EMAIL_FROM="Uniform7 <your_email@gmail.com>"
```

- For Outlook, use:
  - `SMTP_HOST=smtp.office365.com`
  - `SMTP_PORT=587`

---

## 3. Running the App

```bash
node index.js
```

- The app will listen on port 3000 by default.

---

## 4. Connect to Shopify

1. Go to **Shopify Admin → Settings → Notifications → Webhooks**
2. Click **Create webhook**
3. Event: **Order updated**
4. URL: `https://your-server.com/webhook/order-updated`
5. Format: **JSON**
6. Save

---

## 5. How It Works
- When an order is updated, Shopify sends a webhook to this app.
- The app checks if the `uniform7.order_status` metafield changed.
- If changed, it sends an email to the customer using a simple HTML template.

---

## 6. Customization
- Edit `emailTemplates.js` to change the email HTML.
- Edit `index.js` to add more logic (e.g., different templates for each status).

---

## 7. Deployment
- Deploy to any Node.js host (Render, Heroku, AWS, DigitalOcean, etc.)
- Use [ngrok](https://ngrok.com/) for local testing.

---

## 8. Security
- The app verifies Shopify webhook signatures for security.

---

## 9. Support
- For help, contact your developer or open an issue in your project repo. 