/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { formatSourceLocation, getSourceLocation } from "./source-location";

function attachFiber(element: HTMLElement, fiber: unknown): void {
  (element as unknown as Record<string, unknown>)["__reactFiber$test"] = fiber;
}

describe("Fulcro source location detection", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("reports a Fulcro namespace and line without fabricating a source path", () => {
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
        fileName: "app.components.combobox",
        lineNumber: 106,
        locationType: "namespace",
      },
    });
    expect(formatSourceLocation(result.source!, "path")).toBe(
      "app.components.combobox:106",
    );
    expect(formatSourceLocation(result.source!, "vscode")).toBe(
      "app.components.combobox:106",
    );
  });

  it("uses a configured resolver to report an actual Fulcro source path", () => {
    const wrapper = document.createElement("div");
    wrapper.setAttribute(
      "data-fulcro-source",
      "app.benchmarks.smart-benchmark-explorer:219",
    );
    const button = document.createElement("button");
    wrapper.appendChild(button);
    document.body.appendChild(wrapper);
    const resolveFulcroSourcePath = vi.fn(
      (namespace: string) => `/workspace/${namespace}.cljs`,
    );

    const result = getSourceLocation(button, { resolveFulcroSourcePath });

    expect(resolveFulcroSourcePath).toHaveBeenCalledWith(
      "app.benchmarks.smart-benchmark-explorer",
    );
    expect(result).toMatchObject({
      found: true,
      source: {
        fileName: "/workspace/app.benchmarks.smart-benchmark-explorer.cljs",
        lineNumber: 219,
        locationType: "file",
      },
    });
  });

  it("preserves an unknown annotated line instead of substituting one", () => {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-fulcro-source", "app.components.combobox:?");
    const input = document.createElement("input");
    wrapper.appendChild(input);
    document.body.appendChild(wrapper);

    const result = getSourceLocation(input);

    expect(result).toMatchObject({
      found: true,
      source: {
        fileName: "app.components.combobox",
        lineNumber: "?",
      },
    });
    expect(formatSourceLocation(result.source!)).toBe(
      "app.components.combobox:?",
    );
  });

  it("skips internal Fulcro namespaces and reports app component namespace when no line is available", () => {
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
        fileName: "app.benchmarks.compare.screen",
        lineNumber: "?",
        componentName: "app.benchmarks.compare.screen/CompareForm",
        locationType: "namespace",
      },
    });
  });

  it("continues past internal Fulcro wrappers to an annotated app ancestor", () => {
    const appWrapper = document.createElement("div");
    appWrapper.setAttribute(
      "data-fulcro-source",
      "app.benchmarks.smart-benchmark-explorer:219",
    );
    const internalWrapper = document.createElement("div");
    internalWrapper.setAttribute(
      "data-fulcro-source",
      "com.fulcrologic.fulcro.react.error-boundaries:1",
    );
    const button = document.createElement("button");
    internalWrapper.appendChild(button);
    appWrapper.appendChild(internalWrapper);
    document.body.appendChild(appWrapper);

    attachFiber(button, {
      _debugSource: {
        fileName: "/node_modules/agentation/dist/index.js",
        lineNumber: 2460,
      },
      return: null,
    });

    const result = getSourceLocation(button);

    expect(result).toMatchObject({
      found: true,
      source: {
        fileName: "app.benchmarks.smart-benchmark-explorer",
        lineNumber: 219,
        locationType: "namespace",
      },
    });
  });
});
