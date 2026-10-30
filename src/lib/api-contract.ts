import { z } from "zod";

/**
 * Contrato HTTP compartido entre el cliente y los route handlers.
 * No importa nada de Node: lo usa también el navegador.
 */

export const ACCESS_KEY_HEADER = "x-access-key";

export const API_ROUTES = {
  resolve: "/api/resolve",
  auth: "/api/auth",
} as const;

export const MAX_URL_LENGTH = 2_048;

export const resolveRequestSchema = z.object({
  url: z.string().trim().min(1).max(MAX_URL_LENGTH),
});
export type ResolveRequest = z.infer<typeof resolveRequestSchema>;

export const authStatusSchema = z.object({ required: z.boolean() });
export type AuthStatus = z.infer<typeof authStatusSchema>;
