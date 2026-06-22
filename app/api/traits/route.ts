import OpenAI from "openai";
import { NextResponse } from "next/server";

type AiProvider = "openai" | "xai";

function getProvider(value: unknown): AiProvider {
  return value === "openai" || value === "xai" ? value : "xai";
}

function getClient(provider: AiProvider) {
  if (provider === "openai") {
    return new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  return new OpenAI({
    apiKey: process.env.XAI_API_KEY,
    baseURL: "https://api.x.ai/v1",
  });
}

function getModel(provider: AiProvider) {
  if (provider === "openai") {
    return "gpt-4.1-mini";
  }

  return "grok-4-1-fast-non-reasoning";
}

const traitsSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    participants: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          index: { type: "number" },
          traits: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["index", "traits"],
      },
    },
  },
  required: ["participants"],
} as const;

function cleanTraits(traits: string[]) {
  return traits
    .map((trait) => trait.trim())
    .filter(Boolean)
    .slice(0, 3);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const provider = getProvider(body.provider);
    const client = getClient(provider);
    const model = getModel(provider);

    const participants = Array.isArray(body.participants) ? body.participants : [];

    const completion = await client.chat.completions.create({
      model,
      temperature: 0.9,
      messages: [
        {
          role: "system",
          content: `
Wygeneruj cechy postaci do polskiego, absurdalnego battle royale.

Zasady:
- Pisz po polsku.
- Każda postać ma dostać 3 krótkie cechy.
- Cechy mają być użyteczne narracyjnie.
- Cechy mają pasować do imienia/nazwy i płci, ale bez stereotypów.
- Humor może być polski, memiczny i lekko gen Z.
- Nie dawaj cech obraźliwych wobec realnych grup ludzi.
- Nie dawaj cech zbyt długich.
- Zwróć tylko JSON zgodny ze schematem.

Przykłady dobrych cech:
- panikuje przy Excelu
- ma energię rzecznika prasowego
- nosi paragon jak talizman
- wierzy w siłę kolejki
- umie kłócić się o nic
- ma podejrzany spokój
          `.trim(),
        },
        {
          role: "user",
          content: JSON.stringify({
            participants,
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "battle_royale_traits",
          strict: true,
          schema: traitsSchema,
        },
      },
    });

    const raw = completion.choices[0]?.message?.content;

    if (!raw) {
      throw new Error("Model returned an empty response.");
    }

    const result = JSON.parse(raw) as {
      participants: { index: number; traits: string[] }[];
    };

    return NextResponse.json({
      participants: result.participants.map((participant) => ({
        index: participant.index,
        traits: cleanTraits(participant.traits),
      })),
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error: "Nie udało się wygenerować cech.",
      },
      { status: 500 }
    );
  }
}