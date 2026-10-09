import { describe, test, expect } from "vitest";
import { cleanPersonnelDates } from "../../src/services/dateFields";

describe("cleanPersonnelDates", () => {
  test("placeholder employment dates become null, real ones stay", () => {
    const out = cleanPersonnelDates({
      last_lateral_movement_date: "N/A",
      lastPromotionDate: "-",
      new_station_date: "2020-01-02",
      first_service_date: "",
    });
    expect(out).toEqual({
      last_lateral_movement_date: null,
      lastPromotionDate: null,
      new_station_date: "2020-01-02",
      first_service_date: null,
    });
  });
  test("placeholder birthdate is left out so the stored one is kept", () => {
    expect(
      "birthdate" in cleanPersonnelDates({ birthdate: "N/A", name: "x" }),
    ).toBe(false);
    expect(cleanPersonnelDates({ birthdate: "1990-05-05" }).birthdate).toBe(
      "1990-05-05",
    );
  });
  test("does not mutate the input", () => {
    const p = { new_station_date: "N/A" };
    cleanPersonnelDates(p);
    expect(p.new_station_date).toBe("N/A");
  });
});
