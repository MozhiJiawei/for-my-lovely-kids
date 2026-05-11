const parentPasscodeStorageKey = "redFlowerGarden.parentPasscode";
const parentUnlockUntilStorageKey = "redFlowerGarden.parentUnlockUntil";
const parentUnlockDurationMs = 10 * 60 * 1000;

export function hasParentPasscode(): boolean {
  return readStorageString(parentPasscodeStorageKey)?.length === 6;
}

export function isValidParentPasscode(value: string): boolean {
  return /^\d{6}$/.test(value);
}

export function isParentControlUnlocked(now = Date.now()): boolean {
  return readStorageNumber(parentUnlockUntilStorageKey) > now;
}

export function saveParentPasscode(passcode: string): void {
  if (!isValidParentPasscode(passcode)) {
    throw new Error("Parent passcode must be 6 digits.");
  }

  writeStorageString(parentPasscodeStorageKey, passcode);
  unlockParentControl();
}

export function validateParentPasscode(passcode: string): boolean {
  const savedPasscode = readStorageString(parentPasscodeStorageKey);

  if (savedPasscode !== passcode) {
    return false;
  }

  unlockParentControl();
  return true;
}

function unlockParentControl(): void {
  writeStorageNumber(parentUnlockUntilStorageKey, Date.now() + parentUnlockDurationMs);
}

function readStorageString(key: string): string | undefined {
  try {
    const value = wx.getStorageSync(key) as unknown;

    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}

function readStorageNumber(key: string): number {
  try {
    const value = wx.getStorageSync(key) as unknown;

    return typeof value === "number" ? value : 0;
  } catch {
    return 0;
  }
}

function writeStorageString(key: string, value: string): void {
  try {
    wx.setStorageSync(key, value);
  } catch {
    // Parent control falls back to locked behavior if local storage is unavailable.
  }
}

function writeStorageNumber(key: string, value: number): void {
  try {
    wx.setStorageSync(key, value);
  } catch {
    // Parent control falls back to locked behavior if local storage is unavailable.
  }
}
