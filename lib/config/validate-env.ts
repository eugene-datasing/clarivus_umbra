/**
 * Environment variable validation helper.
 *
 * Checks that required variables exist and are non-empty, collects all
 * missing ones, and throws a single descriptive error.  Optional variables
 * generate warnings only.
 */

export interface EnvVarSpec {
  /** Environment variable name */
  name: string;
  /** If true the app will fail to start when this var is missing in production */
  required: boolean;
  /** Human-readable description shown in error/warning messages */
  description: string;
  /**
   * When set, the variable is only enforced in production.
   * In development a warning is logged instead of throwing.
   */
  productionOnly?: boolean;
}

export interface ValidationResult {
  /** Variables that were found and non-empty */
  present: string[];
  /** Required variables that are missing */
  missing: string[];
  /** Optional (or dev-mode-relaxed) variables that are missing */
  warned: string[];
}

/**
 * Validate a list of environment variable specifications.
 *
 * @param specs - Array of variable specs to check.
 * @param nodeEnv - Current NODE_ENV value (defaults to process.env.NODE_ENV).
 * @returns A ValidationResult summarising what was found.
 * @throws Error listing all missing *required* variables (in production, or
 *   non-productionOnly vars in any environment).
 */
export function validateEnv(
  specs: EnvVarSpec[],
  nodeEnv: string = process.env.NODE_ENV ?? "development",
): ValidationResult {
  const isDev = nodeEnv !== "production";
  const result: ValidationResult = { present: [], missing: [], warned: [] };

  for (const spec of specs) {
    const value = process.env[spec.name];
    const isEmpty = !value || value.trim() === "";

    if (!isEmpty) {
      result.present.push(spec.name);
      continue;
    }

    // Variable is missing or empty
    if (spec.required) {
      if (spec.productionOnly && isDev) {
        // In dev, demote to warning
        result.warned.push(spec.name);
        console.warn(
          `[env] WARNING: ${spec.name} is not set. ${spec.description} (required in production)`,
        );
      } else {
        result.missing.push(spec.name);
      }
    } else {
      // Optional variable
      result.warned.push(spec.name);
      console.warn(
        `[env] INFO: Optional variable ${spec.name} is not set. ${spec.description}`,
      );
    }
  }

  if (result.missing.length > 0) {
    const list = result.missing
      .map((name) => {
        const spec = specs.find((s) => s.name === name);
        return `  - ${name}: ${spec?.description ?? ""}`;
      })
      .join("\n");

    throw new Error(
      `Missing required environment variables:\n${list}\n\nSet these in your .env file or deployment configuration.`,
    );
  }

  return result;
}
