let startThis = "not-called";
let pullThis = "not-called";
let cancelThis = "not-called";

function start(controller) {
  startThis = this && this.marker;
  controller.enqueue("chunk");
}

function pull(controller) {
  pullThis = this && this.marker;
  controller.close();
}

function cancel() {
  cancelThis = this && this.marker;
}

const source = { marker: "source", start, pull };
const reader = new ReadableStream(source).getReader();
const first = await reader.read();
const done = await reader.read();

const cancelSource = { marker: "cancel-source", cancel };
const cancelStream = new ReadableStream(cancelSource);
await cancelStream.cancel();

function mutatingStart() {
  this.marker = "changed";
}

const mutatingSource = { marker: "original", start: mutatingStart };
new ReadableStream(mutatingSource);

console.log(
  "stream source callback this:",
  startThis,
  pullThis,
  cancelThis,
  first.value,
  done.done,
);
console.log("stream source callback mutation:", mutatingSource.marker);

let surplusEffects = "";
function ignoredCompanionArgument(label) {
  surplusEffects += label;
  return "ignored";
}

const surplusAbort = AbortSignal.abort(
  undefined,
  ignoredCompanionArgument("abort "),
);
const surplusTimeout = AbortSignal.timeout(
  10000,
  ignoredCompanionArgument("timeout "),
);
const surplusAny = AbortSignal.any(
  [],
  ignoredCompanionArgument("any "),
);
const surplusStreamPart = await ReadableStream.from(
  ["surplus"],
  ignoredCompanionArgument("stream"),
).getReader().read();
console.log(
  "companion surplus arguments:",
  surplusEffects,
  surplusAbort.aborted,
  surplusTimeout.aborted,
  surplusAny.aborted,
  surplusStreamPart.value,
);

let invalidTimeoutOrder = "";
const invalidDelay = JSON.parse('{"delay":5}');
function recordInvalidTimeoutSurplus() {
  invalidTimeoutOrder = "surplus";
  return "ignored";
}
try {
  AbortSignal.timeout(
    invalidDelay,
    recordInvalidTimeoutSurplus(),
  );
} catch (error) {
  console.log(
    "invalid timeout argument order:",
    invalidTimeoutOrder,
    error.name,
    error.code,
  );
}

for (const missing of ["timeout", "any", "from"]) {
  try {
    if (missing === "timeout") AbortSignal.timeout();
    if (missing === "any") AbortSignal.any();
    if (missing === "from") ReadableStream.from();
  } catch (error) {
    console.log(
      `missing ${missing} argument:`,
      error.name,
      error.code || "no-code",
      error.message,
    );
  }
}

let eventNameCoercions = "";
function eventNameToString() {
  eventNameCoercions += this.operation;
  return "abort";
}

const eventNameSignal = AbortSignal.timeout(0);
let eventNameCalls = "";
const keptEventNameListener = () => {
  eventNameCalls += "kept";
};
const removedEventNameListener = () => {
  eventNameCalls += "removed";
};
eventNameSignal.addEventListener(
  { operation: "add ", toString: eventNameToString },
  keptEventNameListener,
);
eventNameSignal.addEventListener("abort", removedEventNameListener);
eventNameSignal.removeEventListener(
  { operation: "remove", toString: eventNameToString },
  removedEventNameListener,
);
await new Promise((resolve) => setTimeout(resolve, 5));
console.log(
  "abort event-name coercion:",
  eventNameCoercions,
  eventNameCalls,
);

let fetchSurplusEffects = "";
const surplusFetchResponse = await fetch(
  `${process.argv[2]}/text`,
  undefined,
  (() => {
    fetchSurplusEffects += "fetch";
    return "ignored";
  })(),
);
console.log(
  "fetch surplus arguments:",
  fetchSurplusEffects,
  await surplusFetchResponse.text(),
);

export {};
