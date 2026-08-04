// The engine-free user surface: this is intentionally top-level and has
// no --dynamic directive. Both backends must compile fetch(url),
// RequestInit, and Response.json() into the native net/http/tls runtime.
const res = await fetch(`${process.argv[2]}/json`);
console.log(await res.json());

const bracketJson = (await (
  await fetch(`${process.argv[2]}/json`)
)["json"]()) as { n: number };
console.log("bracket json:", bracketJson.n);
console.log(
  "bracket text:",
  await (await fetch(`${process.argv[2]}/text`))["text"](),
);
const bracketBytes = await (
  await fetch(`${process.argv[2]}/text`)
)["bytes"]();
console.log("bracket bytes:", bracketBytes.length, bracketBytes[0]);

function readTextLater(response: Response): Promise<string> {
  return response.text();
}
const pendingText: Promise<string> = readTextLater(
  await fetch(`${process.argv[2]}/text`),
);
console.log("stored text promise:", await pendingText);
const pendingBytes: Promise<Uint8Array> = (
  await fetch(`${process.argv[2]}/text`)
).bytes();
const storedBytes = await pendingBytes;
console.log("stored bytes promise:", storedBytes.length, storedBytes[0]);

async function readComputedBody(
  response: Response,
  asBytes: boolean,
): Promise<string> {
  const member: "text" | "bytes" = asBytes ? "bytes" : "text";
  const value: string | Uint8Array = await response[member]();
  return typeof value === "string"
    ? `text:${value}`
    : `bytes:${value.length}:${value[0]}`;
}
console.log(
  "computed response body:",
  await readComputedBody(await fetch(`${process.argv[2]}/text`), false),
  await readComputedBody(await fetch(`${process.argv[2]}/text`), true),
);

const arityHeaders: any = (await fetch(`${process.argv[2]}/text`)).headers;
try {
  arityHeaders.get();
} catch (error) {
  console.log("headers get arity:", (error as Error).name);
}
try {
  arityHeaders.has();
} catch (error) {
  console.log("headers has arity:", (error as Error).name);
}

const extraArgResponse: any = await fetch(`${process.argv[2]}/text`);
console.log("response text extra arg:", await extraArgResponse.text("ignored"));

const gzipText = await (await fetch(`${process.argv[2]}/gzip`)).text();
console.log(
  "gzip:",
  gzipText.length,
  gzipText.startsWith("compressed héllo 😀"),
  gzipText.endsWith(" "),
);
console.log(
  "deflate:",
  await (await fetch(`${process.argv[2]}/deflate`)).text(),
);
console.log(
  "concatenated gzip:",
  await (await fetch(`${process.argv[2]}/gzip-concat`)).text(),
);
console.log(
  "truncated gzip:",
  JSON.stringify(await (await fetch(`${process.argv[2]}/gzip-truncated`)).text()),
);

const urlResponse = await fetch(new URL(`${process.argv[2]}/json`));
console.log("url:", urlResponse.status);

const headerResponse = await fetch(`${process.argv[2]}/header-echo`, {
  headers: { "x-echo-one": "1", "x-echo-two": "2" },
});
const responseHeaders = headerResponse.headers;
console.log(
  "headers:",
  responseHeaders.get("content-type"),
  responseHeaders.get("x-multi"),
  responseHeaders.get("x-latin"),
  responseHeaders.get("missing") ?? "none",
  responseHeaders.has("x-multi"),
  responseHeaders.has("missing"),
  responseHeaders.getSetCookie().join("|"),
);
responseHeaders.forEach((value, name) => {
  if (name.startsWith("x-")) console.log("header walk:", name, value);
});
responseHeaders.forEach((value, name) => {
  if (name === "x-kind") console.log("header walk thisArg:", name, value);
}, { label: "ignored by the arrow callback" });
try {
  const computedHeaderMember = (): "get" | "has" => "missing" as "get";
  const member = computedHeaderMember();
  responseHeaders[member]("x-kind");
  console.log("computed header member unexpectedly accepted");
} catch (error) {
  console.log("computed header member:", (error as Error).name);
}
await headerResponse.text();

const latin1HeaderResponse = await fetch(`${process.argv[2]}/header-echo`, {
  headers: { "x-echo-one": "é", "x-echo-two": "latin1" },
});
console.log("latin1 request header:", await latin1HeaderResponse.text());

const coercedRecordHeaders: any = {
  "x-echo-one": 123,
  "x-echo-two": false,
};
console.log(
  "coerced record headers:",
  await (
    await fetch(`${process.argv[2]}/header-echo`, {
      headers: coercedRecordHeaders,
    })
  ).text(),
);

const coercedSequenceHeaders: any = [
  ["x-echo-one", 456],
  ["x-echo-two", true],
];
console.log(
  "coerced sequence headers:",
  await (
    await fetch(`${process.argv[2]}/header-echo`, {
      headers: coercedSequenceHeaders,
    })
  ).text(),
);

