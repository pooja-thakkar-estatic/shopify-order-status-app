const express = require('express');                                                                                                                                                                                                                                                                                                                                                                                                                                                                 
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
const nodemailer = require('nodemailer');
require('dotenv').config();
const { orderStatusEmail } = require('./emailTemplates');
const axios = require('axios');
const basicAuth = require('basic-auth');

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const STATUSES_FILE = path.join(__dirname, 'statuses.json');

// Utility to read/write statuses
function readStatuses() {
  return JSON.parse(fs.readFileSync(STATUSES_FILE, 'utf8'));
}
function writeStatuses(statuses) {
  fs.writeFileSync(STATUSES_FILE, JSON.stringify(statuses, null, 2));
}

const ORDER_STATUSES_FILE = path.join(__dirname, 'order-statuses.json');
function readOrderStatuses() {
  if (!fs.existsSync(ORDER_STATUSES_FILE)) return {};
  return JSON.parse(fs.readFileSync(ORDER_STATUSES_FILE, 'utf8'));
}
function writeOrderStatuses(data) {
  fs.writeFileSync(ORDER_STATUSES_FILE, JSON.stringify(data, null, 2));
}

// Utility: get SMTP transporter
function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    secure: parseInt(process.env.SMTP_PORT) === 465, // true for 465, false for 587
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

// Utility: find status by name
function findStatusByName(name) {
  const statuses = readStatuses();
  return statuses.find(s => s.orderStatus === name);
}

// API: Get all statuses
app.get('/api/statuses', (req, res) => {
  res.json(readStatuses());
});

// API: Add a new status
app.post('/api/statuses', (req, res) => {
  const { orderStatus, color, description, topContent, bottomContent, emailCustomer, emailStaff } = req.body;
  if (!orderStatus || !color) return res.status(400).json({ error: 'Missing fields' });
  const statuses = readStatuses();
  const newStatus = {
    id: statuses.length ? Math.max(...statuses.map(s => s.id)) + 1 : 1,
    orderStatus,
    color,
    description: description || '',
    topContent: topContent || '',
    bottomContent: bottomContent || '',
    emailCustomer: !!emailCustomer,
    emailStaff: emailStaff || ''
  };
  statuses.push(newStatus);
  writeStatuses(statuses);
  res.json(newStatus);
});

// API: Edit a status
app.put('/api/statuses/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { orderStatus, color, description, topContent, bottomContent, emailCustomer, emailStaff } = req.body;
  let statuses = readStatuses();
  const idx = statuses.findIndex(s => s.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  statuses[idx].orderStatus = orderStatus || statuses[idx].orderStatus;
  statuses[idx].color = color || statuses[idx].color;
  statuses[idx].description = description !== undefined ? description : statuses[idx].description;
  statuses[idx].topContent = topContent !== undefined ? topContent : statuses[idx].topContent;
  statuses[idx].bottomContent = bottomContent !== undefined ? bottomContent : statuses[idx].bottomContent;
  statuses[idx].emailCustomer = emailCustomer !== undefined ? !!emailCustomer : statuses[idx].emailCustomer;
  statuses[idx].emailStaff = emailStaff !== undefined ? emailStaff : statuses[idx].emailStaff;
  writeStatuses(statuses);
  res.json(statuses[idx]);
});

