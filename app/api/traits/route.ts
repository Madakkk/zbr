import OpenAI from "openai";
import { NextResponse } from "next/server";

type AiProvider = "openai" | "xai";
type AppLanguage = "pl" | "en";


function getProvider(value: unknown): AiProvider {
  return value === "openai" || value === "xai" ? value : "xai";
}

function getLanguage(value: unknown): AppLanguage {
  return value === "en" ? "en" : "pl";
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
    const language = getLanguage(body.language);
    const client = getClient(provider);
    const model = getModel(provider);

    const participants = Array.isArray(body.participants) ? body.participants : [];

    const completion = await client.chat.completions.create({
      const languageInstruction =
  language === "pl"
    ? `
- Pisz po polsku.
- Cechy mają mieć polski, memiczny, lekko absurdalny klimat.
`
    : `
- Write in English.
- Traits should have an absurd, meme-like, slightly Polish internet flavor.
- Polish references are okay, but they should be understandable from context.
`;
      model,
      temperature: 0.9,
      messages: [
        {
          role: "system",
          content: `
Generate character traits for an absurd battle royale simulator.

Rules:
${languageInstruction}
- Each character should receive 3 short traits.
- Traits should be useful for narration.
- Traits should match the name and sex, but avoid lazy stereotypes.
- Do not create traits that attack real protected groups.
- Keep traits short.
- Return only JSON matching the schema.

Good trait examples in Polish:
- panikuje przy Excelu
- ma energię rzecznika prasowego
- nosi paragon jak talizman
- wierzy w siłę kolejki
- umie kłócić się o nic
- ma podejrzany spokój

Good trait examples in English:
- panics near spreadsheets
- has press spokesperson energy
- treats receipts like sacred documents
- can argue about nothing
- suspiciously calm under pressure
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
