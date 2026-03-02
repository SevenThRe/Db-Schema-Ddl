import type { RequestHandler } from "express";

export interface ParseMiddlewares {
  globalProtectRateLimit: RequestHandler;
  globalProtectInFlightLimit: RequestHandler;
  parseRateLimit: RequestHandler;
}

export interface UploadMiddlewares extends ParseMiddlewares {
  uploadRateLimit: RequestHandler;
}

