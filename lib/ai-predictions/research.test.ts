import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  researchInstructions,
  researchPredictions,
  type ResearchSource,
} from "./research.ts";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const fixture: ResearchSource = {
  fixtureId: "11111111-1111-4111-8111-111111111111",
  competition: "UEFA Champions League",
  fixture: {
    kickoffAt: "2026-09-08T19:00:00.000Z",
    stage: "league_phase",
    round: "League Stage - 1",
    venue: "Santiago Bernabeu",
    homeTeam: "Real Madrid",
    awayTeam: "Inter",
  },
  modelProbabilities: { home: 0.5, draw: 0.27, away: 0.23 },
  recentResults: { homeTeam: [], awayTeam: [] },
};

describe("OpenAI researched predictions", () => {
  it("requires current web research and preserves home/away semantics", () => {
    const instructions = researchInstructions(new Date("2026-09-06T00:00:00Z"));
    assert.match(instructions, /use live web search/i);
    assert.match(instructions, /predictedHomeGoals.*homeTeam/i);
    assert.match(instructions, /2026-09-06/);
  });

  it("accepts structured output only with a source returned by web search", async () => {
    const requestBodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = async (_input, init) => {
      requestBodies.push(
        JSON.parse(String(init?.body)) as Record<string, unknown>
      );
      return new Response(
        JSON.stringify({
          status: "completed",
          usage: {
            input_tokens: 1_000,
            input_tokens_details: { cached_tokens: 100, cache_write_tokens: 0 },
            output_tokens: 500,
          },
          output_text: JSON.stringify({
            predictions: [
              {
                fixtureId: fixture.fixtureId,
                predictedHomeGoals: 2,
                predictedAwayGoals: 1,
                homeWinProbability: 55,
                drawProbability: 25,
                awayWinProbability: 20,
                confidence: 72,
                summaryEn: "Real Madrid have a narrow edge based on current evidence.",
                summaryHe: "לריאל מדריד יתרון קטן לפי המידע העדכני.",
                keyFactorsEn: ["Recent form", "Team availability", "Home record"],
                keyFactorsHe: ["כושר אחרון", "זמינות שחקנים", "מאזן בית"],
                sources: [
                  { title: "UEFA match preview", url: "https://uefa.com/example" },
                ],
              },
            ],
          }),
          output: [
            {
              type: "web_search_call",
              action: {
                sources: [
                  { title: "UEFA match preview", url: "https://uefa.com/example" },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const result = await researchPredictions(
      [fixture],
      "test-key",
      "test-model",
      new Date("2026-09-06T00:00:00Z")
    );

    assert.equal(result.predictions[0]?.predictedHomeGoals, 2);
    assert.deepEqual(result.predictions[0]?.sources, [
      { title: "UEFA match preview", url: "https://uefa.com/example" },
    ]);
    assert.deepEqual(result.usage, {
      inputTokens: 1_000,
      cachedInputTokens: 100,
      cacheWriteTokens: 0,
      outputTokens: 500,
      webSearchCalls: 1,
    });
    const requestBody = requestBodies[0];
    assert.deepEqual(requestBody?.tools, [
      { type: "web_search", search_context_size: "low" },
    ]);
    assert.equal(requestBody?.tool_choice, "required");
    assert.equal(requestBody?.max_tool_calls, 4);
    assert.equal(requestBody?.max_output_tokens, 4_000);
  });

  it("retries a temporary rate limit using the response delay", async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(
          JSON.stringify({ error: { message: "Rate limited; try again in 0ms" } }),
          { status: 429, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({
          status: "completed",
          usage: { input_tokens: 10, output_tokens: 10 },
          output_text: JSON.stringify({
            predictions: [{
              fixtureId: fixture.fixtureId,
              predictedHomeGoals: 1,
              predictedAwayGoals: 0,
              homeWinProbability: 45,
              drawProbability: 30,
              awayWinProbability: 25,
              confidence: 60,
              summaryEn: "A narrow home edge.",
              summaryHe: "יתרון ביתי קטן.",
              keyFactorsEn: ["Form", "Availability", "Venue"],
              keyFactorsHe: ["כושר", "זמינות", "ביתיות"],
              sources: [{ title: "UEFA", url: "https://uefa.com/example" }],
            }],
          }),
          output: [{
            type: "web_search_call",
            action: { sources: [{ title: "UEFA", url: "https://uefa.com/example" }] },
          }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    await researchPredictions([fixture], "test-key", "test-model");
    assert.equal(calls, 2);
  });
});
