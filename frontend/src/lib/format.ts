import dayjs from "dayjs";

/**
 * Formats an ISO date string into a readable format.
 * Example output: "Thu, 10 Dec 2026 · 14:00"
 */
export const fmt = (iso: string): string => {
  return dayjs(iso).format("ddd, D MMM YYYY · HH:mm");
};