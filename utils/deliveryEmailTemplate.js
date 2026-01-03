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
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        .container { max-width: 600px; margin: 0 auto; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; text-align: center; color: white; }
        .content { padding: 30px; background: white; }
        .credential-box { background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 10px 0; }
        .button { display: inline-block; padding: 12px 30px; background: #4f46e5; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎉 Your Digital Products Are Ready!</h1>
          <p>Order #${order.orderId}</p>
        </div>
        
        <div class="content">
          <h2>Your Credentials</h2>
          <p>Below are your purchased digital products. Please save them securely.</p>
          
          ${itemsList}
          
          <div style="margin-top: 30px; padding: 20px; background: #fef3c7; border-radius: 10px; border: 1px solid #fbbf24;">
            <h3 style="margin-top: 0; color: #92400e;">⚠️ Security Notice</h3>
            <p style="color: #92400e; margin-bottom: 0;">
              • These credentials are shown only once<br>
              • Change passwords on first login<br>
              • Do not share with anyone<br>
              • Access expires in 24 hours
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 30px;">
            <a href="https://revonex.store//order/${order.orderId}/delivery" class="button">
              View in Browser
            </a>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
};

module.exports = { createDeliveryEmail };