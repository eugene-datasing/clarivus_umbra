/**
 * Structured logging for the Umbra.
 *
 * - Development: pretty-printed, human-readable console output.
 * - Production: single-line JSON for Azure Monitor / Log Analytics.
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.info("Pipeline started", { docId, batchId });
 *
 *   const pipelineLog = logger.child({ module: "pipeline" });
 *   pipelineLog.info("Extraction complete", { pages: 5 });
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  [key: string]: unknown;
}

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  /** Create a child logger with additional default context fields. */
  child(defaultContext: Record<string, unknown>): Logger;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isDev = process.env.NODE_ENV !== "production";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** Minimum level to emit. Debug is suppressed in production. */
const MIN_LEVEL: LogLevel = isDev ? "debug" : "info";

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[MIN_LEVEL];
}

function formatDev(entry: LogEntry): string {
  const { timestamp, level, message, ...rest } = entry;
  const time = timestamp.slice(11, 23); // HH:MM:SS.mmm
  const tag = level.toUpperCase().padEnd(5);
  const contextStr =
    Object.keys(rest).length > 0
      ? " " + JSON.stringify(rest, null, 2)
      : "";
  return `${time} [${tag}] ${message}${contextStr}`;
}

function emit(level: LogLevel, entry: LogEntry): void {
  if (!shouldLog(level)) return;

  if (isDev) {
    const formatted = formatDev(entry);
    switch (level) {
      case "error":
        console.error(formatted);
        break;
      case "warn":
        console.warn(formatted);
        break;
      case "debug":
        console.debug(formatted);
        break;
      default:
        console.log(formatted);
    }
  } else {
    // Production: single-line JSON
    const line = JSON.stringify(entry);
    switch (level) {
      case "error":
        console.error(line);
        break;
      case "warn":
        console.warn(line);
        break;
      default:
        console.log(line);
    }
  }
}

// ---------------------------------------------------------------------------
// Logger factory
// ---------------------------------------------------------------------------

function createLogger(defaultContext: Record<string, unknown> = {}): Logger {
  function log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...defaultContext,
      ...context,
    };
    emit(level, entry);
  }

  return {
    debug: (msg, ctx) => log("debug", msg, ctx),
    info: (msg, ctx) => log("info", msg, ctx),
    warn: (msg, ctx) => log("warn", msg, ctx),
    error: (msg, ctx) => log("error", msg, ctx),
    child(additionalContext) {
      return createLogger({ ...defaultContext, ...additionalContext });
    },
  };
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const logger: Logger = createLogger();
