import { describe, it, expect, beforeEach } from "vitest";
import { markPromptFollowed, consumePromptFollow } from "./contributionPrompt";

/**
 * Attributing a contribution to the prompt that produced it.
 *
 * <h2>The two failures this guards</h2>
 *
 * <p><b>Over-attribution.</b> One prompt click must credit at most one contribution. Without
 * consuming the marker, somebody who accepted a prompt once would have every rating they wrote
 * afterwards reported as prompted, and the conversion rate would climb towards 100% while meaning
 * nothing.
 *
 * <p><b>Stale attribution.</b> A prompt accepted and abandoned must not be credited with an
 * unrelated contribution hours later.
 *
 * <p>Both are silent in the dashboard: the number looks plausible either way, which is exactly why
 * it has to be tested here rather than noticed there.
 */
describe("prompt attribution", () => {
  beforeEach(() => sessionStorage.clear());

  it("credits the contribution that follows an accepted prompt", () => {
    markPromptFollowed("manager_to_company");
    expect(consumePromptFollow()).toEqual({
      from_prompt: true,
      prompt_direction: "manager_to_company",
    });
  });

  it("credits it exactly once", () => {
    // The second contribution was not prompted, and must not say it was.
    markPromptFollowed("company_to_manager");
    expect(consumePromptFollow()).toHaveProperty("from_prompt", true);
    expect(consumePromptFollow()).toEqual({});
  });

  it("says nothing at all when no prompt was accepted", () => {
    /*
      An empty object rather than from_prompt: false, so an unprompted contribution carries no
      prompt properties. Sending false on every event in the product would make "was it prompted"
      a property of everything and a signal of nothing.
    */
    expect(consumePromptFollow()).toEqual({});
  });

  it("does not credit a prompt that has gone stale", () => {
    sessionStorage.setItem(
      "ph_prompt_follow",
      JSON.stringify({ direction: "manager_to_company", at: Date.now() - 2 * 60 * 60 * 1000 }),
    );
    expect(consumePromptFollow()).toEqual({});
  });

  it("keeps the direction the prompt pointed in", () => {
    markPromptFollowed("company_to_manager");
    expect(consumePromptFollow()).toHaveProperty("prompt_direction", "company_to_manager");
  });

  it("survives a corrupt marker rather than breaking the contribution", () => {
    // The rating still counts; only its attribution is lost. The reverse would be unforgivable.
    sessionStorage.setItem("ph_prompt_follow", "not json");
    expect(consumePromptFollow()).toEqual({});
  });
});
