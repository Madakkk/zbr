"use client";

import { useMemo, useState } from "react";
import { createInitialGame } from "@/lib/game";
import { GameState, ParticipantInput, PlayerSex, RoundEvent } from "@/lib/types";

const AI_PROVIDER_OPTIONS = [
  {
    label: "GPT",
    value: "openai",
    description: "Lepsze trzymanie zasad, schematu JSON i ciągłości gry.",
  },
  {
    label: "Grok",
    value: "xai",
    description: "Szybszy chaos, bardziej odklejony humor i większy vibe dramy.",
  },
] as const;

type AiProvider = (typeof AI_PROVIDER_OPTIONS)[number]["value"];

function getEventIcon(type: RoundEvent["type"]) {
  switch (type) {
    case "start":
      return "🏁";
    case "loot":
      return "🎒";
    case "hide":
      return "🫥";
    case "fight":
      return "⚔️";
    case "accident":
      return "💥";
    case "lethal":
      return "☠️";
    default:
      return "🌀";
  }
}

function getEventTitle(type: RoundEvent["type"]) {
  switch (type) {
    case "start":
      return "Runda startowa";
    case "loot":
      return "Zbieranie";
    case "hide":
      return "Ukrycie";
    case "fight":
      return "Starcie";
    case "accident":
      return "Wypadek";
    case "lethal":
      return "Wydarzenie śmiertelne";
    default:
      return "Zdarzenie losowe";
  }
}

function getStatusLabel(status: "alive" | "dead") {
  return status === "alive" ? "żyje" : "odpadł/a";
}

function getSexLabel(sex: PlayerSex) {
  switch (sex) {
    case "male":
      return "mężczyzna";
    case "female":
      return "kobieta";
    default:
      return "inna";
  }
}

