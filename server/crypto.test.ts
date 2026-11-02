import { describe, expect, it } from "vitest";

process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("hex");
const { decryptChunk, encryptChunk, sha256, splitBufferIntoChunks } = await import("./crypto.js");

describe("CloudVault chunk encryption", () => {
  it("splits bytes into ordered chunks and preserves a final partial chunk", () => {
    const chunks = splitBufferIntoChunks(Buffer.from("abcdefg"), 3);
    expect(chunks.map((chunk) => chunk.toString())).toEqual(["abc", "def", "g"]);
  });

  it("represents an empty file as one empty chunk", () => {
    expect(splitBufferIntoChunks(Buffer.alloc(0), 3)).toHaveLength(1);
    expect(splitBufferIntoChunks(Buffer.alloc(0), 3)[0]).toHaveLength(0);
  });

  it("rejects invalid chunk sizes", () => {
    expect(() => splitBufferIntoChunks(Buffer.from("x"), 0)).toThrow(RangeError);
    expect(() => splitBufferIntoChunks(Buffer.from("x"), 1.5)).toThrow(RangeError);
  });

  it("encrypts and decrypts authenticated chunks with distinct nonces", () => {
    const plain = Buffer.from("cloud data stays private");
    const first = encryptChunk(plain);
    const second = encryptChunk(plain);
    expect(first.ciphertext.equals(plain)).toBe(false);
    expect(first.iv).not.toBe(second.iv);
    expect(decryptChunk(first.ciphertext, first.iv, first.tag)).toEqual(plain);
  });

  it("rejects modified ciphertext and computes stable SHA-256 checksums", () => {
    const encrypted = encryptChunk(Buffer.from("integrity"));
    const changed = Buffer.from(encrypted.ciphertext);
    changed[0] ^= 1;
    expect(() => decryptChunk(changed, encrypted.iv, encrypted.tag)).toThrow();
    expect(sha256(Buffer.from("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