try {
  await fetch(`${process.argv[2]}/header-echo`, {
    headers: { "x-echo-one": "😀" },
  });
  console.log("wide request header unexpectedly sent");
} catch (error) {
  const caught = error as Error;
  console.log("wide request header:", caught.name);
}

const emptyHeaderResponse = await fetch(`${process.argv[2]}/header-empty`);
console.log(
  "empty duplicate header:",
  JSON.stringify(emptyHeaderResponse.headers["get"]("x-empty")),
);
await emptyHeaderResponse.text();

const headersSource = await fetch(`${process.argv[2]}/headers-source`);
const reusedHeaders = await fetch(`${process.argv[2]}/headers-reuse`, {
  headers: headersSource.headers,
});
console.log("reused headers:", await reusedHeaders.text());

console.log(
  "normalized request headers:",
  await (
    await fetch(`${process.argv[2]}/header-init-echo`, {
      headers: [
        ["X-Duplicate", " one "],
        ["x-duplicate", "\ttwo\t"],
        ["Cookie", "a=1"],
        ["cookie", "b=2"],
      ],
    })
  ).json(),
);

try {
  await fetch(`${process.argv[2]}/text`, {
    headers: [
      ["connection", "close"],
      ["Connection", "keep-alive"],
    ],
  });
  console.log("duplicate connection unexpectedly sent");
} catch (error) {
  const caught = error as Error;
  console.log("duplicate connection:", caught.name, caught.message);
}

console.log(
  "request defaults:",
  await (await fetch(`${process.argv[2]}/request-defaults`)).json(),
);
const forcedFetchMode = (await (
  await fetch(`${process.argv[2]}/request-defaults`, {
    headers: { "sec-fetch-mode": "navigate" },
  })
).json()) as { secFetchMode: string };
console.log("forced sec-fetch-mode:", forcedFetchMode.secFetchMode);
const forcedHost = (await (
  await fetch(`${process.argv[2]}/request-defaults`, {
    headers: { host: "custom.invalid" },
  })
).json()) as { host: string };
console.log(
  "transport-controlled host:",
  forcedHost.host === new URL(process.argv[2]!).host,
);
console.log(
  "raw request headers:",
  await (await fetch(`${process.argv[2]}/raw-headers`)).text(),
);

const forbiddenRequestHeaders: Array<
  [string, Record<string, string>]
> = [
  ["connection", { connection: "x" }],
  ["transfer-encoding", { "transfer-encoding": "chunked" }],
  ["keep-alive", { "keep-alive": "timeout=5" }],
  ["upgrade", { upgrade: "websocket" }],
  ["expect", { expect: "100-continue" }],
];
for (const [name, headers] of forbiddenRequestHeaders) {
  try {
    await fetch(`${process.argv[2]}/text`, { headers });
    console.log("forbidden request header unexpectedly sent:", name);
  } catch (error) {
    const caught = error as Error;
    console.log("forbidden request header:", name, caught.name, caught.message);
  }
}

const init: RequestInit = {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-user-tag": "static",
  },
  body: JSON.stringify({ q: 7 }),
};
const echoed = await fetch(`${process.argv[2]}/post-echo`, init);
console.log(await echoed.json());

const scalarBodyInit = JSON.parse(
  '{"method":"POST","body":123}',
) as RequestInit;
const scalarBodyEcho = await (
  await fetch(`${process.argv[2]}/post-echo`, scalarBodyInit)
).json() as { method: string; contentType: string; body: string };
console.log(
  "coerced scalar body:",
  scalarBodyEcho.method,
  scalarBodyEcho.contentType,
  scalarBodyEcho.body,
);

const scalarMethodInit = JSON.parse('{"method":null}') as RequestInit;
const scalarMethodEcho = await (
  await fetch(`${process.argv[2]}/post-echo`, scalarMethodInit)
).json() as { method: string };
console.log("coerced scalar method:", scalarMethodEcho.method);

// A runtime-computed dictionary cannot be source-profiled, so the native
// RequestInit validator remains the defensive backstop for unsupported keys.
const unsupportedInit = JSON.parse(
  '{"method":"GET","integrity":"sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}',
) as RequestInit;
try {
  await fetch(`${process.argv[2]}/text`, unsupportedInit);
  console.log("unsupported request init unexpectedly accepted");
} catch (error) {
  const caught = error as Error;
  console.log("unsupported request init:", caught.name, caught.message);
}

const unsupportedThenUndefined = { cache: "no-store" } as const;
const overwrittenUnsupportedInit = {
  ...unsupportedThenUndefined,
  cache: undefined,
} as RequestInit;
const overwrittenUnsupported = await fetch(
  `${process.argv[2]}/text`,
  overwrittenUnsupportedInit,
);
console.log("overwritten unsupported request init:", await overwrittenUnsupported.text());

const matchedLength = await fetch(`${process.argv[2]}/post-echo`, {
  method: "POST",
  headers: { "content-length": "2" },
  body: "hi",
});
console.log("matched fixed content-length:", await matchedLength.json());

const redirected = await fetch(`${process.argv[2]}/redirect`);
console.log(
  "redirect:",
  redirected.status,
  redirected.redirected,
  redirected.url.endsWith("/text"),
  await redirected.text(),
);

