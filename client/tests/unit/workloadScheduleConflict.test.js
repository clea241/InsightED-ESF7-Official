import { describe, test, expect } from "vitest";
import { findWorkloadScheduleConflict } from "../../src/pages/Workload.jsx";
import scheduleValidatorModule from "../../../server/utils/scheduleValidator.js";
const { validateWorkloadSchedules } = scheduleValidatorModule;

describe("findWorkloadScheduleConflict", () => {
  const teacher = {
    id: "PER-101",
    firstName: "Maria",
    lastName: "Santos",
  };

  test("(1) Back-to-back blocks do NOT conflict (open boundary: 08:00-08:45 and 08:45-09:30)", () => {
    const rows = [
      {
        id: "r1",
        subject: "FILIPINO",
        sectionId: "sec-1",
        sectionName: "Grade 1 Hope",
        startTime: "08:00",
        endTime: "08:45",
        days: ["M", "T", "W", "TH", "F"],
        term: "1st",
      },
      {
        id: "r2",
        subject: "ENGLISH",
        sectionId: "sec-1",
        sectionName: "Grade 1 Hope",
        startTime: "08:45",
        endTime: "09:30",
        days: ["M", "T", "W", "TH", "F"],
        term: "1st",
      },
    ];

    const result = findWorkloadScheduleConflict(rows, teacher, "1st");
    expect(result).toBeNull();
  });

  test("(2) Real overlap on the same day IS detected and reports teacher, day, and time ranges", () => {
    const rows = [
      {
        id: "r1",
        subject: "MATHEMATICS",
        sectionId: "sec-1",
        sectionName: "Grade 2 Love",
        startTime: "08:00",
        endTime: "09:00",
        days: ["M", "W", "F"],
        term: "1st",
      },
      {
        id: "r2",
        subject: "SCIENCE",
        sectionId: "sec-2",
        sectionName: "Grade 3 Faith",
        startTime: "08:30",
        endTime: "09:30",
        days: ["M", "W"],
        term: "1st",
      },
    ];

    const result = findWorkloadScheduleConflict(rows, teacher, "1st");
    expect(result).not.toBeNull();
    expect(result.hasConflict).toBe(true);
    expect(result.teacherName).toBe("Maria Santos");
    expect(result.conflictingDays).toBe("Mon, Wed");
    expect(result.message).toContain("Maria Santos");
    expect(result.message).toContain("Mon, Wed");
    expect(result.message).toContain("MATHEMATICS");
    expect(result.message).toContain("SCIENCE");
    expect(result.message).toContain("8:00 AM – 9:00 AM");
    expect(result.message).toContain("8:30 AM – 9:30 AM");
  });

  test("(3) Inconsistent time formats (7:30 vs 07:30, 1:00 PM vs 13:00) normalize to minutes", () => {
    const rows = [
      {
        id: "r1",
        subject: "FILIPINO",
        sectionId: "sec-1",
        startTime: "7:30",
        endTime: "8:30",
        days: ["M"],
        term: "1st",
      },
      {
        id: "r2",
        subject: "ENGLISH",
        sectionId: "sec-2",
        startTime: "08:30",
        endTime: "09:30",
        days: ["M"],
        term: "1st",
      },
      {
        id: "r3",
        subject: "MATH",
        sectionId: "sec-3",
        startTime: "1:00 PM",
        endTime: "2:00 PM",
        days: ["M"],
        term: "1st",
      },
      {
        id: "r4",
        subject: "SCIENCE",
        sectionId: "sec-4",
        startTime: "14:00",
        endTime: "15:00",
        days: ["M"],
        term: "1st",
      },
    ];

    const result = findWorkloadScheduleConflict(rows, teacher, "1st");
    expect(result).toBeNull();
  });

  test("(4) Overlapping time ranges on DIFFERENT days do NOT conflict", () => {
    const rows = [
      {
        id: "r1",
        subject: "FILIPINO",
        sectionId: "sec-1",
        startTime: "08:00",
        endTime: "09:00",
        days: ["M", "W", "F"],
        term: "1st",
      },
      {
        id: "r2",
        subject: "ENGLISH",
        sectionId: "sec-2",
        startTime: "08:00",
        endTime: "09:00",
        days: ["T", "TH"],
        term: "1st",
      },
    ];

    const result = findWorkloadScheduleConflict(rows, teacher, "1st");
    expect(result).toBeNull();
  });

  test("(5) Empty, null, or invalid times (TBD) do NOT flag false conflicts", () => {
    const rows = [
      {
        id: "r1",
        subject: "FILIPINO",
        sectionId: "sec-1",
        startTime: "08:00",
        endTime: "09:00",
        days: ["M"],
        term: "1st",
      },
      {
        id: "r2",
        subject: "NEW TASK",
        sectionId: "sec-2",
        startTime: "",
        endTime: "",
        days: ["M"],
        term: "1st",
      },
      {
        id: "r3",
        subject: "TBD CLASS",
        sectionId: "sec-3",
        startTime: "TBD",
        endTime: "TBD",
        days: ["M"],
        term: "1st",
      },
    ];

    const result = findWorkloadScheduleConflict(rows, teacher, "1st");
    expect(result).toBeNull();
  });

  test("(6) Zero duration or inverted times (08:00-08:00) do NOT flag false overlaps", () => {
    const rows = [
      {
        id: "r1",
        subject: "FILIPINO",
        sectionId: "sec-1",
        startTime: "08:00",
        endTime: "09:00",
        days: ["M"],
        term: "1st",
      },
      {
        id: "r2",
        subject: "ZERO DURATION",
        sectionId: "sec-2",
        startTime: "08:30",
        endTime: "08:30",
        days: ["M"],
        term: "1st",
      },
    ];

    const result = findWorkloadScheduleConflict(rows, teacher, "1st");
    expect(result).toBeNull();
  });

  test("(7) Stale duplicate rows in state do NOT conflict against each other", () => {
    const rows = [
      {
        id: "r1",
        subject: "FILIPINO",
        sectionId: "sec-1",
        startTime: "08:00",
        endTime: "09:00",
        days: ["M"],
        term: "1st",
      },
      {
        id: "r1_dup_from_draft",
        subject: "FILIPINO",
        sectionId: "sec-1",
        startTime: "08:00",
        endTime: "09:00",
        days: ["M"],
        term: "1st",
      },
    ];

    const result = findWorkloadScheduleConflict(rows, teacher, "1st");
    expect(result).toBeNull();
  });

  test("(8) Multigrade co-running classes for different grade levels do NOT conflict", () => {
    const rows = [
      {
        id: "r1",
        subject: "MATHEMATICS",
        sectionId: "sec-multi",
        sectionName: "GRADE 1 - GRADE 2 COMBINED",
        subjectGradeLevel: "Grade 1",
        startTime: "08:00",
        endTime: "08:50",
        days: ["M", "T", "W", "TH", "F"],
        term: "1st",
      },
      {
        id: "r2",
        subject: "MATHEMATICS",
        sectionId: "sec-multi",
        sectionName: "GRADE 1 - GRADE 2 COMBINED",
        subjectGradeLevel: "Grade 2",
        startTime: "08:00",
        endTime: "08:50",
        days: ["M", "T", "W", "TH", "F"],
        term: "1st",
      },
    ];

    const result = findWorkloadScheduleConflict(rows, teacher, "1st");
    expect(result).toBeNull();
  });

  test("(9) ADVISORY and HGP co-existence does NOT conflict", () => {
    const rows = [
      {
        id: "r1",
        subject: "ADVISORY",
        sectionId: "sec-1",
        startTime: "07:30",
        endTime: "08:30",
        days: ["M", "T", "W", "TH", "F"],
        term: "1st",
      },
      {
        id: "r2",
        subject: "HGP",
        sectionId: "sec-1",
        startTime: "07:30",
        endTime: "08:30",
        days: ["F"],
        term: "1st",
      },
    ];

    const result = findWorkloadScheduleConflict(rows, teacher, "1st");
    expect(result).toBeNull();
  });

  test("(10) Term isolation: 2nd Term rows do NOT conflict with 1st Term rows", () => {
    const rows = [
      {
        id: "r1",
        subject: "PHYSICAL EDUCATION",
        sectionId: "sec-1",
        startTime: "08:00",
        endTime: "09:00",
        days: ["M"],
        term: "1st",
      },
      {
        id: "r2",
        subject: "HEALTH",
        sectionId: "sec-1",
        startTime: "08:00",
        endTime: "09:00",
        days: ["M"],
        term: "2nd",
      },
    ];

    const result1st = findWorkloadScheduleConflict(rows, teacher, "1st");
    expect(result1st).toBeNull();

    const result2nd = findWorkloadScheduleConflict(rows, teacher, "2nd");
    expect(result2nd).toBeNull();
  });

  test("(11) Teacher scoping: rows belonging to another teacher do NOT conflict", () => {
    const rows = [
      {
        id: "r1",
        personnelId: "PER-101",
        subject: "ENGLISH",
        startTime: "08:00",
        endTime: "09:00",
        days: ["M"],
        term: "1st",
      },
      {
        id: "r2",
        personnelId: "PER-999",
        subject: "MATH",
        startTime: "08:00",
        endTime: "09:00",
        days: ["M"],
        term: "1st",
      },
    ];

    const result = findWorkloadScheduleConflict(rows, teacher, "1st");
    expect(result).toBeNull();
  });

  describe("MAEROSE ACUPIDO Friday SCIENCE vs HGP Conflict Lifecycle", () => {
    const acupidoTeacher = {
      id: "PER-ACUPIDO",
      firstName: "MAEROSE",
      lastName: "ACUPIDO",
    };

    const initialCollidingRows = [
      {
        id: "row-science-1",
        personnelId: "PER-ACUPIDO",
        subject: "SCIENCE",
        sectionId: "sec-diamond",
        sectionName: "Grade 6 Diamond",
        startTime: "07:30",
        endTime: "08:30",
        days: ["F"],
        term: "1st",
      },
      {
        id: "row-hgp-1",
        personnelId: "PER-ACUPIDO",
        subject: "HGP",
        sectionId: "sec-diamond",
        sectionName: "Grade 6 Diamond",
        startTime: "07:30",
        endTime: "08:30",
        days: ["F"],
        term: "1st",
      },
    ];

    test("(12) Initial state flags real schedule conflict on Friday for MAEROSE ACUPIDO", () => {
      const conflict = findWorkloadScheduleConflict(
        initialCollidingRows,
        acupidoTeacher,
        "1st",
      );
      expect(conflict).not.toBeNull();
      expect(conflict.hasConflict).toBe(true);
      expect(conflict.teacherName).toBe("MAEROSE ACUPIDO");
      expect(conflict.conflictingDays).toBe("Fri");
      expect(conflict.message).toContain("SCIENCE");
      expect(conflict.message).toContain("HGP");
      expect(conflict.message).toContain("7:30 AM – 8:30 AM");

      // Server-side validator also rejects
      const serverResult = validateWorkloadSchedules(initialCollidingRows);
      expect(serverResult).not.toBeNull();
      expect(serverResult.type).toBe("conflict");
      expect(serverResult.error).toContain("Schedule conflict");
    });

    test("(13) Moving HGP to Friday 8:30 AM – 9:30 AM resolves conflict immediately", () => {
      const editedRows = [
        initialCollidingRows[0], // SCIENCE 07:30 - 08:30
        {
          ...initialCollidingRows[1], // HGP moved
          startTime: "08:30",
          endTime: "09:30",
        },
      ];

      const conflict = findWorkloadScheduleConflict(
        editedRows,
        acupidoTeacher,
        "1st",
      );
      expect(conflict).toBeNull();

      const serverResult = validateWorkloadSchedules(editedRows);
      expect(serverResult).toBeNull();
    });

    test("(14) Moving HGP to Thursday (same time 7:30 AM – 8:30 AM) resolves Friday conflict", () => {
      const editedRows = [
        initialCollidingRows[0], // SCIENCE on Friday
        {
          ...initialCollidingRows[1],
          days: ["TH"],
          daySchedule: "TH",
        },
      ];

      const conflict = findWorkloadScheduleConflict(
        editedRows,
        acupidoTeacher,
        "1st",
      );
      expect(conflict).toBeNull();

      const serverResult = validateWorkloadSchedules(editedRows);
      expect(serverResult).toBeNull();
    });

    test("(15) Splitting multi-day SCIENCE and moving Friday slot to 8:30 AM – 9:30 AM resolves conflict", () => {
      // SCIENCE originally M-F 07:30-08:30, HGP Friday 07:30-08:30
      // After splitting Friday cell:
      const rowsAfterSplit = [
        {
          id: "row-science-1",
          subject: "SCIENCE",
          days: ["M", "T", "W", "TH"],
          daySchedule: "M,T,W,TH",
          startTime: "07:30",
          endTime: "08:30",
          term: "1st",
        },
        {
          id: "row-science-fri-split",
          subject: "SCIENCE",
          days: ["F"],
          daySchedule: "F",
          startTime: "08:30",
          endTime: "09:30",
          term: "1st",
        },
        {
          id: "row-hgp-1",
          subject: "HGP",
          days: ["F"],
          daySchedule: "F",
          startTime: "07:30",
          endTime: "08:30",
          term: "1st",
        },
      ];

      const conflict = findWorkloadScheduleConflict(
        rowsAfterSplit,
        acupidoTeacher,
        "1st",
      );
      expect(conflict).toBeNull();

      const serverResult = validateWorkloadSchedules(rowsAfterSplit);
      expect(serverResult).toBeNull();
    });

    test("(16) Deleting HGP row resolves conflict immediately", () => {
      const rowsAfterDelete = [initialCollidingRows[0]]; // Only SCIENCE remains

      const conflict = findWorkloadScheduleConflict(
        rowsAfterDelete,
        acupidoTeacher,
        "1st",
      );
      expect(conflict).toBeNull();

      const serverResult = validateWorkloadSchedules(rowsAfterDelete);
      expect(serverResult).toBeNull();
    });

    test("(17) ADVISORY nested co-existence is permitted server-side and client-side", () => {
      const advisoryAndScience = [
        {
          id: "row-adv",
          subject: "ADVISORY",
          startTime: "07:30",
          endTime: "08:30",
          days: ["F"],
          term: "1st",
        },
        {
          id: "row-sci",
          subject: "SCIENCE",
          startTime: "07:30",
          endTime: "08:30",
          days: ["F"],
          term: "1st",
        },
      ];

      expect(
        findWorkloadScheduleConflict(advisoryAndScience, acupidoTeacher, "1st"),
      ).toBeNull();
      expect(validateWorkloadSchedules(advisoryAndScience)).toBeNull();
    });
  });
});
