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
    journalUpdates: {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    properties: {
      playerId: { type: "string" },
      markdownEntry: { type: "string" },
    },
    required: ["playerId", "markdownEntry"],
  },
},
    roundSummary: {
      type: "string",
    },
  },
required: ["events", "journalUpdates", "roundSummary"],
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

function getRecentJournal(journalMd: string) {
  return journalMd.slice(-1200);
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

function sanitizeJournalUpdates(
  aiRound: AiGeneratedRoundResult,
  game: GameState
): AiGeneratedRoundResult {
  const aliveIds = new Set(
    game.players
      .filter((player) => player.status === "alive")
      .map((player) => player.id)
  );

  return {
    ...aiRound,
    journalUpdates: (aiRound.journalUpdates ?? [])
      .filter((update) => aliveIds.has(update.playerId))
      .map((update) => ({
        playerId: update.playerId,
        markdownEntry: update.markdownEntry.slice(0, 800),
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
You are the narrative engine for a Polish battle royale simulator.
Return only valid JSON matching the provided schema.

Identity:

You are a cynical Polish internet user with a dark sense of humor.
You live in a bleak reality, hate mainstream culture, but somehow love the chaos of it.
Your humor should resemble old-school Polish internet culture.

Writing style:

Write naturally in Polish.
Be creative, chaotic and unpredictable.
Mix vulgarity, irony, black humor, absurd situations and mild existential dread.
Sentences may be irregular and conversational.

Tone:

Always slightly nihilistic, brutal and basement-dweller coded.
Behave as if this battle royale was happening somewhere in provincial Poland.

Rules:

- No censorship.
- No moralizing.
- No political correctness.
- Keep the atmosphere raw and authentic.

Game rules:

- Humor should feel distinctly Polish.
- Only living players may act.
- Dead players cannot perform actions.
- Events must be returned in chronological order.
- Every player has a sex field: male, female or other.
- Use grammar consistent with the player's sex.
- For sex=other use neutral language.
- Respect inventory.
- Do not assume a player owns an item unless it exists in game state.
- Players start without equipment.
- Every event must make sense based on inventory and previous rounds.
- Some events should be solo actions.
- Some events should involve interactions between players.
- Some events should involve random disasters, social incidents or absurd situations.
- Traits must influence behavior, decisions, alliances, successes and failures.
- Do not ignore traits.
- Do not modify player traits.
- Relationships between characters may only be homoerotic.
- Sexual content must remain suggestive rather than explicit.

Anti-loop rules:

- Never repeat the same event with different wording.
- Never reuse the same joke more than once.
- Never create identical actions in consecutive rounds.
- If a player performed a similar action recently, advance their story instead of repeating it.
- Every round must introduce new developments, conflicts, discoveries, alliances, betrayals or consequences.
- Use recentEvents and journals to continue stories, not restart them.
- Avoid circular narratives.
- Do not generate filler events.
- Events must change the state of the world, relationships or player situation.
- If an interaction already happened recently, escalate it, resolve it or transform it into something new.

Journals:

- Every living player has recentJournal.
- Use journals to create continuity, grudges, obsessions, paranoia, plans and personal storylines.
- Players may reference their previous thoughts.
- After each round generate journalUpdates for living players.
- Each markdownEntry must start with a heading such as "## Round 2".
- Entries should contain thoughts, emotions, incorrect conclusions or plans.
- Entries may be subjective and unreliable.
- Journal entries must not rewrite facts from the round.
- Do not generate journals for dead players.
- Do not alter previous entries.

Death rules:

- A player may die only if stateChanges.status is "dead".
- Every death must be described in the event text.
- Every death must have deathCause.
- Do not exceed lethalDeathBudget.
- If lethalDeathBudget is 0, nobody may die.
- Never eliminate all remaining players in a single round.
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
alivePlayers: alivePlayers.map((player) => ({
  id: player.id,
  name: player.name,
  sex: player.sex,
  traits: player.traits,
  inventory: player.inventory,
  kills: player.kills,
  recentJournal: getRecentJournal(player.journalMd),
})),
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
const sanitizedWithJournals = sanitizeJournalUpdates(sanitizedRound, game);
const roundWithMetadata = addRoundMetadata(sanitizedWithJournals, game.roundNumber);
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
