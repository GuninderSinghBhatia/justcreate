import "server-only";

/** Demo visitors are real (throwaway) accounts with an address on this unroutable domain. */
export const DEMO_DOMAIN = "demo.justcreate.invalid";
export const DEMO_BOARD = "Demo board";
/** A demo account may start this many AI generations; saving and uploading are off. */
export const DEMO_GENERATIONS = 2;
export const DEMO_REFUSAL = "This is a demo board. Sign in to save your own references.";

export const isDemoUser = (user: { email?: string }) => Boolean(user.email?.endsWith(`@${DEMO_DOMAIN}`));
