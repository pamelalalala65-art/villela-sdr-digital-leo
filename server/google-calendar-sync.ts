import { getGoogleCalendarConnectionSecret, getMeetingById, updateMeetingGoogle, saveGoogleCalendarConnection, getLawyerGoogleConnectionSecret, saveLawyerGoogleConnection } from "./db";
import { decryptGoogleToken, encryptGoogleToken } from "./google-calendar";
import { ENV } from "./_core/env";

type CalendarEvent = {
  id?: string;
  htmlLink?: string;
  hangoutLink?: string;
  attendees?: Array<{ email?: string }>;
  conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> };
};

function eventTime(date: string, time: string) {
  return `${String(date).slice(0, 10)}T${String(time).slice(0, 5)}:00-03:00`;
}
function eventEndTime(date: string, time: string) {
  const [hours, minutes] = String(time).slice(0, 5).split(":").map(Number);
  const total = hours * 60 + minutes + 60;
  const nextDate = new Date(`${String(date).slice(0, 10)}T00:00:00-03:00`);
  nextDate.setDate(nextDate.getDate() + Math.floor(total / 1440));
  const day = nextDate.toISOString().slice(0, 10);
  return eventTime(day, `${String(Math.floor((total % 1440) / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`);
}
function meetLink(event: CalendarEvent) {
  return event.hangoutLink || event.conferenceData?.entryPoints?.find(entry => entry.entryPointType === "video")?.uri || null;
}
async function refreshAccessToken(connection: any) {
  const valid = connection.accessTokenCiphertext && connection.accessTokenExpiresAt && new Date(connection.accessTokenExpiresAt).getTime() > Date.now() + 60_000;
  if (valid) return decryptGoogleToken(connection.accessTokenCiphertext);
  const refreshToken = decryptGoogleToken(connection.refreshTokenCiphertext);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: ENV.googleClientId, client_secret: ENV.googleClientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  if (!response.ok) throw new Error(`Google token refresh failed (${response.status})`);
  const token = await response.json() as { access_token?: string; expires_in?: number };
  if (!token.access_token) throw new Error("Google não retornou um access token válido.");
  const payload = { googleAccountEmail: connection.googleAccountEmail, refreshTokenCiphertext: connection.refreshTokenCiphertext, accessTokenCiphertext: encryptGoogleToken(token.access_token), accessTokenExpiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null, scope: connection.scope };
  if (connection.lawyerId) await saveLawyerGoogleConnection({ lawyerId: connection.lawyerId, ...payload });
  else await saveGoogleCalendarConnection({ userId: connection.userId, ...payload });
  return token.access_token;
}
async function calendarRequest(token: string, path: string, method: string, body?: unknown) {
  const response = await fetch(`https://www.googleapis.com/calendar/v3/${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Google Calendar ${method} ${response.status}: ${payload?.error?.message || "erro desconhecido"}`);
  return payload as CalendarEvent;
}

export async function syncMeetingToGoogle(meetingId: number, userId: number) {
  const row = await getMeetingById(meetingId);
  if (!row) throw new Error("Reunião não encontrada.");
  const connection = row.meeting.calendarOwner === "LAWYER" && row.meeting.lawyerId ? await getLawyerGoogleConnectionSecret(row.meeting.lawyerId) : await getGoogleCalendarConnectionSecret(userId);
  if (!connection) {
    await updateMeetingGoogle(meetingId, { googleCalendarStatus: "NOT_CONNECTED", googleSyncError: null });
    return { status: "NOT_CONNECTED" as const };
  }
  await updateMeetingGoogle(meetingId, { googleCalendarStatus: "PENDING", googleSyncError: null });
  try {
    const token = await refreshAccessToken(connection);
    const closerEmail = row.meeting.lawyerEmail?.trim().toLowerCase() || null;
    const attendees = closerEmail ? [{ email: closerEmail }] : undefined;
    const start = eventTime(String(row.meeting.date), String(row.meeting.time));
    const end = eventEndTime(String(row.meeting.date), String(row.meeting.time));
    const description = [
      `EMPRESA: ${row.meeting.companyName}`,
      `CNPJ/CPF: ${row.meeting.cnpj}`,
      `CONTATO: ${row.meeting.contactName}`,
      `TELEFONE: ${row.meeting.phone}`,
      `SDR: ${row.sdr?.name || row.sdr?.email || "Não informado"}`,
      `E-MAIL DO CLOSER: ${closerEmail || "Não informado"}`,
      row.meeting.notes ? `OBSERVAÇÕES: ${row.meeting.notes}` : "",
      `SISTEMA: Villela SDR`,
    ].filter(Boolean).join("\n");
    const event = {
      summary: `Reunião - ${row.meeting.companyName}`,
      description,
      start: { dateTime: start, timeZone: "America/Sao_Paulo" },
      end: { dateTime: end, timeZone: "America/Sao_Paulo" },
      attendees: attendees || [],
      ...(row.meeting.googleCalendarEventId ? {} : { conferenceData: { createRequest: { requestId: `villela-meet-${meetingId}`, conferenceSolutionKey: { type: "hangoutsMeet" } } } }),
    };
    const result = row.meeting.googleCalendarEventId
      ? await calendarRequest(token, `calendars/primary/events/${encodeURIComponent(row.meeting.googleCalendarEventId)}?sendUpdates=all`, "PATCH", event)
      : await calendarRequest(token, "calendars/primary/events?conferenceDataVersion=1&sendUpdates=all", "POST", event);
    const link = meetLink(result) || row.meeting.googleMeetLink || null;
    const inviteConfirmed = Boolean(closerEmail && result.attendees?.some(attendee => attendee.email?.toLowerCase() === closerEmail));
    await updateMeetingGoogle(meetingId, {
      googleCalendarEventId: result.id || row.meeting.googleCalendarEventId,
      googleMeetLink: link,
      googleCalendarStatus: "SYNCED",
      googleSyncError: null,
      googleInviteSent: inviteConfirmed,
      googleInviteSentAt: inviteConfirmed ? new Date() : null,
      googleCalendarSyncedAt: new Date(),
      googleMeetCreatedAt: link ? (row.meeting.googleMeetCreatedAt || new Date()) : null,
      googleCalendarEventUrl: result.htmlLink || null,
      googleCalendarEventHtmlLink: result.htmlLink || null,
    });
    return { status: "SYNCED" as const, eventId: result.id, meetLink: link, inviteSent: inviteConfirmed };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida na sincronização Google.";
    await updateMeetingGoogle(meetingId, { googleCalendarStatus: "ERROR", googleSyncError: message });
    return { status: "ERROR" as const, error: message };
  }
}
