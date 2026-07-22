import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { isElementTopmostAtPoint, PageFeedbackToolbarCSS } from "./index";
import type { Annotation } from "../../types";

// Mock clipboard API
const mockClipboard = {
  writeText: vi.fn().mockResolvedValue(undefined),
};

let restoreDocumentMethods: Array<() => void> = [];

function mockElementFromPoint(element: Element | null): void {
  const descriptor = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: vi.fn(() => element),
  });
  restoreDocumentMethods.push(() => {
    if (descriptor) {
      Object.defineProperty(document, "elementFromPoint", descriptor);
    } else {
      delete (document as Partial<Document>).elementFromPoint;
    }
  });
}

function mockElementsFromPoint(elements: Element[]): void {
  const descriptor = Object.getOwnPropertyDescriptor(document, "elementsFromPoint");
  Object.defineProperty(document, "elementsFromPoint", {
    configurable: true,
    value: vi.fn(() => elements),
  });
  restoreDocumentMethods.push(() => {
    if (descriptor) {
      Object.defineProperty(document, "elementsFromPoint", descriptor);
    } else {
      delete (document as Partial<Document>).elementsFromPoint;
    }
  });
}

beforeEach(() => {
  vi.stubGlobal("navigator", {
    clipboard: mockClipboard,
    userAgent: "test-agent",
  });
  mockClipboard.writeText.mockClear();
});

afterEach(() => {
  restoreDocumentMethods.reverse().forEach((restore) => restore());
  restoreDocumentMethods = [];
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PageFeedbackToolbarCSS", () => {
  describe("selection visibility", () => {
    it("does not treat an element beneath an SVG as topmost", () => {
      const target = document.createElement("button");
      const occluder = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      );
      document.body.append(target, occluder);
      mockElementsFromPoint([occluder, target]);

      expect(isElementTopmostAtPoint(target, 20, 20)).toBe(false);
    });
  });

  describe("onAnnotationAdd callback", () => {
    it("should accept onAnnotationAdd prop without errors", () => {
      const handleAnnotation = vi.fn();
      expect(() =>
        render(<PageFeedbackToolbarCSS onAnnotationAdd={handleAnnotation} />)
      ).not.toThrow();
    });

    it("should type-check annotation callback parameter", () => {
      // This test verifies TypeScript types are correct at compile time
      const handleAnnotation = (annotation: Annotation) => {
        // Verify all expected properties are accessible
        expect(annotation).toHaveProperty("id");
        expect(annotation).toHaveProperty("x");
        expect(annotation).toHaveProperty("y");
        expect(annotation).toHaveProperty("comment");
        expect(annotation).toHaveProperty("element");
        expect(annotation).toHaveProperty("elementPath");
        expect(annotation).toHaveProperty("timestamp");
      };

      render(<PageFeedbackToolbarCSS onAnnotationAdd={handleAnnotation} />);
    });

    it("uses resolveFulcroSourcePath when an annotation is created", async () => {
      const onAnnotationAdd = vi.fn();
      const target = document.createElement("button");
      target.textContent = "Save";
      target.setAttribute(
        "data-fulcro-source",
        "app.settings.screen:106",
      );
      vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
        bottom: 80,
        height: 30,
        left: 40,
        right: 160,
        top: 50,
        width: 120,
        x: 40,
        y: 50,
        toJSON: () => ({}),
      } as DOMRect);
      document.body.appendChild(target);
      mockElementFromPoint(target);

      render(
        <PageFeedbackToolbarCSS
          onAnnotationAdd={onAnnotationAdd}
          resolveFulcroSourcePath={(namespace) =>
            `/workspace/src/${namespace}.cljs`
          }
        />,
      );
      fireEvent.click(screen.getByTitle("Start feedback mode"));
      await waitFor(() =>
        expect(screen.queryByTitle("Start feedback mode")).toBeNull(),
      );

      fireEvent.click(target, { clientX: 100, clientY: 65 });
      const comment = await screen.findByPlaceholderText("What should change?");
      fireEvent.change(comment, { target: { value: "Save the new value" } });
      fireEvent.click(screen.getByRole("button", { name: "Add" }));

      expect(onAnnotationAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceFile: "/workspace/src/app.settings.screen.cljs:106",
        }),
      );
      target.remove();
    });
  });

  describe("copyToClipboard prop", () => {
    it("should default copyToClipboard to true", () => {
      // Component should render without explicit copyToClipboard prop
      expect(() => render(<PageFeedbackToolbarCSS />)).not.toThrow();
    });

    it("should accept copyToClipboard={false} without errors", () => {
      expect(() =>
        render(<PageFeedbackToolbarCSS copyToClipboard={false} />)
      ).not.toThrow();
    });

    it("should accept copyToClipboard={true} without errors", () => {
      expect(() =>
        render(<PageFeedbackToolbarCSS copyToClipboard={true} />)
      ).not.toThrow();
    });
  });

  describe("combined props", () => {
    it("should accept both onAnnotationAdd and copyToClipboard props", () => {
      const handleAnnotation = vi.fn();
      expect(() =>
        render(
          <PageFeedbackToolbarCSS
            onAnnotationAdd={handleAnnotation}
            copyToClipboard={false}
          />
        )
      ).not.toThrow();
    });
  });

  describe("host interaction blocking", () => {
    it("allows native text selection while feedback mode is active", async () => {
      render(<PageFeedbackToolbarCSS />);
      fireEvent.click(screen.getByTitle("Start feedback mode"));
      await waitFor(() =>
        expect(screen.queryByTitle("Start feedback mode")).toBeNull()
      );

      const paragraph = document.createElement("p");
      paragraph.textContent = "Selectable feedback context";
      const hostMouseDown = vi.fn();
      paragraph.addEventListener("mousedown", hostMouseDown);
      document.body.appendChild(paragraph);

      const mouseDown = new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
      });
      paragraph.dispatchEvent(mouseDown);

      expect(mouseDown.defaultPrevented).toBe(false);
      expect(hostMouseDown).not.toHaveBeenCalled();
      paragraph.remove();
    });

    it("blocks host pointer and click handlers from a window capture listener", async () => {
      render(<PageFeedbackToolbarCSS />);
      fireEvent.click(screen.getByTitle("Start feedback mode"));
      await waitFor(() =>
        expect(screen.queryByTitle("Start feedback mode")).toBeNull(),
      );

      const target = document.createElement("div");
      target.textContent = "Host surface";
      const hostPointerDown = vi.fn();
      const hostPointerMove = vi.fn();
      const hostPointerUp = vi.fn();
      const hostClick = vi.fn();
      target.addEventListener("pointerdown", hostPointerDown);
      target.addEventListener("pointermove", hostPointerMove);
      target.addEventListener("pointerup", hostPointerUp);
      target.addEventListener("click", hostClick);
      document.body.appendChild(target);
      mockElementFromPoint(target);

      const pointerDown = new Event("pointerdown", {
        bubbles: true,
        cancelable: true,
      });
      const pointerMove = new Event("pointermove", {
        bubbles: true,
        cancelable: true,
      });
      const pointerUp = new Event("pointerup", {
        bubbles: true,
        cancelable: true,
      });
      const click = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        clientX: 20,
        clientY: 20,
      });

      act(() => {
        target.dispatchEvent(pointerDown);
        target.dispatchEvent(pointerMove);
        target.dispatchEvent(pointerUp);
        target.dispatchEvent(click);
      });

      expect(pointerDown.defaultPrevented).toBe(false);
      expect(pointerMove.defaultPrevented).toBe(false);
      expect(pointerUp.defaultPrevented).toBe(false);
      expect(click.defaultPrevented).toBe(true);
      expect(hostPointerDown).not.toHaveBeenCalled();
      expect(hostPointerMove).not.toHaveBeenCalled();
      expect(hostPointerUp).not.toHaveBeenCalled();
      expect(hostClick).not.toHaveBeenCalled();
      target.remove();
    });
  });
});

