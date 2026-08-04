// The WHATWG encoder pair, composed and same-scope const store-then-call:
// utf-8 round trips, BOM stripping, and maximal-subpart replacement,
// byte-compared against Node.
const enc = new TextEncoder().encode("héllo😀");
console.log(enc.length, enc[0], enc[1], enc[2], enc[6]);
console.log(new TextDecoder().decode(enc));

// A leading BOM strips (Buffer.toString("utf8") keeps it — the one
// behavioral difference between the two decodes).
console.log(new TextDecoder().decode(new Uint8Array([0xef, 0xbb, 0xbf, 0x41, 0x42])));
console.log(new TextDecoder().decode(new Uint8Array([0xef, 0xbb, 0xbf])).length);
console.log(Buffer.from([0xef, 0xbb, 0xbf, 0x41]).toString("utf8").length);

// Invalid sequences replace per maximal subpart, exactly like Node.
console.log(JSON.stringify(new TextDecoder().decode(new Uint8Array([0x41, 0xff, 0x42]))));
console.log(JSON.stringify(new TextDecoder().decode(new Uint8Array([0xf0, 0x9f, 0x98]))));

// Zero-argument decode is "" per spec; the explicit utf-8 label works.
console.log(new TextDecoder().decode().length);
console.log(new TextDecoder("utf-8").decode(Buffer.from("hi", "utf8")));

// Round trip through both, Buffer input included.
const rt = new TextDecoder().decode(new TextEncoder().encode("round ✓ trip"));
console.log(rt === "round ✓ trip", rt);
console.log(new TextEncoder().encode("").length);

// The ordinary stored-instance idiom is compile-time alias plumbing: the
// default constructors have no effects, and supported calls resolve back
// through a stable const without materializing the codec object.
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const stored = encoder.encode("stored héllo 😀");
console.log(stored.length, decoder.decode(stored));
console.log(encoder.encode("again").length, decoder.decode(Buffer.from("twice", "utf8")));

// An explicit literal utf-8 label is equally effect-free. Function-local
// bindings take the same rewrite within their own execution scope.
function localRoundTrip(s: string): string {
  const labelledDecoder = new TextDecoder("utf-8");
  const localEncoder = new TextEncoder();
  return labelledDecoder.decode(localEncoder.encode(s));
}
console.log(localRoundTrip("local ✓"));

// A switch clause is still one straight-line execution region: the
// declaration dominates the call when both live in that clause.
const codecCase = 1;
switch (codecCase) {
  case 1:
    const caseEncoder = new TextEncoder();
    console.log(caseEncoder.encode("same clause").length);
    break;
}
