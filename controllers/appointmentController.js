// server/controllers/appointmentController.js
//
// ASSUMPTION: verifyToken middleware has already run and set req.user = { id, role, businessId }
// ASSUMPTION: there's a User model at '../models/User' with a `name` field —
// adjust the import/field name below if yours differs (e.g. `fullName`).

const Appointment = require('../models/Appointment');
const User = require('../models/User');
const { sendNewBookingEmail } = require('../utils/sendEmail');
const { verifyTransaction } = require('../utils/paystack');

// ASSUMPTION: "Barbing Salon" (the display string stored on Appointment.business)
// corresponds to businessId 'TheStyleZone-2' on the User model. Update this if
// that mapping is wrong, or once you have a real Business model to look it up from.
const BUSINESS_DISPLAY_TO_ID = {
  'Barbing Salon': 'TheStyleZone-2',
};
// GET /api/appointments
// Returns all appointments belonging to the logged-in user
async function getAppointments(req, res) {
  try {
    const appointments = await Appointment.find({ userId: req.user.id }).sort({ date: 1 });
    const formatted = appointments.map((a) => formatAppointment(a));
    return res.status(200).json(formatted);
  } catch (err) {
    console.error('getAppointments error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load appointments' });
  }
}

// PATCH /api/appointments/:id/cancel
// Customer-initiated cancellation — only the booking's own customer can do this
async function cancelAppointment(req, res) {
  try {
    const { id } = req.params;

    const appointment = await Appointment.findById(id);
    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }

    if (appointment.userId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You do not have access to this appointment' });
    }

    appointment.status = 'cancelled';
    await appointment.save();

    return res.status(200).json({ success: true, message: 'Appointment cancelled' });
  } catch (err) {
    console.error('cancelAppointment error:', err);
    return res.status(500).json({ success: false, message: 'Failed to cancel appointment' });
  }
}

// GET /api/appointments/staff/all
// Returns every appointment for the Barbing Salon — any staff/manager there can see all of them
async function getBusinessAppointments(req, res) {
  try {
    const appointments = await Appointment.find({ business: 'Barbing Salon' }).sort({ date: 1 });
    const formatted = appointments.map((a) => formatAppointment(a));
    return res.status(200).json(formatted);
  } catch (err) {
    console.error('getBusinessAppointments error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load appointments' });
  }
}

// POST /api/appointments
// Customer books a new appointment — no specific barber chosen.
// providerName starts as null; whichever staff member accepts it first gets assigned.
async function createAppointment(req, res) {
  try {
    const {
      service,
      category,
      date,
      startTime,
      endTime,
      customerName,
      customerPhone,
      customerEmail,
      address,
      paymentMethod,
      paymentReference,
      amount,
    } = req.body;

    if (!service || !date || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: 'service, date, startTime, and endTime are required',
      });
    }

    if (!customerName || !customerPhone || !address) {
      return res.status(400).json({
        success: false,
        message: 'customerName, customerPhone, and address are required',
      });
    }

   let verifiedStatus = 'pending';

    if (paymentMethod === 'paystack') {
      if (!paymentReference) {
        return res.status(400).json({
          success: false,
          message: 'paymentReference is required when paymentMethod is paystack',
        });
      }

      const verification = await verifyTransaction(paymentReference);

      if (!verification.success) {
        return res.status(402).json({
          success: false,
          message: `Payment could not be verified (status: ${verification.status}). Please try again or contact support.`,
        });
      }

      // Guard against someone tampering with the amount client-side —
      // Paystack's verified amount (in kobo) must match what was actually charged.
      const expectedKobo = Math.round(Number(amount) * 100);
      if (expectedKobo && verification.amountKobo !== expectedKobo) {
        console.warn(
          `Amount mismatch for reference ${paymentReference}: expected ${expectedKobo} kobo, Paystack reports ${verification.amountKobo} kobo`
        );
        return res.status(402).json({
          success: false,
          message: 'Payment amount does not match the booking total. Please contact support.',
        });
      }

      verifiedStatus = 'confirmed';
    }

    const appointment = await Appointment.create({
      userId: req.user.id,
      business: 'Barbing Salon',
      category: category || 'Grooming',
      service,
      providerName: null, // unassigned — set when a staff member accepts
      date,
      startTime,
      endTime,
      status: verifiedStatus,
      customerName,
      customerPhone,
      customerEmail,
      address,
      paymentMethod: paymentMethod || 'cash',
      paymentReference,
      amount,
    });

   // Notify every staff member at this business — don't let a notification
    // failure block the booking response the customer is waiting on.
    try {
      const businessId = BUSINESS_DISPLAY_TO_ID[appointment.business];
      if (businessId) {
        const staffMembers = await User.find({ businessId, role: 'staff' }).select('email');
        const staffEmails = staffMembers.map((s) => s.email).filter(Boolean);
        await sendNewBookingEmail({ to: staffEmails, appointment });
      }
    } catch (notifyErr) {
      console.error('Failed to send new-booking notification emails:', notifyErr);
    }

    return res.status(201).json({ success: true, appointment: formatAppointment(appointment) });
  } catch (err) {
    console.error('createAppointment error:', err);
    return res.status(500).json({ success: false, message: 'Failed to create appointment' });
  }
}

