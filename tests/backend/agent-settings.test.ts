import { expect, test } from "bun:test";
import { validateAgentSettings } from "../../src/server/agents/store";
test("agent settings reject empty, missing and oversized prompts/instructions", () => {
  for (const input of [null, {}, { prompt: " ", instructions: "go" }, { prompt: "go", instructions: "" }, { prompt: "a".repeat(8001), instructions: "go" }, { prompt: "go", instructions: "a".repeat(32001) }]) expect(() => validateAgentSettings(input)).toThrow();
  expect(validateAgentSettings({ prompt: " work ", instructions: " # Instructions " })).toEqual({ prompt: "work", instructions: "# Instructions" });
});
