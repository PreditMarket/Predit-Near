export const adminAccounts = () =>
  (process.env.NEAR_ADMIN_ACCOUNTS ?? '')
    .split(',')
    .map((account) => account.trim())
    .filter(Boolean);
