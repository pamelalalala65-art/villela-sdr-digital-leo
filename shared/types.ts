export type * from "../drizzle/schema";
export * from "./_core/errors";

export const MEETING_STATUSES = ["AGENDADA", "REALIZADA", "NO_SHOW", "CANCELADA"] as const;
export type MeetingStatusValue = (typeof MEETING_STATUSES)[number];
export const CLIENT_STATUSES = ["QUENTE", "MÉDIA", "FRIA"] as const;
export type ClientStatusValue = (typeof CLIENT_STATUSES)[number];
export const APP_ROLES = ["user", "sdr", "gestao", "admin", "master"] as const;
export type AppRoleValue = (typeof APP_ROLES)[number];
