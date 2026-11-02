import type { NextFunction, Request, Response } from "express";
import { supabase } from "./supabase.js";
import { HttpError } from "./config.js";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const authorization = req.header("authorization");
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) throw new HttpError(401, "Sign in to continue.");
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) throw new HttpError(401, "Your session is invalid or has expired.");
    req.userId = data.user.id;
    next();
  } catch (error) {
    next(error);
  }
}
