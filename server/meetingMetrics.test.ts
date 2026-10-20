import { describe, expect, it } from "vitest";
import { compareProjurisRankingRows, isCompletedQuickMeeting, isStandardCompletedMeeting } from "./meetingMetrics";

describe("classificação de reuniões relâmpago", () => {
  it("conta como relâmpago apenas depois de confirmada como REALIZADA", () => {
    expect(isCompletedQuickMeeting({ status: "REALIZADA", quickMeeting: true })).toBe(true);
    expect(isCompletedQuickMeeting({ status: "AGENDADA", quickMeeting: true })).toBe(false);
    expect(isCompletedQuickMeeting({ status: "NO_SHOW", quickMeeting: true })).toBe(false);
    expect(isCompletedQuickMeeting({ status: "REALIZADA", quickMeeting: false })).toBe(false);
  });

  it("exclui a relâmpago do contador de reuniões realizadas normais", () => {
    expect(isStandardCompletedMeeting({ status: "REALIZADA", quickMeeting: false })).toBe(true);
    expect(isStandardCompletedMeeting({ status: "REALIZADA", quickMeeting: true })).toBe(false);
    expect(isStandardCompletedMeeting({ status: "AGENDADA", quickMeeting: false })).toBe(false);
  });

  it("ordena Projuris por realizadas, relâmpago, PGFN e pelos desempates existentes", () => {
    const rows = [
      { name: "PGFN menor", realized: 1, quickMeetings: 2, specialMeetings: 0, scheduled: 5, noShow: 1 },
      { name: "Mais PGFN", realized: 1, quickMeetings: 2, specialMeetings: 1, scheduled: 5, noShow: 1 },
      { name: "Mais relâmpago", realized: 1, quickMeetings: 3, specialMeetings: 0, scheduled: 1, noShow: 5 },
      { name: "Mais realizadas", realized: 2, quickMeetings: 0, specialMeetings: 0, scheduled: 2, noShow: 0 },
      { name: "Mais agendadas", realized: 1, quickMeetings: 2, specialMeetings: 1, scheduled: 6, noShow: 4 },
      { name: "Menos no-show", realized: 1, quickMeetings: 2, specialMeetings: 1, scheduled: 5, noShow: 0 },
    ];

    expect(rows.sort(compareProjurisRankingRows).map(row => row.name)).toEqual([
      "Mais realizadas",
      "Mais relâmpago",
      "Mais agendadas",
      "Menos no-show",
      "Mais PGFN",
      "PGFN menor",
    ]);
  });
});