describe("Annotation type", () => {
  it("should include all required fields", () => {
    const annotation: Annotation = {
      id: "test-id",
      x: 50,
      y: 100,
      comment: "Test comment",
      element: "Button",
      elementPath: "body > div > button",
      timestamp: Date.now(),
    };

    expect(annotation.id).toBe("test-id");
    expect(annotation.x).toBe(50);
    expect(annotation.y).toBe(100);
    expect(annotation.comment).toBe("Test comment");
    expect(annotation.element).toBe("Button");
    expect(annotation.elementPath).toBe("body > div > button");
    expect(typeof annotation.timestamp).toBe("number");
  });

  it("should allow optional metadata fields", () => {
    const annotation: Annotation = {
      id: "test-id",
      x: 50,
      y: 100,
      comment: "Test comment",
      element: "Button",
      elementPath: "body > div > button",
      timestamp: Date.now(),
      selectedText: "Selected text content",
      boundingBox: { x: 100, y: 200, width: 150, height: 40 },
      nearbyText: "Context around the element",
      cssClasses: "btn btn-primary",
      nearbyElements: "div, span, a",
      computedStyles: "color: blue; font-size: 14px",
      fullPath: "html > body > div#app > main > button.btn",
      accessibility: "role=button, aria-label=Submit",
      isMultiSelect: false,
      isFixed: false,
    };

    expect(annotation.selectedText).toBe("Selected text content");
    expect(annotation.boundingBox).toEqual({
      x: 100,
      y: 200,
      width: 150,
      height: 40,
    });
    expect(annotation.cssClasses).toBe("btn btn-primary");
    expect(annotation.fullPath).toBe("html > body > div#app > main > button.btn");
    expect(annotation.accessibility).toBe("role=button, aria-label=Submit");
    expect(annotation.isMultiSelect).toBe(false);
    expect(annotation.isFixed).toBe(false);
  });
});
