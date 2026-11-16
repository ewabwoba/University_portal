export interface FieldError {
  field: string;
  messages: string[];
}

/** RFC 9457 problem details, with our stable `code` and `correlationId` extensions. */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  correlationId?: string;
  timestamp: string;
  errors?: FieldError[];
  details?: Record<string, unknown>;
}
