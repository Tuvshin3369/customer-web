/** Columns to load from `branches` when building print invoice supplier block. */
export const BRANCH_COLUMNS_FOR_PRINT =
  'address, website, phone_1, phone_2, phone_3, company_bank, company_account, company_name, company_register, company_stamp, personal_name, personal_register, personal_bank, personal_account, personal_stamp';

export interface BranchPrintRow {
  company_name?: string | null;
  company_register?: string | null;
  company_bank?: string | null;
  company_account?: string | null;
  company_stamp?: string | null;
  personal_name?: string | null;
  personal_register?: string | null;
  personal_bank?: string | null;
  personal_account?: string | null;
  personal_stamp?: string | null;
}

/**
 * If customer has no register (NULL / empty), use branch personal_* fields for the seller block;
 * otherwise use branch company_* fields.
 */
export function branchSupplierFieldsForPrint(
  branch: BranchPrintRow | null | undefined,
  customerRegister: string | null | undefined
) {
  const usePersonal =
    customerRegister == null || String(customerRegister).trim() === '';

  if (!branch) {
    return {
      branch_company_name: '',
      branch_company_register: '',
      bank_name: '',
      bank_account: '',
      company_stamp_url: '',
    };
  }

  if (usePersonal) {
    return {
      branch_company_name: branch.personal_name ?? '',
      branch_company_register: branch.personal_register ?? '',
      bank_name: branch.personal_bank ?? '',
      bank_account: branch.personal_account ?? '',
      company_stamp_url: branch.personal_stamp ?? '',
    };
  }

  return {
    branch_company_name: branch.company_name ?? '',
    branch_company_register: branch.company_register ?? '',
    bank_name: branch.company_bank ?? '',
    bank_account: branch.company_account ?? '',
    company_stamp_url: branch.company_stamp ?? '',
  };
}
