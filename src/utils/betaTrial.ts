import { isDeveloperMode } from "./cache";

const BETA_TRIAL_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 dni

export interface BetaTrialStatus {
  isExpired: boolean;
  remainingMs: number;
  startTime: number | null;
  isDeveloper: boolean;
  tamperDetected?: boolean;
}

const STORAGE_KEY_START = "aura_beta_start_time_v2";
const STORAGE_KEY_LAST_SEEN = "aura_beta_last_seen";

/**
 * Checks the status of the 30-day Beta Test for public web users.
 * Bypasses trial restrictions if in Developer Mode (localhost or native APK).
 * Includes anti-tamper logic against system clock manipulation.
 */
export function checkBetaTrialStatus(): BetaTrialStatus {
  const isDev = isDeveloperMode();

  if (isDev) {
    return {
      isExpired: false,
      remainingMs: Infinity,
      startTime: Date.now(),
      isDeveloper: true,
      tamperDetected: false,
    };
  }

  const now = Date.now();
  let startTime: number;
  let tamperDetected = false;

  try {
    const storedStart = localStorage.getItem(STORAGE_KEY_START);
    const storedLastSeen = localStorage.getItem(STORAGE_KEY_LAST_SEEN);

    if (storedLastSeen) {
      const lastSeen = parseInt(storedLastSeen, 10);

      if (!isNaN(lastSeen) && now < lastSeen - 60000) {
        // Clock tampering detected (system clock set backwards)
        tamperDetected = true;
      }
    }

    if (!storedStart) {
      startTime = now;
      localStorage.setItem(STORAGE_KEY_START, String(startTime));
    } else {
      startTime = parseInt(storedStart, 10);

      if (isNaN(startTime)) {
        startTime = now;
        localStorage.setItem(STORAGE_KEY_START, String(startTime));
      }
    }

    localStorage.setItem(STORAGE_KEY_LAST_SEEN, String(now));
  } catch (e) {
    startTime = now;
  }

  const elapsed = now - startTime;
  const remainingMs = Math.max(0, BETA_TRIAL_DURATION_MS - elapsed);
  const isExpired = tamperDetected || remainingMs <= 0;

  return {
    isExpired,
    remainingMs,
    startTime,
    isDeveloper: false,
    tamperDetected,
  };
}