function formatEventTime(timestamp: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

export default function Home() {
  const [participants, setParticipants] = useState<ParticipantInput[]>([
    { name: "Grzegorz", sex: "male" },
    { name: "Marta", sex: "female" },
    { name: "Pan Wiadro", sex: "male" },
    { name: "Sandra", sex: "female" },
    { name: "Sebix z Rady Osiedla", sex: "male" },
    { name: "Kasia od Excela", sex: "female" },
  ]);

  const [mortalityRate, setMortalityRate] = useState(25);
  const [aiProvider, setAiProvider] = useState<AiProvider>("xai");
  const [game, setGame] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeRoundNumber, setActiveRoundNumber] = useState<number | null>(null);

  const validParticipants = useMemo(() => {
    return participants
      .map((participant) => ({
        ...participant,
        name: participant.name.trim(),
      }))
      .filter((participant) => participant.name.length > 0);
  }, [participants]);

  const alivePlayers = game?.players.filter((player) => player.status === "alive") ?? [];
  const deadPlayers = game?.players.filter((player) => player.status === "dead") ?? [];
  const winner = game?.players.find((player) => player.id === game.winnerId);

  const selectedProvider = AI_PROVIDER_OPTIONS.find(
    (provider) => provider.value === aiProvider
  );

  const rounds = useMemo(() => {
    if (!game) return [];

    const map = new Map<number, RoundEvent[]>();

    for (const event of game.log) {
      const existing = map.get(event.roundNumber) ?? [];
      existing.push(event);
      map.set(event.roundNumber, existing);
    }

    return Array.from(map.entries())
      .map(([roundNumber, events]) => ({
        roundNumber,
        events: events.sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        ),
      }))
      .sort((a, b) => a.roundNumber - b.roundNumber);
  }, [game]);

  const selectedRound =
    rounds.find((round) => round.roundNumber === activeRoundNumber) ??
    rounds[rounds.length - 1];

  function updateParticipant(index: number, patch: Partial<ParticipantInput>) {
    setParticipants((current) =>
      current.map((participant, participantIndex) =>
        participantIndex === index ? { ...participant, ...patch } : participant
      )
    );
  }

  function addParticipant() {
    setParticipants((current) => [...current, { name: "", sex: "other" }]);
  }

  function removeParticipant(index: number) {
    setParticipants((current) =>
      current.filter((_, participantIndex) => participantIndex !== index)
    );
  }

  function startGame() {
    if (validParticipants.length < 2) return;

    setGame(createInitialGame(validParticipants, mortalityRate));
    setActiveRoundNumber(null);
  }

  function resetGame() {
    setGame(null);
    setLoading(false);
    setActiveRoundNumber(null);
  }

  function getPlayerName(playerId: string) {
    return game?.players.find((player) => player.id === playerId)?.name ?? playerId;
  }

  async function generateRound() {
    if (!game || game.winnerId) return;

    setLoading(true);

    try {
      const res = await fetch("/api/round", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          game,
          provider: aiProvider,
        }),
      });

      const data = await res.json();

      if (data.game) {
        setGame(data.game);
        setActiveRoundNumber(Math.max(1, data.game.roundNumber - 1));
      } else if (data.error) {
        alert(data.error);
      }
    } catch (error) {
      console.error(error);
      alert("Runda się wywaliła. Sprawdź logi w terminalu.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">symulator polskiego chaosu</p>
          <h1>Battle Royale Generator</h1>
          <p className="hero-copy">
            Dodaj uczestników, ustaw śmiertelność i generuj rundy, aż zostanie
            jedna osoba, która wygrała technicznie, ale emocjonalnie nikt.
          </p>
        </div>

        <div className="hero-card">
          <span>Śmiertelność</span>
          <strong>{mortalityRate}%</strong>
          <small>
            {mortalityRate < 20
              ? "spokojna rozgrzewka"
              : mortalityRate < 45
                ? "średni chaos"
                : "pełna katastrofa"}
          </small>
        </div>
      </section>

      {!game && (
        <section className="setup-grid">
          <div className="panel setup-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">konfiguracja</p>
                <h2>Uczestnicy</h2>
              </div>
              <span className="count-pill">{validParticipants.length} osób</span>
            </div>

            <div className="participant-editor">
              {participants.map((participant, index) => (
                <div className="participant-row" key={index}>
                  <input
                    value={participant.name}
                    onChange={(e) => updateParticipant(index, { name: e.target.value })}
                    className="name-input"
                    placeholder="Imię albo nazwa uczestnika"
                  />

                  <select
                    value={participant.sex}
                    onChange={(e) =>
                      updateParticipant(index, { sex: e.target.value as PlayerSex })
                    }
                    className="sex-select"
                  >
                    <option value="male">mężczyzna</option>
                    <option value="female">kobieta</option>
                    <option value="other">inna</option>
                  </select>

                  <button
                    className="remove-button"
                    onClick={() => removeParticipant(index)}
                    disabled={participants.length <= 2}
                    type="button"
                  >
                    Usuń
                  </button>
                </div>
              ))}
            </div>

            <button className="ghost-button full-width" onClick={addParticipant} type="button">
              Dodaj uczestnika
            </button>

            <div className="model-picker">
              <label className="field-label" htmlFor="ai-provider">
                Model AI
              </label>

              <select
                id="ai-provider"
                value={aiProvider}
                onChange={(e) => setAiProvider(e.target.value as AiProvider)}
                className="sex-select"
              >
                {AI_PROVIDER_OPTIONS.map((provider) => (
                  <option key={provider.value} value={provider.value}>
                    {provider.label}
                  </option>
                ))}
              </select>

              <p className="field-help">{selectedProvider?.description}</p>
            </div>

            <div className="slider-row">
              <div>
                <label className="field-label" htmlFor="mortality">
                  Śmiertelność
                </label>
                <p className="field-help">
                  Pierwsza runda jest zawsze bezpieczna. Potem zaczynają się eliminacje.
                </p>
              </div>

              <strong>{mortalityRate}%</strong>
            </div>

            <input
              id="mortality"
              type="range"
              min="0"
              max="80"
              value={mortalityRate}
              onChange={(e) => setMortalityRate(Number(e.target.value))}
              className="mortality-slider"
            />

            <button
              className="primary-button"
              onClick={startGame}
              disabled={validParticipants.length < 2}
            >
              Rozpocznij grę
            </button>
          </div>

          <div className="panel preview-panel">
            <p className="eyebrow">lista startowa</p>
            <div className="preview-list">
              {validParticipants.map((participant, index) => (
                <div className="preview-player" key={`${participant.name}-${index}`}>
                  <span>{index + 1}</span>
                  <div>
                    <strong>{participant.name}</strong>
                    <small>{getSexLabel(participant.sex)}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {game && (
        <section className="game-layout">
          <aside className="panel roster-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">uczestnicy</p>
                <h2>Stan gry</h2>
              </div>
              <button className="ghost-button" onClick={resetGame}>
                Reset
              </button>
            </div>

            <div className="stats-grid">
              <div>
                <span>Żyją</span>
                <strong>{alivePlayers.length}</strong>
              </div>
              <div>
                <span>Odpadli</span>
                <strong>{deadPlayers.length}</strong>
              </div>
            </div>

            <div className="player-list">
              {game.players.map((player) => (
                <article
                  key={player.id}
                  className={`player-card ${player.status === "dead" ? "is-dead" : ""}`}
                >
                  <div className="player-topline">
                    <strong>{player.name}</strong>
                    <span className={`status-pill ${player.status}`}>
                      {getStatusLabel(player.status)}
                    </span>
                  </div>

                  <div className="player-meta">
                    <span>{getSexLabel(player.sex)}</span>
                    <span>Eliminacje: {player.kills}</span>
                  </div>

                  <p className="inventory">
                    {player.inventory.length ? player.inventory.join(", ") : "Brak sprzętu."}
                  </p>

                  {player.status === "dead" && player.deathCause && (
                    <p className="death-cause">{player.deathCause}</p>
                  )}
                </article>
              ))}
            </div>
          </aside>

          <section className="arena">
            <div className="panel control-panel">
              <div>
                <p className="eyebrow">
                  {game.roundNumber === 1 ? "runda startowa" : "aktualna runda"}
                </p>
                <h2>Runda {game.roundNumber}</h2>
                <p className="field-help">AI: {selectedProvider?.label}</p>
              </div>

              {!winner && (
                <button
                  className="primary-button compact"
                  onClick={generateRound}
                  disabled={loading}
                >
                  {loading
                    ? "Generuję rundę..."
                    : game.roundNumber === 1
                      ? "Rozegraj rundę startową"
                      : "Generuj kolejną rundę"}
                </button>
              )}
            </div>

            {winner && (
              <div className="winner-card">
                <p className="eyebrow">zwycięzca</p>
                <h2>{winner.name} przetrwał/a</h2>
                <p>
                  Gra zakończona. Wynik zostanie zapewne zakwestionowany w komentarzach.
                </p>
              </div>
            )}

            <div className="panel log-panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">dziennik gry</p>
                  <h2>Wydarzenia</h2>
                </div>
                <span className="count-pill">{game.log.length} wydarzeń</span>
              </div>

              {game.log.length === 0 ? (
                <div className="empty-log">
                  <strong>Jeszcze nic się nie stało.</strong>
                  <p>Kliknij pierwszą rundę, żeby rozdać sprzęt i ustawić sytuację.</p>
                </div>
              ) : (
                <>
                  <div className="round-tabs">
                    {rounds.map((round) => (
                      <button
                        key={round.roundNumber}
                        className={`round-tab ${
                          selectedRound?.roundNumber === round.roundNumber ? "active" : ""
                        }`}
                        onClick={() => setActiveRoundNumber(round.roundNumber)}
                        type="button"
                      >
                        Runda {round.roundNumber}
                      </button>
                    ))}
                  </div>

                  <div className="event-list">
                    {selectedRound?.events.map((event, index) => {
                      const participantsText = event.participants
                        .map((id) => getPlayerName(id))
                        .join(", ");

                      return (
                        <article className="event-card" key={`${event.timestamp}-${index}`}>
                          <div className="event-icon">{getEventIcon(event.type)}</div>

                          <div>
                            <div className="event-header">
                              <strong>{getEventTitle(event.type)}</strong>
                              <span>{formatEventTime(event.timestamp)}</span>
                            </div>

                            {participantsText && (
                              <p className="event-participants">{participantsText}</p>
                            )}

                            <p>{event.text}</p>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </section>
        </section>
      )}
    </main>
  );
}