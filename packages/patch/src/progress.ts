const PERCENT = /(\d+(?:\.\d+)?)\s*%/;

export const parseDepotPercent = (line: string): number | undefined => {
  const match = line.match(PERCENT);
  if (match?.[1] === undefined) {
    return undefined;
  }
  const value = Number(match[1]) / 100;
  if (!Number.isFinite(value)) {
    return undefined;
  }
  return Math.min(1, Math.max(0, value));
};

export const isSteamGuardPrompt = (line: string): boolean =>
  line.includes("This account is protected by Steam Guard.") ||
  line.includes("Please enter your 2 factor auth code") ||
  line.includes("Please enter the authentication code sent to your email");
