export async function onRequestGet(context) {
  const { env } = context;

  const value = Number(env.ALLOW_SYNC_PASSWORD_INPUT);

  return new Response(
    JSON.stringify({
      allowPasswordInput: value === 1 ? 1 : 0
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      }
    }
  );
}