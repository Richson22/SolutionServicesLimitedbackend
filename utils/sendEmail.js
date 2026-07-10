// server/utils/sendEmail.js
// Sends emails using Resend. Docs: https://resend.com/docs
//
// SETUP:
// 1. npm install resend
// 2. Get an API key from https://resend.com/api-keys
// 3. Add to your .env file:
//      RESEND_API_KEY=re_xxxxxxxxxxxx
//      CLIENT_URL=http://localhost:5173   (or your deployed frontend URL)
//      EMAIL_FROM=onboarding@resend.dev   (swap to your verified domain later, e.g. accounts@yourschool.com)

const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Sends the "your account has been created" email with temp login credentials.
 * @param {Object} params
 * @param {string} params.to - recipient email
 * @param {string} params.name - recipient's name
 * @param {string} params.role - 'student' or 'staff'
 * @param {string} params.tempPassword - the temporary password the admin set
 */
async function sendWelcomeEmail({ to, name, role, tempPassword }) {
  const loginUrl = `${process.env.CLIENT_URL}/StudentStaffLogin`;

  const html = `
    <div style="font-family: -apple-system, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #12213F; margin-bottom: 4px;">Welcome, ${name}!</h2>
      <p style="color: #5B6577; font-size: 14px; line-height: 1.6;">
        An account has been created for you as a <strong>${role}</strong>.
        Use the credentials below to log in.
      </p>

      <div style="background: #F4F6FA; border-radius: 10px; padding: 16px; margin: 20px 0;">
        <p style="margin: 0 0 8px; font-size: 14px; color: #12213F;"><strong>Email:</strong> ${to}</p>
        <p style="margin: 0; font-size: 14px; color: #12213F;"><strong>Temporary Password:</strong> ${tempPassword}</p>
      </div>

      <a href="${loginUrl}"
         style="display: inline-block; background: #12213F; color: #fff; text-decoration: none;
                padding: 12px 22px; border-radius: 10px; font-weight: 700; font-size: 14px;">
        Log In Now
      </a>

      <p style="color: #8A94A6; font-size: 12.5px; margin-top: 24px;">
        For security, please log in and change your password as soon as possible.
      </p>
    </div>
  `;

  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
    to,
    subject: 'Your account has been created',
    html,
  });

  if (error) {
    console.error('Resend email error:', error);
    throw new Error('Failed to send welcome email');
  }

  return data;
}

/**
 * Notifies every staff member at a given business that a new booking came in.
 * @param {Object} params
 * @param {string[]} params.to - array of staff emails to notify
 * @param {Object} params.appointment - the appointment/booking details
 */
async function sendNewBookingEmail({ to, appointment }) {
  if (!to || to.length === 0) return; // no staff to notify — nothing to send

  const dashboardUrl = `${process.env.CLIENT_URL}/StaffDashboard`;
  const formattedDate = new Date(appointment.date).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  const html = `
    <div style="font-family: -apple-system, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #12213F; margin-bottom: 4px;">New booking request</h2>
      <p style="color: #5B6577; font-size: 14px; line-height: 1.6;">
        A customer just booked <strong>${appointment.service}</strong>. First staff member to accept it gets the job.
      </p>

      <div style="background: #F4F6FA; border-radius: 10px; padding: 16px; margin: 20px 0;">
        <p style="margin: 0 0 8px; font-size: 14px; color: #12213F;"><strong>Service:</strong> ${appointment.service}</p>
        <p style="margin: 0 0 8px; font-size: 14px; color: #12213F;"><strong>Date & Time:</strong> ${formattedDate} · ${appointment.startTime}</p>
        <p style="margin: 0; font-size: 14px; color: #12213F;"><strong>Location:</strong> ${appointment.address}</p>
      </div>

      <a href="${dashboardUrl}"
         style="display: inline-block; background: #12213F; color: #fff; text-decoration: none;
                padding: 12px 22px; border-radius: 10px; font-weight: 700; font-size: 14px;">
        View & Accept
      </a>

      <p style="color: #8A94A6; font-size: 12.5px; margin-top: 24px;">
        Log in to your dashboard to accept this request before another staff member does.
      </p>
    </div>
  `;

  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
    to, // Resend accepts an array of recipients here
    subject: 'New booking request — first to accept gets it',
    html,
  });

  if (error) {
    // Don't throw — a failed notification email shouldn't fail the booking itself.
    console.error('Resend new-booking email error:', error);
    return null;
  }

  return data;
}

module.exports = { sendWelcomeEmail, sendNewBookingEmail };