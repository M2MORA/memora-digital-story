import { afterEach, describe, expect, it, vi } from "vitest";
import { readEnv, readR2Config, readSupabaseConfig } from "@/server/config";

const r2 = {
  R2_ACCOUNT_ID: "acct",
  R2_ACCESS_KEY_ID: "key",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET_NAME: "bucket",
};
const R2_AND_SUPABASE_VARS = [...Object.keys(r2), "SUPABASE_URL", "VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];

function clearProcessEnv() {
  for (const name of R2_AND_SUPABASE_VARS) vi.stubEnv(name, "");
}

afterEach(() => vi.unstubAllEnvs());

describe("readEnv", () => {
  it("prefers the Cloudflare binding, then process.env, trimmed", () => {
    vi.stubEnv("SOME_VAR", " from-process ");
    expect(readEnv({ SOME_VAR: " from-binding " }, "SOME_VAR")).toBe("from-binding");
    expect(readEnv({ SOME_VAR: "   " }, "SOME_VAR")).toBe("from-process");
    expect(readEnv(undefined, "SOME_VAR")).toBe("from-process");
    expect(readEnv({ SOME_VAR: 42 }, "MISSING_VAR")).toBe("");
  });
});

describe("readR2Config", () => {
  it("reads the four R2 variables from the binding or process.env", () => {
    clearProcessEnv();
    vi.stubEnv("R2_BUCKET_NAME", "process-bucket");
    const { R2_BUCKET_NAME: _bucket, ...withoutBucket } = r2;
    expect(readR2Config(withoutBucket)).toEqual({
      accountId: "acct",
      accessKeyId: "key",
      secretAccessKey: "secret",
      bucketName: "process-bucket",
    });
  });

  it("throws on a missing bucket instead of falling back to a default", () => {
    clearProcessEnv();
    const { R2_BUCKET_NAME: _bucket, ...withoutBucket } = r2;
    expect(() => readR2Config(withoutBucket)).toThrow("R2_BUCKET_NAME");
  });

  it("lists every missing variable", () => {
    clearProcessEnv();
    expect(() => readR2Config({})).toThrow(
      "Configuration Cloudflare R2 manquante (variables requises : R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME)",
    );
  });
});

describe("readSupabaseConfig", () => {
  it("prefers SUPABASE_URL over VITE_SUPABASE_URL", () => {
    clearProcessEnv();
    const env = {
      SUPABASE_URL: "https://server.supabase.co",
      VITE_SUPABASE_URL: "https://public.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service",
    };
    expect(readSupabaseConfig(env)).toEqual({ url: "https://server.supabase.co", serviceRoleKey: "service" });
  });

  it("falls back to VITE_SUPABASE_URL from process.env (Vercel)", () => {
    clearProcessEnv();
    vi.stubEnv("VITE_SUPABASE_URL", "https://public.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    expect(readSupabaseConfig(undefined)).toEqual({ url: "https://public.supabase.co", serviceRoleKey: "service" });
  });

  it("throws when the URL or the service role key is missing", () => {
    clearProcessEnv();
    expect(() => readSupabaseConfig({ SUPABASE_URL: "https://x.supabase.co" })).toThrow("SUPABASE_SERVICE_ROLE_KEY");
    expect(() => readSupabaseConfig({ SUPABASE_SERVICE_ROLE_KEY: "service" })).toThrow("Configuration Supabase serveur manquante");
  });
});
