export interface Agency {
  id?: string | number;
  name: string;
  website: string;
  clutchUrl: string;
  programmingLanguages: string[];
  frameworksAndTechnologies: string[];
  notes: string;
  createdAt?: string;
  updatedAt?: string;
}
export type Status =
  | "ADDED"
  | "UPDATED"
  | "SKIPPED"
  | "DUPLICATE_FOUND"
  | "VALIDATION_ERROR"
  | "CONFIGURATION_ERROR"
  | "NETWORK_ERROR"
  | "SERVER_ERROR";
export interface Candidate {
  agency: Agency;
  token: string;
  reason: "clutch" | "domain" | "name";
}
export interface ApiResponse {
  success: boolean;
  status: Status;
  data?: { agency?: Agency; candidates?: Candidate[] };
  error?: { code: string; message: string };
}
export interface ApiRequest {
  operation:
    | "healthCheck"
    | "checkDuplicate"
    | "createCompany"
    | "updateCompany"
    | "skip";
  agency?: Agency;
  id?: string | number;
  token?: string;
  requestId: string;
}
export interface ExtractionResult {
  agency: Agency;
  warnings: string[];
  diagnostics?: string;
}
export interface CompanyExtractor {
  supports(url: string): boolean;
  extract(document: Document, url: string): ExtractionResult;
}
