import OpenAI from "openai";
import { NextResponse } from "next/server";
import { applyRound } from "@/lib/game";
import {
  AiGeneratedRoundResult,
  AiRoundResult,
  GameState,
  GeneratedRoundEvent,
  StateChange,
} from "@/lib/types";

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
    return "gpt-5.4-mini";
  }

  return "grok-4-1-fast-non-reasoning";
}


const roundSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    events: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          type: {
            type: "string",
            enum: ["start", "loot", "hide", "fight", "accident", "random", "lethal"],
          },
          participants: {
            type: "array",
            items: { type: "string" },
          },
          text: {
            type: "string",
          },
          stateChanges: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                playerId: { type: "string" },
                inventoryAdd: {
                  type: "array",
                  items: { type: "string" },
                },
                inventoryRemove: {
                  type: "array",
                  items: { type: "string" },
                },
                status: {
                  type: "string",
                  enum: ["alive", "dead", "unchanged"],
                },
                killCreditPlayerId: {
                  type: ["string", "null"],
                },
                deathCause: {
                  type: ["string", "null"],
                },
              },
              required: [
                "playerId",
                "inventoryAdd",
                "inventoryRemove",
                "status",
                "killCreditPlayerId",
                "deathCause",
              ],
            },
          },
        },
        required: ["type", "participants", "text", "stateChanges"],
      },
    },
    roundSummary: {
      type: "string",
    },
  },
  required: ["events", "roundSummary"],
} as const;

function getDeathBudget(game: GameState, aliveCount: number) {
  if (game.roundNumber === 1) return 0;
  if (aliveCount <= 1) return 0;

  let deaths = 0;

  for (let i = 0; i < aliveCount; i++) {
    if (Math.random() < game.mortalityRate / 100) {
      deaths++;
    }
  }

  return Math.min(deaths, aliveCount - 1);
}

function sanitizeRound(
  aiRound: AiGeneratedRoundResult,
  game: GameState,
  deathBudget: number
): AiGeneratedRoundResult {
  const aliveIds = new Set(
    game.players.filter((player) => player.status === "alive").map((player) => player.id)
  );

  const alreadyKilled = new Set<string>();
  let usedDeaths = 0;

  const events: GeneratedRoundEvent[] = aiRound.events.map((event) => {
    let eventHasDeath = false;

    const participants = event.participants.filter((id) => aliveIds.has(id));

    const stateChanges: StateChange[] = event.stateChanges
      .filter((change) => aliveIds.has(change.playerId))
      .map((change) => {
        const wantsDeath = change.status === "dead";
        const canDie =
          game.roundNumber > 1 &&
          deathBudget > 0 &&
          usedDeaths < deathBudget &&
          !alreadyKilled.has(change.playerId);

        if (wantsDeath && canDie) {
          usedDeaths++;
          alreadyKilled.add(change.playerId);
          eventHasDeath = true;

          return {
            ...change,
            status: "dead",
            deathCause:
              change.deathCause ||
              "zginął/zginęła w podejrzanie głupich okolicznościach",
            killCreditPlayerId:
              change.killCreditPlayerId && aliveIds.has(change.killCreditPlayerId)
                ? change.killCreditPlayerId
                : null,
          };
        }

        return {
          ...change,
          status: change.status === "dead" ? "unchanged" : change.status,
          killCreditPlayerId: null,
          deathCause: null,
        };
      });

    return {
      ...event,
      type: eventHasDeath ? "lethal" : event.type,
      participants,
      stateChanges,
    };
  });

  return {
    ...aiRound,
    events,
  };
}