// API: Delete a status
app.delete('/api/statuses/:id', (req, res) => {
  const id = parseInt(req.params.id);
  let statuses = readStatuses();
  const idx = statuses.findIndex(s => s.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const removed = statuses.splice(idx, 1);
  writeStatuses(statuses);
  res.json(removed[0]);
});

// Webhook endpoint for Shopify order updates
app.post('/webhook/order-updated', async (req, res) => {
  try {
    const order = req.body;
    // Find the order status metafield (assume namespace 'uniform7', key 'order_status')
    const metafields = order.metafields && order.metafields.uniform7;
    const statusValue = metafields && metafields.order_status && metafields.order_status.value;
    if (!statusValue) return res.status(200).send('No status metafield');
    const status = findStatusByName(statusValue);
    if (!status) return res.status(200).send('Status not found');
    // Send email to customer if enabled
    if (status.emailCustomer && order.email) {
      const html = orderStatusEmail({
        orderNumber: order.name || order.order_number || order.id,
        status: status.orderStatus,
        topContent: status.topContent,
        bottomContent: status.bottomContent
      });
      const transporter = getTransporter();
      await transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: order.email,
        subject: `Order Update - Order #${order.name || order.order_number || order.id}`,
        html
      });
      console.log(`Email sent to customer for status: ${status.orderStatus}`);
    }
    // Send email to staff if enabled
    if (status.emailStaff) {
      const html = orderStatusEmail({
        orderNumber: order.name || order.order_number || order.id,
        status: status.orderStatus,
        topContent: status.topContent,
        bottomContent: status.bottomContent
      });
      const transporter = getTransporter();
      await transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: status.emailStaff,
        subject: `Order Status Changed (Staff) - Order #${order.name || order.order_number || order.id}`,
        html
      });
      console.log(`Email sent to staff for status: ${status.orderStatus}`);
    }
    res.status(200).send('ok');
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).send('error');
  }
});

// Shopify API helper
const SHOP = process.env.SHOPIFY_SHOP;
const API_KEY = process.env.SHOPIFY_API_KEY;
const API_SECRET = process.env.SHOPIFY_API_SECRET;
const ADMIN_API_VERSION = '2023-10'; // or latest supported
const ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN;

function shopifyRequest(method, endpoint, data) {
  return axios({
    method,
    url: `https://${SHOP}/admin/api/${ADMIN_API_VERSION}${endpoint}`,
    headers: {
      'X-Shopify-Access-Token': ACCESS_TOKEN,
      'Content-Type': 'application/json',
    },
    data,
  });
}

// GET /api/orders - fetch all orders and attach statuses from order-statuses.json
app.get('/api/orders', async (req, res) => {
  try {
    const resp = await shopifyRequest('get', '/orders.json?limit=50&status=any');
    const orders = resp.data.orders;
    const orderStatuses = readOrderStatuses();
    const ordersWithStatus = orders.map(order => {
      return {
        id: order.id,
        name: order.name,
        email: order.email,
        customer: order.customer ? [order.customer.first_name, order.customer.last_name].filter(Boolean).join(' ') : '',
        created_at: order.created_at,
        total_price: order.total_price,
        financial_status: order.financial_status,
        fulfillment_status: order.fulfillment_status,
        order_statuses: orderStatuses[order.id] || [],
      };
    });
    res.json(ordersWithStatus);
  } catch (err) {
    console.error('Fetch orders error:', (err.response && err.response.data) || err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});
// POST /api/orders/:id/status - add status to order-statuses.json
app.post('/api/orders/:id/status', (req, res) => {
  const orderId = req.params.id;
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'Missing status' });
  const orderStatuses = readOrderStatuses();
  if (!orderStatuses[orderId]) orderStatuses[orderId] = [];
  if (!orderStatuses[orderId].includes(status)) orderStatuses[orderId].push(status);
  writeOrderStatuses(orderStatuses);
  res.json({ success: true });
});
// POST /api/orders/:id/status/remove - remove status from order-statuses.json
app.post('/api/orders/:id/status/remove', (req, res) => {
  const orderId = req.params.id;
  const orderStatuses = readOrderStatuses();
  orderStatuses[orderId] = []; // Clear all statuses for this order
  writeOrderStatuses(orderStatuses);
  res.json({ success: true });
});

