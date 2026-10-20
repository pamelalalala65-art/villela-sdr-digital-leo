export type MeetingCompletion = {
  status: string;
  quickMeeting?: boolean | null;
};

export function isCompletedQuickMeeting(meeting: MeetingCompletion) {
  return meeting.status === "REALIZADA" && Boolean(meeting.quickMeeting);
}

export function isStandardCompletedMeeting(meeting: MeetingCompletion) {
  return meeting.status === "REALIZADA" && !meeting.quickMeeting;
}

export type ProjurisRankingMetrics = {
  realized: number;
  quickMeetings: number;
  specialMeetings: number;
  scheduled: number;
  noShow: number;
  name?: string | null;
  email?: string | null;
};

export function compareProjurisRankingRows(a: ProjurisRankingMetrics, b: ProjurisRankingMetrics) {
  return b.realized - a.realized
    || b.quickMeetings - a.quickMeetings
    || b.specialMeetings - a.specialMeetings
    || b.scheduled - a.scheduled
    || a.noShow - b.noShow
    || String(a.name || a.email || "").localeCompare(String(b.name || b.email || ""), "pt-BR");
}