// ---------------------------------------------------------------------------
// Staff-scoped endpoints — everything below is filtered to the logged-in
// staff member's own name, resolved server-side from their user id (never
// trust a name sent from the frontend for this kind of filtering).
// ---------------------------------------------------------------------------

async function getCurrentStaffName(req) {
  const user = await User.findById(req.user.id);
  return user?.name || null;
}

// "10:30 AM" -> minutes since midnight
function timeToMinutes(timeStr) {
  const match = timeStr && timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return null;
  const [, h, m, period] = match;
  let hours = parseInt(h, 10) % 12;
  if (period.toUpperCase() === 'PM') hours += 12;
  return hours * 60 + parseInt(m, 10);
}

// minutes since midnight -> "11:15 AM"
function minutesToTime(totalMinutes) {
  const h24 = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

// PATCH /api/appointments/:id/reschedule
// Customer picks a new date/time. Preserves the original service duration,
// resets to unassigned ("finding a barber") since the previously assigned
// barber may not be free at the new time, and clears decline history since
// staff who couldn't do the old slot might well be free for the new one.
async function rescheduleAppointment(req, res) {
  try {
    const { id } = req.params;
    const { date, startTime } = req.body;

    if (!date || !startTime) {
      return res.status(400).json({ success: false, message: 'date and startTime are required' });
    }

    const appointment = await Appointment.findById(id);
    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }
    if (appointment.userId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'You do not have access to this appointment' });
    }
    if (appointment.status === 'cancelled' || appointment.status === 'completed') {
      return res.status(400).json({ success: false, message: 'This appointment can no longer be rescheduled' });
    }

    const oldStart = timeToMinutes(appointment.startTime);
    const oldEnd = timeToMinutes(appointment.endTime);
    const durationMinutes = oldStart != null && oldEnd != null ? oldEnd - oldStart : 20;

    const newStartMinutes = timeToMinutes(startTime);
    if (newStartMinutes == null) {
      return res.status(400).json({ success: false, message: 'Invalid startTime format' });
    }
    const newEndTime = minutesToTime(newStartMinutes + durationMinutes);

    appointment.date = date;
    appointment.startTime = startTime;
    appointment.endTime = newEndTime;
    appointment.providerName = null;
    appointment.status = 'pending';
    appointment.declinedBy = [];
    await appointment.save();

    try {
      const businessId = BUSINESS_DISPLAY_TO_ID[appointment.business];
      if (businessId) {
        const staffMembers = await User.find({ businessId, role: 'staff' }).select('email');
        const staffEmails = staffMembers.map((s) => s.email).filter(Boolean);
        await sendNewBookingEmail({ to: staffEmails, appointment });
      }
    } catch (notifyErr) {
      console.error('Failed to send reschedule notification emails:', notifyErr);
    }

    return res.status(200).json({ success: true, appointment: formatAppointment(appointment) });
  } catch (err) {
    console.error('rescheduleAppointment error:', err);
    return res.status(500).json({ success: false, message: 'Failed to reschedule appointment' });
  }
}

// GET /api/appointments/staff/requests
// Unassigned pending bookings — visible to EVERY available staff member at
// this business, since any of them can be the one to accept it (Uber-style).
async function getMyPendingRequests(req, res) {
  try {
    // Only fetch from today onward at the DB level — cheap first pass to
    // avoid pulling in bookings from days/weeks ago entirely.
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const appointments = await Appointment.find({
      business: 'Barbing Salon',
      providerName: null,
      status: 'pending',
      declinedBy: { $ne: req.user.id }, // hide requests THIS staff member already declined
      date: { $gte: startOfToday },
    }).sort({ date: 1, startTime: 1 });

    // Second pass, in-memory: for TODAY's bookings specifically, also drop
    // ones whose exact startTime has already passed — the DB query above
    // only filters by day, not time-of-day, since startTime is a separate
    // "10:30 AM" string, not part of the Date field.
    const now = new Date();
    const stillUpcoming = appointments.filter((a) => {
      const start = parseAppointmentDateTime(a.date, a.startTime);
      return !start || start.getTime() >= now.getTime();
    });

    const formatted = stillUpcoming.map((a) => ({
      id: a._id,
      client: a.customerName,
      phone: a.customerPhone,
      email: a.customerEmail,
      time: a.startTime,
      endTime: a.endTime,
      date: a.date,
      location: a.address,
      services: [a.service],
      price: a.amount,
      paymentMethod: a.paymentMethod,
      urgent: isStartingSoon(a),
    }));

    return res.status(200).json(formatted);
  } catch (err) {
    console.error('getMyPendingRequests error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load requests' });
  }
}

