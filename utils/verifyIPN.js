import crypto from 'crypto';

export function verifyIPN(req) {
  const signature = req.headers['x-nowpayments-sig'];
  const payload = req.body.toString();
  
  if (!signature || !payload) {
    return false;
  }

  const hmac = crypto.createHmac('sha512', process.env.NOWPAYMENTS_WEBHOOK_SECRET);
  const calculatedSignature = hmac.update(payload).digest('hex');
  
  return signature === calculatedSignature;
}