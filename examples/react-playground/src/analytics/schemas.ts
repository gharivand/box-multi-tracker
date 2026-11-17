import { createZodValidator } from "box-multi-tracker/zod";
import type { EventValidator } from "box-multi-tracker";
import { z } from "zod";
import type { AppEventInputs, AppEvents } from "./events";

/** A number, or text such as "4.50" that is converted to a number. */
const price = z.union(
  [
    z.number().nonnegative(),
    z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/)
      .transform(Number),
  ],
  "must be a non-negative number, or text such as 12.50",
);

/** One schema per event. These are the application's runtime validation rules. */
export const eventSchemas = {
  user_signed_in: z.object({
    userId: z.string().min(1, "userId is required"),
    method: z.enum(["email", "google"]),
  }),

  product_viewed: z.object({
    productId: z.string().min(1, "productId is required"),
    productName: z.string().trim().min(1, "productName is required"),
    price,
  }),

  order_completed: z.object({
    orderId: z.string().min(1, "orderId is required"),
    totalPrice: price,
    itemsCount: z.number().int("must be a whole number").positive("must be at least 1"),
  }),

  user_signed_out: z.undefined(),
};

/**
 * The annotation makes the compiler verify the schemas against the
 * hand-written maps: a missing event, or a schema whose input or output
 * differs from `AppEventInputs` / `AppEvents`, is a compile error here.
 */
export const appEventValidator: EventValidator<AppEventInputs, AppEvents> = createZodValidator(eventSchemas);
