import { z } from "zod";

export const adminLoginSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address."),
  password: z.string().min(1, "Please enter your password."),
  rememberMe: z.boolean().optional().default(false),
});

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
