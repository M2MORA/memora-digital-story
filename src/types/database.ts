/**
 * Types TypeScript pour les schémas de base de données MÉMORA - Phase 1.1 (Corrigée)
 */

export type UploadIntentStatus =
  | "pending"
  | "uploading"
  | "ready"
  | "consumed"
  | "purging"
  | "cancelled"
  | "expired";

export type FileKind = "video" | "photo";

export interface UploadIntentRecord {
  id: string;
  draft_id: string;
  draft_token_hash: string;
  item_id: string | null;
  file_kind: FileKind;
  storage_key: string;
  file_name: string;
  file_extension: string;
  mime_type: string;
  file_size_bytes: number;
  client_sha256: string | null;
  status: UploadIntentStatus;
  last_heartbeat_at: string;
  expires_at: string;
  order_id: string | null;
  consumed_at: string | null;
  purge_token: string | null;
  purge_lease_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface IntentMapping {
  item_id: string;
  intent_id: string;
  file_kind: FileKind;
}

export interface CreateUploadIntentParams {
  draft_id: string;
  draft_token: string;
  file_kind: FileKind;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  file_extension: string;
  item_id?: string;
}

export interface CompleteUploadIntentParams {
  intent_id: string;
  draft_token: string;
  verified_size_bytes: number;
  verified_etag?: string;
  client_sha256?: string;
}

export interface FinalizeOrderPayload {
  order_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string | null;
  shipping_address: Record<string, unknown>;
  items: Array<Record<string, unknown>>;
  subtotal?: number;
  shipping_fee?: number;
  total?: number;
  currency?: string;
  promo_code?: string;
  shipping_carrier?: string;
  idempotency_key: string; // FIX 6: Mandatory
  payload_hash?: string;
  draft_id?: string;
  draft_token_hash?: string;
}

export interface FinalizeOrderResult {
  success: boolean;
  order_id?: string;
  order_number?: string;
  idempotent_replay?: boolean;
  subtotal?: number;
  shipping_fee?: number;
  total?: number;
  error?: string;
  code?: string;
}

export interface ClaimPurgeItem {
  claimed_id: string;
  storage_key: string;
  purge_token: string;
}

export interface ClaimPurgeResult {
  success: boolean;
  claimed: ClaimPurgeItem[];
}
