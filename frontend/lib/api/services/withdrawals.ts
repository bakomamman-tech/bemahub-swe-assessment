import api from "@/lib/api/client";
import type { Withdrawal } from "@/lib/types/api";

export interface CreateWithdrawalInput {
  amountMinor: number;
  payoutReference: string;
}

export async function createWithdrawal(
  input: CreateWithdrawalInput
): Promise<Withdrawal> {
  const response = await api.post<Withdrawal>(
    "/me/withdrawals",
    input,
    {
      headers: {
        "Idempotency-Key": input.payoutReference,
      },
    }
  );

  return response.data;
}