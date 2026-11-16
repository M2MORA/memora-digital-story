/** Réponses JSON + CORS des routes appelées depuis l'app admin (autre origine). */
export function corsJson(methods: string) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
  return {
    json: (status: number, body: unknown) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json", ...cors },
      }),
    preflight: () => new Response(null, { status: 204, headers: cors }),
  };
}
