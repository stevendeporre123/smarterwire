// Proxy voor fotoanalyse van zekeringskasten. De Anthropic-sleutel blijft server-side.
//   wrangler secret put ANTHROPIC_API_KEY
// NB: nog niet getest tegen de echte API – eerst op een paar echte foto's uitproberen.
export interface Env { ANTHROPIC_API_KEY: string; MODEL?: string; ALLOW_ORIGIN?: string }

const PROMPT = `Je ziet een foto van een Belgische elektrische zekeringskast (DIN-rail).
Geef ALLE zichtbare modulaire toestellen terug als JSON, zonder uitleg, in dit formaat:
{"devices":[{"kind":"hoofd|differentieel|automaat|aardlekautomaat|smelt|overspanning|contactor|schakelaar|trafo|anders",
"label":"opschrift indien leesbaar","poles":"1P|2P|3P|4P","rating_a":16,"curve":"B|C|D","sens_ma":30,"dtype":"AC|A|F|B",
"modules":1,"rect":{"x":0.1,"y":0.2,"w":0.03,"h":0.2},"notes":"onzeker? leg uit"}]}
poles = aantal polen (1 tot 4), NIET het aantal fases. modules = breedte in DIN-modules van 18 mm (mag 1, 1.5, 2, 3, 4…);
een 2-polige mini-automaat kan 2 polen op 1 module hebben, dus tel de breedte apart van de polen.
rect = omkadering van het toestel, genomen als fractie (0..1) van de breedte/hoogte van de foto.
Laat velden weg die je niet kan aflezen; gok niet. Elke toestel apart, ook naast elkaar.`;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const cors = { 'access-control-allow-origin': env.ALLOW_ORIGIN ?? '*', 'access-control-allow-headers': 'content-type' };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST') return new Response('POST only', { status: 405, headers: cors });
    const { image, mime } = (await req.json()) as { image: string; mime: string };
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: env.MODEL ?? 'claude-sonnet-5-5', max_tokens: 8000,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mime, data: image } },
          { type: 'text', text: PROMPT }] }],
      }),
    });
    if (!r.ok) return new Response(await r.text(), { status: 502, headers: cors });
    const data: any = await r.json();
    const text: string = data.content?.find((c: any) => c.type === 'text')?.text ?? '{}';
    const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    return new Response(json, { headers: { ...cors, 'content-type': 'application/json' } });
  },
};