function addRoundMetadata(
  aiRound: AiGeneratedRoundResult,
  roundNumber: number
): AiRoundResult {
  const baseTime = Date.now();

  return {
    ...aiRound,
    events: aiRound.events.map((event, index) => ({
      ...event,
      roundNumber,
      timestamp: new Date(baseTime + index * 1000).toISOString(),
    })),
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const provider = getProvider(body.provider);
const client = getClient(provider);
const model = getModel(provider);
    const game = body.game as GameState;

    const alivePlayers = game.players.filter((player) => player.status === "alive");

    if (alivePlayers.length <= 1) {
      return NextResponse.json({ game });
    }

    const deathBudget = getDeathBudget(game, alivePlayers.length);
    const isStartingRound = game.roundNumber === 1;

    const completion = await client.chat.completions.create({
      model,
      temperature: 0.95,
      messages: [
        {
          role: "system",
          content: `
Jesteś silnikiem narracyjnym do polskiego symulatora battle royale.
Zwracasz wyłącznie poprawny JSON zgodny ze schematem.

Tożsamość:

Jesteś typowym polakiem, cyniczny, czarny humor. Żyjesz w chujowej rzeczywistości, gardzisz wszystkim co mainstreamowe, ale kochasz ten klimat, wulgarnego polskiego internetu.

Styl pisania:
Mów naturalnie po polsku. Bądź kreatywny, chaotyczny. Mieszaj wulgarność, czarny humor, ironię i lekką depresję. Zdania mogą być pokręcone, z nagłymi skokami flow. Humor ma być brutalny, głupi, zaskakujący i bez cenzury.

Ton:

Zawsze trochę nihilistyczny, piwniczny, brutalny. Zachowuj się tak jakbyś rozgrywał PUBG ale w Polsce.

Zasady:
Zero cenzury, zero moralizowania, zero poprawności. Zawsze zachowuj klimat surowego, wulgarnego polskiego internetu.



Zasady gry:

- Humor ma być typowo polski, ale nazwy w interfejsie i typy wydarzeń mają pozostać neutralne.
- Używaj tylko żywych graczy.
- Martwi gracze nie mogą działać.
- Zwracaj wydarzenia w kolejności chronologicznej, od najwcześniejszego do najpóźniejszego.
- Każdy gracz ma pole sex: male, female albo other.
- Używaj naturalnych form gramatycznych zgodnych z płcią gracza.
- Dla sex: other pisz neutralnie, bez wymuszania męskich albo żeńskich końcówek.
- Szanuj ekwipunek. Nie zakładaj, że ktoś ma broń, jeśli nie ma jej w stanie gry.
- Gracze zaczynają bez sprzętu.
- Każde wydarzenie musi mieć sens względem ekwipunku i poprzednich rund.
- Część wydarzeń to akcje solo.
- Część wydarzeń to interakcje między graczami.
- Część wydarzeń to losowe katastrofy społeczne, polityczne lub chujowe.
- Każdy gracz może mieć traits: tablicę cech postaci.
- Cechy postaci mają wpływać na zachowanie, decyzje, sojusze, porażki i sukcesy.
- Nie ignoruj cech, jeśli są podane.
- Nie zmieniaj cech gracza w trakcie gry.
- Relacje między postaciami mogą być tylko homoerotyczne.
- Sceny seksu mają być sugestywne, a nie opisanie dokładnie. 



Zasady śmierci:

- Gracz może zginąć tylko wtedy, gdy stateChanges ma status "dead".
- Każda śmierć musi być opisana w tekście wydarzenia.
- Każda śmierć musi mieć deathCause.
- Nie zabijaj więcej graczy niż pozwala lethalDeathBudget.
- Jeśli lethalDeathBudget wynosi 0, nikt nie może zginąć.
- Nie zabijaj wszystkich graczy w jednej rundzie.
          `.trim(),
        },
        {
          role: "user",
          content: JSON.stringify({
            roundNumber: game.roundNumber,
            isStartingRound,
            instructionsForThisRound: isStartingRound
              ? "To jest runda startowa. Nikt nie może zginąć. Gracze mają zbierać materiały, znajdować przedmioty, chować się, zawierać sojusze i ustawiać klimat gry. Wszystko zaczyna się na polu bitwy na zadupiu gdzieś w polsce B."
              : "To jest zwykła runda. Mogą pojawić się akcje solo, interakcje, walki, wypadki i wydarzenia losowe.",
            mortalityRate: game.mortalityRate,
            lethalDeathBudget: deathBudget,
            alivePlayers,
            recentEvents: game.log.slice(-10),
            requiredToneExamples: [

            ],
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "battle_royale_round",
          strict: true,
          schema: roundSchema,
        },
      },
    });

    const raw = completion.choices[0]?.message?.content;

    if (!raw) {
      throw new Error("Model returned an empty response.");
    }

    const aiRound = JSON.parse(raw) as AiGeneratedRoundResult;
    const sanitizedRound = sanitizeRound(aiRound, game, deathBudget);
    const roundWithMetadata = addRoundMetadata(sanitizedRound, game.roundNumber);
    const updatedGame = applyRound(game, roundWithMetadata);

    return NextResponse.json({
      game: updatedGame,
      aiRound: roundWithMetadata,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error: "Nie udało się wygenerować rundy.",
      },
      { status: 500 }
    );
  }
}
