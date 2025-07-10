// emailTemplates.js

function orderStatusEmail({ orderNumber, status, topContent, bottomContent }) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align:center; margin-bottom: 18px;">
        <img src=\"https://uniform7.co.uk/cdn/shop/files/white_background.jpg?v=1750248566&width=110\" alt=\"Uniform7 Store\" width=\"110\" height=\"107.8\" style=\"display:inline-block;vertical-align:middle;max-width:110px;max-height:108px;\" />
      </div>
      <h2 style="color: #333;">Order Status Update</h2>
      <p style="color: #666;">Order #${orderNumber}</p>
      <div style="background: #f8f9fa; padding: 16px; border-radius: 6px; margin-bottom: 16px;">
        <strong>Status:</strong> ${status}
      </div>
      <div style="margin-bottom: 16px;">${topContent}</div>
      <div style="font-size: 13px; color: #555;">${bottomContent}</div>
      <hr style="margin: 24px 0;">
      <div style="font-size: 12px; color: #888;">Thank you for shopping with Uniform7.</div>
    </div>
  `;
}

module.exports = { orderStatusEmail }; 