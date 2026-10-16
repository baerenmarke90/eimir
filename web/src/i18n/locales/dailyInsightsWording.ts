/*
 * Copy-review rules for the Pro insights (#1151), kept beside the copy they
 * govern. Tests assert that no rendered text matches these patterns.
 */

/** Wording that would distinguish hidden partner values from missing ones. */
export const HIDDEN_STATE_WORDING =
  /noch kein|nicht eingecheckt|hat nichts geteilt|verborgen/i;

/** Scores, rankings, causal claims and diagnosis language are not allowed. */
export const JUDGING_WORDING =
  /Score|schlechter|besser als|problematisch|deshalb|weil ihr|Diagnose|Punkte/i;
