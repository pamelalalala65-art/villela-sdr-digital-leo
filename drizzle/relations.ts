import { relations } from "drizzle-orm";
import { meetingHistory, meetings, sectors, userSectors, users } from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
  sdrMeetings: many(meetings, { relationName: "sdr" }),
  responsibleMeetings: many(meetings, { relationName: "responsible" }),
  history: many(meetingHistory),
  sectors: many(userSectors),
}));

export const meetingsRelations = relations(meetings, ({ one, many }) => ({
  sdr: one(users, { fields: [meetings.sdrId], references: [users.id], relationName: "sdr" }),
  responsible: one(users, { fields: [meetings.responsibleId], references: [users.id], relationName: "responsible" }),
  history: many(meetingHistory),
  sector: one(sectors, { fields: [meetings.sectorId], references: [sectors.id] }),
}));

export const meetingHistoryRelations = relations(meetingHistory, ({ one }) => ({
  meeting: one(meetings, { fields: [meetingHistory.meetingId], references: [meetings.id] }),
  user: one(users, { fields: [meetingHistory.userId], references: [users.id] }),
  sector: one(sectors, { fields: [meetingHistory.sectorId], references: [sectors.id] }),
}));

export const sectorsRelations = relations(sectors, ({ many }) => ({
  users: many(userSectors),
  meetings: many(meetings),
  history: many(meetingHistory),
}));

export const userSectorsRelations = relations(userSectors, ({ one }) => ({
  user: one(users, { fields: [userSectors.userId], references: [users.id] }),
  sector: one(sectors, { fields: [userSectors.sectorId], references: [sectors.id] }),
}));
