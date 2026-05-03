import { describe, expect, it } from "vitest";
import { sha256Hex as serverSha256Hex } from "../convex/lib/hash";
import { sha256Hex as clientSha256Hex } from "@/lib/hash";

const HELLO_WORLD_SHA256 =
  "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9";

describe("file hash helpers", () => {
  it("produce the same stable SHA256 digest", async () => {
    const file = new File(["hello world"], "statement.pdf", {
      type: "application/pdf",
    });

    expect(await clientSha256Hex(file)).toBe(HELLO_WORLD_SHA256);
    expect(await serverSha256Hex(await file.arrayBuffer())).toBe(
      HELLO_WORLD_SHA256,
    );
  });
});
