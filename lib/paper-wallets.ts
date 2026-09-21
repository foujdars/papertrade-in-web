/** Validate deposits in whole cents/paise while preserving existing sub-cent trading fees. */
export function addPaperCash(balance: number, amount: number): number {
  const deposit = Math.round(amount * 100);
  if (!Number.isFinite(balance) || balance < 0 || !Number.isSafeInteger(Math.round(balance * 100))) throw new Error("Saved practice balance is invalid.");
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(deposit) || deposit < 1 || Math.abs(amount * 100 - deposit) > 0.000001) {
    throw new Error("Enter a positive amount with no more than two decimal places.");
  }
  const next = balance + deposit / 100;
  if (!Number.isFinite(next) || !Number.isSafeInteger(Math.round(next * 100))) throw new Error("Amount is too large for this practice wallet.");
  return next;
}
