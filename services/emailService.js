// server/services/emailService.js
const nodemailer = require('nodemailer');

// Create a transporter (for development, use Ethereal)
const createTransporter = () => {
  // For development, you can use a test email service
  // Or configure with your real email provider
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.ethereal.email',
    port: process.env.EMAIL_PORT || 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER || 'test@ethereal.email',
      pass: process.env.EMAIL_PASS || 'test-password'
    }
  });
};

const sendVerificationEmail = async (email, token) => {
  try {
    const transporter = createTransporter();
    
    const verificationUrl = `${process.env.CLIENT_URL || 'https://revonex.store/'}/verify-email/${token}`;
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || '"Revonex" <noreply@revonex.com>',
      to: email,
      subject: 'Verify Your Email - Revonex',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1>Welcome to Revonex! 👋</h1>
          <p>Please verify your email address to complete your registration.</p>
          <div style="margin: 30px 0;">
            <a href="${verificationUrl}" 
               style="background-color: #6366f1; color: white; padding: 12px 24px; 
                      text-decoration: none; border-radius: 6px; font-weight: bold;">
              Verify Email Address
            </a>
          </div>
          <p>Or copy and paste this link in your browser:</p>
          <p style="word-break: break-all; color: #666; font-size: 14px;">
            ${verificationUrl}
          </p>
          <p>This link will expire in 24 hours.</p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 12px;">
            If you didn't create an account with Revonex, please ignore this email.
          </p>
        </div>
      `
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Verification email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('❌ Error sending verification email:', error);
    return false;
  }
};
// In server/services/emailService.js
const sendBanNotificationEmail = async (userEmail, banReason) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: userEmail,
    subject: 'Account Status Update - Revonex',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">Account Suspension Notice</h2>
        <p>Dear User,</p>
        <p>Your Revonex account has been suspended due to:</p>
        <div style="background-color: #fee2e2; border-left: 4px solid #dc2626; padding: 12px; margin: 16px 0;">
          <p style="color: #dc2626; margin: 0;">${banReason}</p>
        </div>
        <p>If you believe this was a mistake, please contact our support team immediately.</p>
        <div style="background-color: #f3f4f6; padding: 16px; border-radius: 8px; margin: 24px 0;">
          <p style="margin: 0; font-size: 14px; color: #6b7280;">
            Need help? Contact support at <a href="mailto:support@revonex.com" style="color: #3b82f6;">support@revonex.com</a>
          </p>
        </div>
      </div>
    `
  };

  // Send email using your email service (Nodemailer, SendGrid, etc.)
  // await transporter.sendMail(mailOptions);
};
const sendPasswordResetEmail = async (email, token) => {
  try {
    const transporter = createTransporter();
    
    const resetUrl = `${process.env.CLIENT_URL || 'https://revonex.store/'}/reset-password/${token}`;
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || '"Revonex" <noreply@revonex.com>',
      to: email,
      subject: 'Reset Your Password - Revonex',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1>Password Reset Request 🔐</h1>
          <p>You requested to reset your password. Click the button below to create a new password.</p>
          <div style="margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background-color: #6366f1; color: white; padding: 12px 24px; 
                      text-decoration: none; border-radius: 6px; font-weight: bold;">
              Reset Password
            </a>
          </div>
          <p>Or copy and paste this link in your browser:</p>
          <p style="word-break: break-all; color: #666; font-size: 14px;">
            ${resetUrl}
          </p>
          <p>This link will expire in 1 hour.</p>
          <p style="color: #ef4444; font-weight: bold;">
            ⚠️ If you didn't request a password reset, please ignore this email and ensure your account is secure.
          </p>
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 12px;">
            Revonex Security Team
          </p>
        </div>
      `
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Password reset email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('❌ Error sending password reset email:', error);
    return false;
  }
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail
};