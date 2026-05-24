/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from "vitest";
import { getSourceLocation } from "./source-location";

function attachFiber(element: HTMLElement, fiber: unknown): void {
  (element as unknown as Record<string, unknown>)["__reactFiber$test"] = fiber;
}

describe("Fulcro source location detection", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("uses Fulcro DOM source annotations before React fiber fallbacks", () => {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-fulcro-source", "app.components.combobox:106");
    const input = document.createElement("input");
    wrapper.appendChild(input);
    document.body.appendChild(wrapper);

    attachFiber(input, {
      _debugSource: {
        fileName: "/node_modules/agentation/dist/index.js",
        lineNumber: 2460,
      },
      type: { displayName: "Agentation" },
      return: null,
    });

    const result = getSourceLocation(input);

    expect(result).toMatchObject({
      found: true,
      source: {
        fileName: "src/app/components/combobox.cljs",
        lineNumber: 106,
      },
    });
  });

  it("skips internal Fulcro namespaces and falls back to app CLJS component names", () => {
    const wrapper = document.createElement("div");
    wrapper.setAttribute(
      "data-fulcro-source",
      "com.fulcrologic.fulcro.react.error-boundaries:1",
    );
    const input = document.createElement("input");
    wrapper.appendChild(input);
    document.body.appendChild(wrapper);

    attachFiber(input, {
      type: "input",
      return: {
        type: { displayName: "app.benchmarks.compare.screen/CompareForm" },
        return: null,
      },
    });

    const result = getSourceLocation(input);

    expect(result).toMatchObject({
      found: true,
      source: {
        fileName: "src/app/benchmarks/compare/screen.cljs",
        lineNumber: 1,
        componentName: "app.benchmarks.compare.screen/CompareForm",
      },
    });
  });
});
