const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
const nodemailer = require('nodemailer');
require('dotenv').config();
const { orderStatusEmail } = require('./emailTemplates');

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

// Admin UI (simple HTML page)
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Order Status App running on http://localhost:${PORT}`);
}); 