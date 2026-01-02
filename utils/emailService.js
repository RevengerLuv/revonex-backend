// utils/deliveryEmailTemplate.js
const createDeliveryEmail = (order, deliveryDetails) => {
  const itemsList = deliveryDetails.map(detail => 
    `<div style="margin-bottom: 20px; padding: 20px; background: #f8f9fa; border-radius: 10px; border-left: 4px solid #4f46e5;">
      <h3 style="margin: 0 0 10px 0; color: #1f2937;">${detail.productName}</h3>
      <div style="color: #6b7280; font-size: 14px;">
        ${Object.entries(detail.credentials || {}).map(([key, value]) => 
          `<div style="margin: 5px 0;">
            <strong>${key}:</strong> ${value}
          </div>`
        ).join('')}
      </div>
    </div>`
  ).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Your Digital Purchase is Ready!</title>
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; 
          line-height: 1.6; 
          color: #333;
          margin: 0;
          padding: 0;
        }
        .container { 
          max-width: 600px; 
          margin: 0 auto; 
          background: #ffffff;
        }
        .header { 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
          padding: 40px; 
          text-align: center; 
          color: white; 
          border-radius: 0 0 20px 20px;
        }
        .header h1 { 
          margin: 0 0 10px 0; 
          font-size: 28px;
        }
        .header p { 
          margin: 0; 
          opacity: 0.9;
        }
        .content { 
          padding: 30px; 
        }
        .order-info {
          background: #f8f9fa;
          padding: 20px;
          border-radius: 10px;
          margin-bottom: 30px;
        }
        .order-info h2 {
          margin-top: 0;
          color: #1f2937;
        }
        .button { 
          display: inline-block; 
          padding: 14px 32px; 
          background: #4f46e5; 
          color: white; 
          text-decoration: none; 
          border-radius: 8px; 
          font-weight: bold; 
          font-size: 16px;
          margin: 10px 0;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .button:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 20px rgba(79, 70, 229, 0.2);
        }
        .security-notice {
          background: #fef3c7;
          border: 1px solid #fbbf24;
          border-radius: 10px;
          padding: 20px;
          margin: 30px 0;
        }
        .security-notice h3 {
          color: #92400e;
          margin-top: 0;
        }
        .security-notice p {
          color: #92400e;
          margin: 0;
        }
        .footer {
          text-align: center;
          padding: 20px;
          color: #6b7280;
          font-size: 14px;
          border-top: 1px solid #e5e7eb;
        }
        .credential-item {
          background: #f8f9fa;
          padding: 15px;
          border-radius: 8px;
          margin: 10px 0;
        }
        .credential-item h4 {
          margin: 0 0 10px 0;
          color: #1f2937;
        }
        .credential-value {
          font-family: 'Courier New', monospace;
          background: white;
          padding: 8px 12px;
          border-radius: 6px;
          border: 1px solid #e5e7eb;
          word-break: break-all;
        }
        @media (max-width: 600px) {
          .header { padding: 30px 20px; }
          .content { padding: 20px; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎉 Your Digital Products Are Ready!</h1>
          <p>Order #${order.orderId}</p>
        </div>
        
        <div class="content">
          <div class="order-info">
            <h2>Order Summary</h2>
            <p><strong>Order ID:</strong> ${order.orderId}</p>
            <p><strong>Total:</strong> $${order.total}</p>
            <p><strong>Payment Status:</strong> ✅ Paid</p>
            <p><strong>Delivery:</strong> ⚡ Instant</p>
          </div>
          
          <h2 style="color: #1f2937; margin-top: 0;">Your Credentials</h2>
          <p style="color: #6b7280;">Below are your purchased digital products. Please save them securely.</p>
          
          ${itemsList}
          
          <div class="security-notice">
            <h3>⚠️ Important Security Notice</h3>
            <p>
              • These credentials are shown only once<br>
              • Change passwords on first login<br>
              • Do not share with anyone<br>
              • This link expires in 24 hours
            </p>
          </div>
          
          <div style="text-align: center; margin: 40px 0;">
            <a href="http://localhost:3000/order/${order.orderId}/delivery" class="button">
              View Full Delivery Page
            </a>
            <p style="color: #6b7280; font-size: 14px; margin-top: 15px;">
              For the best experience, view on desktop
            </p>
          </div>
        </div>
        
        <div class="footer">
          <p>Need help? Contact support at support@store.com</p>
          <p>© ${new Date().getFullYear()} Digital Store. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

module.exports = { createDeliveryEmail };