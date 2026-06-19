export type PlayerStatus = "alive" | "dead";
export type PlayerSex = "male" | "female" | "other";

export type ParticipantInput = {
  name: string;
  sex: PlayerSex;
};

export type Player = {
  id: string;
  name: string;
  sex: PlayerSex;
  status: PlayerStatus;
  inventory: string[];
  kills: number;
  deathCause?: string;
};

export type GameState = {
  roundNumber: number;
  mortalityRate: number;
  players: Player[];
  log: RoundEvent[];
  winnerId?: string;
};

export type RoundEventType =
  | "start"
  | "loot"
  | "hide"
  | "fight"
  | "accident"
  | "random"
  | "lethal";

export type StateChange = {
  playerId: string;
  inventoryAdd: string[];
  inventoryRemove: string[];
  status: "alive" | "dead" | "unchanged";
  killCreditPlayerId: string | null;
  deathCause: string | null;
};

export type GeneratedRoundEvent = {
  type: RoundEventType;
  participants: string[];
  text: string;
  stateChanges: StateChange[];
};

export type RoundEvent = GeneratedRoundEvent & {
  roundNumber: number;
  timestamp: string;
};

export type AiGeneratedRoundResult = {
  events: GeneratedRoundEvent[];
  roundSummary: string;
};

export type AiRoundResult = {
  events: RoundEvent[];
  roundSummary: string;
};