// GET /api/appointments/staff/schedule
// This staff member's confirmed/completed appointments for TODAY
async function getMySchedule(req, res) {
  try {
    const staffName = await getCurrentStaffName(req);
    if (!staffName) {
      return res.status(404).json({ success: false, message: 'Staff profile not found' });
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const appointments = await Appointment.find({
      business: 'Barbing Salon',
      providerName: staffName,
      status: { $in: ['confirmed', 'completed'] },
      date: { $gte: startOfDay, $lte: endOfDay },
    }).sort({ startTime: 1 });

    const formatted = appointments.map((a) => ({
      id: a._id,
      time: a.startTime,
      client: a.customerName,
      service: a.service,
      status: a.status === 'completed' ? 'completed' : isHappeningNow(a) ? 'in-progress' : 'upcoming',
    }));

    return res.status(200).json(formatted);
  } catch (err) {
    console.error('getMySchedule error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load schedule' });
  }
}

// PATCH /api/appointments/:id/accept
// Atomic "first to accept wins" claim — findOneAndUpdate with providerName:
// null as part of the filter means if two staff click Accept at the same
// moment, only the first write succeeds; the second gets result === null.
async function acceptAppointment(req, res) {
  try {
    const staffName = await getCurrentStaffName(req);
    if (!staffName) {
      return res.status(404).json({ success: false, message: 'Staff profile not found' });
    }

    const appointment = await Appointment.findOneAndUpdate(
      { _id: req.params.id, providerName: null, status: 'pending' },
      { providerName: staffName, status: 'confirmed' },
      { new: true }
    );

    if (!appointment) {
      // Either it never existed, or someone else already claimed it first.
      const stillExists = await Appointment.findById(req.params.id);
      if (!stillExists) {
        return res.status(404).json({ success: false, message: 'Appointment not found' });
      }
      return res.status(409).json({ success: false, message: 'This request has already been accepted by another staff member' });
    }

    return res.status(200).json({ success: true, appointment: formatAppointment(appointment) });
  } catch (err) {
    console.error('acceptAppointment error:', err);
    return res.status(500).json({ success: false, message: 'Failed to accept appointment' });
  }
}

// PATCH /api/appointments/:id/decline
// In the broadcast model, "decline" just means this one staff member isn't
// taking it — the request should stay open for everyone else. Right now this
// is a no-op success response so the frontend can remove it from that one
// staff member's own list; it does NOT cancel the booking for other staff.
// ASSUMPTION: if you want a genuine per-staff "hide this from me" behavior,
// the Appointment schema needs a `declinedBy: [ObjectId]` array — ask me to
// add that if staff are currently seeing declined requests reappear.
async function declineAppointment(req, res) {
  try {
    const appointment = await Appointment.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { declinedBy: req.user.id } }, // $addToSet avoids duplicate entries if clicked twice
      { new: true }
    );

    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }

    return res.status(200).json({ success: true, message: 'Request declined' });
  } catch (err) {
    console.error('declineAppointment error:', err);
    return res.status(500).json({ success: false, message: 'Failed to decline appointment' });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAppointment(a) {
  return {
    id: a._id,
    userId: a.userId,
    business: a.business,
    category: a.category,
    service: a.service,
    providerName: a.providerName,
    providerImage: a.providerImage,
    date: a.date,
    startTime: a.startTime,
    endTime: a.endTime,
    status: a.status,
    customerName: a.customerName,
    customerPhone: a.customerPhone,
    customerEmail: a.customerEmail,
    address: a.address,
    paymentMethod: a.paymentMethod,
    paymentReference: a.paymentReference,
    amount: a.amount,
  };
}

// "Urgent" = the appointment's start time is within the next 2 hours
function isStartingSoon(appointment) {
  const start = parseAppointmentDateTime(appointment.date, appointment.startTime);
  if (!start) return false;
  const diffMs = start.getTime() - Date.now();
  return diffMs >= 0 && diffMs <= 2 * 60 * 60 * 1000;
}

// "In progress" = right now falls between the appointment's start and end time
function isHappeningNow(appointment) {
  const start = parseAppointmentDateTime(appointment.date, appointment.startTime);
  const end = parseAppointmentDateTime(appointment.date, appointment.endTime);
  if (!start || !end) return false;
  const now = Date.now();
  return now >= start.getTime() && now <= end.getTime();
}

// Combines a stored Date (day only) with a "10:30 AM" string into one Date object
function parseAppointmentDateTime(date, timeStr) {
  const match = timeStr && timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return null;
  const [, h, m, period] = match;
  let hours = parseInt(h, 10) % 12;
  if (period.toUpperCase() === 'PM') hours += 12;

  const result = new Date(date);
  result.setHours(hours, parseInt(m, 10), 0, 0);
  return result;
}

module.exports = {
  getAppointments,
  cancelAppointment,
  rescheduleAppointment,
  getBusinessAppointments,
  createAppointment,
  getMyPendingRequests,
  getMySchedule,
  acceptAppointment,
  declineAppointment,
};