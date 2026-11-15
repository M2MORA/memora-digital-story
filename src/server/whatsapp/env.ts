import { readEnv } from "../config";

export type WhatsAppConfig = {
  verifyToken: string;
  appSecret: string;
  accessToken: string;
  phoneNumberId: string;
  graphVersion: string;
};

export function whatsappConfig(env: unknown): WhatsAppConfig {
  return {
    verifyToken: readEnv(env, "WHATSAPP_VERIFY_TOKEN"),
    appSecret: readEnv(env, "WHATSAPP_APP_SECRET"),
    accessToken: readEnv(env, "WHATSAPP_ACCESS_TOKEN"),
    phoneNumberId: readEnv(env, "WHATSAPP_PHONE_NUMBER_ID"),
    graphVersion: readEnv(env, "WHATSAPP_GRAPH_VERSION") || "v23.0",
  };
}
