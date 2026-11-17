import { createZodValidator } from "box-multi-tracker/zod";
import type { EventValidator } from "box-multi-tracker";
import { z } from "zod";

/** Events of the Commerce Analytics instance: shopping and checkout. */
export interface CommerceEvents {
  product_added_to_cart: { productId: string; quantity: number; price: number };
  checkout_started: { total: number; itemCount: number };
  order_completed: { orderId: string; total: number; itemCount: number };
}

/** Runtime rules for the same events. Types alone cannot stop a wrong value at runtime. */
export const commerceSchemas = {
  product_added_to_cart: z.object({
    productId: z.string().min(1, "productId is required"),
    quantity: z.number().int("must be a whole number").positive("must be at least 1"),
    price: z.number().nonnegative("must not be negative"),
  }),
  checkout_started: z.object({
    total: z.number().nonnegative("must not be negative"),
    itemCount: z.number().int().positive("must be at least 1"),
  }),
  order_completed: z.object({
    orderId: z.string().min(1, "orderId is required"),
    total: z.number().nonnegative("must not be negative"),
    itemCount: z.number().int().positive("must be at least 1"),
  }),
};

/**
 * The annotation makes the compiler check the schemas against `CommerceEvents`:
 * a missing event or a schema with a different payload shape is a compile error.
 * The schemas do not transform anything, so input and output maps are the same.
 */
export const commerceValidator: EventValidator<CommerceEvents> = createZodValidator(commerceSchemas);
