// ---------------------------------------------------------------------------
// booking-notify — confirmation and reminder emails
//
// Runs on a schedule (see supabase/cron.sql). Each pass does two things:
//   1. emails a confirmation for any booking that has not had one
//   2. emails a reminder for any booking starting inside the reminder window
// Both are stamped on the booking row, so a booking is never emailed twice
// even if the function runs late, twice, or overlapping itself.
//
// Deploy:  supabase functions deploy booking-notify --no-verify-jwt
// Secrets: supabase secrets set RESEND_API_KEY=... MAIL_FROM="Three Cities Social <club@yourdomain.com>" APP_URL=https://thesocialclubconsultant.com/book/
// ---------------------------------------------------------------------------
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const MAIL_FROM = Deno.env.get('MAIL_FROM') ?? 'Three Cities Social <club@example.com>';
const APP_URL = Deno.env.get('APP_URL') ?? 'https://thesocialclubconsultant.com/book/';

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

type Booking = {
  id: string;
  starts_at: string;
  ends_at: string;
  room_name: string;
  title: string | null;
  member_email: string;
  member_name: string | null;
};

function fmt(iso: string, tz: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, weekday: 'long', day: 'numeric', month: 'long',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date(iso));
}

function fmtTime(iso: string, tz: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date(iso));
}

function shell(club: string, heading: string, lead: string, b: Booking, tz: string, support: string) {
  return `<!doctype html><html><body style="margin:0;background:#EDE7DB;font-family:'Nunito Sans',Avenir,'Segoe UI',sans-serif;color:#35302C;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EDE7DB;padding:28px 14px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FBF9F4;border:1px solid rgba(53,48,44,.12);border-radius:14px;">
        <tr><td style="padding:28px 28px 6px;">
          <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#5C554E;">${club}</div>
          <h1 style="font-family:Georgia,serif;font-size:24px;font-weight:700;margin:8px 0 0;">${heading}</h1>
          <p style="font-size:15px;color:#5C554E;line-height:1.6;margin:10px 0 0;">${lead}</p>
        </td></tr>
        <tr><td style="padding:18px 28px 4px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EDE7DB;border-radius:12px;">
            <tr><td style="padding:18px 20px;">
              <div style="font-family:Georgia,serif;font-size:19px;font-weight:600;">${b.room_name}</div>
              <div style="font-size:15px;color:#35302C;margin-top:5px;">${fmt(b.starts_at, tz)} – ${fmtTime(b.ends_at, tz)}</div>
              ${b.title ? `<div style="font-size:14px;color:#5C554E;margin-top:5px;">${b.title}</div>` : ''}
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:20px 28px 28px;">
          <a href="${APP_URL}" style="display:inline-block;background:#984929;color:#FBF9F4;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:999px;">View or cancel your booking</a>
          <p style="font-size:12px;color:#5C554E;line-height:1.6;margin:18px 0 0;">
            Plans changed? Cancel in the app so someone else can use the room.<br>Questions: <a href="mailto:${support}" style="color:#427179;">${support}</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) {
    console.log(`[dry run] would email ${to}: ${subject}`);
    return true;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: MAIL_FROM, to, subject, html }),
  });
  if (!res.ok) {
    console.error(`email to ${to} failed: ${res.status} ${await res.text()}`);
    return false;
  }
  return true;
}

Deno.serve(async () => {
  const { data: settings } = await db.from('settings').select('*').single();
  const tz = settings?.timezone ?? 'America/New_York';
  const club = settings?.club_name ?? 'The club';
  const support = settings?.support_email ?? 'hello@example.com';
  const lead = settings?.reminder_minutes ?? 60;

  const now = new Date();
  const sent = { confirmations: 0, reminders: 0, failed: 0 };

  // --- Confirmations -------------------------------------------------------
  const { data: fresh } = await db
    .from('bookings_detailed')
    .select('*')
    .eq('status', 'confirmed')
    .gte('starts_at', now.toISOString())
    .is('confirmation_sent_at', null)
    .limit(100);

  for (const b of (fresh ?? []) as Booking[]) {
    const ok = await sendEmail(
      b.member_email,
      `Booked: ${b.room_name}, ${fmt(b.starts_at, tz)}`,
      shell(club, "You're booked in", `Your room is held. Here are the details.`, b, tz, support));
    if (ok) {
      await db.from('bookings').update({ confirmation_sent_at: new Date().toISOString() }).eq('id', b.id);
      sent.confirmations++;
    } else sent.failed++;
  }

  // --- Reminders -----------------------------------------------------------
  const horizon = new Date(now.getTime() + lead * 60_000).toISOString();
  const { data: soon } = await db
    .from('bookings_detailed')
    .select('*')
    .eq('status', 'confirmed')
    .gte('starts_at', now.toISOString())
    .lte('starts_at', horizon)
    .is('reminder_sent_at', null)
    .limit(100);

  for (const b of (soon ?? []) as Booking[]) {
    const mins = Math.max(1, Math.round((new Date(b.starts_at).getTime() - now.getTime()) / 60_000));
    const ok = await sendEmail(
      b.member_email,
      `Starting soon: ${b.room_name} at ${fmtTime(b.starts_at, tz)}`,
      shell(club, 'Your room is ready shortly',
        `${b.member_name ? b.member_name.split(' ')[0] + ', y' : 'Y'}our booking starts in about ${mins} minutes.`,
        b, tz, support));
    if (ok) {
      await db.from('bookings').update({ reminder_sent_at: new Date().toISOString() }).eq('id', b.id);
      sent.reminders++;
    } else sent.failed++;
  }

  console.log('booking-notify', sent);
  return new Response(JSON.stringify(sent), { headers: { 'Content-Type': 'application/json' } });
});