// PATCH/POST order status update endpoint
app.post('/api/orders/:orderId/status', async (req, res) => {
  const orderId = req.params.orderId;
  const { status } = req.body;
  console.log('Received status update for order:', orderId, 'status:', status);
  if (!status) {
    console.log('Missing status in request body');
    return res.status(400).json({ error: 'Missing status' });
  }
  const orderStatuses = readOrderStatuses();
  if (!orderStatuses[orderId]) orderStatuses[orderId] = [];
  orderStatuses[orderId] = [status]; // Only keep the last status
  writeOrderStatuses(orderStatuses);
  let emailSent = false;
  let staffEmailSent = false;
  let errorMsg = '';
  try {
    const statuses = readStatuses();
    const statusObj = statuses.find(s => s.orderStatus === status);
    // Fetch order details for email
    let orderEmail = '';
    let orderName = '';
    // Try to get order details from Shopify API
    try {
      const SHOP = process.env.SHOPIFY_SHOP;
      const ADMIN_API_VERSION = '2023-10';
      const ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN;
      const axios = require('axios');
      console.log('Fetching order details from Shopify for orderId:', orderId);
      const resp = await axios.get(`https://${SHOP}/admin/api/${ADMIN_API_VERSION}/orders/${orderId}.json`, {
        headers: { 'X-Shopify-Access-Token': ACCESS_TOKEN }
      });
      const order = resp.data.order;
      orderEmail = order.email;
      orderName = order.name;
      console.log('Fetched order details:', { orderEmail, orderName });
      // Send customer email
      if (statusObj && statusObj.emailCustomer && orderEmail) {
        try {
          const html = require('./emailTemplates').orderStatusEmail({
            orderNumber: orderName || orderId,
            status: statusObj.orderStatus,
            topContent: statusObj.topContent,
            bottomContent: statusObj.bottomContent
          });
          const transporter = getTransporter();
          console.log('Preparing to send customer email. SMTP config:', {
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            user: process.env.SMTP_USER,
            from: process.env.EMAIL_FROM
          });
          console.log('Sending customer email to:', orderEmail);
          await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: orderEmail,
            subject: `Order Update - Order #${orderName || orderId}`,
            html
          });
          emailSent = true;
          console.log('Customer email sent successfully');
        } catch (e) {
          errorMsg += 'Customer email send error: ' + e.message + '\n';
          console.error('Customer email send error:', e);
        }
      } else if (statusObj && statusObj.emailCustomer && !orderEmail) {
        errorMsg += 'No customer email found for order.\n';
        console.error('No customer email found for order:', orderId);
      }
      // Send staff email
      if (statusObj && statusObj.emailStaff) {
        try {
          const html = require('./emailTemplates').orderStatusEmail({
            orderNumber: orderName || orderId,
            status: statusObj.orderStatus,
            topContent: statusObj.topContent,
            bottomContent: statusObj.bottomContent
          });
          const transporter = getTransporter();
          console.log('Preparing to send staff email. SMTP config:', {
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            user: process.env.SMTP_USER,
            from: process.env.EMAIL_FROM
          });
          console.log('Sending staff email to:', statusObj.emailStaff);
          await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: statusObj.emailStaff,
            subject: `Order Status Changed (Staff) - Order #${orderName || orderId}`,
            html
          });
          staffEmailSent = true;
          console.log('Staff email sent successfully');
        } catch (e) {
          errorMsg += 'Staff email send error: ' + e.message + '\n';
          console.error('Staff email send error:', e);
        }
      }
    } catch (e) {
      errorMsg += 'Shopify order fetch error: ' + e.message + '\n';
      console.error('Shopify order fetch error:', e);
    }
  } catch (e) {
    errorMsg += 'General error: ' + e.message;
    console.error('General error:', e);
  }
  // Only return success if email is sent or not required
  if (errorMsg && errorMsg.trim().length > 0) {
    console.log('Status update failed:', errorMsg);
    return res.json({ success: false, error: errorMsg });
  }
  console.log('Status update successful for order:', orderId, 'status:', status);
  res.json({ success: true });
});

// Admin UI (simple HTML page)
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';

function adminAuth(req, res, next) {
  const user = basicAuth(req);
  if (!user || user.name !== ADMIN_USER || user.pass !== ADMIN_PASS) {
    res.set('WWW-Authenticate', 'Basic realm=\"Admin Area\"');
    return res.status(401).send('Authentication required.');
  }
  next();
}

app.get('/admin', adminAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Order Status App running on http://localhost:${PORT}`);
}); 