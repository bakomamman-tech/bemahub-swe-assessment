"use client";

import axios from "axios";
import { useMemo, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { createWithdrawal } from "@/lib/api/services/withdrawals";
import { formatMoney } from "@/lib/format";
import type { ApiError } from "@/lib/types/api";

interface WithdrawalFormProps {
  availableMinor: number;
  minimumWithdrawalMinor: number;
  currency: string;
}

interface WithdrawalFormValues {
  amount: string;
}

interface WithdrawalAttempt {
  amountMinor: number;
  payoutReference: string;
}

/**
 * Convert a user-facing decimal currency string to integer minor units without
 * doing floating-point money arithmetic.
 *
 * "600"    -> 60000
 * "600.5"  -> 60050
 * "600.50" -> 60050
 */
function parseAmountToMinor(value: string): number | null {
  const normalized = value.trim();

  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    return null;
  }

  const [wholePart, fractionPart = ""] = normalized.split(".");
  const whole = Number(wholePart);
  const fraction = Number(fractionPart.padEnd(2, "0"));

  const minor = whole * 100 + fraction;

  return Number.isSafeInteger(minor) ? minor : null;
}

export function WithdrawalForm({
  availableMinor,
  minimumWithdrawalMinor,
  currency,
}: WithdrawalFormProps) {
  const queryClient = useQueryClient();

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [transportMessage, setTransportMessage] = useState<string | null>(null);

  // If a request fails before receiving a response, retry the same logical
  // attempt with the same idempotency reference.
  const attemptRef = useRef<WithdrawalAttempt | null>(null);

  const schema = useMemo(
    () =>
      z
        .object({
          amount: z.string().trim().min(1, "Enter an amount."),
        })
        .superRefine((values, ctx) => {
          const amountMinor = parseAmountToMinor(values.amount);

          if (amountMinor === null) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["amount"],
              message:
                "Enter a valid amount with no more than two decimal places.",
            });
            return;
          }

          if (amountMinor <= 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["amount"],
              message: "Withdrawal amount must be greater than zero.",
            });
            return;
          }

          if (amountMinor < minimumWithdrawalMinor) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["amount"],
              message: `Minimum withdrawal is ${formatMoney(
                minimumWithdrawalMinor,
                currency
              )}.`,
            });
          }

          if (amountMinor > availableMinor) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["amount"],
              message: `You cannot withdraw more than your available balance of ${formatMoney(
                availableMinor,
                currency
              )}.`,
            });
          }
        }),
    [availableMinor, currency, minimumWithdrawalMinor]
  );

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<WithdrawalFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      amount: "",
    },
  });

  async function onSubmit(values: WithdrawalFormValues) {
    setSuccessMessage(null);
    setTransportMessage(null);

    const amountMinor = parseAmountToMinor(values.amount);

    // The zod resolver has already validated this.
    if (amountMinor === null) {
      return;
    }

    let attempt = attemptRef.current;

    // A changed amount is a new logical withdrawal attempt.
    if (!attempt || attempt.amountMinor !== amountMinor) {
      attempt = {
        amountMinor,
        payoutReference: `wd_${crypto.randomUUID()}`,
      };

      attemptRef.current = attempt;
    }

    try {
      const withdrawal = await createWithdrawal({
        amountMinor: attempt.amountMinor,
        payoutReference: attempt.payoutReference,
      });

      // The server confirmed the outcome, so this attempt is complete.
      attemptRef.current = null;

      reset();

      setSuccessMessage(
        `${formatMoney(
          withdrawal.amountMinor,
          currency
        )} withdrawal requested successfully. Status: ${withdrawal.status}.`
      );

      // Refresh the authenticated earnings data after the mutation.
      await queryClient.invalidateQueries({
        queryKey: ["earnings"],
      });
    } catch (error) {
      if (axios.isAxiosError<ApiError>(error)) {
        if (!error.response) {
          // Outcome is unknown. Keep attemptRef so retrying sends the same
          // payoutReference and therefore remains idempotent.
          setTransportMessage(
            "The request could not be confirmed. You can retry safely; the same withdrawal reference will be reused."
          );
          return;
        }

        // We received a definitive server response. A later submit is a new
        // attempt and may therefore receive a fresh reference.
        attemptRef.current = null;

        setError("amount", {
          type: "server",
          message:
            error.response.data?.message ??
            `Withdrawal was refused with status ${error.response.status}.`,
        });

        return;
      }

      attemptRef.current = null;
      setTransportMessage(
        "An unexpected error occurred while requesting the withdrawal."
      );
    }
  }

  return (
    <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <header>
        <h3 className="text-lg font-semibold text-slate-900">
          Request withdrawal
        </h3>

        <p className="mt-1 text-sm text-slate-600">
          Minimum: {formatMoney(minimumWithdrawalMinor, currency)} · Available:{" "}
          {formatMoney(availableMinor, currency)}
        </p>
      </header>

      {successMessage ? (
        <div
          role="status"
          className="mt-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700"
        >
          {successMessage}
        </div>
      ) : null}

      {transportMessage ? (
        <div
          role="alert"
          className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {transportMessage}
        </div>
      ) : null}

      <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4">
        <div>
          <label
            htmlFor="withdrawal-amount"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Amount ({currency})
          </label>

          <input
            id="withdrawal-amount"
            type="text"
            inputMode="decimal"
            placeholder="600.00"
            aria-invalid={errors.amount ? "true" : "false"}
            aria-describedby={
              errors.amount ? "withdrawal-amount-error" : undefined
            }
            {...register("amount")}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          />

          {errors.amount ? (
            <p
              id="withdrawal-amount-error"
              className="mt-2 text-sm text-red-700"
            >
              {errors.amount.message}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Requesting..." : "Request withdrawal"}
        </button>
      </form>
    </section>
  );
}