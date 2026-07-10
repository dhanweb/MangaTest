(() => {
  const decoder = new TextDecoder("utf-8", { fatal: false });

  class BencodeParser {
    constructor(data) {
      this.data = data;
      this.pos = 0;
    }

    parse() {
      const node = this.parseNode();
      if (this.pos !== this.data.length) {
        throw new Error("Unexpected trailing data in torrent");
      }
      return node;
    }

    parseNode() {
      this.ensureAvailable();
      const byte = this.data[this.pos];

      if (byte === 0x64) return this.parseDict();
      if (byte === 0x6c) return this.parseList();
      if (byte === 0x69) return this.parseInteger();
      if (isDigit(byte)) return this.parseBytes();

      throw new Error(`Invalid bencode token at offset ${this.pos}`);
    }

    parseDict() {
      const start = this.pos;
      this.pos++;
      const value = new Map();

      while (this.currentByte() !== 0x65) {
        const key = this.parseBytes();
        const child = this.parseNode();
        value.set(decodeBytes(key.bytes), child);
      }

      this.pos++;
      return { type: "dict", value, start, end: this.pos };
    }

    parseList() {
      const start = this.pos;
      this.pos++;
      const value = [];

      while (this.currentByte() !== 0x65) {
        value.push(this.parseNode());
      }

      this.pos++;
      return { type: "list", value, start, end: this.pos };
    }

    parseInteger() {
      const start = this.pos;
      this.pos++;
      const numberStart = this.pos;

      while (this.currentByte() !== 0x65) {
        this.pos++;
      }

      const raw = decodeBytes(this.data.subarray(numberStart, this.pos));
      this.pos++;

      if (!/^-?(0|[1-9]\d*)$/.test(raw)) {
        throw new Error(`Invalid bencode integer at offset ${start}`);
      }

      return { type: "integer", value: Number(raw), start, end: this.pos };
    }

    parseBytes() {
      const start = this.pos;
      let length = 0;

      while (isDigit(this.currentByte())) {
        length = length * 10 + (this.data[this.pos] - 0x30);
        this.pos++;
      }

      if (this.currentByte() !== 0x3a) {
        throw new Error(`Invalid bencode byte string at offset ${start}`);
      }

      this.pos++;
      const contentStart = this.pos;
      const contentEnd = contentStart + length;
      if (contentEnd > this.data.length) {
        throw new Error("Torrent byte string extends past end of file");
      }

      this.pos = contentEnd;
      return {
        type: "bytes",
        bytes: this.data.subarray(contentStart, contentEnd),
        start,
        end: this.pos,
      };
    }

    currentByte() {
      this.ensureAvailable();
      return this.data[this.pos];
    }

    ensureAvailable() {
      if (this.pos >= this.data.length) {
        throw new Error("Unexpected end of torrent data");
      }
    }
  }

  async function fetchTorrentAsMagnet(url) {
    if (url.trim().toLowerCase().startsWith("magnet:")) {
      return url;
    }

    const response = await fetch(url, {
      credentials: "include",
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`Torrent request failed with HTTP ${response.status}`);
    }

    return torrentToMagnet(await response.arrayBuffer());
  }

  async function torrentToMagnet(input) {
    const data = input instanceof Uint8Array ? input : new Uint8Array(input);
    const root = new BencodeParser(data).parse();
    const rootDict = expectDict(root, "Torrent root");
    const info = rootDict.get("info");
    if (!info) {
      throw new Error("Torrent is missing info dictionary");
    }

    const infoDict = expectDict(info, "Torrent info");
    const isV2 = getInteger(infoDict.get("meta version")) === 2;
    const hasV1Pieces = infoDict.has("pieces");
    const xt = [];

    if (hasV1Pieces || !isV2) {
      xt.push(`urn:btih:${await digestHex("SHA-1", data.subarray(info.start, info.end))}`);
    }
    if (isV2) {
      xt.push(`urn:btmh:1220${await digestHex("SHA-256", data.subarray(info.start, info.end))}`);
    }
    if (xt.length === 0) {
      throw new Error("Torrent does not contain a supported info hash");
    }

    const params = xt.map((value) => `xt=${encodeURIComponent(value)}`);
    const name = getText(infoDict.get("name.utf-8")) ?? getText(infoDict.get("name"));
    if (name) {
      params.push(`dn=${encodeURIComponent(name)}`);
    }

    for (const tracker of collectTrackers(rootDict)) {
      params.push(`tr=${encodeURIComponent(tracker)}`);
    }

    return `magnet:?${params.join("&")}`;
  }

  function isDigit(byte) {
    return byte >= 0x30 && byte <= 0x39;
  }

  function decodeBytes(bytes) {
    return decoder.decode(bytes);
  }

  function expectDict(node, label) {
    if (node.type !== "dict") {
      throw new Error(`${label} must be a dictionary`);
    }
    return node.value;
  }

  function getInteger(node) {
    return node?.type === "integer" ? node.value : null;
  }

  function getText(node) {
    if (node?.type !== "bytes") {
      return null;
    }
    const text = decodeBytes(node.bytes).trim();
    return text || null;
  }

  function collectTrackers(rootDict) {
    const trackers = new Set();
    const announce = getText(rootDict.get("announce"));
    if (announce) {
      trackers.add(announce);
    }

    const announceList = rootDict.get("announce-list");
    if (announceList) {
      for (const value of collectTextValues(announceList)) {
        trackers.add(value);
      }
    }

    return [...trackers];
  }

  function collectTextValues(node) {
    if (node.type === "bytes") {
      const text = decodeBytes(node.bytes).trim();
      return text ? [text] : [];
    }
    if (node.type !== "list") {
      return [];
    }

    const values = [];
    for (const child of node.value) {
      values.push(...collectTextValues(child));
    }
    return values;
  }

  async function digestHex(algorithm, bytes) {
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    const digest = await crypto.subtle.digest(algorithm, buffer);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  self.MangaTestTorrentMagnet = { fetchTorrentAsMagnet, torrentToMagnet };
})();
