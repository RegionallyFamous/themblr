import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ThemblrApp } from "@/components/themblr-app";

describe("ThemblrApp", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runs generation and renders output report", async () => {
    const user = userEvent.setup();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        fileName: "my-theme-2026-02-24-theme.html",
        themeHtml: "<html><body>ok</body></html>",
        validation: {
          passed: true,
          errors: [],
          warnings: [],
          checks: [
            {
              id: "required-meta-options",
              passed: true,
              severity: "error",
              message: "ok",
            },
          ],
        },
        report: {
          lockedRegionsRepaired: 0,
          retryCount: 0,
          changedRegions: [
            {
              zone: "cssCore",
              changed: true,
              oldChars: 10,
              newChars: 12,
            },
          ],
        },
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<ThemblrApp />);

    await user.click(screen.getByRole("button", { name: "Generate Theme" }));

    await waitFor(() => {
      expect(screen.getByText("Validation passed")).toBeInTheDocument();
    });

    expect(screen.getByText(/Locked regions repaired: 0/)).toBeInTheDocument();
    expect(screen.getByText(/cssCore: changed/)).toBeInTheDocument();
  });

  it("accepts a 422 generate response that includes validation payload", async () => {
    const user = userEvent.setup();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () =>
        JSON.stringify({
          ok: true,
          fileName: "my-theme-2026-02-24-theme.html",
          themeHtml: "<html><body>invalid-but-returned</body></html>",
          validation: {
            passed: false,
            errors: ["Missing Tumblr blocks"],
            warnings: [],
            checks: [
              {
                id: "required-tumblr-blocks",
                passed: false,
                severity: "error",
                message: "Missing Tumblr blocks",
              },
            ],
          },
          report: {
            lockedRegionsRepaired: 0,
            retryCount: 1,
            changedRegions: [],
          },
        }),
      headers: {
        get: vi.fn().mockReturnValue("req-422"),
      },
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<ThemblrApp />);

    await user.click(screen.getByRole("button", { name: "Generate Theme" }));

    await waitFor(() => {
      expect(screen.getByText("Validation failed")).toBeInTheDocument();
    });

    expect(screen.queryByText(/req-422/)).not.toBeInTheDocument();
    expect(screen.getByText(/Retry count: 1/)).toBeInTheDocument();
  });
});
