import { AiRoundResult, GameState, ParticipantInput, Player, StateChange } from "./types";

function applyChange(player: Player, change: StateChange): Player {
  const inventory = player.inventory
    .filter((item) => !change.inventoryRemove.includes(item))
    .concat(change.inventoryAdd);

  const status =
    player.status === "alive" && change.status === "dead" ? "dead" : player.status;

  return {
    ...player,
    status,
    inventory: [...new Set(inventory)],
    deathCause:
      status === "dead" && change.deathCause ? change.deathCause : player.deathCause,
  };
}

export function applyRound(game: GameState, aiRound: AiRoundResult): GameState {
  let players = [...game.players];

  for (const event of aiRound.events) {
    for (const change of event.stateChanges) {
      players = players.map((player) => {
        if (player.id !== change.playerId) return player;
        if (player.status === "dead") return player;

        return applyChange(player, change);
      });

      if (change.status === "dead" && change.killCreditPlayerId) {
        players = players.map((player) => {
          if (player.id !== change.killCreditPlayerId) return player;
          if (player.status === "dead") return player;

          return {
            ...player,
            kills: player.kills + 1,
          };
        });
      }
    }
  }

  const alive = players.filter((player) => player.status === "alive");

  return {
    ...game,
    roundNumber: game.roundNumber + 1,
    players,
    log: [...game.log, ...aiRound.events],
    winnerId: alive.length === 1 ? alive[0].id : undefined,
  };
}

export function createInitialGame(
  participants: ParticipantInput[],
  mortalityRate: number
): GameState {
  return {
    roundNumber: 1,
    mortalityRate,
    players: participants.map((participant, index) => ({
      id: `p${index + 1}`,
      name: participant.name,
      sex: participant.sex,
      status: "alive",
      inventory: [],
      kills: 0,
    })),
    log: [],
  };
}