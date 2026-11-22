import { z } from "zod";
import { isGstin, isGstStateCode } from "./gst";

const text = (max: number) => z.string().trim().min(1).max(max);
const optText = (max: number) => z.string().trim().max(max).nullish();

/** The body of POST /api/invoices. Amounts are in paise (₹1 = 100). */
export const issueBody = z.object({
  paymentRef: text(100),
  paymentMethod: optText(40).default("Razorpay"),
  orderId: optText(100),
  customerRef: optText(100),
  product: text(60),
  description: text(200),
  amountPaise: z.number().int().positive().max(1_000_000_000),
  amountIncludesGst: z.boolean().default(true),
  buyer: z.object({
    name: text(120),
    email: z.string().trim().email().max(200).nullish(),
    phone: optText(20),
    state: z
      .string()
      .trim()
      .nullish()
      .refine((v) => !v || isGstStateCode(v), "state must be a GST state code such as \"32\""),
    gstin: z
      .string()
      .trim()
      .toUpperCase()
      .nullish()
      .refine((v) => !v || isGstin(v), "gstin is not a valid GSTIN"),
    address: optText(400),
  }),
  sendEmail: z.boolean().default(true),
});

export type IssueBody = z.infer<typeof issueBody>;