const backslashRedirect = await fetch(
  `${process.argv[2]}/redirect-backslash`,
);
console.log(
  "backslash redirect:",
  backslashRedirect.status,
  backslashRedirect.url.endsWith("/text"),
  await backslashRedirect.text(),
);

const sameSchemeRedirect = await fetch(
  `${process.argv[2]}/redirect-same-scheme/dir/start`,
);
console.log(
  "same-scheme redirect:",
  sameSchemeRedirect.status,
  sameSchemeRedirect.url.endsWith("/redirect-same-scheme/dir/next"),
  await sameSchemeRedirect.text(),
);

const invalidUtf8Redirect = await fetch(
  `${process.argv[2]}/redirect-invalid-utf8`,
);
console.log(
  "invalid utf8 redirect:",
  invalidUtf8Redirect.url.endsWith("/caf%EF%BF%BD"),
  await invalidUtf8Redirect.text(),
);

const fragmentRedirect = await fetch(
  `${process.argv[2]}/redirect-fragment/path`,
  {
    headers: {
      "x-redirect-key": process.argv[3] ?? "static-fragment",
    },
  },
);
console.log(
  "fragment redirect:",
  fragmentRedirect.status,
  fragmentRedirect.url.endsWith("/redirect-fragment/path"),
  await fragmentRedirect.text(),
);

const manualRedirect = await fetch(`${process.argv[2]}/redirect`, {
  redirect: "manual",
});
console.log(
  "manual redirect:",
  manualRedirect.status,
  manualRedirect.redirected,
  manualRedirect.url.endsWith("/redirect"),
  manualRedirect.headers.get("location"),
  JSON.stringify(await manualRedirect.text()),
);

try {
  await fetch(`${process.argv[2]}/redirect`, { redirect: "error" });
} catch (error) {
  const caught = error as Error;
  console.log("error redirect:", caught.name, caught.message);
}

try {
  await fetch(`${process.argv[2]}/redirect-credentials`);
} catch (error) {
  const caught = error as Error;
  console.log("credential redirect:", caught.name, caught.message);
}

try {
  const credentialUrl =
    `http://user:pass@${process.argv[2].slice("http://".length)}/text`;
  await fetch(credentialUrl);
} catch (error) {
  const caught = error as Error;
  console.log("credential URL:", caught.name, caught.message);
}

console.log(
  "early hints:",
  await (await fetch(`${process.argv[2]}/early-hints`)).text(),
);
try {
  await fetch(`${process.argv[2]}/switching-protocols`);
  console.log("switching protocols unexpectedly resolved");
} catch (error) {
  const caught = error as Error;
  console.log("switching protocols:", caught.name, caught.message);
}
console.log(
  "invalid utf8:",
  JSON.stringify(await (await fetch(`${process.argv[2]}/invalid-utf8`)).text()),
);

const statusMeta = await fetch(`${process.argv[2]}/status-meta`);
console.log("status text:", statusMeta.status, statusMeta.statusText);

const head = await fetch(`${process.argv[2]}/text`, { method: "HEAD" });
console.log(
  "head body:",
  head.body === null,
  head.bodyUsed,
  JSON.stringify(await head.text()),
  head.bodyUsed,
  JSON.stringify(await head.text()),
);
const noContent = await fetch(`${process.argv[2]}/no-content`);
try {
  await noContent.json();
} catch (error) {
  const caught = error as Error;
  console.log("no-content json:", caught.name, caught.message, noContent.bodyUsed);
}
console.log(
  "no-content body:",
  noContent.body === null,
  noContent.bodyUsed,
  JSON.stringify(await noContent.text()),
  noContent.bodyUsed,
);
const resetContent = await fetch(`${process.argv[2]}/reset-content`);
console.log(
  "reset-content body:",
  resetContent.body === null,
  JSON.stringify(await resetContent.text()),
);
const largeResetContent = await fetch(
  `${process.argv[2]}/reset-content-large`,
);
console.log(
  "large reset-content body:",
  largeResetContent.body === null,
  JSON.stringify(await largeResetContent.text()),
);

try {
  await fetch(`${process.argv[2]}/json`, { method: "BAD METHOD" });
} catch (error) {
  console.log("invalid-method:", (error as Error).name);
}
try {
  await fetch("not a url", {
    signal: AbortSignal.abort(new Error("must not mask URL validation")),
  });
} catch (error) {
  console.log("aborted invalid-url:", (error as Error).name);
}
try {
  await fetch(`${process.argv[2]}/text`, { method: "TRACE" });
} catch (error) {
  const caught = error as Error;
  console.log("forbidden-method:", caught.name, caught.message);
}
try {
  await fetch(`${process.argv[2]}/post-echo`, {
    method: "POST",
    headers: { "content-length": "5" },
    body: "hi",
    signal: AbortSignal.timeout(200),
  });
} catch (error) {
  const caught = error as Error;
  console.log("fixed content-length mismatch:", caught.name, caught.message);
}
