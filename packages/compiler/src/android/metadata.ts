import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { IrType } from "../ir/nodes.js";

const ARRAY_OFFSET = 0x7fffffff;
const CLASS = 1;
const INTERFACE = 2;
const PRIMITIVE = 16;

interface RawNode {
  id: number;
  firstChildId: number;
  nextSiblingId: number;
  offsetName: number;
  offsetValue: number;
  name: string;
  parentId: number | null;
}

export interface AndroidMethod {
  owner: string;
  name: string;
  descriptor: string;
  parameterTypes: string[];
  returnType: string;
  isStatic: boolean;
  resolved: boolean;
}

export interface AndroidField {
  owner: string;
  name: string;
  descriptor: string;
  isFinal: boolean;
}

export class AndroidMetadata {
  readonly #nodes: RawNode[];
  readonly #names: Buffer;
  readonly #values: Buffer;
  readonly #byName = new Map<string, RawNode>();
  readonly #byDottedName = new Map<string, RawNode>();
  readonly #methods = new Map<number, AndroidMethod[]>();
  readonly #staticFields = new Map<number, AndroidField[]>();

  constructor(nodes: Buffer, names: Buffer, values: Buffer) {
    if (nodes.length % 12 !== 0) {
      throw new Error("invalid NativeScript treeNodeStream.dat length");
    }
    this.#names = names;
    this.#values = values;
    this.#nodes = Array.from({ length: nodes.length / 12 }, (_, id) => {
      const at = id * 12;
      const offsetName = nodes.readUInt32LE(at + 4);
      return {
        id,
        firstChildId: nodes.readUInt16LE(at),
        nextSiblingId: nodes.readUInt16LE(at + 2),
        offsetName,
        offsetValue: nodes.readUInt32LE(at + 8),
        name: this.#readName(offsetName),
        parentId: null,
      };
    });
    for (const node of this.#nodes) {
      if (node.firstChildId === node.id) continue;
      let childId = node.firstChildId;
      while (true) {
        const child = this.#nodes[childId];
        if (!child) throw new Error(`invalid NativeScript metadata child id ${childId}`);
        child.parentId = node.id;
        if (child.nextSiblingId === child.id) break;
        childId = child.nextSiblingId;
      }
    }
    for (const node of this.#nodes) {
      const name = this.#typeName(node);
      this.#byName.set(name, node);
      this.#byDottedName.set(name.replaceAll("/", ".").replaceAll("$", "."), node);
    }
  }

  static load(directory: string): AndroidMetadata {
    return new AndroidMetadata(
      readFileSync(join(directory, "treeNodeStream.dat")),
      readFileSync(join(directory, "treeStringsStream.dat")),
      readFileSync(join(directory, "treeValueStream.dat")),
    );
  }

  hasType(javaName: string): boolean {
    return this.#nodeForName(javaName) !== undefined;
  }

  resolveConstructor(owner: string, args: readonly IrType[]): AndroidMethod {
    return this.#resolve(owner, "<init>", args, false);
  }

  resolveInstanceMethod(owner: string, name: string, args: readonly IrType[]): AndroidMethod {
    return this.#resolve(owner, name, args, false);
  }

  resolveStaticField(owner: string, name: string): AndroidField {
    let node = this.#nodeForName(owner);
    if (!node) throw new Error(`NativeScript metadata has no Android type '${owner}'`);
    const visited = new Set<number>();
    while (node && !visited.has(node.id)) {
      visited.add(node.id);
      // Parsing methods also walks to the static-field tail and populates
      // the field cache.
      this.#methodsFor(node);
      const field = this.#staticFields.get(node.id)?.find((candidate) =>
        candidate.name === name
      );
      if (field) return field;
      node = this.#baseNode(node);
    }
    throw new Error(`NativeScript metadata cannot resolve static field ${owner}.${name}`);
  }

  #resolve(
    owner: string,
    name: string,
    args: readonly IrType[],
    isStatic: boolean,
  ): AndroidMethod {
    const internalOwner = owner.replaceAll(".", "/");
    let node = this.#nodeForName(owner);
    if (!node) {
      const leaf = internalOwner.slice(internalOwner.lastIndexOf("/") + 1);
      const nearby = [...this.#byName.keys()]
        .filter((name) => name.endsWith(`/${leaf}`) || name === leaf)
        .slice(0, 3);
      throw new Error(
        `NativeScript metadata has no Android type '${owner}'` +
          (nearby.length ? ` (nearby: ${nearby.join(", ")})` : ""),
      );
    }
    const candidates: Array<{ method: AndroidMethod; score: number }> = [];
    const visited = new Set<number>();
    while (node && !visited.has(node.id)) {
      visited.add(node.id);
      for (const method of this.#methodsFor(node)) {
        if (
          method.name !== name ||
          method.isStatic !== isStatic ||
          method.parameterTypes.length !== args.length
        ) continue;
        let score = 0;
        let compatible = true;
        for (let i = 0; i < args.length; i++) {
          const cost = this.#conversionCost(args[i]!, method.parameterTypes[i]!);
          if (cost === null) {
            compatible = false;
            break;
          }
          score += cost;
        }
        if (compatible) candidates.push({ method, score });
      }
      if (name === "<init>") break;
      node = this.#baseNode(node);
    }
    candidates.sort((a, b) => a.score - b.score);
    const best = candidates[0];
    if (!best) {
      throw new Error(
        `NativeScript metadata cannot resolve ${owner}.${name}(${args.map((a) => a.kind).join(", ")})`,
      );
    }
    return best.method;
  }

  #conversionCost(actual: IrType, expected: string): number | null {
    if (actual.kind === "string") {
      if (expected === "java/lang/String") return 0;
      if (expected === "java/lang/CharSequence") return 1;
      return this.#isAssignable("java/lang/String", expected) ? 1 : null;
    }
    if (actual.kind === "bool") return expected === "Z" ? 0 : null;
    if (actual.kind === "f64") {
      if (expected === "D") return 0;
      if (expected === "F") return 1;
      return expected === "J" || expected === "I" || expected === "S" || expected === "B"
        ? 2
        : null;
    }
    if (actual.kind === "func") {
      const expectedNode = this.#byName.get(expected);
      return expectedNode && (this.#nodeType(expectedNode) & INTERFACE) !== 0 ? 0 : null;
    }
    if (actual.kind === "object" && actual.className.startsWith("%Android:")) {
      const sourceName = actual.className.slice("%Android:".length);
      const javaName = this.#nodeForName(sourceName);
      if (!javaName) return null;
      const internalName = this.#typeName(javaName);
      if (internalName === expected) return 0;
      return this.#isAssignable(internalName, expected) ? 1 : null;
    }
    return null;
  }

  #isAssignable(actual: string, expected: string): boolean {
    if (actual === expected || expected === "java/lang/Object") return true;
    let node = this.#byName.get(actual);
    const visited = new Set<number>();
    while (node && !visited.has(node.id)) {
      visited.add(node.id);
      const base = this.#baseNode(node);
      if (!base) return false;
      const name = this.#typeName(base);
      if (name === expected) return true;
      node = base;
    }
    return false;
  }

  #nodeForName(name: string): RawNode | undefined {
    return this.#byName.get(name.replaceAll(".", "/")) ??
      this.#byDottedName.get(name.replaceAll("/", ".").replaceAll("$", "."));
  }

  #methodsFor(node: RawNode): AndroidMethod[] {
    const cached = this.#methods.get(node.id);
    if (cached) return cached;
    const methods: AndroidMethod[] = [];
    let at = node.offsetValue;
    const type = this.#values[at++]!;
    at += 2; // base class node id
    if ((type & INTERFACE) !== 0) at += 5; // generated implementation prefix

    const readMethod = (isStatic: boolean, declaringType: boolean): AndroidMethod => {
      const nameOffset = this.#values.readUInt32LE(at);
      at += 4;
      const resolved = this.#values[at++]! !== 0;
      const signatureLength = this.#values.readUInt16LE(at);
      at += 2;
      const signature: string[] = [];
      for (let i = 0; i < signatureLength; i++) {
        const typeId = this.#values.readUInt16LE(at);
        try {
          signature.push(this.#descriptorType(typeId));
        } catch (error) {
          throw new Error(
            `${error instanceof Error ? error.message : String(error)} ` +
              `while reading ${this.#typeName(node)} at value offset ${at}`,
          );
        }
        at += 2;
      }
      let owner = this.#typeName(node);
      if (declaringType) {
        owner = this.#typeName(this.#nodes[this.#values.readUInt16LE(at)]!);
        at += 2;
      }
      const returnType = signature.shift() ?? "V";
      return {
        owner,
        name: this.#readName(nameOffset),
        descriptor: `(${signature.join("")})${returnType}`,
        parameterTypes: signature.map((value) =>
          value.startsWith("L") ? value.slice(1, -1) : value
        ),
        returnType,
        isStatic,
        resolved,
      };
    };
    const readMethods = (isStatic: boolean, declaringType: boolean): void => {
      const count = this.#values.readUInt16LE(at);
      at += 2;
      for (let i = 0; i < count; i++) methods.push(readMethod(isStatic, declaringType));
    };

    readMethods(true, true); // Kotlin extension functions
    readMethods(false, false);

    const fields = this.#values.readUInt16LE(at);
    at += 2 + fields * 7;
    const properties = this.#values.readUInt16LE(at);
    at += 2;
    for (let i = 0; i < properties; i++) {
      at += 4;
      const getterCount = this.#values.readUInt16LE(at);
      at += 2;
      for (let j = 0; j < getterCount; j++) methods.push(readMethod(false, false));
      const setterCount = this.#values.readUInt16LE(at);
      at += 2;
      for (let j = 0; j < setterCount; j++) methods.push(readMethod(false, false));
    }
    readMethods(true, true);
    const staticFields: AndroidField[] = [];
    const staticFieldCount = this.#values.readUInt16LE(at);
    at += 2;
    for (let i = 0; i < staticFieldCount; i++) {
      const nameOffset = this.#values.readUInt32LE(at);
      at += 4;
      const typeId = this.#values.readUInt16LE(at);
      at += 2;
      const isFinal = this.#values[at++]! !== 0;
      const declaringId = this.#values.readUInt16LE(at);
      at += 2;
      staticFields.push({
        owner: this.#typeName(this.#nodes[declaringId]!),
        name: this.#readName(nameOffset),
        descriptor: this.#descriptorType(typeId),
        isFinal,
      });
    }
    this.#staticFields.set(node.id, staticFields);
    this.#methods.set(node.id, methods);
    return methods;
  }

  #baseNode(node: RawNode): RawNode | undefined {
    if (node.offsetValue === 0 || node.offsetValue >= ARRAY_OFFSET) return undefined;
    const id = this.#values.readUInt16LE(node.offsetValue + 1);
    return id === 0 ? undefined : this.#nodes[id];
  }

  #nodeType(node: RawNode): number {
    if (node.offsetValue === 0) return 0;
    if (node.offsetValue >= ARRAY_OFFSET) return 8;
    return this.#values[node.offsetValue]!;
  }

  #descriptorType(id: number): string {
    // Writer encodes a null signature node (void return) as id 0, which is
    // also the root node id. Signature parameters themselves are never void.
    if (id === 0) return "V";
    const node = this.#nodes[id];
    if (!node) throw new Error(`invalid NativeScript metadata type id ${id}`);
    const name = this.#typeName(node);
    const type = this.#nodeType(node);
    if (name.startsWith("[")) return name;
    if ((type & PRIMITIVE) !== 0) return name;
    if ((type & (CLASS | INTERFACE)) !== 0) return `L${name};`;
    throw new Error(`invalid NativeScript metadata signature type '${name}'`);
  }

  #typeName(node: RawNode): string {
    if (node.id === 0) return "";
    if (node.offsetValue > ARRAY_OFFSET) {
      return `[${this.#descriptorType(node.offsetValue - ARRAY_OFFSET)}`;
    }
    let result = node.name;
    let current = node;
    while (current.parentId !== null && current.parentId !== 0) {
      const parent = this.#nodes[current.parentId]!;
      const separator =
        (this.#nodeType(current) & (CLASS | INTERFACE)) !== 0 &&
          (this.#nodeType(parent) & (CLASS | INTERFACE)) !== 0
          ? "$"
          : "/";
      result = `${parent.name}${separator}${result}`;
      current = parent;
    }
    return result;
  }

  #readName(offset: number): string {
    const length = this.#names.readUInt16LE(offset);
    return this.#names.toString("utf8", offset + 2, offset + 2 + length);
  }
}

let bundledMetadata: AndroidMetadata | undefined;

export function getAndroidMetadata(): AndroidMetadata {
  if (!bundledMetadata) {
    const require = createRequire(import.meta.url);
    const root = dirname(require.resolve("@scriptc/android/package.json"));
    bundledMetadata = AndroidMetadata.load(join(root, "metadata"));
  }
  return bundledMetadata;
}
