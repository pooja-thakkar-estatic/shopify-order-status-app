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

// GET /api/orders - fetch all orders with custom status metafield and all details
app.get('/api/orders', async (req, res) => {
  try {
    // Fetch orders (limit 50 for demo)
    const resp = await shopifyRequest('get', '/orders.json?limit=50&status=any');
    const orders = resp.data.orders;
    // For each order, get custom status metafield (namespace: 'uniform7', key: 'order_statuses')
    const ordersWithStatus = await Promise.all(orders.map(async (order) => {
      let statusesArr = [];
      try {
        const metafieldsResp = await shopifyRequest('get', `/orders/${order.id}/metafields.json`);
        const statusField = metafieldsResp.data.metafields.find(mf => mf.namespace === 'uniform7' && mf.key === 'order_statuses');
        if (statusField) {
          statusesArr = JSON.parse(statusField.value);
        }
      } catch (e) {}
      return {
        id: order.id,
        name: order.name,
        email: order.email,
        customer: order.customer ? [order.customer.first_name, order.customer.last_name].filter(Boolean).join(' ') : '',
        created_at: order.created_at,
        total_price: order.total_price,
        financial_status: order.financial_status,
        fulfillment_status: order.fulfillment_status,
        tags: Array.isArray(order.tags) ? order.tags : (order.tags ? order.tags.split(',').map(t => t.trim()) : []),
        line_items: order.line_items || [],
        shipping_lines: order.shipping_lines || [],
        source_name: order.source_name || '',
        channel: order.source_name || '',
        order_statuses: statusesArr,
      };
    }));
    res.json(ordersWithStatus);
  } catch (err) {
    console.error('Fetch orders error:', err.response?.data || err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// POST /api/orders/:id/status - append new status to order_statuses array and send email
app.post('/api/orders/:id/status', async (req, res) => {
  const orderId = req.params.id;
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'Missing status' });
  try {
    // Fetch existing statuses
    let statusesArr = [];
    try {
      const metafieldsResp = await shopifyRequest('get', `/orders/${orderId}/metafields.json`);
      const statusField = metafieldsResp.data.metafields.find(mf => mf.namespace === 'uniform7' && mf.key === 'order_statuses');
      if (statusField) {
        statusesArr = JSON.parse(statusField.value);
      }
    } catch (e) {}
    // Add new status if not already present
    if (!statusesArr.includes(status)) statusesArr.push(status);
    // Save back as JSON string
    await shopifyRequest('post', `/orders/${orderId}/metafields.json`, {
      metafield: {
        namespace: 'uniform7',
        key: 'order_statuses',
        value: JSON.stringify(statusesArr),
        type: 'json_string',
      }
    });
    // Fetch order details for email
    const orderResp = await shopifyRequest('get', `/orders/${orderId}.json`);
    const order = orderResp.data.order;
    // Find status config
    const statusConfig = findStatusByName(status);
    if (statusConfig) {
      // Send email to customer if enabled
      if (statusConfig.emailCustomer && order.email) {
        const html = orderStatusEmail({
          orderNumber: order.name || order.order_number || order.id,
          status: statusConfig.orderStatus,
          topContent: statusConfig.topContent,
          bottomContent: statusConfig.bottomContent
        });
        const transporter = getTransporter();
        await transporter.sendMail({
          from: process.env.EMAIL_FROM,
          to: order.email,
          subject: `Order Update - Order #${order.name || order.order_number || order.id}`,
          html
        });
      }
      // Send email to staff if enabled
      if (statusConfig.emailStaff) {
        const html = orderStatusEmail({
          orderNumber: order.name || order.order_number || order.id,
          status: statusConfig.orderStatus,
          topContent: statusConfig.topContent,
          bottomContent: statusConfig.bottomContent
        });
        const transporter = getTransporter();
        await transporter.sendMail({
          from: process.env.EMAIL_FROM,
          to: statusConfig.emailStaff,
          subject: `Order Status Changed (Staff) - Order #${order.name || order.order_number || order.id}`,
          html
        });
      }
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Update status error:', err.response?.data || err);
    res.status(500).json({ error: 'Failed to update status' });
  }
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